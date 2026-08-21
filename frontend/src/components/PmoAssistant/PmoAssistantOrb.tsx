import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useAuth } from "../../auth/authContext";

interface PmoAssistantOrbProps {
  onTogglePanel: (rect: DOMRect) => void;
}

const STORAGE_KEY = "pmo-assistant-position";
const GREETING_SESSION_KEY = "pmo-greeting-shown-session";
const ORB_WIDTH = 90;
const ORB_HEIGHT = 90;

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

  // 1. Position State with LocalStorage Persistence
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

  // Keep position clamped on window resize
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

    // Main 3D Spherical Body
    const bodyGeo = new THREE.SphereGeometry(1.2, 32, 32);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.35,
      metalness: 0.25,
    });
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    robotGroup.add(bodyMesh);

    // Antenna Rod & Top Blue Tip
    const antennaGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.6, 12);
    const antennaMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.8 });
    const antennaMesh = new THREE.Mesh(antennaGeo, antennaMat);
    antennaMesh.position.set(0, 1.4, 0);
    robotGroup.add(antennaMesh);

    const tipGeo = new THREE.SphereGeometry(0.09, 16, 16);
    const tipMat = new THREE.MeshBasicMaterial({ color: 0x0ea5e9 });
    const tipMesh = new THREE.Mesh(tipGeo, tipMat);
    tipMesh.position.set(0, 1.7, 0);
    robotGroup.add(tipMesh);

    // Horizontal Visor Socket
    const visorGeo = new THREE.CylinderGeometry(1.02, 1.02, 0.55, 32, 1, false, Math.PI * 0.25, Math.PI * 0.5);
    const visorMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.2,
      metalness: 0.9,
    });
    const visorMesh = new THREE.Mesh(visorGeo, visorMat);
    visorMesh.rotation.y = Math.PI * 0.25;
    robotGroup.add(visorMesh);

    // Eyeball Lens Group
    const eyeGroup = new THREE.Group();
    eyeGroup.position.set(0, 0, 0.9);
    robotGroup.add(eyeGroup);

    const eyeSocketGeo = new THREE.SphereGeometry(0.45, 24, 24);
    const eyeSocketMat = new THREE.MeshStandardMaterial({ color: 0x020617, roughness: 0.5 });
    const eyeSocketMesh = new THREE.Mesh(eyeSocketGeo, eyeSocketMat);
    eyeGroup.add(eyeSocketMesh);

    const lensGeo = new THREE.SphereGeometry(0.28, 24, 24);
    const lensMat = new THREE.MeshStandardMaterial({
      color: 0x00d2ff,
      emissive: 0x00a3ff,
      emissiveIntensity: 0.85,
      roughness: 0.1,
    });
    const lensMesh = new THREE.Mesh(lensGeo, lensMat);
    lensMesh.position.set(0, 0, 0.2);
    eyeGroup.add(lensMesh);

    const pupilGeo = new THREE.SphereGeometry(0.09, 16, 16);
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const pupilMesh = new THREE.Mesh(pupilGeo, pupilMat);
    pupilMesh.position.set(0.08, 0.08, 0.42);
    eyeGroup.add(pupilMesh);

    // Eyelid Top & Bottom (Blinking Animation)
    const eyelidTopGeo = new THREE.SphereGeometry(1.22, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.4);
    const eyelidMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.4 });
    const eyelidTop = new THREE.Mesh(eyelidTopGeo, eyelidMat);
    eyelidTop.rotation.x = -Math.PI * 0.35;
    robotGroup.add(eyelidTop);

    const eyelidBottomGeo = new THREE.SphereGeometry(1.22, 32, 16, 0, Math.PI * 2, Math.PI * 0.6, Math.PI * 0.4);
    const eyelidBottom = new THREE.Mesh(eyelidBottomGeo, eyelidMat);
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
      bodyGeo.dispose();
      bodyMat.dispose();
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

      // Clamp inside viewport with 16px safety margin
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

  return (
    <>
      {/* Personalized Login Greeting Speech Bubble attached to Draggable Orb */}
      {showGreeting && greeting && (
        <div
          style={{
            position: "fixed",
            left: `${Math.max(16, Math.min(pos.x - 70, window.innerWidth - 270))}px`,
            top:
              pos.y > window.innerHeight / 2
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
              pos.y > window.innerHeight / 2 ? "-bottom-1.5 border-t-0 border-l-0" : "-top-1.5 border-b-0 border-r-0"
            }`}
          />
        </div>
      )}

      {/* Floating Draggable Orb */}
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
    </>
  );
};

export default PmoAssistantOrb;
