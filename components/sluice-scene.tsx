"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

type Props = { selectedId: string; onSelect: (id: string) => void };

export default function SluiceScene({ selectedId, onSelect }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef(selectedId);
  const onSelectRef = useRef(onSelect);
  const [error, setError] = useState(false);

  useEffect(() => { selectedRef.current = selectedId; }, [selectedId]);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setError(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.65;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog("#11273b", 16, 32);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(9, 7.2, 10.4);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.1, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.minDistance = 6;
    controls.maxDistance = 20;
    controls.maxPolarAngle = Math.PI / 2.08;
    controls.update();

    scene.add(new THREE.AmbientLight("#b7dcf3", 2.3));
    const sun = new THREE.DirectionalLight("#fff3df", 3.5);
    sun.position.set(-5, 9, 6);
    scene.add(sun);
    const fill = new THREE.DirectionalLight("#54cbd4", 1.8);
    fill.position.set(5, 5, -6);
    scene.add(fill);

    const selectable: THREE.Mesh[] = [];
    const box = (id: string | null, size: [number, number, number], pos: [number, number, number], color: string, metalness = 0.1) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(...size),
        new THREE.MeshStandardMaterial({ color, metalness, roughness: metalness ? 0.48 : 0.8 }),
      );
      mesh.position.set(...pos);
      if (id) { mesh.userData.componentId = id; selectable.push(mesh); }
      scene.add(mesh);
      return mesh;
    };
    const cylinder = (id: string, radius: number, height: number, pos: [number, number, number], color: string) => {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, height, 24),
        new THREE.MeshStandardMaterial({ color, metalness: 0.65, roughness: 0.35 }),
      );
      mesh.position.set(...pos);
      mesh.userData.componentId = id;
      selectable.push(mesh);
      scene.add(mesh);
      return mesh;
    };

    // Compact diagrammatic geometry. Each group carries the same ComponentID as its record.
    box(null, [12.6, 0.3, 10.5], [0, -0.07, 0], "#1b3744");
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(12.2, 10.1),
      new THREE.MeshStandardMaterial({ color: "#16828f", transparent: true, opacity: 0.74, metalness: 0.25, roughness: 0.28, side: THREE.DoubleSide }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.1;
    scene.add(water);
    box("CHAMBER-01", [6.8, 0.42, 4.7], [0, 0.32, 0], "#8fa5ae");
    box("PIER-L", [1.15, 2.7, 4.95], [-3.15, 1.7, 0], "#b8c6c9");
    box("PIER-R", [1.15, 2.7, 4.95], [3.15, 1.7, 0], "#b8c6c9");
    box("GATE-01", [5.05, 2.35, 0.28], [0, 1.68, 0.2], "#296077", 0.75);
    for (let i = -2; i <= 2; i++) {
      box("GATE-01", [0.055, 2.2, 0.08], [i * 0.92, 1.68, 0.4], "#8ac0ca", 0.8);
    }
    for (let i = 0; i < 3; i++) {
      box("GATE-01", [5.1, 0.055, 0.09], [0, 0.75 + i * 0.78, 0.4], "#8ac0ca", 0.8);
    }
    box("BRIDGE-01", [8.0, 0.28, 1.35], [0, 3.2, -0.6], "#b9cbd0");
    for (const x of [-3.7, 3.7]) {
      box("BRIDGE-01", [0.08, 0.72, 0.08], [x, 3.7, -1.18], "#d3e1e3");
    }
    box("BRIDGE-01", [7.6, 0.07, 0.07], [0, 4.04, -1.18], "#d3e1e3");
    box("HOIST-01", [2.25, 0.18, 1.3], [0, 3.52, -0.6], "#284a59", 0.6);
    box("HOIST-01", [0.17, 0.72, 1.02], [-0.86, 3.98, -0.6], "#60aeb7", 0.6);
    box("HOIST-01", [0.17, 0.72, 1.02], [0.86, 3.98, -0.6], "#60aeb7", 0.6);
    const drum = cylinder("HOIST-01", 0.33, 1.56, [0, 4.04, -0.6], "#6fc9cb");
    drum.rotation.z = Math.PI / 2;
    box("HOIST-01", [0.07, 1.1, 0.07], [0, 3.26, 0.13], "#d7cfb0", 0.6);
    box(null, [6.7, 0.18, 0.8], [0, 0.34, 3.06], "#5e7e86");
    box(null, [6.7, 0.18, 0.8], [0, 0.34, -3.06], "#5e7e86");

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDown: { x: number; y: number } | null = null;
    const onPointerDown = (event: PointerEvent) => { pointerDown = { x: event.clientX, y: event.clientY }; };
    const onPointerUp = (event: PointerEvent) => {
      if (!pointerDown || Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 6) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(selectable)[0];
      if (hit?.object.userData.componentId) onSelectRef.current(hit.object.userData.componentId);
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);

    const resize = () => {
      const width = host.clientWidth || 1;
      const height = host.clientHeight || 1;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      controls.update();
      for (const mesh of selectable) {
        const material = mesh.material as THREE.MeshStandardMaterial;
        const active = mesh.userData.componentId === selectedRef.current;
        material.emissive.set(active ? "#4cd7cc" : "#000000");
        material.emissiveIntensity = active ? 0.18 : 0;
      }
      renderer.render(scene, camera);
    };
    animate();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.domElement.remove();
    };
  }, []);

  return <div className="scene-host" ref={hostRef} aria-label="可旋转的涵闸三维示意模型">
    {error && <div className="scene-fallback">当前设备无法加载三维视图。仍可通过下方构件列表查看档案与记录。</div>}
  </div>;
}
