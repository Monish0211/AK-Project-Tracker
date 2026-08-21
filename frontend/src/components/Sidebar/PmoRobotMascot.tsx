import React, { useEffect, useRef } from "react";
import * as THREE from "three";

interface PmoRobotMascotProps {
  onClick: (rect?: DOMRect) => void;
}

export const PmoRobotMascot: React.FC<PmoRobotMascotProps> = ({ onClick }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = 100;
    const height = 110;

    // 1. SCENE & CAMERA
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(0, 0.3, 6.5);

    // 2. RENDERER
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // 3. LIGHTS
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.6);
    dirLight.position.set(5, 10, 7);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const blueLight = new THREE.PointLight(0x00d2ff, 2.5, 6);
    blueLight.position.set(0, 0.2, 2);
    scene.add(blueLight);

    // 4. ROBOT GROUP
    const robotGroup = new THREE.Group();
    scene.add(robotGroup);

    // A. Main Spherical 3D Body (CodePen 'boule' sphere)
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

    // B. Antenna Rod & Top Tip (Matching CodePen model)
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

    // C. Horizontal Visor Band Socket
    const visorGeo = new THREE.CylinderGeometry(1.02, 1.02, 0.55, 32, 1, false, Math.PI * 0.25, Math.PI * 0.5);
    const visorMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.2,
      metalness: 0.9,
    });
    const visorMesh = new THREE.Mesh(visorGeo, visorMat);
    visorMesh.rotation.y = Math.PI * 0.25;
    robotGroup.add(visorMesh);

    // D. Central Eye Eyeball Group (Tracks Mouse Cursor)
    const eyeGroup = new THREE.Group();
    eyeGroup.position.set(0, 0, 0.9);
    robotGroup.add(eyeGroup);

    // Outer Dark Eye Socket
    const eyeSocketGeo = new THREE.SphereGeometry(0.45, 24, 24);
    const eyeSocketMat = new THREE.MeshStandardMaterial({ color: 0x020617, roughness: 0.5 });
    const eyeSocketMesh = new THREE.Mesh(eyeSocketGeo, eyeSocketMat);
    eyeGroup.add(eyeSocketMesh);

    // Glowing Cyan Camera Lens Pupil (CodePen Eyeball)
    const lensGeo = new THREE.SphereGeometry(0.28, 24, 24);
    const lensMat = new THREE.MeshStandardMaterial({
      color: 0x00d2ff,
      emissive: 0x00a3ff,
      emissiveIntensity: 0.8,
      roughness: 0.1,
    });
    const lensMesh = new THREE.Mesh(lensGeo, lensMat);
    lensMesh.position.set(0, 0, 0.2);
    eyeGroup.add(lensMesh);

    // Inner White Pupil Highlight
    const pupilGeo = new THREE.SphereGeometry(0.09, 16, 16);
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const pupilMesh = new THREE.Mesh(pupilGeo, pupilMat);
    pupilMesh.position.set(0.08, 0.08, 0.42);
    eyeGroup.add(pupilMesh);

    // E. Eyelid Top & Bottom (CodePen Eyelid Blinking Animation)
    const eyelidTopGeo = new THREE.SphereGeometry(1.22, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.4);
    const eyelidMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.4 });
    const eyelidTop = new THREE.Mesh(eyelidTopGeo, eyelidMat);
    eyelidTop.rotation.x = -Math.PI * 0.35; // Open angle
    robotGroup.add(eyelidTop);

    const eyelidBottomGeo = new THREE.SphereGeometry(1.22, 32, 16, 0, Math.PI * 2, Math.PI * 0.6, Math.PI * 0.4);
    const eyelidBottom = new THREE.Mesh(eyelidBottomGeo, eyelidMat);
    eyelidBottom.rotation.x = Math.PI * 0.35; // Open angle
    robotGroup.add(eyelidBottom);

    // F. Floating Shadow Plane (Matching CodePen ground shadow)
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

    // 5. MOUSE EVENT TRACKING
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouseRef.current.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener("mousemove", handleMouseMove);

    // 6. BLINK ANIMATION TIMER
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

    // 7. ANIMATION LOOP
    let animationFrameId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      // Idle Floating Bobbing Motion (CodePen flyingAnimation)
      const floatOffsetY = Math.sin(elapsedTime * 2.2) * 0.15;
      robotGroup.position.y = floatOffsetY;

      // Shadow pulse scaling with height
      const shadowScale = 1 - floatOffsetY * 0.3;
      shadowMesh.scale.set(shadowScale, shadowScale, 1);
      shadowMat.opacity = 0.5 - floatOffsetY * 0.2;

      // Smooth Mouse Eye & Head Tracking Inertia
      const targetRotY = mouseRef.current.x * 0.45;
      const targetRotX = -mouseRef.current.y * 0.35;

      robotGroup.rotation.y += (targetRotY - robotGroup.rotation.y) * 0.08;
      robotGroup.rotation.x += (targetRotX - robotGroup.rotation.x) * 0.08;

      // Eye Lens micro shift
      eyeGroup.position.x = (mouseRef.current.x * 0.12 - eyeGroup.position.x) * 0.1;
      eyeGroup.position.y = (mouseRef.current.y * 0.12 - eyeGroup.position.y) * 0.1;

      // Eyelid Blinking
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

    // 8. CLEANUP ON UNMOUNT
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

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const rect = mountRef.current?.getBoundingClientRect();
    onClick(rect);
  };

  return (
    <div className="shrink-0 px-2 min-[1440px]:px-4 py-2 flex flex-col items-center justify-center">
      <button
        type="button"
        onClick={handleClick}
        title="Open PMO Assistant"
        className="group relative flex flex-col items-center justify-center bg-transparent border-0 cursor-pointer select-none focus:outline-none transition-all duration-300 hover:scale-105"
      >
        {/* Three.js WebGL Canvas Mount Container (CodePen 3D Spherical Robot Model) */}
        <div ref={mountRef} className="w-[100px] h-[110px] flex items-center justify-center overflow-hidden" />

        {/* Minimal Label below CodePen 3D Model */}
        <div className="mt-1 text-center flex flex-col items-center">
          <span className="text-[11px] font-extrabold tracking-widest text-slate-100 group-hover:text-cyan-400 transition-colors uppercase">
            PMO Assistant
          </span>
          <span className="text-[9px] font-bold text-cyan-400 tracking-wider uppercase mt-0.5">
            ● Active
          </span>
        </div>
      </button>
    </div>
  );
};

export default PmoRobotMascot;
