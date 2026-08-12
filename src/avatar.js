import * as THREE from 'three';
import { createItemMesh } from './viewmodel.js';

const smooth = (t) => t * t * (3 - 2 * t);
const phase = (t, a, b) => THREE.MathUtils.clamp((t - a) / (b - a), 0, 1);

const SHOULDER_Y = 1.35;
const ARM_LEN = 0.5;

// アイテムを構えたときの右腕の基本角度。hand をこの逆に回すと、
// 手のローカル軸がワールド軸と揃うのでアイテムの向きを素直に指定できる。
const HOLD_ARM_X = { gun: -1.45, shovel: -0.5 };

function limb(len, thickness, color) {
  const pivot = new THREE.Object3D();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(thickness, len, thickness),
    new THREE.MeshStandardMaterial({ color, roughness: 0.8 })
  );
  mesh.position.y = -len / 2;
  mesh.castShadow = true;
  pivot.add(mesh);
  return pivot;
}

// 職業がひと目で分かるかぶりもの。アバターは +Z を向いているのでツバは +Z 側
function createHat(jobId) {
  const g = new THREE.Group();
  const mat = (color, rough = 0.75) => new THREE.MeshStandardMaterial({ color, roughness: rough });

  if (jobId === 'medic') {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.24), mat(0xf4f6f8));
    cap.position.y = 0.19;
    const fold = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.08), mat(0xe6eaee));
    fold.position.set(0, 0.24, -0.06);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.03, 0.012), mat(0xd93b3b, 0.6));
    bar.position.set(0, 0.19, 0.125);
    const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.07, 0.012), mat(0xd93b3b, 0.6));
    bar2.position.copy(bar.position);
    g.add(cap, fold, bar, bar2);
  } else if (jobId === 'architect') {
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xf2c02e));
    shell.position.y = 0.14;
    shell.scale.y = 0.85;
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.32), mat(0xd9a417));
    ridge.position.y = 0.25;
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.035, 0.14), mat(0xf2c02e));
    brim.position.set(0, 0.15, 0.15);
    g.add(shell, ridge, brim);
  } else {
    // スーパーマリオメーカーのマリオっぽい、丸いエンブレム付きの赤帽子
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xd9302c));
    crown.position.y = 0.14;
    crown.scale.y = 0.8;
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.05, 0.31), mat(0xd9302c));
    band.position.y = 0.16;
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 0.17), mat(0xc02824));
    brim.position.set(0, 0.155, 0.18);
    brim.rotation.x = -0.12;
    const badge = new THREE.Mesh(new THREE.CircleGeometry(0.07, 16), mat(0xf6f2ea, 0.9));
    badge.position.set(0, 0.2, 0.155);
    const letter = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.01), mat(0xd9302c, 0.9));
    letter.position.set(0, 0.2, 0.163);
    letter.rotation.z = Math.PI / 4;
    g.add(crown, band, brim, badge, letter);
  }

  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export class Avatar {
  constructor(color = 0x5f7f9f) {
    this.root = new THREE.Group();
    this.downed = false;
    this.itemId = null;
    this.walkPhase = 0;

    const skin = 0xc7a68a;
    const body = new THREE.Group();
    this.body = body;
    this.root.add(body);

    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.66, 0.3),
      new THREE.MeshStandardMaterial({ color, roughness: 0.85 })
    );
    torso.position.y = 1.15;
    torso.castShadow = true;

    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.3, 0.28),
      new THREE.MeshStandardMaterial({ color: skin, roughness: 0.9 })
    );
    head.position.y = 1.65;
    head.castShadow = true;
    this.head = head;

    this.armR = limb(ARM_LEN, 0.15, skin);
    this.armR.position.set(-0.33, SHOULDER_Y, 0);
    this.armL = limb(ARM_LEN, 0.15, skin);
    this.armL.position.set(0.33, SHOULDER_Y, 0);

    this.legR = limb(0.8, 0.18, 0x3c4149);
    this.legR.position.set(-0.14, 0.82, 0);
    this.legL = limb(0.8, 0.18, 0x3c4149);
    this.legL.position.set(0.14, 0.82, 0);

    this.hand = new THREE.Group();
    this.hand.position.y = -ARM_LEN;
    this.armR.add(this.hand);

    body.add(torso, head, this.armR, this.armL, this.legR, this.legL);
  }

  setHat(jobId) {
    if (this.jobId === jobId) return;
    this.jobId = jobId;
    if (this.hat) this.head.remove(this.hat);
    this.hat = jobId ? createHat(jobId) : null;
    if (this.hat) this.head.add(this.hat);
  }

  setItem(id) {
    if (this.itemId === id) return;
    this.itemId = id;
    this.hand.clear();
    if (!id) return;
    // アバターは +Z を向いている。アイテムは銃口が -Z のまま作られているので反転させる。
    const mesh = createItemMesh(id);
    if (id === 'shovel' || id === 'hammer') {
      this.hand.rotation.x = -HOLD_ARM_X.shovel;
      mesh.scale.setScalar(0.75);
      mesh.position.set(0, -0.34, 0);
    } else {
      this.hand.rotation.x = -HOLD_ARM_X.gun;
      mesh.rotation.y = Math.PI;
      mesh.position.set(0, 0.14, 0.03);
    }
    this.hand.add(mesh);
  }

  setDowned(downed) {
    this.downed = downed;
  }

  update(dt, { anim = { name: 'idle', t: 0 }, speed = 0, pitch = 0 } = {}) {
    if (this.downed) {
      this.body.rotation.x = THREE.MathUtils.lerp(this.body.rotation.x, -Math.PI / 2, dt * 8);
      // 倒すと各パーツのローカルYが奥行きに変わるので、厚みの半分だけ持ち上げて床に寝かせる
      this.body.position.y = THREE.MathUtils.lerp(this.body.position.y, 0.16, dt * 8);
      this.armR.rotation.set(0.4, 0, 0.6);
      this.armL.rotation.set(0.4, 0, -0.6);
      this.legR.rotation.set(0, 0, 0.15);
      this.legL.rotation.set(0, 0, -0.15);
      return;
    }
    this.body.rotation.x = THREE.MathUtils.lerp(this.body.rotation.x, 0, dt * 8);
    this.body.position.y = THREE.MathUtils.lerp(this.body.position.y, 0, dt * 8);

    this.walkPhase += dt * (2 + speed * 2.2);
    const step = Math.sin(this.walkPhase * 2) * Math.min(speed / 4.5, 1) * 0.7;
    this.legR.rotation.x = step;
    this.legL.rotation.x = -step;
    this.head.rotation.x = THREE.MathUtils.clamp(-pitch, -0.6, 0.6);

    const holding = this.itemId === 'shovel' || this.itemId === 'hammer'
      ? 'shovel'
      : this.itemId ? 'gun' : null;
    let armR = holding ? HOLD_ARM_X[holding] : -step;
    let armL = holding === 'gun' ? -1.25 : holding === 'shovel' ? -0.3 : step;
    let armRz = holding === 'shovel' ? -0.35 : 0;
    let armLz = holding === 'gun' ? -0.35 : 0;

    const { name, t } = anim;
    if (name === 'fire') {
      const kick = t < 0.25 ? t / 0.25 : 1 - smooth((t - 0.25) / 0.75);
      armR += kick * 0.35;
      armL += kick * 0.3;
    } else if (name === 'reload') {
      const down = smooth(phase(t, 0, 0.22)) - smooth(phase(t, 0.78, 1));
      armR += down * 0.7;
      const reach = smooth(phase(t, 0.15, 0.5)) - smooth(phase(t, 0.55, 0.85));
      armL += down * 0.5 - reach * 0.5;
      armLz += reach * 0.5;
    } else if (name === 'swing') {
      // 横薙ぎ：体ごと右から左へ回す
      const swing = smooth(Math.min(t / 0.5, 1)) - smooth(phase(t, 0.55, 1)) * 0.85;
      armR = -1.55;
      armRz = -0.75 + swing * 0.95;
      armL = -0.7;
      armLz = 0.25 - swing * 0.5;
      this.body.rotation.y = THREE.MathUtils.lerp(0.95, -0.75, swing);
    } else if (name === 'swap') {
      armR += (1 - smooth(t)) * 1.0;
    }

    if (name !== 'swing') this.body.rotation.y = THREE.MathUtils.lerp(this.body.rotation.y, 0, dt * 10);

    this.armR.rotation.x = THREE.MathUtils.lerp(this.armR.rotation.x, armR, dt * 16);
    this.armL.rotation.x = THREE.MathUtils.lerp(this.armL.rotation.x, armL, dt * 16);
    this.armR.rotation.z = THREE.MathUtils.lerp(this.armR.rotation.z, armRz, dt * 16);
    this.armL.rotation.z = THREE.MathUtils.lerp(this.armL.rotation.z, armLz, dt * 16);
  }
}
