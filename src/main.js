import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

const EYE_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.4;
const WALK_SPEED = 4.5;
const RUN_SPEED = 8.0;
const JUMP_SPEED = 5.0;
const GRAVITY = 20.0;
const ARENA = 40;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fa5bd);
scene.fog = new THREE.Fog(0x8fa5bd, 25, 110);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 300);
camera.position.set(0, EYE_HEIGHT, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.body.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xbfd4ea, 0x53585f, 2.4));

const sun = new THREE.DirectionalLight(0xfff2e0, 3.0);
sun.position.set(20, 35, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
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

const grid = new THREE.GridHelper(ARENA * 2, 40, 0x545b66, 0x5d646f);
scene.add(grid);

const colliders = [];

function addBox(x, z, width, depth, height, color) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color, roughness: 0.8 })
  );
  mesh.position.set(x, height / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  colliders.push(new THREE.Box3().setFromObject(mesh));
}

const rand = (n) => (Math.random() - 0.5) * n;
for (let i = 0; i < 30; i++) {
  const w = 1.5 + Math.random() * 3;
  const d = 1.5 + Math.random() * 3;
  const h = 1 + Math.random() * 4;
  const x = rand(ARENA * 1.6);
  const z = rand(ARENA * 1.6);
  if (Math.hypot(x, z) < 5) continue;
  addBox(x, z, w, d, h, new THREE.Color().setHSL(0.08, 0.12, 0.45 + Math.random() * 0.25).getHex());
}

const wallH = 6;
addBox(0, -ARENA, ARENA * 2, 1, wallH, 0x8a8f98);
addBox(0, ARENA, ARENA * 2, 1, wallH, 0x8a8f98);
addBox(-ARENA, 0, 1, ARENA * 2, wallH, 0x8a8f98);
addBox(ARENA, 0, 1, ARENA * 2, wallH, 0x8a8f98);

const controls = new PointerLockControls(camera, document.body);
scene.add(controls.object);

const overlay = document.getElementById('overlay');
overlay.addEventListener('click', () => controls.lock());
controls.addEventListener('lock', () => document.body.classList.add('playing'));
controls.addEventListener('unlock', () => document.body.classList.remove('playing'));

const keys = new Set();
addEventListener('keydown', (e) => keys.add(e.code));
addEventListener('keyup', (e) => keys.delete(e.code));

const velocity = new THREE.Vector3();
let onGround = true;

function collides(pos) {
  const box = new THREE.Box3(
    new THREE.Vector3(pos.x - PLAYER_RADIUS, pos.y - EYE_HEIGHT, pos.z - PLAYER_RADIUS),
    new THREE.Vector3(pos.x + PLAYER_RADIUS, pos.y, pos.z + PLAYER_RADIUS)
  );
  return colliders.some((c) => c.intersectsBox(box));
}

const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const move = new THREE.Vector3();

function update(dt) {
  const pos = controls.object.position;

  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();
  right.crossVectors(forward, camera.up).normalize();

  move.set(0, 0, 0);
  if (keys.has('KeyW')) move.add(forward);
  if (keys.has('KeyS')) move.sub(forward);
  if (keys.has('KeyD')) move.add(right);
  if (keys.has('KeyA')) move.sub(right);

  const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? RUN_SPEED : WALK_SPEED;
  if (move.lengthSq() > 0) move.normalize().multiplyScalar(speed * dt);

  const stepX = new THREE.Vector3(pos.x + move.x, pos.y, pos.z);
  if (!collides(stepX)) pos.x = stepX.x;
  const stepZ = new THREE.Vector3(pos.x, pos.y, pos.z + move.z);
  if (!collides(stepZ)) pos.z = stepZ.z;

  if (keys.has('Space') && onGround) {
    velocity.y = JUMP_SPEED;
    onGround = false;
  }
  velocity.y -= GRAVITY * dt;
  pos.y += velocity.y * dt;

  if (pos.y < EYE_HEIGHT) {
    pos.y = EYE_HEIGHT;
    velocity.y = 0;
    onGround = true;
  }
}

const clock = new THREE.Clock();
const fpsEl = document.getElementById('fps');
let frames = 0;
let fpsTimer = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);

  if (controls.isLocked) update(dt);

  frames++;
  fpsTimer += dt;
  if (fpsTimer >= 0.5) {
    fpsEl.textContent = Math.round(frames / fpsTimer);
    frames = 0;
    fpsTimer = 0;
  }

  renderer.render(scene, camera);
}
animate();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
