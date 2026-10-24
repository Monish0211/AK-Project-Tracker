import React, { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { useAuth } from "../../auth/authContext";
import { hasModuleAccess } from "../../auth/permissions";
import { reminderScheduler, REMINDER_FIRED_EVENT } from "../../notifications/reminderScheduler";
import type { FiredReminderDetail } from "../../notifications/reminderSchedulerCore";
import { buildAlertBubble, createAlertDeduper } from "../../notifications/reminderAlertBubble";
import { reminderSoundService } from "../../services/audio/ReminderSoundService";

/**
 * Positioning model — FINAL, confirmed by real manual testing: the orb is a
 * floating PMO assistant that must remain visible/accessible at all times,
 * regardless of page scroll. This is `position: fixed` with plain
 * VIEWPORT-relative left/top. No document-height dependency, no
 * scroll-offset math, and no route-change re-clamp effect remain anywhere
 * in this file — none of them are needed once the position is
 * viewport-relative.
 *
 * CONFIRMED ROOT CAUSE of `position: fixed` still not staying viewport-
 * anchored in the real app even after that revert: `MainLayout.tsx`'s
 * outermost wrapper div carries `.animate-pmo-fade-up`, whose keyframes
 * (index.css's `pmoFadeUp`) end at `filter: blur(0)` — NOT `filter: none`.
 * With `animation-fill-mode: forwards`, that non-`none` filter value stays
 * permanently applied to the element for the life of the page, and per the
 * CSS Filter Effects spec, ANY non-`none` `filter` on an ancestor
 * establishes a new containing block for every `position: fixed`
 * descendant — identical in effect to `transform`. A sibling bug in this
 * exact same keyframe (`transform: translateY(0)` instead of `none`) was
 * already found and fixed by an earlier change (see that fix's own comment
 * in index.css) — but the analogous `filter` case was missed, and quietly
 * re-broke fixed positioning for this component (and, per that same
 * mechanism, potentially other fixed-position overlays elsewhere in the
 * app) the whole time. Confirmed via static analysis of the actual
 * shipped CSS, not assumed.
 *
 * Rather than depend on that global CSS file being correct (a one-line fix
 * there is a separate, explicitly out-of-scope decision for this task —
 * see the accompanying report), this component now renders through a React
 * Portal directly into `document.body` — the standard, idiomatic pattern
 * for a global floating widget. This makes the orb permanently immune to
 * this entire class of bug (any current or future ancestor anywhere in the
 * app gaining a transform/filter/perspective/contain property), not just
 * a fix for the one specific rule found this time.
 */

interface PmoAssistantOrbProps {
  onTogglePanel: (rect: DOMRect) => void;
  /** True while the assistant panel is open — the robot drops to a very low frame rate so it never competes with the panel for the main thread. */
  panelOpen?: boolean;
}

const STORAGE_KEY = "pmo-assistant-position";
const GREETING_SESSION_KEY = "pmo-greeting-shown-session";
// Compact footprint (smaller than the previous 110x110 orb) — the full-body
// robot is framed to fit it. Drag clamping, default position and greeting/alert
// bubble placement all read these two constants.
const ORB_WIDTH = 105;
const ORB_HEIGHT = 120;

// Sleep mode: the robot dozes off when there has been no user activity at all
// (mouse not moving, no clicks, keys or scrolling anywhere on the page) for
// this long, and wakes the moment any activity resumes or a reminder alert
// fires.
const SLEEP_AFTER_MS = 30_000;
// Reminder alert: how long the colour-pulsing alert plays. It plays ONCE per
// reminder the Reminder Scheduler actually fires — it no longer polls the
// pending list or repeats (that made old, already-fired, snoozed or simply
// not-yet-completed reminders keep coming back every few minutes and on every
// page load).
const ALERT_DURATION_MS = 7_000;
// Remembers which fired occurrences were already shown, at module level, so a
// second mounted robot / a re-mount / a late replay can never alert twice.
const alertedOccurrences = createAlertDeduper();
// Waving: the robot waves when the greeting appears, when the cursor first
// moves onto it (at most once per HOVER_WAVE_COOLDOWN_MS), when it wakes up,
// and on its own every AUTO_WAVE_MIN..MAX_MS while awake and idle.
const WAVE_DURATION_MS = 3600;
// Render budget. The scene runs on the main thread's GL command queue, and on
// machines with weak/software graphics a 60fps loop blocks the page long
// enough to make the assistant panel (and the rest of the UI) feel stuck.
// ~24fps is plenty for this animation; it drops further while the robot is
// asleep and almost to a stop while the panel is open.
const FRAME_MS_AWAKE = 42;
const FRAME_MS_WALK = 33; // ~30fps while walking, so the sideways travel looks smooth
const FRAME_MS_ASLEEP = 100;
const FRAME_MS_PANEL_OPEN = 200;
const HOVER_WAVE_COOLDOWN_MS = 10_000;
const AUTO_WAVE_MIN_MS = 20_000;
const AUTO_WAVE_MAX_MS = 35_000;
// Walking: every WALK_INTERVAL_MS the robot really walks across the screen —
// the whole assistant moves WALK_DISTANCE_PX sideways (towards whichever side
// has room, never off-screen) at a steady ~65px/s with legs swinging, pauses at
// the far point to wave, then walks back to exactly where it was. The walk is
// only a visual offset: the saved position never changes.
const WALK_INTERVAL_MS = 2 * 60_000;
const WALK_DURATION_MS = 10_000;
const WALK_DISTANCE_PX = 260;
const WALK_MIN_ROOM_PX = 100; // a side needs at least this much free space to be walked towards
const WALK_MIN_DISTANCE_PX = 40; // below this there is nowhere worth walking to — skip the walk
// Corner stunt: when the robot is dropped within CORNER_ZONE_PX of a screen
// corner (measured from the same 16px clamp margin dragging already uses), it
// immediately does a rotating stunt — a backflip or a spin-jump — lasting
// STUNT_DURATION_MS.
const CORNER_ZONE_PX = 90;
const STUNT_DURATION_MS = 1800;
// True when this browser can create a WebGL context at all. Checked once, up
// front, so a machine with WebGL disabled (remote desktops, locked-down office
// PCs, blocklisted GPUs) gets the simple fallback avatar instead of a thrown
// error — an exception from the scene setup would otherwise reach the app's
// root error boundary and replace the whole portal with "Something went wrong".
// The probe context is released straight away so it never counts toward the
// browser's limit on live WebGL contexts.
const canUseWebGL = (): boolean => {
  try {
    const probe = document.createElement("canvas");
    const gl = (probe.getContext("webgl2") || probe.getContext("webgl")) as WebGLRenderingContext | WebGL2RenderingContext | null;
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
};

const isInCorner = (p: { x: number; y: number }): boolean => {
  const edge = 16 + CORNER_ZONE_PX;
  const nearLeft = p.x <= edge;
  const nearRight = p.x >= window.innerWidth - ORB_WIDTH - edge;
  const nearTop = p.y <= edge;
  const nearBottom = p.y >= window.innerHeight - ORB_HEIGHT - edge;
  return (nearLeft || nearRight) && (nearTop || nearBottom);
};

const MOTIVATIONAL_QUOTES = [
  '"Small progress is still progress." 🚀',
  '"Great things are built one step at a time." 💪',
  '"Progress, not perfection." ✨',
  '"Stay focused. Keep moving forward." 🎯',
  '"Every accomplishment starts with the decision to try." 🌟',
  '"Consistency turns effort into results." 🚀',
  '"Make today count." 💫',
];

// PMO portal theme colours for the robot: the portal's royal blue (the
// dashboard accent, #2563eb) for the blue body parts, and its cyan (the teal
// end of the sidebar/hero gradient, brightened to read as a glow) for the
// eyes and chest light. Also the two colours the reminder alert pulses between.
const PMO_BLUE = 0x2563eb;
const PMO_CYAN = 0x06b6d4;
const ALERT_COLOR_A = 0xf59e0b;
const ALERT_COLOR_B = 0xef4444;
const SLEEP_COLOR = 0x334155;

export const PmoAssistantOrb: React.FC<PmoAssistantOrbProps> = ({ onTogglePanel, panelOpen = false }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  // Read by the three.js render loop (which lives in a mount-once effect), so
  // these are refs rather than state — the render loop must not be torn down
  // and rebuilt every time the robot falls asleep or an alert starts.
  const sleepRef = useRef(false);
  const alertRef = useRef(false);
  const alertStartRef = useRef(0);
  const lastTouchRef = useRef(0);
  const panelOpenRef = useRef(panelOpen);
  const waveStartRef = useRef(-1e9);
  const waveSideRef = useRef<"A" | "B">("B");
  const walkStartRef = useRef(-1e9);
  const walkDirRef = useRef(1);
  const walkDistRef = useRef(0); // how far (px) this walk travels
  const walkPxRef = useRef(0); // current sideways walk offset (px), applied as a transform
  const dragOffsetRef = useRef({ x: 0, y: 0 }); // current drag offset (px) while a drag is in progress
  const posRef = useRef({ x: 0, y: 0 }); // latest committed position, readable from the timers and the render loop
  const walkWavedRef = useRef(false);
  const nextWalkRef = useRef(0);
  const stuntStartRef = useRef(-1e9);
  const stuntKindRef = useRef<"flip" | "spin">("flip");
  const lastDragPosRef = useRef<{ x: number; y: number } | null>(null);
  const lastWaveRef = useRef(0);
  const nextAutoWaveRef = useRef(0);
  const draggingRef = useRef(false);
  const { user } = useAuth();
  // Set when WebGL is unavailable (or the renderer could not be created): the
  // robot is then drawn as a plain CSS avatar so the assistant stays usable.
  const [canvasFailed, setCanvasFailed] = useState(() => !canUseWebGL());

  // The robot's on-screen offset from its saved position is a single CSS
  // transform, built from two independent parts: the live drag offset and the
  // walk offset. Both writers go through here so neither overwrites the other.
  const applyOrbTransform = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const x = dragOffsetRef.current.x + walkPxRef.current;
    const y = dragOffsetRef.current.y;
    el.style.transform = x === 0 && y === 0 ? "" : `translate3d(${x}px, ${y}px, 0)`;
  }, []);

  useEffect(() => {
    panelOpenRef.current = panelOpen;
  }, [panelOpen]);

  // 1. Position State with LocalStorage Persistence — pos.x/pos.y are
  // VIEWPORT-relative pixels (matching position: fixed below), same
  // storage key/format as always, so an existing saved position is simply
  // clamped back inside the current viewport rather than reset — this also
  // self-heals any stray value left over from the reverted document-relative
  // attempt (e.g. a large Y from being dragged far down a page) by pulling
  // it back on-screen the next time this runs, exactly the "never place it
  // outside the visible screen" requirement.
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.x === "number" && typeof parsed.y === "number") {
          const clampedX = Math.max(16, Math.min(parsed.x, window.innerWidth - ORB_WIDTH - 16));
          const clampedY = Math.max(16, Math.min(parsed.y, window.innerHeight - ORB_HEIGHT - 16));
          return { x: clampedX, y: clampedY };
        }
      }
    } catch {
      // Ignore parse errors
    }
    return {
      x: 24,
      y: Math.max(16, window.innerHeight - ORB_HEIGHT - 120),
    };
  });

  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; posX: number; posY: number }>({ x: 0, y: 0, posX: 0, posY: 0 });
  const hasDraggedRef = useRef(false);

  // 2. Session Greeting State (Triggers on Login Session)
  const [greeting, setGreeting] = useState<{ header: string; quote: string } | null>(null);
  const [showGreeting, setShowGreeting] = useState(false);

  // Reminder alert bubble + sleep indicator (Zzz) — presentation state only;
  // the robot's own pose/colour is driven through alertRef/sleepRef.
  const [alertBubble, setAlertBubble] = useState<{ header: string; body: string } | null>(null);
  const [isSleeping, setIsSleeping] = useState(false);

  useEffect(() => {
    if (!user) {
      setShowGreeting(false);
      return;
    }

    const sessionKey = `${GREETING_SESSION_KEY}-${user.id || user.email || "user"}`;
    if (sessionStorage.getItem(sessionKey)) return;

    const rawName = user.name ? user.name.trim() : user.email ? user.email.split("@")[0] : "User";
    const userName = rawName.split(" ")[0]; // Get first name (e.g., "Monish", "Bala", "Bhupesh")
    const hour = new Date().getHours();

    let salutation = "Good morning";
    let emoji = "👋";

    if (hour >= 5 && hour < 12) {
      salutation = "Good morning";
      emoji = "👋";
    } else if (hour >= 12 && hour < 17) {
      salutation = "Good afternoon";
      emoji = "👋";
    } else if (hour >= 17 && hour < 21) {
      salutation = "Good evening";
      emoji = "👋";
    } else {
      salutation = "Good evening";
      emoji = "🌙";
    }

    const randomQuote = MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)];

    setGreeting({
      header: `${salutation}, ${userName}! ${emoji}`,
      quote: randomQuote,
    });
    setShowGreeting(true);
    waveStartRef.current = performance.now();
    waveSideRef.current = "A";
    lastWaveRef.current = Date.now();
    sessionStorage.setItem(sessionKey, "true");

    // Auto-dismiss greeting after 4.5 seconds
    const timer = setTimeout(() => {
      setShowGreeting(false);
    }, 4500);

    return () => clearTimeout(timer);
  }, [user]);

  // Auto-dismiss the greeting 4.5s after it appears. Kept separate from the
  // effect above, whose own timer is cleared whenever `user` changes identity
  // (e.g. after the session refresh) — that previously left the bubble stuck
  // on screen until clicked.
  useEffect(() => {
    if (!showGreeting) return;
    const timer = setTimeout(() => setShowGreeting(false), 4500);
    return () => clearTimeout(timer);
  }, [showGreeting]);

  // Keep position clamped on window resize — plain viewport bounds, exactly
  // as this already worked before the document-relative attempt. No
  // route-change effect is needed at all with fixed/viewport positioning:
  // the viewport is the same size regardless of which route is active, so
  // there is nothing route-specific to re-clamp against — matching "do not
  // create route-specific positioning logic unless absolutely necessary."
  useEffect(() => {
    const handleResize = () => {
      setPos((prev) => ({
        x: Math.max(16, Math.min(prev.x, window.innerWidth - ORB_WIDTH - 16)),
        y: Math.max(16, Math.min(prev.y, window.innerHeight - ORB_HEIGHT - 16)),
      }));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Save position to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
    } catch {
      // Ignore storage errors
    }
  }, [pos]);

  // Touching the robot (hover / press / drag) wakes it and restarts the idle
  // clock that sleep mode counts down from.
  const startWave = useCallback(() => {
    // Alternate hands so both the left and right hand wave.
    waveSideRef.current = waveSideRef.current === "A" ? "B" : "A";
    waveStartRef.current = performance.now();
    lastWaveRef.current = Date.now();
    nextAutoWaveRef.current = Date.now() + AUTO_WAVE_MIN_MS + Math.random() * (AUTO_WAVE_MAX_MS - AUTO_WAVE_MIN_MS);
  }, []);

  const startWalk = useCallback(() => {
    nextWalkRef.current = Date.now() + WALK_INTERVAL_MS;
    // Walk towards a side that has room (never off-screen, never past the 16px
    // margin dragging uses). With room on both sides pick one at random; with
    // too little room anywhere there is nowhere to walk, so skip this one.
    const rightRoom = window.innerWidth - ORB_WIDTH - 16 - posRef.current.x;
    const leftRoom = posRef.current.x - 16;
    const sides = [rightRoom >= WALK_MIN_ROOM_PX ? 1 : 0, leftRoom >= WALK_MIN_ROOM_PX ? -1 : 0].filter((s) => s !== 0);
    const dir = sides.length > 0 ? sides[Math.floor(Math.random() * sides.length)] : rightRoom >= leftRoom ? 1 : -1;
    const room = dir === 1 ? rightRoom : leftRoom;
    const distance = Math.min(WALK_DISTANCE_PX, room - 4);
    if (distance < WALK_MIN_DISTANCE_PX) return;
    walkDirRef.current = dir;
    walkDistRef.current = distance;
    walkWavedRef.current = false;
    walkStartRef.current = performance.now();
  }, []);

  // Corner stunt — fired when the robot is dropped in a screen corner.
  // Skipped while a reminder alert is playing (the alert takes priority).
  const doStunt = useCallback(() => {
    if (alertRef.current) return;
    stuntKindRef.current = Math.random() < 0.5 ? "flip" : "spin";
    stuntStartRef.current = performance.now();
    // The stunt replaces any wave/walk in progress.
    waveStartRef.current = -1e9;
    walkStartRef.current = -1e9;
    lastTouchRef.current = Date.now();
    setGreeting({ header: "Nice corner! 🤸", quote: '"Watch this move." 🏅' });
    setShowGreeting(true);
  }, []);

  // Any real user activity (mouse moving, clicking, typing, scrolling) wakes
  // the robot and restarts the idle clock that sleep mode counts down from.
  const markActivity = useCallback(() => {
    lastTouchRef.current = Date.now();
    if (sleepRef.current) {
      sleepRef.current = false;
      setIsSleeping(false);
      // Waking up — greet whoever came back.
      if (!alertRef.current) startWave();
    }
  }, [startWave]);

  useEffect(() => {
    const events = ["mousemove", "mousedown", "keydown", "wheel", "touchstart"] as const;
    let lastSeen = 0;
    const onActivity = () => {
      const now = performance.now();
      // Throttle while awake (mousemove fires constantly); wake instantly.
      if (now - lastSeen < 250 && !sleepRef.current) return;
      lastSeen = now;
      markActivity();
    };
    events.forEach((name) => window.addEventListener(name, onActivity, { passive: true }));
    return () => events.forEach((name) => window.removeEventListener(name, onActivity));
  }, [markActivity]);

  // Hovering the robot itself also earns a greeting wave (with a cooldown).
  const touchRobot = () => {
    markActivity();
    if (
      !alertRef.current &&
      !sleepRef.current &&
      Date.now() - lastWaveRef.current > HOVER_WAVE_COOLDOWN_MS &&
      performance.now() - walkStartRef.current > WALK_DURATION_MS
    ) {
      startWave();
    }
  };

  // Sleep mode — doze off after SLEEP_AFTER_MS with no user activity. Never
  // while a reminder alert is playing. Also schedules the periodic walk and
  // the occasional idle wave.
  useEffect(() => {
    lastTouchRef.current = Date.now();
    nextAutoWaveRef.current = Date.now() + AUTO_WAVE_MIN_MS;
    nextWalkRef.current = Date.now() + WALK_INTERVAL_MS;
    const id = setInterval(() => {
      if (sleepRef.current || alertRef.current) return;
      const now = Date.now();
      const perfNow = performance.now();
      const walkingNow = perfNow - walkStartRef.current < WALK_DURATION_MS;
      // Never doze off in the middle of a walk (it would snap the robot back).
      if (now - lastTouchRef.current >= SLEEP_AFTER_MS && !walkingNow) {
        sleepRef.current = true;
        setIsSleeping(true);
        return;
      }
      // Every few minutes: take a walk — but not while the robot is being dragged
      // or the assistant panel is open next to it.
      if (
        now >= nextWalkRef.current &&
        !walkingNow &&
        !draggingRef.current &&
        !panelOpenRef.current &&
        perfNow - waveStartRef.current > WAVE_DURATION_MS
      ) {
        startWalk();
        return;
      }
      // Awake and idle: wave on its own now and then.
      if (!walkingNow && now >= nextAutoWaveRef.current && perfNow - waveStartRef.current > WAVE_DURATION_MS) {
        startWave();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [startWave, startWalk]);

  // Reminder alert — driven by what the Reminder Scheduler actually FIRES (the same single occurrence that produces the
  // toast, the Bell entry and the chime), once. Same module gate as the Assistant panel's own Active Reminders list
  // (Projects access), so a user who can't see reminders is never alerted about them. Clicking the robot acknowledges it.
  const canAccessProjects = hasModuleAccess(user, "Projects");
  const soundState = useSyncExternalStore(
    (listener) => reminderSoundService.subscribe(listener),
    () => reminderSoundService.getState(),
    () => reminderSoundService.getState()
  );
  useEffect(() => {
    if (!user || !canAccessProjects) return;

    let alertTimer: ReturnType<typeof setTimeout> | undefined;

    const fireAlert = (header: string, body: string) => {
      alertRef.current = true;
      alertStartRef.current = performance.now();
      lastTouchRef.current = Date.now();
      if (sleepRef.current) {
        sleepRef.current = false;
        setIsSleeping(false);
      }
      setShowGreeting(false);
      setAlertBubble({ header, body });
      if (alertTimer) clearTimeout(alertTimer);
      alertTimer = setTimeout(() => {
        alertRef.current = false;
        setAlertBubble(null);
      }, ALERT_DURATION_MS);
    };

    const show = (batch: FiredReminderDetail[]) => {
      const bubble = buildAlertBubble(alertedOccurrences.filter(batch));
      if (bubble) fireAlert(bubble.header, bubble.body);
    };

    // Reminders that fired a moment before this mounted (the robot's chunk loads lazily) — shown once, never twice.
    show(reminderScheduler.getRecentFires());
    const onFired = (event: Event) => show((event as CustomEvent<FiredReminderDetail[]>).detail ?? []);
    window.addEventListener(REMINDER_FIRED_EVENT, onFired);
    return () => {
      window.removeEventListener(REMINDER_FIRED_EVENT, onFired);
      if (alertTimer) clearTimeout(alertTimer);
      alertRef.current = false;
    };
  }, [user, canAccessProjects]);

  // 3. Three.js 3D WebGL "Astro" robot scene setup (full-body white robot
  // with antennae, black screen face and blue accents — procedural
  // primitives only, no external model/image asset, same approach as the
  // previous avatars).
  useEffect(() => {
    const container = mountRef.current;
    if (!container || canvasFailed) return;

    const width = ORB_WIDTH;
    const height = ORB_HEIGHT;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(0, 2.7, 9.07);

    // No MSAA (antialias: false) — measured: with multisampling on, a machine
    // with weak/software graphics (VMs, remote desktops, some office PCs) was
    // busy ~100% just rendering this 110x130 canvas, which made the assistant
    // panel and the rest of the page feel stuck. Drawing at 2x resolution and
    // letting the browser downscale gives equally smooth edges for ~8% busy.
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });
    } catch {
      // WebGL passed the probe but the renderer still could not start (blocklisted
      // driver, out of contexts…). Switch to the fallback avatar — deferred, so
      // this is not a state update inside the effect body.
      window.setTimeout(() => setCanvasFailed(true), 0);
      return;
    }
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.max(2, Math.min(window.devicePixelRatio, 2)));
    container.appendChild(renderer.domElement);

    // A GPU reset or a browser reclaiming contexts fires "webglcontextlost".
    // Pausing the draw until "webglcontextrestored" (three.js rebuilds its GPU
    // resources itself) avoids drawing into a dead context.
    let contextLost = false;
    const onContextLost = (e: Event) => {
      e.preventDefault(); // required, otherwise the context is never restored
      contextLost = true;
    };
    const onContextRestored = () => {
      contextLost = false;
    };
    renderer.domElement.addEventListener("webglcontextlost", onContextLost);
    renderer.domElement.addEventListener("webglcontextrestored", onContextRestored);

    // Every geometry/material/texture created below is tracked so cleanup can
    // dispose all of them, not just a hand-picked few.
    const disposables: Array<{ dispose: () => void }> = [];
    const track = <T extends { dispose: () => void }>(x: T): T => {
      disposables.push(x);
      return x;
    };

    // Studio lighting: a small procedural room environment gives the glossy
    // shell and the black screen real reflections.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envRT = pmrem.fromScene(roomEnv, 0.04);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.85;
    track(envRT);
    pmrem.dispose();
    roomEnv.dispose();

    scene.add(new THREE.HemisphereLight(0xe0ecff, 0x39405a, 0.9));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
    keyLight.position.set(4, 9, 9);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x9ec5ff, 0.6);
    fillLight.position.set(-6, 3, 5);
    scene.add(fillLight);

    // ── Materials ────────────────────────────────────────────────────────
    // MeshStandardMaterial (not Physical): no clearcoat layer, so every
    // fragment is cheaper — the gloss comes from the environment map instead.
    const shellMat = track(new THREE.MeshStandardMaterial({ color: 0xf4f6f9, roughness: 0.22, metalness: 0.05 }));
    const greyMat = track(new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.3, metalness: 0.55 }));
    const screenMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x030507,
        roughness: 0.14,
        metalness: 0.25,
        // Own env map at low intensity: in this three.js version a material's
        // envMapIntensity is ignored for scene.environment, and the studio
        // light panel would otherwise wash the black screen out to grey.
        envMap: envRT.texture,
        envMapIntensity: 0.22,
      })
    );
    // Every glowing/blue part is tracked here with its own theme tint, so the
    // reminder alert (and sleep dimming) can still recolour the whole robot
    // from a single place while the idle look stays two-tone (blue + cyan).
    const glowMats: Array<{ mat: THREE.MeshStandardMaterial; base: number; tint: THREE.Color }> = [];
    const makeGlow = (base: number, hex: number = PMO_BLUE) => {
      const mat = track(
        new THREE.MeshStandardMaterial({
          color: hex,
          emissive: hex,
          emissiveIntensity: base,
          roughness: 0.3,
        })
      );
      glowMats.push({ mat, base, tint: new THREE.Color(hex) });
      return mat;
    };
    const blueMat = makeGlow(0.05);
    const eyeMat = makeGlow(1.0, PMO_CYAN);
    const chestMat = makeGlow(0.8, PMO_CYAN);

    // ── Geometry helpers ─────────────────────────────────────────────────
    const addMesh = (geo: THREE.BufferGeometry, mat: THREE.Material) => new THREE.Mesh(track(geo), mat);
    const ell = (
      mat: THREE.Material,
      x: number,
      y: number,
      z: number,
      sx: number,
      sy: number,
      sz: number,
      seg = 20
    ) => {
      const m = addMesh(new THREE.SphereGeometry(1, seg, Math.round(seg * 0.75)), mat);
      m.scale.set(sx, sy, sz);
      m.position.set(x, y, z);
      return m;
    };
    // Rounded-square ("squircle") solid: a sphere pushed toward a
    // superellipsoid (n = 2 is a sphere; larger is squarer).
    const sq = (
      mat: THREE.Material,
      x: number,
      y: number,
      z: number,
      rx: number,
      ry: number,
      rz: number,
      n = 2.6,
      seg = 32
    ) => {
      const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.75));
      const p = g.attributes.position as THREE.BufferAttribute;
      const e = 2 / n;
      for (let i = 0; i < p.count; i++) {
        const a = p.getX(i);
        const b = p.getY(i);
        const c = p.getZ(i);
        p.setXYZ(
          i,
          Math.sign(a) * Math.pow(Math.abs(a), e) * rx,
          Math.sign(b) * Math.pow(Math.abs(b), e) * ry,
          Math.sign(c) * Math.pow(Math.abs(c), e) * rz
        );
      }
      g.computeVertexNormals();
      const m = addMesh(g, mat);
      m.position.set(x, y, z);
      return m;
    };

    // Root holds the whole body (feet at y = 0); `robotGroup` floats gently.
    const robotGroup = new THREE.Group();
    scene.add(robotGroup);
    const upper = new THREE.Group();
    robotGroup.add(upper);

    // ── Legs: short white leg, blue ankle ring, rounded sneaker with a
    //    blue glowing sole ─────────────────────────────────────────────────
    const makeLeg = (side: 1 | -1) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.54, 0.98, 0);
      robotGroup.add(hip);
      hip.add(ell(blueMat, 0, -0.02, 0, 0.22, 0.16, 0.22, 16));
      const kneeG = new THREE.Group();
      kneeG.position.y = -0.1;
      hip.add(kneeG);
      const leg = addMesh(new THREE.CylinderGeometry(0.23, 0.26, 0.36, 24), shellMat);
      leg.position.y = -0.2;
      kneeG.add(leg);
      const ankle = addMesh(new THREE.TorusGeometry(0.27, 0.065, 12, 30), blueMat);
      ankle.rotation.x = Math.PI / 2;
      ankle.position.y = -0.4;
      kneeG.add(ankle);
      const foot = new THREE.Group();
      foot.position.set(0, -0.62, 0);
      kneeG.add(foot);
      foot.add(sq(shellMat, 0, 0.02, 0.14, 0.38, 0.21, 0.56, 2.6, 24));
      foot.add(sq(shellMat, 0, 0.1, 0.4, 0.3, 0.15, 0.26, 2.4, 24));
      foot.add(sq(blueMat, 0, -0.17, 0.14, 0.41, 0.075, 0.6, 3, 28));
      foot.add(sq(blueMat, 0, 0.05, -0.38, 0.24, 0.09, 0.1, 2.6, 16));
      return { hip, kneeG };
    };
    const legL = makeLeg(-1);
    const legR = makeLeg(1);

    // ── Body: small rounded torso with a blue chest light ───────────────
    upper.add(sq(shellMat, 0, 1.3, 0, 0.72, 0.62, 0.58, 2.4, 28));
    const chestLight = sq(chestMat, 0, 1.42, 0.56, 0.24, 0.075, 0.05, 3, 16);
    upper.add(chestLight);
    upper.add(ell(greyMat, 0, 1.85, 0, 0.4, 0.14, 0.36, 16));

    // ── Head: big rounded square, black screen with a thin bezel, bar eyes ─
    const HEAD_PIVOT_Y = 1.7;
    const HEAD_CENTER_Y = 1.4;
    const headPivot = new THREE.Group();
    headPivot.position.set(0, HEAD_PIVOT_Y, 0);
    upper.add(headPivot);
    headPivot.add(sq(shellMat, 0, HEAD_CENTER_Y, 0, 1.66, 1.42, 1.4, 2.7, 40));
    headPivot.add(sq(screenMat, 0, HEAD_CENTER_Y, 0.86, 1.34, 1.0, 0.6, 2.8, 32));
    const eyeGroup = new THREE.Group();
    eyeGroup.position.set(0, HEAD_CENTER_Y, 1.47);
    headPivot.add(eyeGroup);
    const eyes = [-1, 1].map((s) => {
      const e = sq(eyeMat, s * 0.6, 0, 0, 0.17, 0.36, 0.05, 4, 14);
      eyeGroup.add(e);
      return e;
    });
    // Ear pods: white capsule with a blue stripe on the outer face.
    [-1, 1].forEach((s) => {
      const pod = new THREE.Group();
      pod.position.set(s * 1.72, HEAD_CENTER_Y - 0.06, 0);
      headPivot.add(pod);
      pod.add(sq(shellMat, 0, 0, 0, 0.3, 0.62, 0.56, 2.4, 20));
      pod.add(sq(blueMat, s * 0.22, 0, 0, 0.1, 0.4, 0.3, 2.4, 20));
    });
    // Antennae: short blue stalks with leaf-like bulbs; they wiggle while
    // idle and droop when asleep.
    const antennas = ([-1, 1] as const).map((s) => {
      const g = new THREE.Group();
      g.position.set(s * 0.72, HEAD_CENTER_Y + 1.28, -0.02);
      headPivot.add(g);
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(s * -0.04, 0.38, 0),
        new THREE.Vector3(s * 0.12, 0.72, 0)
      );
      g.add(addMesh(new THREE.TubeGeometry(curve, 20, 0.1, 10, false), blueMat));
      const bulb = ell(blueMat, s * 0.14, 0.88, 0, 0.27, 0.3, 0.2, 20);
      bulb.rotation.z = -s * 0.45;
      g.add(bulb);
      return { g, s };
    });

    // ── Arms (rest: hang along -y) ───────────────────────────────────────
    const makeArm = (side: 1 | -1) => {
      const sh = new THREE.Group();
      sh.position.set(side * 1.0, 1.58, 0);
      upper.add(sh);
      sh.add(ell(blueMat, 0, 0, 0, 0.34, 0.34, 0.34, 22));
      const ua = addMesh(new THREE.CylinderGeometry(0.24, 0.21, 0.36, 20), shellMat);
      ua.position.y = -0.23;
      sh.add(ua);
      const el = new THREE.Group();
      el.position.y = -0.36;
      sh.add(el);
      el.add(ell(shellMat, 0, 0, 0, 0.24, 0.24, 0.24, 18));
      const fa = addMesh(new THREE.CylinderGeometry(0.24, 0.21, 0.34, 20), shellMat);
      fa.position.y = -0.22;
      el.add(fa);
      const wr = new THREE.Group();
      wr.position.y = -0.34;
      el.add(wr);
      const cuff = addMesh(new THREE.TorusGeometry(0.22, 0.055, 10, 26), blueMat);
      cuff.rotation.x = Math.PI / 2;
      wr.add(cuff);
      const hand = new THREE.Group();
      hand.position.y = -0.05;
      wr.add(hand);
      hand.add(ell(shellMat, 0, -0.15, 0, 0.27, 0.29, 0.25, 22));
      return { sh, el, side };
    };
    const armA = makeArm(-1);
    const armB = makeArm(1);

    // Ground Shadow Plane
    const shadowGeo = track(new THREE.PlaneGeometry(3.6, 1.9));
    const shadowCanvas = document.createElement("canvas");
    shadowCanvas.width = 64;
    shadowCanvas.height = 64;
    const ctx = shadowCanvas.getContext("2d");
    if (ctx) {
      const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
      grad.addColorStop(0, "rgba(15, 23, 42, 0.65)");
      grad.addColorStop(1, "rgba(15, 23, 42, 0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 64);
    }
    const shadowTex = track(new THREE.CanvasTexture(shadowCanvas));
    const shadowMat = track(
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.6, depthWrite: false })
    );
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.set(0, 0.02, 0.1);
    scene.add(shadowMesh);

    // Mouse Tracking
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouseRef.current.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener("mousemove", handleMouseMove);

    // Blinking Timer
    // Both timers are tracked so cleanup can stop the loop at any moment — an
    // untracked "end of blink" timer would otherwise re-arm itself after the
    // orb unmounted and keep the disposed scene alive forever.
    let blinkTimer: ReturnType<typeof setTimeout> | undefined;
    let blinkEndTimer: ReturnType<typeof setTimeout> | undefined;
    let isBlinking = false;
    const scheduleBlink = () => {
      blinkTimer = setTimeout(() => {
        isBlinking = true;
        blinkEndTimer = setTimeout(() => {
          isBlinking = false;
          scheduleBlink();
        }, 180);
      }, 3500 + Math.random() * 2000);
    };
    scheduleBlink();

    // Animation Render Loop
    const alertColorA = new THREE.Color(ALERT_COLOR_A);
    const alertColorB = new THREE.Color(ALERT_COLOR_B);
    const sleepColor = new THREE.Color(SLEEP_COLOR);
    const tmpColor = new THREE.Color();
    const pulseColor = new THREE.Color();

    let animationFrameId: number;
    const startMs = performance.now();
    let prevMs = startMs;
    let sleepK = 0; // 0 awake → 1 asleep (smoothed)
    let alertK = 0; // 0 normal → 1 alerting (smoothed)
    let headYaw = 0;
    let bodyYaw = 0;
    let walkYaw = 0;
    let walkAmp = 0; // 0 standing → 1 mid-stride (smoothed)
    let headPitch = 0;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const nowMs = performance.now();
      const frameBudget = panelOpenRef.current
        ? FRAME_MS_PANEL_OPEN
        : sleepRef.current
          ? FRAME_MS_ASLEEP
          : nowMs - walkStartRef.current < WALK_DURATION_MS
            ? FRAME_MS_WALK
            : FRAME_MS_AWAKE;
      if (nowMs - prevMs < frameBudget - 2) return; // skip this frame entirely (no update, no draw)
      if (contextLost) return; // GPU context gone — wait for "webglcontextrestored"
      const t = (nowMs - startMs) / 1000;
      const dt = Math.min((nowMs - prevMs) / 1000, 0.25);
      prevMs = nowMs;

      const smooth = 1 - Math.pow(0.003, dt);
      // Per-frame easing factors below were tuned at 60fps; this keeps the
      // motion identical on slower/faster displays.
      const f60 = (k: number) => 1 - Math.pow(1 - k, dt * 60);
      sleepK += ((sleepRef.current ? 1 : 0) - sleepK) * smooth;
      alertK += ((alertRef.current ? 1 : 0) - alertK) * smooth;
      const alertT = (nowMs - alertStartRef.current) / 1000;

      // Floating idle animation (calmer while asleep)
      const floatOffsetY = Math.sin(t * 2.2) * 0.1 * (1 - 0.7 * sleepK);
      robotGroup.position.y = floatOffsetY;
      // Quick shake when an alert starts
      // Corner stunt state — flip (backflip about the body centre) or spin-jump.
      const stp = (nowMs - stuntStartRef.current) / STUNT_DURATION_MS;
      const stunting = stp >= 0 && stp < 1 && !alertRef.current && sleepK < 0.5;
      const stuntK = stunting ? Math.sin(stp * Math.PI) : 0; // 0 → 1 → 0 over the stunt
      const stuntE = stunting ? (stp < 0.5 ? 2 * stp * stp : 1 - Math.pow(-2 * stp + 2, 2) / 2) : 0;
      const stuntFlip = stunting && stuntKindRef.current === "flip";
      const stuntSpin = stunting && stuntKindRef.current === "spin";

      // Walk: every WALK_INTERVAL_MS the whole assistant walks across the screen
      // (a real sideways move of the container, not a drift inside the canvas),
      // pauses at the far point to wave, and walks back to where it started.
      // Never while alerting or asleep.
      const wkp = (nowMs - walkStartRef.current) / WALK_DURATION_MS;
      const walking = wkp >= 0 && wkp < 1 && !alertRef.current && sleepK < 0.5 && !stunting && !draggingRef.current;
      let walkTargetX = 0;
      let walkTargetYaw = 0;
      let stride = 0;
      let moving = false;
      if (walking) {
        // Steady pace out and back (the smoothing below gives the soft start/stop).
        const leg = wkp < 0.4 ? wkp / 0.4 : wkp < 0.6 ? 1 : 1 - (wkp - 0.6) / 0.4;
        walkTargetX = walkDirRef.current * walkDistRef.current * leg;
        moving = wkp < 0.4 || wkp > 0.6;
        const vel = moving ? (wkp < 0.4 ? walkDirRef.current : -walkDirRef.current) : 0;
        walkTargetYaw = vel * 1.2;
        stride = moving ? Math.sin(t * 7) : 0;
        if (wkp > 0.4 && !walkWavedRef.current) {
          // Pause at the far point and wave.
          walkWavedRef.current = true;
          waveSideRef.current = "A";
          waveStartRef.current = nowMs;
          lastWaveRef.current = Date.now();
        }
      }
      // The offset lives in walkPxRef (px) so a pointer-down can read it, and
      // zero it, to take over from a walk in progress.
      const curWalkPx = walkPxRef.current;
      let nextWalkPx = curWalkPx + (walkTargetX - curWalkPx) * f60(0.15);
      if (walkTargetX === 0 && Math.abs(nextWalkPx) < 0.05) nextWalkPx = 0; // settled back home
      if (nextWalkPx !== curWalkPx) {
        walkPxRef.current = nextWalkPx;
        applyOrbTransform();
      }
      walkYaw += (walkTargetYaw - walkYaw) * f60(0.12);
      walkAmp += ((moving ? 1 : 0) - walkAmp) * f60(0.15);
      robotGroup.position.x = alertRef.current && alertT < 0.6 ? Math.sin(t * 50) * 0.06 : 0;
      robotGroup.position.y += Math.abs(Math.sin(t * 7)) * 0.14 * walkAmp;
      // Stunt transforms. The flip rotates about the body centre (not the
      // feet) and the robot shrinks a little mid-air so the whole move stays
      // inside the small canvas: position is solved so the body-centre point
      // stays put while scale/rotation change around it.
      const STUNT_PIVOT_Y = 2.7;
      const stuntScale = 1 - 0.2 * stuntK;
      const stuntTheta = stuntFlip ? -Math.PI * 2 * stuntE : 0;
      robotGroup.scale.setScalar(stuntScale);
      robotGroup.rotation.x = stuntTheta;
      robotGroup.position.y += 0.6 * stuntK + STUNT_PIVOT_Y - stuntScale * STUNT_PIVOT_Y * Math.cos(stuntTheta);
      robotGroup.position.z = -stuntScale * STUNT_PIVOT_Y * Math.sin(stuntTheta);
      legL.hip.rotation.x = stride * 0.6 * walkAmp;
      legR.hip.rotation.x = -stride * 0.6 * walkAmp;
      legL.kneeG.rotation.x = Math.max(0, -stride) * 0.8 * walkAmp;
      legR.kneeG.rotation.x = Math.max(0, stride) * 0.8 * walkAmp;
      upper.position.y = Math.sin(t * 2) * 0.03;

      const shadowScale = 1 - floatOffsetY * 0.3;
      shadowMesh.scale.set(shadowScale, shadowScale, 1);
      shadowMat.opacity = 0.6 - floatOffsetY * 0.3;

      // Mouse inertia tracking (the robot looks at the cursor unless asleep)
      const awake = 1 - sleepK;
      const mx = mouseRef.current.x * awake;
      const my = mouseRef.current.y * awake;
      headYaw += (mx * 0.45 - headYaw) * f60(0.08);
      headPitch += (-my * 0.3 + sleepK * 0.45 - headPitch) * f60(0.08);
      bodyYaw += (mx * 0.18 - bodyYaw) * f60(0.08);
      robotGroup.rotation.y = bodyYaw + walkYaw + (stuntSpin ? Math.PI * 2 * stuntE : 0);
      headPivot.rotation.set(headPitch, headYaw, 0);

      eyeGroup.position.x += (mx * 0.12 - eyeGroup.position.x) * f60(0.12);
      eyeGroup.position.y += (HEAD_CENTER_Y + my * 0.1 - eyeGroup.position.y) * f60(0.12);

      // Eyes: blink / close when asleep / widen when alerting
      const eyeOpen = (isBlinking ? 0.08 : (1 - sleepK) * (1 + 0.1 * alertK) + sleepK * 0.07) * (1 - 0.4 * stuntK);
      eyes.forEach((e) => {
        e.scale.y += (eyeOpen - e.scale.y) * f60(isBlinking ? 0.7 : 0.3);
        e.scale.x = 1 + 0.15 * sleepK + 0.1 * alertK;
      });

      // Antennae: gentle wiggle, livelier while alerting, droop when asleep
      antennas.forEach(({ g, s }, i) => {
        const ph = i * 1.3;
        g.rotation.z = Math.sin(t * 2.2 + ph) * (0.05 + (alertK + stuntK) * 0.25) - headYaw * 0.15 + s * 0.35 * sleepK;
        g.rotation.x = Math.sin(t * 1.7 + ph) * (0.03 + (alertK + stuntK) * 0.15) + headPitch * 0.1;
      });

      // Colour: theme blue/cyan → pulsing amber/red while alerting → dim when asleep
      const pulse = (Math.sin(t * 9) + 1) / 2;
      pulseColor.copy(alertColorA).lerp(alertColorB, pulse);
      const glowMul = 1 + alertK * (0.3 + pulse * 0.9) - sleepK * 0.75 + Math.sin(t * 2.4) * 0.06 + 0.6 * stuntK;
      glowMats.forEach(({ mat, base, tint }) => {
        tmpColor.copy(tint).lerp(pulseColor, alertK).lerp(sleepColor, 0.5 * sleepK);
        mat.color.copy(tmpColor);
        mat.emissive.copy(tmpColor);
        mat.emissiveIntensity = base * glowMul;
      });

      // Arms: hang at rest; the right arm raises sideways to point while a
      // reminder alert is playing.
      // Gentle idle sway so the hands are never frozen.
      const sway = (1 - sleepK) * 0.05;
      const swayA = Math.sin(t * 1.3) * sway;
      const swayB = Math.sin(t * 1.3 + 1.7) * sway;

      // Waves alternate between the left and right hand (greeting / hover /
      // wake / periodic / walk pause) — never while an alert is playing or
      // while asleep.
      const wp = (nowMs - waveStartRef.current) / WAVE_DURATION_MS;
      let waveK = 0;
      if (wp >= 0 && wp < 1 && !alertRef.current && sleepK < 0.5) {
        waveK = Math.sin(Math.min(wp / 0.16, 1) * (Math.PI / 2)) * (wp > 0.86 ? (1 - wp) / 0.14 : 1);
      }
      const waveA = waveSideRef.current === "A" ? waveK : 0;
      const waveB = waveSideRef.current === "B" ? waveK : 0;
      // Arms counter-swing with the stride while walking.
      const strideSwing = stride * 0.7 * walkAmp;
      armA.sh.rotation.set(swayA - strideSwing, 0, armA.side * (0.1 + 1.6 * waveA));
      armA.el.rotation.set(-0.08 * (1 - waveA), 0, armA.side * (0.75 * waveA + Math.sin(t * 9) * 0.3 * waveA));

      // Right arm: waves too, and points while a reminder alert is playing.
      const alertArm = alertK;
      armB.sh.rotation.set(
        swayB + strideSwing - 0.35 * alertArm,
        0,
        armB.side * (0.1 + 1.6 * waveB + (1.55 - 0.1) * alertArm)
      );
      armB.el.rotation.set(
        -0.08 * (1 - waveB) + 0.03 * alertArm,
        0,
        armB.side * (0.75 * waveB + Math.sin(t * 9 + 1) * 0.3 * waveB)
      );
      // Both arms thrown up during a stunt.
      armA.sh.rotation.z += armA.side * 2.2 * stuntK;
      armB.sh.rotation.z += armB.side * 2.2 * stuntK;


      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      clearTimeout(blinkTimer);
      clearTimeout(blinkEndTimer);
      window.removeEventListener("mousemove", handleMouseMove);
      renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
      renderer.domElement.removeEventListener("webglcontextrestored", onContextRestored);
      scene.environment = null;
      disposables.forEach((resource) => resource.dispose());
      renderer.dispose();
      // dispose() frees the GPU resources but not the context itself; browsers cap
      // live contexts (~16), so release it explicitly (matters across logout/login).
      renderer.forceContextLoss();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [canvasFailed, applyOrbTransform]);

  // 4. Pointer Drag vs Click Logic
  const handlePointerDown = (e: React.PointerEvent) => {
    setShowGreeting(false); // Dismiss greeting on drag start
    touchRobot();
    hasDraggedRef.current = false;
    lastDragPosRef.current = null;
    // Grabbing the robot mid-walk stops the walk right where it is: its visible
    // spot (saved position + walk offset) becomes its position, so the drag or
    // click starts from where it really is instead of jumping back first.
    let startX = pos.x;
    if (walkPxRef.current !== 0) {
      startX = Math.max(16, Math.min(pos.x + walkPxRef.current, window.innerWidth - ORB_WIDTH - 16));
      walkPxRef.current = 0;
      walkStartRef.current = -1e9;
      setPos({ x: startX, y: pos.y });
    }
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: startX,
      posY: pos.y,
    };
    draggingRef.current = true;
    setIsDragging(true);
    // Capture on the container itself (not whichever child — the canvas — was
    // hit) so move/up/cancel all arrive at one stable element.
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  // While dragging, the robot is moved with a CSS transform straight on the DOM
  // node: no React state update, no re-render and no localStorage write per
  // pointer-move (those used to run at the full pointer rate). The new position
  // is committed to state — and therefore persisted — once, when the drag ends.
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;

    const deltaX = e.clientX - dragStartRef.current.x;
    const deltaY = e.clientY - dragStartRef.current.y;
    const distance = Math.hypot(deltaX, deltaY);

    if (distance > 6) {
      hasDraggedRef.current = true;
    }

    if (hasDraggedRef.current) {
      lastTouchRef.current = Date.now();
      const newX = dragStartRef.current.posX + deltaX;
      const newY = dragStartRef.current.posY + deltaY;

      // Clamp inside viewport with 16px safety margin — plain viewport
      // bounds, no scroll offset needed anywhere with fixed positioning.
      const clampedX = Math.max(16, Math.min(newX, window.innerWidth - ORB_WIDTH - 16));
      const clampedY = Math.max(16, Math.min(newY, window.innerHeight - ORB_HEIGHT - 16));

      lastDragPosRef.current = { x: clampedX, y: clampedY };
      dragOffsetRef.current = { x: clampedX - dragStartRef.current.posX, y: clampedY - dragStartRef.current.posY };
      applyOrbTransform();
    }
  };

  // The drag ended. Commit where the robot was dropped (if it was really
  // dragged). The transform is cleared by the layout effect below in the same
  // commit that applies the new left/top, so there is no one-frame jump back.
  const commitDrag = () => {
    const dropped = lastDragPosRef.current;
    if (hasDraggedRef.current && dropped) {
      setPos({ x: dropped.x, y: dropped.y });
    } else {
      dragOffsetRef.current = { x: 0, y: 0 };
      applyOrbTransform();
    }
    return dropped;
  };

  // Pointer cancelled by the browser (touch gesture took over, window lost focus,
  // capture stolen): finish the drag where it stands — never leave the robot
  // stuck in "dragging" and glued to the pointer. No click, no stunt.
  const handlePointerCancel = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setIsDragging(false);
    commitDrag();
  };

  useLayoutEffect(() => {
    posRef.current = pos;
    dragOffsetRef.current = { x: 0, y: 0 };
    applyOrbTransform();
  }, [pos, applyOrbTransform]);

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setIsDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);

    const dropped = commitDrag();

    // Dropped in a screen corner after a drag → do a stunt right away.
    // Uses the last position recorded by the move handler rather than React
    // state, which can lag a frame behind a quick release.
    if (hasDraggedRef.current && isInCorner(dropped ?? pos)) {
      doStunt();
    }

    // If movement was less than 6px, treat as a CLICK to toggle panel!
    if (!hasDraggedRef.current && containerRef.current) {
      setShowGreeting(false);
      // Opening the panel acknowledges a playing reminder alert.
      if (alertRef.current) {
        alertRef.current = false;
        setAlertBubble(null);
      }
      const rect = containerRef.current.getBoundingClientRect();
      onTogglePanel(rect);
    }
  };

  // pos.y is viewport-relative again (see the module-level comment), so the
  // original direct comparison is correct once more — no scroll offset
  // involved anywhere.
  const greetingShowAbove = pos.y > window.innerHeight / 2;

  // Shared placement for the greeting and reminder-alert speech bubbles.
  const bubbleStyle: React.CSSProperties = {
    position: "fixed",
    left: `${Math.max(16, Math.min(pos.x - 70, window.innerWidth - 270))}px`,
    top: greetingShowAbove
      ? `${Math.max(16, pos.y - 84)}px`
      : `${Math.min(window.innerHeight - 100, pos.y + ORB_HEIGHT + 8)}px`,
  };

  // Portal directly to document.body — see the module-level comment for
  // why. Rendered outside MainLayout's own DOM subtree entirely, so no
  // ancestor there (now or introduced later) can ever again turn this
  // component's `position: fixed` into something anchored to a scrolling
  // container instead of the true viewport. Nothing else about this
  // component changes: same state, same refs, same event handlers, same
  // single mounted instance (React portals don't create a second React
  // tree or a second component instance, only a different DOM insertion
  // point) — only WHERE in the DOM this JSX is inserted differs.
  return createPortal(
    <>
      {/* Personalized Login Greeting Speech Bubble attached to Draggable Orb. */}
      {showGreeting && greeting && !alertBubble && (
        <div
          style={bubbleStyle}
          className="z-[99998] pointer-events-none no-print w-64 bg-slate-900/95 text-white border border-blue-500/40 rounded-2xl shadow-2xl p-3 text-xs animate-in fade-in slide-in-from-bottom-2 duration-300 backdrop-blur-md"
        >
          <div className="flex items-center gap-1.5 mb-1">
            <span className="font-extrabold text-blue-300 text-xs">{greeting.header}</span>
          </div>
          <p className="text-[11px] font-medium text-slate-300 italic leading-snug">
            {greeting.quote}
          </p>

          {/* Directional Popover Pointer Arrow */}
          <div
            className={`absolute left-1/2 -translate-x-1/2 w-3 h-3 bg-slate-900 border-r border-b border-blue-500/40 transform rotate-45 ${
              greetingShowAbove ? "-bottom-1.5 border-t-0 border-l-0" : "-top-1.5 border-b-0 border-r-0"
            }`}
          />
        </div>
      )}

      {/* Reminder alert bubble — same look as the greeting bubble, amber. */}
      {alertBubble && !isDragging && (
        <div
          style={bubbleStyle}
          className="z-[99998] pointer-events-none no-print w-64 bg-slate-900/95 text-white border border-amber-500/60 rounded-2xl shadow-2xl p-3 text-xs animate-in fade-in slide-in-from-bottom-2 duration-300 backdrop-blur-md"
        >
          <div className="flex items-center gap-1.5 mb-1">
            <span className="font-extrabold text-amber-300 text-xs">{alertBubble.header}</span>
          </div>
          <p className="text-[11px] font-medium text-slate-200 leading-snug">{alertBubble.body}</p>
          <p className="text-[10px] text-slate-400 mt-1">Click me to open Active Reminders.</p>
          {soundState.enabled && (soundState.status === "blocked" || soundState.status === "needs-interaction") && (
            <p className="text-[10px] text-amber-300 mt-1">🔇 The browser is blocking the reminder sound — click anywhere on the page to enable it.</p>
          )}

          <div
            className={`absolute left-1/2 -translate-x-1/2 w-3 h-3 bg-slate-900 border-r border-b border-amber-500/60 transform rotate-45 ${
              greetingShowAbove ? "-bottom-1.5 border-t-0 border-l-0" : "-top-1.5 border-b-0 border-r-0"
            }`}
          />
        </div>
      )}

      {/* Floating Draggable Orb — position: fixed, viewport-relative
          pos.x/pos.y (see the module-level comment at the top of this
          file). Always visible regardless of scroll, by design. */}
      <div
        ref={containerRef}
        style={{
          position: "fixed",
          left: `${pos.x}px`,
          top: `${pos.y}px`,
          width: `${ORB_WIDTH}px`,
          height: `${ORB_HEIGHT}px`,
          // Without this a touch drag is taken over by the browser (scroll/pan),
          // which cancels the pointer after a few pixels.
          touchAction: "none",
        }}
        onPointerEnter={touchRobot}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onLostPointerCapture={handlePointerCancel}
        title="Drag to move PMO Assistant | Click to open panel"
        className={`z-[99999] select-none no-print transition-shadow duration-200 ${
          isDragging ? "cursor-grabbing scale-105" : "cursor-grab hover:scale-105"
        }`}
      >
        {canvasFailed ? (
          // Fallback when WebGL is unavailable: a flat CSS version of the robot's
          // head (white shell, black screen, two cyan bar eyes) so the assistant
          // can still be seen, dragged and clicked.
          <div className="w-full h-full flex items-center justify-center" aria-hidden="true">
            <div className="relative w-[72px] h-[60px] rounded-[22px] bg-gradient-to-b from-slate-100 to-slate-300 border border-slate-300 shadow-lg flex items-center justify-center">
              <div className="w-[56px] h-[38px] rounded-[16px] bg-slate-950 flex items-center justify-center gap-2.5">
                <span className="w-2.5 h-4 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.9)]" />
                <span className="w-2.5 h-4 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.9)]" />
              </div>
              <span className="absolute -top-2 left-4 w-1.5 h-3 rounded-full bg-blue-600" />
              <span className="absolute -top-2 right-4 w-1.5 h-3 rounded-full bg-blue-600" />
            </div>
          </div>
        ) : (
          <div ref={mountRef} className="w-full h-full flex items-center justify-center" />
        )}

        {/* Sleep indicator — floating "Zzz" while the robot is dozing. */}
        {isSleeping && (
          <div className="pointer-events-none absolute right-6 top-6 font-extrabold text-sky-300" aria-hidden="true">
            <style>{`@keyframes pmoZzz{0%{opacity:0;transform:translate(0,0) scale(.6)}20%{opacity:1}100%{opacity:0;transform:translate(22px,-46px) scale(1.4)}}`}</style>
            {[0, 0.8, 1.6].map((delay, i) => (
              <span
                key={i}
                style={{ position: "absolute", fontSize: `${13 + i * 3}px`, animation: "pmoZzz 2.4s ease-out infinite", animationDelay: `${delay}s` }}
              >
                {i === 1 ? "Z" : "z"}
              </span>
            ))}
          </div>
        )}
      </div>
    </>,
    document.body
  );
};

export default PmoAssistantOrb;
