import * as THREE from 'three';
import { canvasTexture, grungeTexture, muscleTexture, paint, boxGeometry, disposeModel } from './textures.js';
import { IS_TOUCH } from './device.js';

// ボス「マザー」。ふくれあがって根を張った母体。ほとんど動かない。
// 4本の腕にそれぞれ別のHPがあり、腕が生きている間はゾンビを産み続ける。
// 4本すべて落とさないと、本体にダメージが通らない。

const BODY_W = 3.2, BODY_H = 3.0, BODY_D = 2.6;
const HEAD_W = 1.1, HEAD_H = 0.95, HEAD_D = 1.05;
// 腕（触手）1本ぶん。関節3つでうねらせる
const ARM_SEG = 3;
const ARM_LEN = 1.5;
const ARM_W = 0.62;

export const MOTHER_HEIGHT = 5.2;
const RIG_HEIGHT = BODY_H + HEAD_H;
const MOTHER_SCALE = MOTHER_HEIGHT / RIG_HEIGHT;

const BIRTH_TIME = 1.6;
const BIRTH_OPEN_TIME = 0.85;
const ROAR_TIME = 1.8;
const SWIPE_TIME = 1.0;
const SWIPE_HIT_TIME = 0.5;

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const easeOutCubic = (x) => 1 - (1 - x) ** 3;

// 目が並んだ、膨れた顔
function faceTexture() {
  const { canvas, ctx, size } = paint();
  ctx.fillStyle = '#7a5f6b';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 140; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? '#4e3a45' : '#9c7d8a';
    ctx.globalAlpha = 0.1 + Math.random() * 0.2;
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, 1 + Math.random() * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // 小さな目がいくつも並ぶ
  for (const [ex, ey, r] of [[38, 46, 7], [64, 40, 5], [90, 46, 7], [50, 62, 4], [78, 62, 4]]) {
    ctx.fillStyle = '#160f14';
    ctx.beginPath(); ctx.arc(ex, ey, r + 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd94a';
    ctx.beginPath(); ctx.arc(ex, ey, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#160f14';
    ctx.beginPath(); ctx.ellipse(ex, ey, r * 0.35, r, 0, 0, Math.PI * 2); ctx.fill();
  }
  // 裂けた口
  ctx.fillStyle = '#2a0f18';
  ctx.beginPath(); ctx.ellipse(64, 96, 30, 12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#d8c6ae';
  for (let i = 0; i < 8; i++) ctx.fillRect(38 + i * 7, 88, 5, 8);
  return canvasTexture(canvas);
}

const TEX = {
  flesh: muscleTexture('#8a5f6d', '#4e343e', '#a87f8c'),
  fleshDark: muscleTexture('#5e404b', '#33222a', '#7d5a66'),
  sac: grungeTexture('#9c6a58', '#5e3b30', '#c08c74', 190),
  face: faceTexture(),
};

function box(w, h, d, material, shadow = !IS_TOUCH) {
  const m = new THREE.Mesh(boxGeometry(w, h, d), material);
  m.castShadow = shadow;
  return m;
}

export class Mother {
  constructor() {
    const skinned = (map) => new THREE.MeshStandardMaterial({ map, roughness: 0.9, transparent: true });
    this.mats = {
      flesh: skinned(TEX.flesh),
      fleshDark: skinned(TEX.fleshDark),
      sac: skinned(TEX.sac),
      face: skinned(TEX.face),
    };
    this.bodyMats = Object.values(this.mats);

    this.root = new THREE.Group();
    this.root.scale.setScalar(MOTHER_SCALE);
    this.rigBob = new THREE.Group();
    this.root.add(this.rigBob);

    // 根を張った土台。動かないことが見た目で分かるようにする
    const base = box(BODY_W * 1.35, 0.55, BODY_D * 1.35, this.mats.fleshDark);
    base.position.y = 0.28;
    this.rigBob.add(base);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const root = box(0.4, 0.3, 1.8, this.mats.fleshDark);
      root.position.set(Math.sin(a) * BODY_W * 0.75, 0.16, Math.cos(a) * BODY_D * 0.75);
      root.rotation.y = a;
      this.rigBob.add(root);
    }

    // 胴。産む前に膨らむので、拡大しやすいよう入れ子にする
    this.belly = new THREE.Group();
    this.belly.position.y = 0.5 + BODY_H / 2;
    this.rigBob.add(this.belly);
    this.belly.add(box(BODY_W, BODY_H, BODY_D, this.mats.flesh, true));
    // 前面の卵嚢。ここが開いてゾンビが出てくる
    this.sac = box(BODY_W * 0.66, BODY_H * 0.5, BODY_D * 0.3, this.mats.sac);
    this.sac.position.set(0, -BODY_H * 0.1, BODY_D * 0.52);
    this.belly.add(this.sac);

    this.neck = new THREE.Group();
    this.neck.position.y = BODY_H / 2;
    this.belly.add(this.neck);
    const head = new THREE.Mesh(
      boxGeometry(HEAD_W, HEAD_H, HEAD_D),
      [this.mats.fleshDark, this.mats.fleshDark, this.mats.fleshDark,
        this.mats.fleshDark, this.mats.face, this.mats.fleshDark]
    );
    head.position.y = HEAD_H / 2 + 0.05;
    head.castShadow = true;
    this.neck.add(head);
    this.head = head;

    // ---- 4本の腕。それぞれ別に壊れる ----
    // 並び：0=左前 1=右前 2=左後 3=右後
    this.arms = [];
    this.armAlive = [true, true, true, true];
    const spots = [[-1, 0.7], [1, 0.7], [-1, -0.7], [1, -0.7]];
    spots.forEach(([sx, sz], i) => this.arms.push(this.#buildArm(sx, sz, i)));

    this.mode = 'idle';
    this.modeTime = 0;
    this.time = Math.random() * 10;
    this.reset();
  }

  // 根元から3つの節でつながった触手。先に当たり判定用の塊をつける
  #buildArm(sx, sz, index) {
    const root = new THREE.Group();
    root.position.set(sx * BODY_W * 0.46, 0.7, sz * BODY_D * 0.4);
    // 付け根はやや外向き。先へ行くほど外へ倒れて弧になる
    root.rotation.z = -sx * 0.34;
    root.rotation.x = -sz * 0.3;
    this.belly.add(root);

    const joints = [];
    let parent = root;
    for (let i = 0; i < ARM_SEG; i++) {
      const joint = new THREE.Group();
      if (i > 0) joint.position.y = ARM_LEN;
      parent.add(joint);
      const seg = box(ARM_W * (1 - i * 0.18), ARM_LEN, ARM_W * (1 - i * 0.18), this.mats.flesh);
      seg.position.y = ARM_LEN / 2;
      joint.add(seg);
      joints.push(joint);
      parent = joint;
    }
    // 先端の爪。ここが「腕を撃つ」当たり判定になる
    const claw = box(ARM_W * 1.25, ARM_LEN * 0.5, ARM_W * 1.25, this.mats.fleshDark);
    claw.position.y = ARM_LEN + ARM_LEN * 0.2;
    claw.name = 'arm';
    parent.add(claw);

    return { root, joints, claw, index, sx };
  }

  // ---- 腕 ----
  breakArm(index) {
    if (!this.armAlive[index]) return false;
    this.armAlive[index] = false;
    this.arms[index].root.visible = false;
    return true;
  }

  // 腕が1本だけ生え直す
  regrowArm(index) {
    if (this.armAlive[index]) return false;
    this.armAlive[index] = true;
    this.arms[index].root.visible = true;
    return true;
  }

  get armsLeft() {
    return this.armAlive.filter(Boolean).length;
  }

  // 撃たれた物が腕なら番号、それ以外は null
  partOf(object) {
    const index = this.arms.findIndex((a) => a.claw === object);
    return index >= 0 && this.armAlive[index] ? index : null;
  }

  hitTargets() {
    return this.arms.filter((a) => this.armAlive[a.index]).map((a) => a.claw);
  }

  // 腕の先の世界での位置。演出を出す場所に使う
  armPoint(index, out = new THREE.Vector3()) {
    return this.arms[index].claw.getWorldPosition(out);
  }

  // 卵嚢の前。ここからゾンビが出てくる
  birthPoint(out = new THREE.Vector3()) {
    return this.sac.getWorldPosition(out);
  }

  mouthPoint(out = new THREE.Vector3()) {
    return this.head.getWorldPosition(out);
  }

  dispose() {
    disposeModel(this.root);
  }

  reset() {
    this.mode = 'idle';
    this.modeTime = 0;
    this.armAlive = [true, true, true, true];
    for (const a of this.arms) a.root.visible = true;
    this.belly.scale.setScalar(1);
    this.sac.scale.setScalar(1);
    for (const m of this.bodyMats) {
      m.opacity = 1;
      m.emissive?.setRGB(0, 0, 0);
    }
  }

  setMode(name) {
    if (this.mode === name) return;
    if (this.mode === 'death') this.reset();
    for (const m of this.bodyMats) m.emissive?.setRGB(0, 0, 0);
    this.belly.scale.setScalar(1);
    this.sac.scale.setScalar(1);
    this.mode = name;
    this.modeTime = 0;
  }

  set walkRate(rate) {
    this._walkRate = rate;
  }

  restartAttack() {
    this.setMode('attack');
    this.modeTime = 0;
  }

  // 腕を振り下ろす瞬間
  get attackLanded() {
    return this.mode === 'attack' && this.modeTime >= SWIPE_HIT_TIME;
  }

  get attackFinished() {
    return this.mode === 'attack' && this.modeTime >= SWIPE_TIME;
  }

  // 卵嚢が開ききって、ゾンビが出てくる瞬間
  get birthOpened() {
    return this.mode === 'birth' && this.modeTime >= BIRTH_OPEN_TIME;
  }

  get birthFinished() {
    return this.mode === 'birth' && this.modeTime >= BIRTH_TIME;
  }

  get roarFinished() {
    return this.mode === 'roar' && this.modeTime >= ROAR_TIME;
  }

  get deathFinished() {
    return this.mode === 'death' && this.modeTime > 3.0;
  }

  update(dt) {
    this.time += dt;
    this.modeTime += dt;
    const t = this.time;
    const lt = this.modeTime;

    // 腕は常にゆっくりうねらせる。生きていることが遠目にも分かる
    for (const arm of this.arms) {
      if (!this.armAlive[arm.index]) continue;
      const phase = t * 0.9 + arm.index * 1.6;
      arm.joints.forEach((joint, i) => {
        // 節ごとに少しずつ外へ倒すと、まっすぐな棒ではなく弧になる
        joint.rotation.x = Math.sin(phase + i * 0.8) * 0.2;
        joint.rotation.z = -arm.sx * 0.34 + Math.cos(phase * 0.7 + i * 0.6) * 0.14;
      });
    }

    if (this.mode === 'idle' || this.mode === 'walk') {
      // 呼吸するようにふくらむ
      const breath = 1 + Math.sin(t * 1.3) * 0.03;
      this.belly.scale.set(breath, 1 / breath, breath);
      this.neck.rotation.y = Math.sin(t * 0.4) * 0.2;
      this.rigBob.position.y = Math.sin(t * 1.3) * 0.03;
    } else if (this.mode === 'birth') {
      // 大きくふくらんでから、卵嚢が開いて吐き出す
      const swell = easeOutCubic(clamp01(lt / BIRTH_OPEN_TIME));
      const open = clamp01((lt - BIRTH_OPEN_TIME) / (BIRTH_TIME - BIRTH_OPEN_TIME));
      const push = Math.sin(open * Math.PI);
      this.belly.scale.set(1 + swell * 0.22 - push * 0.16, 1 + swell * 0.14, 1 + swell * 0.22 - push * 0.16);
      this.sac.scale.set(1 + swell * 0.4 + push * 0.5, 1 + swell * 0.3 + push * 0.4, 1 + push * 1.4);
      this.neck.rotation.x = -swell * 0.3 + push * 0.2;
      const heat = swell * 0.3;
      for (const m of this.bodyMats) m.emissive?.setRGB(heat, heat * 0.1, heat * 0.15);
    } else if (this.mode === 'attack') {
      // 手前の腕を大きく振り下ろす
      const up = easeOutCubic(clamp01(lt / SWIPE_HIT_TIME));
      const down = clamp01((lt - SWIPE_HIT_TIME) / (SWIPE_TIME - SWIPE_HIT_TIME));
      const swing = up * (1 - down);
      for (const arm of this.arms) {
        if (!this.armAlive[arm.index]) continue;
        arm.joints.forEach((joint, i) => {
          joint.rotation.x = -swing * 1.0 + down * 1.6;
        });
      }
      this.neck.rotation.x = -swing * 0.25;
    } else if (this.mode === 'roar') {
      const open = Math.sin(clamp01(lt / ROAR_TIME) * Math.PI);
      this.neck.rotation.x = -open * 0.6;
      this.belly.scale.set(1 + open * 0.12, 1 + open * 0.08, 1 + open * 0.12);
      this.rigBob.rotation.z = Math.sin(t * 38) * 0.02 * open;
      // 腕を大きく広げる
      for (const arm of this.arms) {
        if (!this.armAlive[arm.index]) continue;
        arm.joints.forEach((joint) => { joint.rotation.z = arm.sx * open * 0.5; });
      }
      const heat = open * 0.45;
      for (const m of this.bodyMats) m.emissive?.setRGB(heat, heat * 0.08, heat * 0.12);
    } else if (this.mode === 'hit') {
      const p = clamp01(lt / 0.3);
      const kick = Math.sin(p * Math.PI);
      this.belly.scale.set(1 - kick * 0.05, 1 + kick * 0.05, 1 - kick * 0.05);
      if (lt > 0.3) this.setMode('idle');
    } else if (this.mode === 'death') {
      // しぼんで、腕が力なく垂れる
      const shrink = easeOutCubic(clamp01(lt / 1.6));
      this.belly.scale.setScalar(1 - shrink * 0.45);
      this.rigBob.position.y = -shrink * 0.5;
      this.neck.rotation.x = shrink * 0.9;
      for (const arm of this.arms) {
        if (!this.armAlive[arm.index]) continue;
        arm.joints.forEach((joint) => { joint.rotation.x = shrink * 1.5; });
      }
      const fade = clamp01((lt - 2.0) / 1.0);
      for (const m of this.bodyMats) m.opacity = 1 - fade;
    }
  }
}
