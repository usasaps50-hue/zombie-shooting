import * as THREE from 'three';
import { QUALITY } from './device.js';

export const ARENA = 40;

export function createWorld() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fa5bd);
  scene.fog = new THREE.Fog(0x8fa5bd, 25, 110);

  scene.add(new THREE.HemisphereLight(0xbfd4ea, 0x53585f, 2.4));

  const sun = new THREE.DirectionalLight(0xfff2e0, 3.0);
  sun.position.set(20, 35, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(QUALITY.shadowMap, QUALITY.shadowMap);
  sun.shadow.camera.left = -ARENA;
  sun.shadow.camera.right = ARENA;
  sun.shadow.camera.top = ARENA;
  sun.shadow.camera.bottom = -ARENA;
  sun.shadow.camera.far = 100;
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA * 2, ARENA * 2),
    new THREE.MeshStandardMaterial({ color: 0x6d7480, roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  scene.add(new THREE.GridHelper(ARENA * 2, 40, 0x545b66, 0x5d646f));

  const colliders = [];

  const addBox = (x, z, width, depth, height, color) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      new THREE.MeshStandardMaterial({ color, roughness: 0.8 })
    );
    mesh.position.set(x, height / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
  };

  for (let i = 0; i < 26; i++) {
    const w = 1.5 + Math.random() * 3;
    const d = 1.5 + Math.random() * 3;
    const h = 1 + Math.random() * 4;
    const x = (Math.random() - 0.5) * ARENA * 1.6;
    const z = (Math.random() - 0.5) * ARENA * 1.6;
    if (Math.hypot(x, z) < 8) continue;
    addBox(x, z, w, d, h, new THREE.Color().setHSL(0.08, 0.12, 0.45 + Math.random() * 0.25).getHex());
  }

  const wallH = 6;
  addBox(0, -ARENA, ARENA * 2, 1, wallH, 0x8a8f98);
  addBox(0, ARENA, ARENA * 2, 1, wallH, 0x8a8f98);
  addBox(-ARENA, 0, 1, ARENA * 2, wallH, 0x8a8f98);
  addBox(ARENA, 0, 1, ARENA * 2, wallH, 0x8a8f98);

  return { scene, colliders };
}
