import * as THREE from 'three';
import { BUILDS, MATERIALS, WALL_SIZE, TURRET } from './data/builds.js';
import { GOD_TURRET, HOSPITAL } from './data/ultimates.js';
import { makeLabel, hpColor } from './label.js';

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

    // 当たり判定は solid だけから取る。HPの文字までは含めない
    this.solid = new THREE.Group();
    this.label = makeLabel(1.6);
    this.root.add(this.solid, this.label.sprite);
    this.#refreshLabel();
  }

  get alive() {
    return this.hp > 0;
  }

  // 建物の高さに合わせて、HPの文字を頭の上に出す
  setLabelHeight(y) {
    this.label.sprite.position.y = y;
  }

  damage(amount) {
    this.hp = Math.max(0, this.hp - amount);
    this.#showWear();
    return !this.alive;
  }

  heal(amount) {
    if (!this.alive || this.hp >= this.maxHp) return 0;
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this.#showWear();
    return this.hp - before;
  }

  // オンラインで、親から届いたHPをそのまま反映する
  setHp(hp) {
    if (this.hp === hp) return;
    this.hp = hp;
    this.#showWear();
  }

  #refreshLabel() {
    this.label.draw(`${Math.ceil(this.hp)} / ${this.maxHp}`, hpColor(this.hp, this.maxHp));
  }

  // 傷むほど暗くする。元の色を覚えておかないと、金色などが灰色になってしまう
  #showWear() {
    const shade = 0.4 + (this.hp / this.maxHp) * 0.6;
    this.solid.traverse((o) => {
      if (!o.isMesh || !o.material.color) return;
      o.material.userData.baseColor ??= o.material.color.clone();
      o.material.color.copy(o.material.userData.baseColor).multiplyScalar(shade);
    });
    this.#refreshLabel();
  }

  // setFromObject は親をたどってくれないので、先に root から行列を作り直す
  refreshBox() {
    this.root.updateMatrixWorld(true);
    this.box.setFromObject(this.solid);
  }

  dispose() {
    this.label.dispose();
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
    this.solid.add(mesh);
    this.setLabelHeight(height + 0.35);
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

    this.solid.add(base, post, this.head);
    this.solid.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.setLabelHeight(1.6);

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

// 衛生兵の必殺技。近くにいる味方とタレットを回復し続ける
export class Hospital extends Structure {
  constructor(def, position, yaw) {
    super(def, position);
    this.root.rotation.y = yaw;

    const w = 3.0;
    const h = 2.0;
    const d = 2.4;
    const walls = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color: 0xe9eef4, roughness: 0.85 })
    );
    walls.position.y = h / 2;
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.3, 0.24, d + 0.3),
      new THREE.MeshStandardMaterial({ color: 0xc25f5f, roughness: 0.8 })
    );
    roof.position.y = h + 0.12;
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 1.4, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x3c4450, roughness: 0.9 })
    );
    door.position.set(0, 0.7, d / 2 + 0.03);

    const crossMat = new THREE.MeshStandardMaterial({ color: 0xd0453f, roughness: 0.7 });
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.8, 0.06), crossMat);
    const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.22, 0.06), crossMat);
    crossV.position.set(-1.0, 1.5, d / 2 + 0.03);
    crossH.position.copy(crossV.position);

    // 回復が届く範囲を地面に描く
    const aura = new THREE.Mesh(
      new THREE.RingGeometry(HOSPITAL.radius - 0.12, HOSPITAL.radius, 40),
      new THREE.MeshBasicMaterial({ color: 0x8fe3b0, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })
    );
    aura.rotation.x = -Math.PI / 2;
    aura.position.y = 0.03;

    // 回復範囲の輪を solid に入れると、ゾンビが遠くから殴り始めてしまう
    this.solid.add(walls, roof, door, crossV, crossH);
    this.solid.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.root.add(aura);
    this.setLabelHeight(h + 0.6);
    this.refreshBox();
  }
}

// 建築士の必殺技。5秒に一度、範囲攻撃のロケットを撃つ
export class RocketTurret extends Structure {
  constructor(def, position, yaw) {
    super(def, position);
    this.root.rotation.y = yaw;

    const metal = (color, rough = 0.45) =>
      new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.5 });

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.72, 0.36, 14), metal(0x6a5f3f, 0.8));
    base.position.y = 0.18;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.7, 12), metal(0x8a7c50));
    post.position.y = 0.7;

    this.head = new THREE.Group();
    this.head.position.y = 1.15;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.6), metal(0xc8a94e));
    const tube = (x) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.9, 12), metal(0x39404a, 0.4));
      m.rotation.x = Math.PI / 2;
      m.position.set(x, 0.08, -0.5);
      return m;
    };
    this.head.add(body, tube(-0.2), tube(0.2));

    this.solid.add(base, post, this.head);
    this.solid.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.setLabelHeight(1.95);

    this.time = 0;
    this.readyAt = 1.0;
    this.refreshBox();
  }

  muzzle(out = new THREE.Vector3()) {
    return this.head.localToWorld(out.set(0, 0.08, -1.0));
  }

  update(dt, enemies, onFire) {
    this.time += dt;

    let target = null;
    let best = GOD_TURRET.range;
    for (const e of enemies) {
      if (!e.alive) continue;
      const dist = e.position.distanceTo(this.root.position);
      if (dist < best) {
        best = dist;
        target = e;
      }
    }
    if (!target) return;

    const to = target.position.clone().sub(this.root.position);
    const wanted = Math.atan2(-to.x, -to.z) - this.root.rotation.y;
    this.head.rotation.y = rotateToward(this.head.rotation.y, wanted, GOD_TURRET.turnSpeed * dt);

    if (this.time < this.readyAt) return;
    this.readyAt = this.time + GOD_TURRET.interval;
    onFire(this, target);
  }
}

function rotateToward(from, to, maxStep) {
  let delta = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return from + THREE.MathUtils.clamp(delta, -maxStep, maxStep);
}

const KINDS = { wall: Wall, turret: Turret, hospital: Hospital, godturret: RocketTurret };

export function createStructure(typeId, position, yaw) {
  const def = BUILDS[typeId];
  return new KINDS[def.kind](def, position, yaw);
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
