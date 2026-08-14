import * as THREE from 'three';
import { canvasTexture, grungeTexture, paint, boxGeometry, disposeModel } from './textures.js';
import { IS_TOUCH } from './device.js';

// 骨だけの体。ゾンビと同じ 3.95 のリグ高で作って、同じ縮尺で並べる
const TORSO_W = 1.15, TORSO_H = 1.5, TORSO_D = 0.6;
const HEAD_W = 0.88, HEAD_H = 0.9, HEAD_D = 0.88;
const ARM_H = 1.5, ARM_T = 0.2;
const LEG_H = 1.55, LEG_T = 0.24;

const RIG_HEIGHT = LEG_H + TORSO_H + HEAD_H;
export const SKELETON_HEIGHT = 1.8;
const SKELETON_SCALE = SKELETON_HEIGHT / RIG_HEIGHT;

// 棒の振り下ろし
const ATTACK_TIME = 0.72;
const ATTACK_HIT_TIME = 0.46;
// 弓を引いて放つまで
const SHOOT_TIME = 1.2;
const SHOOT_RELEASE_TIME = 0.68;
// 崩れ落ちてから消えるまでと、骨が組み上がるまで
const DEATH_FALL = 0.75;
const REVIVE_TIME = 1.3;

const easeOutCubic = (x) => 1 - (1 - x) ** 3;
const easeInCubic = (x) => x * x * x;
const easeOutBack = (x) => 1 + 2.7 * (x - 1) ** 3 + 1.7 * (x - 1) ** 2;

// どくろの顔。落ちくぼんだ眼窩と、かみ合わせた歯
function skullTexture() {
  const { canvas, ctx, size } = paint();
  ctx.fillStyle = '#ded7c2';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 140; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? '#b3a98e' : '#f2ecd9';
    ctx.globalAlpha = 0.08 + Math.random() * 0.16;
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, 1 + Math.random() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 眼窩。奥に赤い光をともす
  for (const x of [40, 88]) {
    ctx.fillStyle = '#1a1712';
    ctx.beginPath();
    ctx.ellipse(x, 54, 17, 19, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c8452e';
    ctx.beginPath();
    ctx.arc(x, 56, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffb06a';
    ctx.beginPath();
    ctx.arc(x, 56, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // 鼻の穴
  ctx.fillStyle = '#1a1712';
  ctx.beginPath();
  ctx.moveTo(64, 74);
  ctx.lineTo(56, 92);
  ctx.lineTo(72, 92);
  ctx.closePath();
  ctx.fill();

  // 歯の並び。すき間を黒く抜いて歯に見せる
  ctx.fillStyle = '#efe9d6';
  ctx.fillRect(34, 100, 60, 20);
  ctx.fillStyle = '#1a1712';
  ctx.fillRect(34, 109, 60, 2.5);
  for (let i = 1; i < 8; i++) {
    ctx.fillRect(34 + i * 7.5 - 1, 100, 2, 20);
  }
  return canvasTexture(canvas);
}

let TEX = null;
function textures() {
  TEX ??= {
    bone: grungeTexture('#d8d1bc', '#a79d84', '#f3eddc', 200),
    boneDark: grungeTexture('#b9b19a', '#8b8269', '#d8d1bc', 200),
    skull: skullTexture(),
  };
  return TEX;
}

function box(w, h, d, material, shadow = !IS_TOUCH) {
  const m = new THREE.Mesh(boxGeometry(w, h, d), material);
  m.castShadow = shadow;
  return m;
}

export class Skeleton {
  // weapon は 'club'（棒）か 'bow'（弓）
  constructor({ weapon = 'club' } = {}) {
    const T = textures();
    const boned = (map) => new THREE.MeshStandardMaterial({ map, roughness: 0.9, transparent: true });
    this.mats = {
      bone: boned(T.bone),
      boneDark: boned(T.boneDark),
      skull: boned(T.skull),
      wood: new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.85, transparent: true }),
      string: new THREE.MeshStandardMaterial({ color: 0xe6e0cc, roughness: 0.9, transparent: true }),
    };
    this.bodyMats = Object.values(this.mats);
    this.weapon = weapon;

    this.root = new THREE.Group();
    this.root.scale.setScalar(SKELETON_SCALE);

    this.rigBob = new THREE.Group();
    this.root.add(this.rigBob);
    this.hip = new THREE.Group();
    this.hip.position.y = LEG_H;
    this.rigBob.add(this.hip);

    // 骨盤
    const pelvis = box(TORSO_W * 0.86, 0.42, TORSO_D * 0.95, this.mats.boneDark, true);
    pelvis.position.y = 0.02;
    this.hip.add(pelvis);

    this.legL = this.#buildLeg(-1);
    this.legR = this.#buildLeg(1);

    this.torso = new THREE.Group();
    this.torso.position.y = TORSO_H / 2;
    this.hip.add(this.torso);
    this.#buildRibs();

    this.neck = new THREE.Group();
    this.neck.position.y = TORSO_H / 2;
    this.torso.add(this.neck);
    this.#buildSkull();

    this.armL = this.#buildArm(-1);
    this.armR = this.#buildArm(1);

    if (weapon === 'club') this.#buildClub();
    else this.#buildBow();

    this.mode = 'idle';
    this.modeTime = 0;
    this.time = Math.random() * 10;
    this.reset();
  }

  #buildLeg(side) {
    const pivot = new THREE.Group();
    pivot.position.set(side * (TORSO_W * 0.24), -0.16, 0);
    this.hip.add(pivot);

    // 太ももの骨。真ん中を細く、両端を太くして骨らしく見せる
    const femur = box(LEG_T * 0.62, LEG_H * 0.44, LEG_T * 0.62, this.mats.bone);
    femur.position.y = -LEG_H * 0.24;
    const hipBall = box(LEG_T, LEG_T * 0.8, LEG_T, this.mats.bone);
    const knee = box(LEG_T * 1.05, LEG_T * 0.8, LEG_T * 1.05, this.mats.boneDark);
    knee.position.y = -LEG_H * 0.48;

    const shin = box(LEG_T * 0.56, LEG_H * 0.4, LEG_T * 0.56, this.mats.bone);
    shin.position.set(0, -LEG_H * 0.7, 0.01);
    const fibula = box(LEG_T * 0.22, LEG_H * 0.38, LEG_T * 0.22, this.mats.bone);
    fibula.position.set(side * LEG_T * 0.3, -LEG_H * 0.7, -0.02);
    const ankle = box(LEG_T * 0.8, LEG_T * 0.6, LEG_T * 0.8, this.mats.boneDark);
    ankle.position.y = -LEG_H * 0.9;
    const foot = box(LEG_T * 1.0, LEG_T * 0.42, LEG_T * 1.9, this.mats.bone);
    foot.position.set(0, -LEG_H * 0.99, LEG_T * 0.55);

    pivot.add(hipBall, femur, knee, shin, fibula, ankle, foot);
    return pivot;
  }

  // 背骨とあばら。前後を細い骨でつないだ、すき間だらけの胸
  #buildRibs() {
    for (let i = 0; i < 5; i++) {
      const vert = box(0.3, 0.17, 0.3, this.mats.boneDark);
      vert.position.set(0, TORSO_H * 0.34 - i * (TORSO_H * 0.17), -TORSO_D * 0.34);
      this.torso.add(vert);
    }
    const sternum = box(0.26, TORSO_H * 0.6, 0.14, this.mats.bone);
    sternum.position.set(0, TORSO_H * 0.05, TORSO_D * 0.36);
    const collar = box(TORSO_W * 0.98, 0.16, 0.18, this.mats.bone, true);
    collar.position.set(0, TORSO_H * 0.42, TORSO_D * 0.2);
    this.torso.add(sternum, collar);

    for (let i = 0; i < 4; i++) {
      const y = TORSO_H * 0.28 - i * (TORSO_H * 0.19);
      const w = TORSO_W * (0.98 - i * 0.06);
      for (const side of [-1, 1]) {
        const rib = box(0.12, 0.14, TORSO_D * 0.95, this.mats.bone, i === 0);
        rib.position.set(side * w * 0.5, y, 0);
        this.torso.add(rib);
      }
      const front = box(w * 0.8, 0.13, 0.13, this.mats.bone);
      front.position.set(0, y - 0.03, TORSO_D * 0.42);
      const back = box(w * 0.72, 0.13, 0.13, this.mats.bone);
      back.position.set(0, y, -TORSO_D * 0.42);
      this.torso.add(front, back);
    }
  }

  #buildSkull() {
    const M = this.mats;
    const skull = new THREE.Mesh(
      boxGeometry(HEAD_W, HEAD_H * 0.78, HEAD_D),
      [M.boneDark, M.boneDark, M.boneDark, M.boneDark, M.skull, M.boneDark]
    );
    skull.position.y = HEAD_H * 0.52;
    skull.castShadow = true;
    // 後頭部のふくらみ
    const crown = box(HEAD_W * 0.92, HEAD_H * 0.3, HEAD_D * 0.8, M.boneDark);
    crown.position.set(0, HEAD_H * 0.86, -HEAD_D * 0.06);
    // 首の骨
    const spine = box(0.22, 0.2, 0.22, M.boneDark);
    spine.position.y = HEAD_H * 0.1;

    // 下あご。ふるえてカタカタ鳴る
    this.jaw = new THREE.Group();
    this.jaw.position.set(0, HEAD_H * 0.2, 0);
    const jawBone = box(HEAD_W * 0.78, HEAD_H * 0.16, HEAD_D * 0.9, M.bone);
    jawBone.position.set(0, -HEAD_H * 0.06, 0.02);
    this.jaw.add(jawBone);

    this.neck.add(skull, crown, spine, this.jaw);
  }

  #buildArm(side) {
    const pivot = new THREE.Group();
    pivot.position.set(side * (TORSO_W / 2 + 0.06), TORSO_H * 0.4, 0);
    this.torso.add(pivot);

    const shoulder = box(ARM_T, ARM_T * 0.8, ARM_T, this.mats.boneDark);
    const upper = box(ARM_T * 0.55, ARM_H * 0.42, ARM_T * 0.55, this.mats.bone);
    upper.position.y = -ARM_H * 0.23;
    const elbow = box(ARM_T * 0.85, ARM_T * 0.7, ARM_T * 0.85, this.mats.boneDark);
    elbow.position.y = -ARM_H * 0.46;
    // 前腕は2本の骨
    for (const off of [-1, 1]) {
      const fore = box(ARM_T * 0.28, ARM_H * 0.38, ARM_T * 0.28, this.mats.bone);
      fore.position.set(off * ARM_T * 0.18, -ARM_H * 0.68, 0);
      pivot.add(fore);
    }
    const wrist = box(ARM_T * 0.7, ARM_T * 0.4, ARM_T * 0.7, this.mats.boneDark);
    wrist.position.y = -ARM_H * 0.88;
    const palm = box(ARM_T * 0.75, ARM_T * 0.5, ARM_T * 0.6, this.mats.bone);
    palm.position.y = -ARM_H * 0.95;
    for (let i = 0; i < 3; i++) {
      const finger = box(ARM_T * 0.14, ARM_T * 0.5, ARM_T * 0.14, this.mats.bone);
      finger.position.set((i - 1) * ARM_T * 0.24, -ARM_H * 1.05, ARM_T * 0.12);
      pivot.add(finger);
    }

    pivot.add(shoulder, upper, elbow, wrist, palm);
    return pivot;
  }

  // 骨のこん棒。持ち手の先が太い
  #buildClub() {
    const club = new THREE.Group();
    club.position.y = -ARM_H * 1.0;

    const shaft = box(0.17, 1.05, 0.17, this.mats.bone, true);
    shaft.position.y = -0.5;
    const head = box(0.42, 0.36, 0.42, this.mats.boneDark, true);
    head.position.y = -1.02;
    const knobL = box(0.24, 0.24, 0.24, this.mats.boneDark);
    knobL.position.set(-0.16, -0.94, 0);
    const knobR = box(0.24, 0.24, 0.24, this.mats.boneDark);
    knobR.position.set(0.16, -0.94, 0);
    const grip = box(0.22, 0.2, 0.22, this.mats.boneDark);
    grip.position.y = 0.02;

    club.add(shaft, head, knobL, knobR, grip);
    this.armR.add(club);
    this.club = club;
  }

  // 弓。左手に持ち、腕を前へ倒すと的のほうを向く
  #buildBow() {
    const R = 0.62;
    const ARC = Math.PI * 1.12;

    const pivot = new THREE.Group();
    pivot.position.y = -ARM_H * 0.98;
    // 弓の上下＝腕の +Z、矢の飛ぶ向き＝腕の -Y になるように向きを組む
    pivot.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(-1, 0, 0)
    ));

    const limb = new THREE.Mesh(
      new THREE.TorusGeometry(R, 0.05, 5, 16, ARC),
      this.mats.wood
    );
    limb.rotation.z = -ARC / 2;
    limb.castShadow = !IS_TOUCH;

    const tipY = Math.sin(ARC / 2) * R;
    const tipX = Math.cos(ARC / 2) * R;
    const string = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, tipY * 2, 0.03),
      this.mats.string
    );
    string.position.x = tipX;
    const gripBar = box(0.12, 0.34, 0.14, this.mats.wood);
    gripBar.position.x = R * 0.98;

    // つがえた矢。引くと後ろへ下がる
    this.arrow = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.05, 0.05), this.mats.wood);
    shaft.position.x = 0.5;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 4), this.mats.boneDark);
    head.rotation.z = -Math.PI / 2;
    head.position.x = 1.08;
    for (const s of [-1, 1]) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.02), this.mats.string);
      fin.position.set(0.08, s * 0.07, 0);
      this.arrow.add(fin);
    }
    this.arrow.add(shaft, head);

    pivot.add(limb, string, gripBar, this.arrow);
    this.armL.add(pivot);
    this.bow = pivot;
    this.bowString = string;
    this.bowTipX = tipX;

    // 矢が飛び出す位置の目印
    this.muzzleTip = new THREE.Object3D();
    this.muzzleTip.position.x = R * 1.4;
    pivot.add(this.muzzleTip);
  }

  dispose() {
    disposeModel(this.root);
  }

  reset() {
    this.mode = 'idle';
    this.modeTime = 0;
    this.rigBob.rotation.set(0, 0, 0);
    this.rigBob.position.set(0, 0, 0);
    this.hip.rotation.set(0, 0, 0);
    this.torso.rotation.set(0, 0, 0);
    this.neck.rotation.set(0, 0, 0);
    this.neck.position.y = TORSO_H / 2;
    this.jaw.rotation.set(0, 0, 0);
    if (this.arrow) this.arrow.visible = true;
    for (const m of this.bodyMats) {
      m.opacity = 1;
      m.emissive.setRGB(0, 0, 0);
    }
  }

  setMode(name) {
    if (this.mode === name) return;
    if (this.mode === 'death' || this.mode === 'revive') this.reset();
    this.torso.rotation.set(0, 0, 0);
    this.neck.rotation.set(0, 0, 0);
    this.hip.rotation.set(0, 0, 0);
    this.mode = name;
    this.modeTime = 0;
  }

  restartAttack() {
    this.setMode('attack');
    this.modeTime = 0;
  }

  // 弓を引きはじめる。放つのは shotReleased のタイミング
  startShoot() {
    this.setMode('shoot');
    this.modeTime = 0;
    if (this.arrow) this.arrow.visible = true;
  }

  get attackLanded() {
    return this.mode === 'attack' && this.modeTime >= ATTACK_HIT_TIME;
  }

  get attackFinished() {
    return this.mode === 'attack' && this.modeTime >= ATTACK_TIME;
  }

  get shotReleased() {
    return this.mode === 'shoot' && this.modeTime >= SHOOT_RELEASE_TIME;
  }

  get shootFinished() {
    return this.mode === 'shoot' && this.modeTime >= SHOOT_TIME;
  }

  // 骨が散らばりきって、まだ消えていない頃。ここで復活できる
  get reviveWindow() {
    return this.mode === 'death' && this.modeTime >= 1.35;
  }

  get deathFinished() {
    return this.mode === 'death' && this.modeTime > 2.5;
  }

  get reviveFinished() {
    return this.mode === 'revive' && this.modeTime >= REVIVE_TIME;
  }

  // 矢が出る位置の世界座標
  muzzlePoint(out = new THREE.Vector3()) {
    if (!this.muzzleTip) return out.set(0, 0, 0);
    this.muzzleTip.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(this.muzzleTip.matrixWorld);
  }

  set walkRate(rate) {
    this._walkRate = rate;
  }

  // s=0 で組み上がった状態、s=1 でばらばらに崩れた状態。
  // 崩れるときも組み上がるときも、この1本の姿勢を行き来させる
  #collapse(s, rattle = 0) {
    const r = rattle;
    this.rigBob.rotation.set(s * 1.25, s * 0.3, s * 0.18);
    this.rigBob.position.y = -s * (LEG_H * 0.72);
    this.hip.rotation.set(0, 0, s * 0.3 + r * 0.5);
    this.torso.rotation.set(s * 0.55 + r, s * 0.35, -s * 0.25);
    this.neck.rotation.set(s * 1.0, s * 1.7, s * 0.6 + r * 2);
    this.neck.position.y = TORSO_H / 2 - s * 0.35;
    this.armL.rotation.set(-s * 0.7 + r, 0, s * 1.75);
    this.armR.rotation.set(-s * 0.45 - r, 0, -s * 1.95);
    this.legL.rotation.set(s * 0.55, 0, s * 0.95 + r);
    this.legR.rotation.set(s * 0.3, 0, -s * 1.15 - r);
    this.jaw.rotation.x = s * 0.5;
  }

  update(dt) {
    this.time += dt * (this._walkRate ?? 1);
    this.modeTime += dt;
    const t = this.time;
    const lt = this.modeTime;

    if (this.mode === 'idle') {
      this.rigBob.position.y = Math.sin(t * 1.2) * 0.03;
      this.torso.rotation.set(0, Math.sin(t * 0.5) * 0.08, 0);
      this.neck.rotation.set(0.05, Math.sin(t * 0.7) * 0.22, Math.sin(t * 1.3) * 0.05);
      // あごがカタカタ鳴る
      this.jaw.rotation.x = 0.06 + Math.abs(Math.sin(t * 7)) * 0.13;
      this.armL.rotation.set(-0.06, 0, 0.14 + Math.sin(t * 1.2) * 0.03);
      this.armR.rotation.set(-0.06, 0, -0.14 - Math.sin(t * 1.2) * 0.03);
      this.legL.rotation.set(0, 0, 0);
      this.legR.rotation.set(0, 0, 0);
    } else if (this.mode === 'walk') {
      // 骨がぶつかり合う、かたい足取り
      const swing = Math.sin(t * 5.0);
      const step = Math.abs(swing);
      this.rigBob.position.y = step * 0.07;
      this.rigBob.rotation.z = swing * 0.04;
      this.hip.rotation.y = -swing * 0.12;
      this.torso.rotation.set(0.06, swing * 0.14, 0);
      this.neck.rotation.set(0.08, -swing * 0.1, Math.sin(t * 9) * 0.04);
      this.jaw.rotation.x = 0.05 + step * 0.16;
      this.armL.rotation.set(-swing * 0.7, 0, 0.16);
      this.armR.rotation.set(swing * 0.7, 0, -0.16);
      this.legL.rotation.set(swing * 0.62, 0, 0);
      this.legR.rotation.set(-swing * 0.62, 0, 0);
    } else if (this.mode === 'attack') {
      // 棒を頭の上まで振りかぶって、体ごと打ち下ろす
      const p = Math.min(lt / ATTACK_TIME, 1);
      let armX, twist, lean, bob;
      if (p < 0.42) {
        const w = easeOutCubic(p / 0.42);
        armX = -0.1 - w * 2.5;
        twist = w * 0.5;
        lean = -w * 0.3;
        bob = w * 0.08;
      } else if (p < 0.64) {
        const s = easeInCubic((p - 0.42) / 0.22);
        armX = -2.6 + s * 3.2;
        twist = 0.5 - s * 0.85;
        lean = -0.3 + s * 0.75;
        bob = 0.08 - s * 0.18;
      } else {
        const r = easeOutCubic((p - 0.64) / 0.36);
        armX = 0.6 - r * 0.7;
        twist = -0.35 + r * 0.35;
        lean = 0.45 - r * 0.45;
        bob = -0.1 + r * 0.1;
      }
      this.rigBob.position.y = bob;
      this.rigBob.rotation.z = 0;
      this.hip.rotation.y = twist * 0.4;
      this.torso.rotation.set(lean, twist, 0);
      this.neck.rotation.set(lean * 0.4, -twist * 0.5, 0);
      this.jaw.rotation.x = 0.05 + Math.max(0, 0.4 - Math.abs(p - 0.5) * 1.6);
      this.armR.rotation.set(armX, 0, -0.1);
      this.armL.rotation.set(-0.4 + lean, 0, 0.5);
      this.legL.rotation.set(0.2, 0, 0);
      this.legR.rotation.set(-0.22, 0, 0);
    } else if (this.mode === 'shoot') {
      // 弓を構える→引き絞る→放つ→戻す
      const p = Math.min(lt / SHOOT_TIME, 1);
      const raise = easeOutCubic(Math.min(p / 0.28, 1));
      const draw = p < 0.52 ? easeOutCubic(Math.max(0, (p - 0.18)) / 0.34) : 1;
      const released = p >= SHOOT_RELEASE_TIME / SHOOT_TIME;
      const after = released ? easeOutCubic((p - SHOOT_RELEASE_TIME / SHOOT_TIME) / (1 - SHOOT_RELEASE_TIME / SHOOT_TIME)) : 0;

      // 左腕をまっすぐ前へ。放ったあとゆっくり下ろす
      const hold = raise * (1 - after * 0.75);
      this.armL.rotation.set(-Math.PI / 2 * hold, 0, 0.1 * (1 - hold));
      // 右手は弦を引いてあごの横まで。放つと後ろへ弾ける
      const pull = released ? draw * (1 - Math.min(after * 3, 1)) : draw;
      const snap = released ? Math.sin(Math.min(after * 3, 1) * Math.PI) * 0.7 : 0;
      this.armR.rotation.set(-1.5 * raise + pull * 0.35 - snap, 0, -0.5 * pull - snap * 0.4);

      this.rigBob.position.y = Math.sin(t * 1.2) * 0.02;
      this.rigBob.rotation.z = 0;
      // 半身に構える。ひねりすぎると、弓が的からそれて見える
      this.hip.rotation.y = -0.1 * raise;
      this.torso.rotation.set(0, -0.12 * raise, 0);
      this.neck.rotation.set(0.02, 0.2 * raise, 0);
      this.jaw.rotation.x = 0.05;
      this.legL.rotation.set(0.12, 0, 0);
      this.legR.rotation.set(-0.12, 0, 0);

      if (this.arrow) {
        this.arrow.visible = !released;
        this.arrow.position.x = -pull * 0.34;
      }
      if (this.bowString) {
        // 引いた弦がへこみ、放つと震える
        const twang = released ? Math.cos(after * 24) * Math.max(0, 0.06 - after * 0.1) : 0;
        this.bowString.position.x = this.bowTipX - pull * 0.3 + twang;
      }
    } else if (this.mode === 'hit') {
      // 骨がばらけかけて、すぐ戻る
      const recoil = Math.sin(Math.min(lt / 0.5, 1) * Math.PI);
      this.#collapse(recoil * 0.18, Math.sin(lt * 40) * recoil * 0.06);
      this.rigBob.position.y = -recoil * 0.05;
      const flash = Math.max(0, 1 - lt / 0.25);
      for (const m of this.bodyMats) m.emissive.setRGB(flash * 0.7, 0, 0);
      if (lt > 0.5) this.setMode('idle');
    } else if (this.mode === 'death') {
      // 糸が切れたように骨が崩れ落ち、しばらく散らばってから消える
      const fall = easeInCubic(Math.min(lt / DEATH_FALL, 1));
      const settle = lt > DEATH_FALL ? Math.sin((lt - DEATH_FALL) * 14) * Math.max(0, 0.05 - (lt - DEATH_FALL) * 0.08) : 0;
      this.#collapse(fall, settle);
      if (this.arrow) this.arrow.visible = false;

      const fade = THREE.MathUtils.clamp((lt - 1.6) / 0.9, 0, 1);
      for (const m of this.bodyMats) {
        m.opacity = 1 - fade;
        m.emissive.setRGB(0, 0, 0);
      }
    } else if (this.mode === 'revive') {
      // 散らばった骨が震えながら引き寄せられ、立ち上がる
      const p = Math.min(lt / REVIVE_TIME, 1);
      const s = 1 - easeOutBack(p);
      const shake = Math.sin(lt * 34) * 0.12 * (1 - p);
      this.#collapse(Math.max(0, s), shake);
      if (this.arrow) this.arrow.visible = true;

      const glow = Math.sin(p * Math.PI);
      for (const m of this.bodyMats) {
        m.opacity = 1;
        m.emissive.setRGB(glow * 0.15, glow * 0.75, glow * 0.3);
      }
      if (p >= 1) for (const m of this.bodyMats) m.emissive.setRGB(0, 0, 0);
    }
  }
}
