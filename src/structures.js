import * as THREE from 'three';
import { BUILDS, MATERIALS, WALL_SIZE, TURRET } from './data/builds.js';

const PAD = 0.02;

function plankTexture(base, dark, planks) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = dark;
  ctx.lineWidth = 3;
  const step = size / planks;
  for (let i = 1; i < planks; i++) {
    ctx.beginPath();
    ctx.moveTo(0, i * step);
    ctx.lineTo(size, i * step);
    ctx.stroke();
  }
  for (let i = 0; i < planks; i++) {
    // レンガのように一段ごとにずらす
    const offset = i % 2 ? step : 0;
    ctx.beginPath();
    ctx.moveTo(offset + step, i * step);
    ctx.lineTo(offset + step, (i + 1) * step);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const WALL_TEX = {
  wood: plankTexture('#9a6f3f', '#5d4223', 4),
  brick: plankTexture('#a4574a', '#6d342c', 6),
  iron: plankTexture('#8c949e', '#5c636c', 3),
};

export class Structure {
  constructor(def, position) {
    this.def = def;
    this.maxHp = def.hp;
    this.hp = def.hp;
    this.root = new THREE.Group();
    this.root.position.copy(position);
    this.box = new THREE.Box3();
  }

  get alive() {
    return this.hp > 0;
  }

  damage(amount) {
    this.hp = Math.max(0, this.hp - amount);
    const wear = this.hp / this.maxHp;
    this.root.traverse((o) => {
      if (o.isMesh && o.material.color) o.material.color.setScalar(0.4 + wear * 0.6);
    });
    return !this.alive;
  }

  refreshBox() {
    this.box.setFromObject(this.root);
  }

  dispose() {
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.dispose();
      o.material.dispose();
    });
  }
}

export class Wall extends Structure {
  constructor(def, position, yaw) {
    super(def, position);
    this.root.rotation.y = yaw;
    const { width, height, depth } = WALL_SIZE;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      new THREE.MeshStandardMaterial({ map: WALL_TEX[def.id], roughness: 0.9 })
    );
    mesh.position.y = height / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    this.refreshBox();
  }
}

export class Turret extends Structure {
  constructor(def, position, yaw) {
    super(def, position);
    this.root.rotation.y = yaw;

    const metal = (color, rough = 0.5) =>
      new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.4 });

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.3, 12), metal(0x5a6068, 0.8));
    base.position.y = 0.15;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.55, 10), metal(0x6f7680));
    post.position.y = 0.55;

    this.head = new THREE.Group();
    this.head.position.y = 0.9;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.55), metal(0x7d8590));
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.7, 10), metal(0x3a3f47, 0.4));
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.5);
    const scope = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.24), metal(0x2f343a));
    scope.position.set(0, 0.26, -0.05);
    this.head.add(body, barrel, scope);

    this.root.add(base, post, this.head);
    this.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

    this.ammo = TURRET.magazine;
    this.readyAt = 0;
    this.time = 0;
    this.refreshBox();
  }

  // 銃口のワールド座標
  muzzle(out = new THREE.Vector3()) {
    return this.head.localToWorld(out.set(0, 0.02, -0.85));
  }

  update(dt, enemies, onShoot) {
    this.time += dt;
    const origin = this.root.position;

    let target = null;
    let best = TURRET.range;
    for (const e of enemies) {
      if (!e.alive) continue;
      const dist = e.position.distanceTo(origin);
      if (dist < best) {
        best = dist;
        target = e;
      }
    }
    if (!target) return;

    const to = target.position.clone().sub(origin);
    const wanted = Math.atan2(-to.x, -to.z) - this.root.rotation.y;
    this.head.rotation.y = rotateToward(this.head.rotation.y, wanted, TURRET.turnSpeed * dt);
    this.head.rotation.x = THREE.MathUtils.clamp(Math.atan2(1.1 - 0.9, best), -0.5, 0.5);

    if (this.time < this.readyAt) return;
    if (this.ammo <= 0) {
      this.ammo = TURRET.magazine;
      this.readyAt = this.time + TURRET.cooldown;
      return;
    }
    this.ammo--;
    this.readyAt = this.time + TURRET.fireInterval;
    onShoot(this, target);
  }

  get reloading() {
    return this.ammo >= TURRET.magazine && this.time < this.readyAt;
  }
}

function rotateToward(from, to, maxStep) {
  let delta = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return from + THREE.MathUtils.clamp(delta, -maxStep, maxStep);
}

export function createStructure(typeId, position, yaw) {
  const def = BUILDS[typeId];
  return def.kind === 'turret' ? new Turret(def, position, yaw) : new Wall(def, position, yaw);
}

export function createGhost(typeId) {
  const def = BUILDS[typeId];
  const geometry = def.kind === 'turret'
    ? new THREE.BoxGeometry(1.1, 1.3, 1.1)
    : new THREE.BoxGeometry(WALL_SIZE.width, WALL_SIZE.height, WALL_SIZE.depth);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color: 0x7fffa0, transparent: true, opacity: 0.35, depthWrite: false })
  );
  mesh.position.y = (def.kind === 'turret' ? 1.3 : WALL_SIZE.height) / 2;
  const group = new THREE.Group();
  group.add(mesh);
  return group;
}

export function costText(typeId) {
  const def = BUILDS[typeId];
  return Object.entries(def.cost)
    .map(([id, n]) => `${MATERIALS[id].name}${n}`)
    .join('＋');
}

// 設置予定地が既存のコライダーや建造物と重なっていないか
export function overlaps(box, colliders, structures) {
  const test = box.clone().expandByScalar(-PAD);
  return colliders.some((c) => c.intersectsBox(test)) ||
    structures.some((s) => s.alive && s.box.intersectsBox(test));
}
