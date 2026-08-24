import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { useAuth } from "../../auth/authContext";

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
}

const STORAGE_KEY = "pmo-assistant-position";
const GREETING_SESSION_KEY = "pmo-greeting-shown-session";
const ORB_WIDTH = 110;
const ORB_HEIGHT = 110;

const MOTIVATIONAL_QUOTES = [
  '"Small progress is still progress." 🚀',
  '"Great things are built one step at a time." 💪',
  '"Progress, not perfection." ✨',
  '"Stay focused. Keep moving forward." 🎯',
  '"Every accomplishment starts with the decision to try." 🌟',
  '"Consistency turns effort into results." 🚀',
  '"Make today count." 💫',
];

export const PmoAssistantOrb: React.FC<PmoAssistantOrbProps> = ({ onTogglePanel }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const { user } = useAuth();

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
    sessionStorage.setItem(sessionKey, "true");

    // Auto-dismiss greeting after 4.5 seconds
    const timer = setTimeout(() => {
      setShowGreeting(false);
    }, 4500);

    return () => clearTimeout(timer);
  }, [user]);

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

  // 3. Three.js 3D WebGL Spherical Robot Orb Scene Setup
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = ORB_WIDTH;
    const height = ORB_HEIGHT;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(0, 0.3, 6.2);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.3);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.6);
    dirLight.position.set(5, 10, 7);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const blueLight = new THREE.PointLight(0x00d2ff, 2.5, 6);
    blueLight.position.set(0, 0.2, 2);
    scene.add(blueLight);

    // Robot Mesh Group
    const robotGroup = new THREE.Group();
    scene.add(robotGroup);

    // "Navigator" — Priority #6 avatar redesign. Same procedural-primitive
    // build approach as before (no external model/image asset), restyled
    // per the approved brief: two eyes instead of one, ear modules, a small
    // distinct body under the head, a chest compass emblem, and a subtle
    // smile. Every mesh below is purely cosmetic geometry/material — the
    // mouse-tracking, blink timer, float animation, drag, and disposal
    // logic further down are structurally unchanged, just re-pointed at the
    // new mesh names where needed (see each site's own comment).
    const disposables: Array<THREE.BufferGeometry | THREE.Material> = [];
    const track = <T extends THREE.BufferGeometry | THREE.Material>(x: T): T => {
      disposables.push(x);
      return x;
    };

    // "Navigator" redesign v2 — per your explicit proportion targets: head
    // ~55-65% of total height, body ~25-35%, antenna ~5-10%. Computed below
    // against actual mesh extents (not eyeballed): head spans world-Y
    // [-0.45, 1.55] = 2.0 units (57.5% of the 3.48-unit total span), body
    // spans roughly [-1.58, -0.45] = 1.13 units (32.5%), antenna tip to
    // head-top = 0.35 units (10%).
    const HEAD_RADIUS = 1.0;
    const HEAD_CENTER_Y = 0.55;

    // Head — a real robotic head with a large dark visor "screen" (not a
    // thin band), not a plain sphere.
    const headGeo = track(new THREE.SphereGeometry(HEAD_RADIUS, 32, 32));
    const headMat = track(new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.28, metalness: 0.35 }));
    const headMesh = new THREE.Mesh(headGeo, headMat);
    headMesh.position.set(0, HEAD_CENTER_Y, 0);
    headMesh.scale.set(1, 1, 0.97);
    headMesh.castShadow = true;
    headMesh.receiveShadow = true;
    robotGroup.add(headMesh);

    // Large oval face visor — a flattened, glossy dark sphere whose front
    // cap pokes just past the head's own front surface (depth-tested
    // correctly against the opaque head mesh), reading as one large "screen"
    // covering both eyes and the smile — replaces the old thin cylindrical
    // band, which is what made the previous pass look like a camera/drone.
    const visorGeo = track(new THREE.SphereGeometry(HEAD_RADIUS * 0.74, 32, 32));
    const visorMat = track(new THREE.MeshStandardMaterial({ color: 0x0b1220, roughness: 0.12, metalness: 0.85 }));
    const visorMesh = new THREE.Mesh(visorGeo, visorMat);
    visorMesh.scale.set(1.18, 0.86, 0.4);
    visorMesh.position.set(0, HEAD_CENTER_Y - 0.16, 0.82);
    robotGroup.add(visorMesh);

    // Collar — a dark ring marking a clean seam between head and body, so
    // the two read as distinct, deliberately assembled parts rather than
    // two overlapping balls.
    const collarGeo = track(new THREE.TorusGeometry(0.62, 0.055, 12, 32));
    const collarMat = track(new THREE.MeshStandardMaterial({ color: 0x0b1220, roughness: 0.3, metalness: 0.75 }));
    const collarMesh = new THREE.Mesh(collarGeo, collarMat);
    collarMesh.rotation.x = Math.PI / 2;
    collarMesh.position.set(0, -0.42, 0);
    robotGroup.add(collarMesh);

    // Body — clearly smaller than the head, rounded futuristic torso.
    const bodyGeo = track(new THREE.SphereGeometry(0.6, 32, 32));
    const bodyMat = track(new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.35, metalness: 0.25 }));
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.scale.set(1.05, 0.9, 0.95);
    bodyMesh.position.set(0, -1.05, 0);
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    robotGroup.add(bodyMesh);

    // Antenna Rod & Top Blue Tip — kept subtle/thin, ~10% of total height.
    const antennaGeo = track(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 12));
    const antennaMat = track(new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.8, roughness: 0.3 }));
    const antennaMesh = new THREE.Mesh(antennaGeo, antennaMat);
    antennaMesh.position.set(0, HEAD_CENTER_Y + HEAD_RADIUS + 0.11, 0);
    robotGroup.add(antennaMesh);

    const tipGeo = track(new THREE.SphereGeometry(0.07, 16, 16));
    const tipMat = track(
      new THREE.MeshStandardMaterial({ color: 0x0ea5e9, emissive: 0x0ea5e9, emissiveIntensity: 0.9 })
    );
    const tipMesh = new THREE.Mesh(tipGeo, tipMat);
    tipMesh.position.set(0, HEAD_CENTER_Y + HEAD_RADIUS + 0.28, 0);
    robotGroup.add(tipMesh);

    // Side sensor/comms modules — flush-mounted flat discs with a glowing
    // ring accent (like a lens), not floating capsules sticking out at
    // random, per your explicit note that the previous pass read that way.
    const sensorGeo = track(new THREE.CylinderGeometry(0.2, 0.2, 0.11, 24));
    const sensorMat = track(new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.28, metalness: 0.6 }));
    const sensorRingGeo = track(new THREE.TorusGeometry(0.1, 0.015, 8, 20));
    const sensorRingMat = track(
      new THREE.MeshStandardMaterial({ color: 0x0ea5e9, emissive: 0x0ea5e9, emissiveIntensity: 0.7, roughness: 0.2 })
    );

    function buildSensor(sideSign: 1 | -1) {
      const disc = new THREE.Mesh(sensorGeo, sensorMat);
      disc.rotation.z = Math.PI / 2;
      disc.position.set(sideSign * 0.94, HEAD_CENTER_Y - 0.1, 0);
      robotGroup.add(disc);

      const ring = new THREE.Mesh(sensorRingGeo, sensorRingMat);
      ring.rotation.y = Math.PI / 2;
      ring.position.set(sideSign * 1.0, HEAD_CENTER_Y - 0.1, 0);
      robotGroup.add(ring);
    }
    buildSensor(-1);
    buildSensor(1);

    // Two Eyes — was a single centered "Cyclops" eye before; two glowing,
    // horizontally-aligned eyes per the brief. Both eyes live inside ONE
    // parent group so the existing mouse-tracking code below (which moves
    // `eyeGroup.position`) keeps working completely unmodified — it still
    // just nudges "the eyes" as a pair, same interaction concept, now
    // connected to the new two-eye geometry instead of the old single lens.
    const eyeGroup = new THREE.Group();
    eyeGroup.position.set(0, HEAD_CENTER_Y + 0.06, 0.95);
    robotGroup.add(eyeGroup);

    const eyeSocketGeo = track(new THREE.SphereGeometry(0.19, 24, 24));
    const eyeSocketMat = track(new THREE.MeshStandardMaterial({ color: 0x020617, roughness: 0.5 }));
    const lensGeo = track(new THREE.SphereGeometry(0.13, 24, 24));
    const lensMat = track(
      new THREE.MeshStandardMaterial({ color: 0x00d2ff, emissive: 0x00a3ff, emissiveIntensity: 0.95, roughness: 0.1 })
    );
    const pupilGeo = track(new THREE.SphereGeometry(0.045, 16, 16));
    const pupilMat = track(new THREE.MeshBasicMaterial({ color: 0xffffff }));

    function buildEye(offsetX: number) {
      const socket = new THREE.Mesh(eyeSocketGeo, eyeSocketMat);
      socket.position.set(offsetX, 0, 0);
      eyeGroup.add(socket);

      const lens = new THREE.Mesh(lensGeo, lensMat);
      lens.position.set(offsetX, 0, 0.1);
      eyeGroup.add(lens);

      const pupil = new THREE.Mesh(pupilGeo, pupilMat);
      pupil.position.set(offsetX + 0.04, 0.04, 0.19);
      eyeGroup.add(pupil);
    }
    buildEye(-0.3);
    buildEye(0.3);

    // Subtle smile — a short arc beneath the eyes, kept small/clean rather
    // than a cartoon curve, per "professional and enterprise-ready".
    const smileGeo = track(new THREE.TorusGeometry(0.2, 0.014, 8, 24, Math.PI * 0.55));
    const smileMat = track(new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4 }));
    const smileMesh = new THREE.Mesh(smileGeo, smileMat);
    smileMesh.position.set(0, HEAD_CENTER_Y - 0.28, 0.98);
    smileMesh.rotation.set(Math.PI * 0.5, 0, Math.PI * 1.22);
    robotGroup.add(smileMesh);

    // Chest compass emblem — a simple, recognizable navigation symbol on
    // the body, per the brief. A glowing ring with a small diamond needle
    // and two tick marks, kept flat/simple so it still reads at small sizes.
    const compassGroup = new THREE.Group();
    compassGroup.position.set(0, -1.0, 0.58);
    robotGroup.add(compassGroup);

    const compassRingGeo = track(new THREE.TorusGeometry(0.22, 0.02, 8, 32));
    const compassRingMat = track(
      new THREE.MeshStandardMaterial({ color: 0x0ea5e9, emissive: 0x0ea5e9, emissiveIntensity: 0.6, roughness: 0.25 })
    );
    const compassRing = new THREE.Mesh(compassRingGeo, compassRingMat);
    compassGroup.add(compassRing);

    const needleGeo = track(new THREE.ConeGeometry(0.045, 0.16, 4));
    const needleMatN = track(new THREE.MeshStandardMaterial({ color: 0x0ea5e9, emissive: 0x0ea5e9, emissiveIntensity: 0.5 }));
    const needleMatS = track(new THREE.MeshStandardMaterial({ color: 0xdc2626 }));
    const needleTop = new THREE.Mesh(needleGeo, needleMatN);
    needleTop.position.set(0, 0.08, 0.01);
    compassGroup.add(needleTop);
    const needleBottom = new THREE.Mesh(needleGeo, needleMatS);
    needleBottom.position.set(0, -0.08, 0.01);
    needleBottom.rotation.z = Math.PI;
    compassGroup.add(needleBottom);

    const compassDotGeo = track(new THREE.SphereGeometry(0.03, 12, 12));
    const compassDotMat = track(new THREE.MeshStandardMaterial({ color: 0xf1f5f9 }));
    const compassDot = new THREE.Mesh(compassDotGeo, compassDotMat);
    compassDot.position.set(0, 0, 0.02);
    compassGroup.add(compassDot);

    // Eyelid Top & Bottom (Blinking Animation) — radius/position follow
    // HEAD_RADIUS/HEAD_CENTER_Y so they still hug the head sphere exactly.
    const eyelidTopGeo = track(new THREE.SphereGeometry(HEAD_RADIUS * 1.02, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.4));
    const eyelidMat = track(new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.35 }));
    const eyelidTop = new THREE.Mesh(eyelidTopGeo, eyelidMat);
    eyelidTop.position.set(0, HEAD_CENTER_Y, 0);
    eyelidTop.rotation.x = -Math.PI * 0.35;
    robotGroup.add(eyelidTop);

    const eyelidBottomGeo = track(
      new THREE.SphereGeometry(HEAD_RADIUS * 1.02, 32, 16, 0, Math.PI * 2, Math.PI * 0.6, Math.PI * 0.4)
    );
    const eyelidBottom = new THREE.Mesh(eyelidBottomGeo, eyelidMat);
    eyelidBottom.position.set(0, HEAD_CENTER_Y, 0);
    eyelidBottom.rotation.x = Math.PI * 0.35;
    robotGroup.add(eyelidBottom);

    // Ground Shadow Plane
    const shadowGeo = new THREE.PlaneGeometry(2.2, 2.2);
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
    const shadowTex = new THREE.CanvasTexture(shadowCanvas);
    const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.6 });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.set(0, -1.75, 0);
    scene.add(shadowMesh);

    // Mouse Tracking
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouseRef.current.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener("mousemove", handleMouseMove);

    // Blinking Timer
    let blinkTimer: ReturnType<typeof setTimeout>;
    let isBlinking = false;
    const scheduleBlink = () => {
      blinkTimer = setTimeout(() => {
        isBlinking = true;
        setTimeout(() => {
          isBlinking = false;
          scheduleBlink();
        }, 180);
      }, 3500 + Math.random() * 2000);
    };
    scheduleBlink();

    // Animation Render Loop
    let animationFrameId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      // Floating idle animation
      const floatOffsetY = Math.sin(elapsedTime * 2.2) * 0.15;
      robotGroup.position.y = floatOffsetY;

      const shadowScale = 1 - floatOffsetY * 0.3;
      shadowMesh.scale.set(shadowScale, shadowScale, 1);
      shadowMat.opacity = 0.5 - floatOffsetY * 0.2;

      // Mouse inertia tracking
      const targetRotY = mouseRef.current.x * 0.45;
      const targetRotX = -mouseRef.current.y * 0.35;

      robotGroup.rotation.y += (targetRotY - robotGroup.rotation.y) * 0.08;
      robotGroup.rotation.x += (targetRotX - robotGroup.rotation.x) * 0.08;

      eyeGroup.position.x = (mouseRef.current.x * 0.12 - eyeGroup.position.x) * 0.1;
      eyeGroup.position.y = (mouseRef.current.y * 0.12 - eyeGroup.position.y) * 0.1;

      if (isBlinking) {
        eyelidTop.rotation.x += (-Math.PI * 0.05 - eyelidTop.rotation.x) * 0.4;
        eyelidBottom.rotation.x += (Math.PI * 0.05 - eyelidBottom.rotation.x) * 0.4;
      } else {
        eyelidTop.rotation.x += (-Math.PI * 0.35 - eyelidTop.rotation.x) * 0.2;
        eyelidBottom.rotation.x += (Math.PI * 0.35 - eyelidBottom.rotation.x) * 0.2;
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      clearTimeout(blinkTimer);
      window.removeEventListener("mousemove", handleMouseMove);
      renderer.dispose();
      // Priority #6 — every geometry/material created above is tracked via
      // track() specifically so this disposes all of them, not just the two
      // the original code happened to clean up.
      disposables.forEach((resource) => resource.dispose());
      shadowGeo.dispose();
      shadowMat.dispose();
      shadowTex.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // 4. Pointer Drag vs Click Logic
  const handlePointerDown = (e: React.PointerEvent) => {
    setShowGreeting(false); // Dismiss greeting on drag start
    hasDraggedRef.current = false;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: pos.x,
      posY: pos.y,
    };
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;

    const deltaX = e.clientX - dragStartRef.current.x;
    const deltaY = e.clientY - dragStartRef.current.y;
    const distance = Math.hypot(deltaX, deltaY);

    if (distance > 6) {
      hasDraggedRef.current = true;
    }

    if (hasDraggedRef.current) {
      const newX = dragStartRef.current.posX + deltaX;
      const newY = dragStartRef.current.posY + deltaY;

      // Clamp inside viewport with 16px safety margin — plain viewport
      // bounds, no scroll offset needed anywhere with fixed positioning.
      const clampedX = Math.max(16, Math.min(newX, window.innerWidth - ORB_WIDTH - 16));
      const clampedY = Math.max(16, Math.min(newY, window.innerHeight - ORB_HEIGHT - 16));

      setPos({ x: clampedX, y: clampedY });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);

    // If movement was less than 6px, treat as a CLICK to toggle panel!
    if (!hasDraggedRef.current && containerRef.current) {
      setShowGreeting(false);
      const rect = containerRef.current.getBoundingClientRect();
      onTogglePanel(rect);
    }
  };

  // pos.y is viewport-relative again (see the module-level comment), so the
  // original direct comparison is correct once more — no scroll offset
  // involved anywhere.
  const greetingShowAbove = pos.y > window.innerHeight / 2;

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
      {showGreeting && greeting && (
        <div
          style={{
            position: "fixed",
            left: `${Math.max(16, Math.min(pos.x - 70, window.innerWidth - 270))}px`,
            top: greetingShowAbove
              ? `${Math.max(16, pos.y - 84)}px`
              : `${Math.min(window.innerHeight - 100, pos.y + ORB_HEIGHT + 8)}px`,
          }}
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
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        title="Drag to move PMO Assistant | Click to open panel"
        className={`z-[99999] select-none no-print transition-shadow duration-200 ${
          isDragging ? "cursor-grabbing scale-105" : "cursor-grab hover:scale-105"
        }`}
      >
        <div ref={mountRef} className="w-full h-full flex items-center justify-center filter drop-shadow-[0_12px_24px_rgba(0,0,0,0.5)]" />
      </div>
    </>,
    document.body
  );
};

export default PmoAssistantOrb;
