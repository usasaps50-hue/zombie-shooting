import * as THREE from 'three';
import { canvasTexture, grungeTexture, boxGeometry, disposeModel } from './textures.js';
import { IS_TOUCH } from './device.js';

const TORSO_W = 1.5, TORSO_H = 1.5, TORSO_D = 0.75;
const HEAD_W = 1.0, HEAD_H = 0.95, HEAD_D = 1.0;
const ARM_W = 0.55, ARM_H = 1.5, ARM_D = 0.55;
const LEG_W = 0.62, LEG_H = 1.5, LEG_D = 0.62;
const LEG_GAP = 0.06;

// R6リグは全高3.95。人の背丈(約1.8m)に合わせて縮める
export const ZOMBIE_SCALE = 1.8 / (LEG_H + TORSO_H + HEAD_H);
export const ZOMBIE_HEIGHT = 1.8;

function faceTexture(skin) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = skin.face;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 120; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? skin.dark : skin.light;
    ctx.globalAlpha = 0.08 + Math.random() * 0.15;
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, 1 + Math.random() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 目。怒った顔のときは吊り上げて、白目を光らせる
  if (skin.eyes === 'angry') {
    ctx.fillStyle = '#ffe9c0';
    ctx.beginPath(); ctx.ellipse(42, 56, 9, 6, -0.25, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(86, 56, 9, 6, 0.25, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#141414';
    ctx.beginPath(); ctx.arc(44, 57, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(84, 57, 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = skin.dark;
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(28, 40); ctx.lineTo(54, 50); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(100, 40); ctx.lineTo(74, 50); ctx.stroke();
  } else {
    ctx.fillStyle = '#141414';
    ctx.beginPath(); ctx.ellipse(42, 55, 7, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(86, 55, 7, 10, 0, 0, Math.PI * 2); ctx.fill();
  }

  // 口。牙をむいた口はギザギザに描く
  if (skin.mouth === 'grin') {
    ctx.fillStyle = '#2a1010';
    ctx.beginPath();
    ctx.moveTo(36, 88);
    ctx.lineTo(92, 88);
    ctx.lineTo(92, 104);
    ctx.lineTo(36, 104);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#efe6cf';
    for (let i = 0; i < 7; i++) {
      const x = 36 + i * 8;
      ctx.beginPath();
      ctx.moveTo(x, 88);
      ctx.lineTo(x + 8, 88);
      ctx.lineTo(x + 4, 88 + (i % 2 ? 12 : 8));
      ctx.closePath();
      ctx.fill();
    }
  } else {
    ctx.strokeStyle = '#141414';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(64, 100, 22, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  }
  return canvasTexture(canvas);
}

function graveTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#8a8a86';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 150; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? '#5c5c58' : '#a8a8a2';
    ctx.globalAlpha = 0.1 + Math.random() * 0.15;
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, 1 + Math.random() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#2c2c2a';
  ctx.font = 'bold 26px Georgia';
  ctx.textAlign = 'center';
  ctx.fillText('R.I.P', size / 2, 58);
  ctx.strokeStyle = '#3a3a36';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(20, 68); ctx.lineTo(108, 68); ctx.stroke();
  return canvasTexture(canvas);
}

// 服と墓は全種類で共通
const TEX = {
  sleeve: grungeTexture('#5b5245', '#3a352c', '#8a9578'),
  pants: grungeTexture('#2f394a', '#1c222c', '#4a5568'),
  stone: grungeTexture('#8a8a86', '#5c5c58', '#a8a8a2', 220),
  dirt: grungeTexture('#3a2e22', '#241b13', '#4d3d2c', 220),
  graveFront: graveTexture(),
};

// カウボーイのそうび。ガンマゾンビだけが使うので、初めて作るときまで待つ
let COWBOY = null;
function cowboyTextures() {
  COWBOY ??= {
    hat: grungeTexture('#8a6a42', '#563f26', '#b08c5c', 200),
    leather: grungeTexture('#7a5232', '#472d1a', '#a3714a', 200),
    scarf: grungeTexture('#a83a33', '#6b1f1b', '#d6685c', 160),
  };
  return COWBOY;
}

// 肌の色。face は顔、hand は袖から出た手、foot は裾から出た足
const SKINS = {
  green: { face: '#7c8873', dark: '#4c5642', light: '#9aa78a', hand: '#9aa78a', foot: '#6b7860' },
  blue: { face: '#5d8cb6', dark: '#2f5d7d', light: '#a6cbe4', hand: '#7fabce', foot: '#48708f' },
  // 足の速いゾンビ。牙をむいて目を吊り上げた、赤い個体
  red: {
    face: '#b2483f', dark: '#63201b', light: '#dd8271', hand: '#c2604f', foot: '#8f3a30',
    eyes: 'angry', mouth: 'grin',
  },
  // 地中に潜るゾンビ
  purple: { face: '#7b5aa6', dark: '#3d2a58', light: '#b39ad8', hand: '#8f6cbb', foot: '#5d4180' },
  // ガンマゾンビ。放射線を浴びたような黄緑
  gamma: {
    face: '#9aa84e', dark: '#4f5b24', light: '#cfdc7c', hand: '#a8b65c', foot: '#79863c',
    eyes: 'angry',
  },
};

// 装甲の色。素の金属らしく見せたいのでテクスチャは貼らない
export const ARMORS = {
  silver: { plate: 0xc3c9d1, trim: 0x8d949d },
  gold: { plate: 0xd9b23f, trim: 0xa8842a },
};

// 同じ肌のテクスチャは1回だけ作って使い回す
const skinCache = {};
function skinTextures(id) {
  const skin = SKINS[id] ?? SKINS.green;
  skinCache[id] ??= {
    face: faceTexture(skin),
    cuff: grungeTexture(skin.hand, skin.dark, skin.light, 180),
    pantsCuff: grungeTexture(skin.foot, skin.dark, skin.light, 180),
    dark: skin.dark,
  };
  return skinCache[id];
}

const ATTACK_TIME = 0.55;
const ATTACK_HIT_TIME = 0.42;
// 地中へ潜る時間と、地面から出てきて身構えるまでの時間
const BURROW_TIME = 1.0;
export const EMERGE_TIME = 2.0;
// 潜るとき、これだけ下げれば地面の下に完全に隠れる（リグの座標）
const RIG_HEIGHT = LEG_H + TORSO_H + HEAD_H;
const SINK = RIG_HEIGHT + 0.5;

const easeOutCubic = (x) => 1 - (1 - x) ** 3;
const easeInCubic = (x) => x * x * x;
const easeOutBack = (x) => 1 + 2.7 * (x - 1) ** 3 + 1.7 * (x - 1) ** 2;

// 20体ぶんの手足すべてに影を落とさせると重い。胴と頭だけ影を出す
function box(w, h, d, material, shadow = !IS_TOUCH) {
  const m = new THREE.Mesh(boxGeometry(w, h, d), material);
  m.castShadow = shadow;
  return m;
}

export class Zombie {
  // outfit に 'cowboy' を渡すと、帽子・ベスト・リボルバーがつく
  constructor(skinId = 'green', armorId = null, { outfit = null } = {}) {
    const skin = skinTextures(skinId);
    const armor = ARMORS[armorId];
    const skinned = (map) => new THREE.MeshStandardMaterial({ map, roughness: 0.95, transparent: true });
    this.mats = {
      sleeve: skinned(TEX.sleeve),
      cuff: skinned(skin.cuff),
      pants: skinned(TEX.pants),
      pantsCuff: skinned(skin.pantsCuff),
      face: skinned(skin.face),
      dark: new THREE.MeshStandardMaterial({ color: skin.dark, roughness: 1, transparent: true }),
    };
    this.outfit = outfit;
    if (outfit === 'cowboy') {
      const cow = cowboyTextures();
      this.mats.hat = skinned(cow.hat);
      this.mats.leather = skinned(cow.leather);
      this.mats.scarf = skinned(cow.scarf);
      this.mats.steel = new THREE.MeshStandardMaterial({
        color: 0x4a4f57, roughness: 0.35, metalness: 0.55, transparent: true,
      });
      this.mats.brass = new THREE.MeshStandardMaterial({
        color: 0xc79b3f, roughness: 0.4, metalness: 0.5, transparent: true,
      });
      this.mats.wood = new THREE.MeshStandardMaterial({
        color: 0x6b4326, roughness: 0.8, transparent: true,
      });
    }
    if (armor) {
      // 環境マップがないシーンなので、metalness を上げすぎると真っ黒になる
      const metal = (color, rough) =>
        new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.3, transparent: true });
      this.mats.plate = metal(armor.plate, 0.3);
      this.mats.trim = metal(armor.trim, 0.45);
    }
    this.armor = armor ? { plate: this.mats.plate, trim: this.mats.trim } : null;
    this.bodyMats = Object.values(this.mats);

    this.root = new THREE.Group();
    this.root.scale.setScalar(ZOMBIE_SCALE);

    this.rigBob = new THREE.Group();
    this.root.add(this.rigBob);
    this.hip = new THREE.Group();
    this.hip.position.y = LEG_H;
    this.rigBob.add(this.hip);

    this.legL = this.#buildLeg(-1);
    this.legR = this.#buildLeg(1);

    this.torso = new THREE.Group();
    this.torso.position.y = TORSO_H / 2;
    this.hip.add(this.torso);
    this.torso.add(box(TORSO_W, TORSO_H, TORSO_D, this.mats.sleeve, true));

    this.neck = new THREE.Group();
    this.neck.position.y = TORSO_H / 2;
    this.torso.add(this.neck);
    const head = new THREE.Mesh(
      boxGeometry(HEAD_W, HEAD_H, HEAD_D),
      [this.mats.dark, this.mats.dark, this.mats.dark, this.mats.dark, this.mats.face, this.mats.dark]
    );
    head.position.y = HEAD_H / 2;
    head.castShadow = true;
    this.neck.add(head);

    if (this.armor) this.#buildArmor();
    if (outfit === 'cowboy') this.#buildCowboy();

    this.armL = this.#buildArm(-1);
    this.armR = this.#buildArm(1);
    if (outfit === 'cowboy') this.gun = this.#buildRevolver();

    this.grave = this.#buildGrave();
    this.root.add(this.grave);

    this.mode = 'idle';
    this.modeTime = 0;
    this.time = Math.random() * 10;
    // 銃を構えているか。構えている間は右腕だけ、モーションより優先して前へ向ける
    this.aiming = false;
    this.recoil = 0;
    this.reset();
  }

  #buildLeg(side) {
    const pivot = new THREE.Group();
    pivot.position.x = side * (LEG_W / 2 + LEG_GAP / 2);
    this.hip.add(pivot);
    const main = box(LEG_W, LEG_H * 0.8, LEG_D, this.mats.pants);
    main.position.y = -(LEG_H * 0.8) / 2;
    const cuff = box(LEG_W * 1.03, LEG_H * 0.2, LEG_D * 1.03, this.mats.pantsCuff);
    cuff.position.y = -(LEG_H * 0.8) - (LEG_H * 0.2) / 2;
    pivot.add(main, cuff);

    if (this.outfit === 'cowboy') {
      // 革のチャップスとブーツ
      const chaps = box(LEG_W * 1.12, LEG_H * 0.52, LEG_D * 1.12, this.mats.leather);
      chaps.position.y = -LEG_H * 0.28;
      const fringe = box(LEG_W * 0.16, LEG_H * 0.5, LEG_D * 1.2, this.mats.leather);
      fringe.position.set(side * LEG_W * 0.56, -LEG_H * 0.3, 0);
      const boot = box(LEG_W * 1.1, LEG_H * 0.24, LEG_D * 1.35, this.mats.leather);
      boot.position.set(0, -(LEG_H * 0.86), LEG_D * 0.12);
      const spur = box(LEG_W * 0.5, LEG_W * 0.5, 0.08, this.mats.brass);
      spur.position.set(0, -(LEG_H * 0.9), -LEG_D * 0.6);
      pivot.add(chaps, fringe, boot, spur);
    }
    return pivot;
  }

  #buildArm(side) {
    const pivot = new THREE.Group();
    pivot.position.set(side * (TORSO_W / 2 + ARM_W / 2), TORSO_H / 2, 0);
    this.torso.add(pivot);
    const main = box(ARM_W, ARM_H * 0.82, ARM_D, this.mats.sleeve);
    main.position.y = -(ARM_H * 0.82) / 2;
    const cuff = box(ARM_W * 1.03, ARM_H * 0.18, ARM_D * 1.03, this.mats.cuff);
    cuff.position.y = -(ARM_H * 0.82) - (ARM_H * 0.18) / 2;
    pivot.add(main, cuff);

    if (this.armor) {
      // 肩当ては腕と一緒に振れるよう、腕のピボットにぶら下げる
      const pauldron = box(ARM_W * 1.32, ARM_H * 0.26, ARM_D * 1.32, this.armor.plate);
      pauldron.position.y = -ARM_H * 0.1;
      const bracer = box(ARM_W * 1.14, ARM_H * 0.2, ARM_D * 1.14, this.armor.trim);
      bracer.position.y = -ARM_H * 0.62;
      pivot.add(pauldron, bracer);
    }
    return pivot;
  }

  // 胸当て・ベルト・兜。肌と服の上から重ねる
  #buildArmor() {
    const chest = box(TORSO_W * 1.07, TORSO_H * 0.66, TORSO_D * 1.16, this.armor.plate);
    chest.position.y = 0.16;
    const belt = box(TORSO_W * 1.09, TORSO_H * 0.14, TORSO_D * 1.18, this.armor.trim);
    belt.position.y = -0.5;
    this.torso.add(chest, belt);

    // 目より上だけを覆う。顔が隠れるとゾンビに見えなくなる
    const helmet = box(HEAD_W * 1.1, HEAD_H * 0.42, HEAD_D * 1.1, this.armor.plate);
    helmet.position.y = HEAD_H - (HEAD_H * 0.42) / 2;
    const crest = box(HEAD_W * 0.13, HEAD_H * 0.2, HEAD_D * 1.14, this.armor.trim);
    crest.position.y = HEAD_H + HEAD_H * 0.06;
    this.neck.add(helmet, crest);
  }

  // テンガロンハット・ベスト・バンダナ・ガンベルト
  #buildCowboy() {
    const M = this.mats;

    // 前を開けたベスト。胸の両脇と背中の板でそれらしく見せる
    for (const side of [-1, 1]) {
      const panel = box(TORSO_W * 0.3, TORSO_H * 0.8, 0.1, M.leather);
      panel.position.set(side * TORSO_W * 0.31, -0.05, TORSO_D / 2 + 0.05);
      this.torso.add(panel);
    }
    const back = box(TORSO_W * 0.94, TORSO_H * 0.8, 0.1, M.leather);
    back.position.set(0, -0.05, -TORSO_D / 2 - 0.05);
    const collar = box(TORSO_W * 0.94, TORSO_H * 0.16, TORSO_D * 1.14, M.leather);
    collar.position.y = TORSO_H * 0.36;
    // 保安官バッジ
    const badge = box(0.26, 0.26, 0.06, M.brass);
    badge.position.set(-TORSO_W * 0.3, TORSO_H * 0.12, TORSO_D / 2 + 0.12);

    // 首のバンダナ。前に三角の結び目が垂れる
    const scarf = box(TORSO_W * 0.66, 0.32, TORSO_D * 0.86, M.scarf);
    scarf.position.y = TORSO_H / 2 - 0.14;
    const knot = new THREE.Mesh(boxGeometry(0.42, 0.42, 0.08), M.scarf);
    knot.position.set(0, TORSO_H / 2 - 0.42, TORSO_D / 2 + 0.02);
    knot.rotation.z = Math.PI / 4;

    // ガンベルトと、腰の弾帯
    const belt = box(TORSO_W * 1.04, 0.24, TORSO_D * 1.08, M.leather);
    belt.position.y = -TORSO_H / 2 + 0.16;
    const buckle = box(0.34, 0.26, 0.08, M.brass);
    buckle.position.set(0, -TORSO_H / 2 + 0.16, TORSO_D / 2 + 0.06);
    for (let i = 0; i < 6; i++) {
      const bullet = box(0.1, 0.22, 0.1, M.brass);
      bullet.position.set(-0.5 + i * 0.2, -TORSO_H / 2 + 0.16, -TORSO_D / 2 - 0.07);
      this.torso.add(bullet);
    }
    // 腰のホルスター（銃は手に持っているので、空のケースだけ）
    const holster = box(0.3, 0.5, 0.24, M.leather);
    holster.position.set(TORSO_W * 0.52, -TORSO_H / 2 - 0.1, 0.05);

    this.torso.add(back, collar, badge, scarf, knot, belt, buckle, holster);

    // テンガロンハット。丸いつばの左右を少しはね上げる
    const hat = new THREE.Group();
    hat.position.y = HEAD_H + 0.02;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.92, 0.07, 14), M.hat);
    brim.castShadow = !IS_TOUCH;
    const crown = box(HEAD_W * 0.84, HEAD_H * 0.58, HEAD_D * 0.84, M.hat, true);
    crown.position.y = HEAD_H * 0.29 + 0.03;
    // てっぺんのくぼみ
    const dent = box(HEAD_W * 0.24, HEAD_H * 0.16, HEAD_D * 0.86, M.hat);
    dent.position.y = HEAD_H * 0.56;
    const band = box(HEAD_W * 0.88, 0.14, HEAD_D * 0.88, M.scarf);
    band.position.y = 0.12;
    for (const side of [-1, 1]) {
      const flip = box(0.5, 0.09, 0.9, M.hat);
      flip.position.set(side * 0.78, 0.11, 0);
      flip.rotation.z = -side * 0.42;
      hat.add(flip);
    }
    hat.add(brim, crown, dent, band);
    this.neck.add(hat);
    this.hat = hat;
  }

  // 右手のリボルバー。腕が下がっているときは銃口が下を向く
  #buildRevolver() {
    const M = this.mats;
    const gun = new THREE.Group();
    gun.position.y = -ARM_H * 0.98;

    const barrel = box(0.15, 0.66, 0.15, M.steel);
    barrel.position.y = -0.36;
    const rib = box(0.08, 0.6, 0.07, M.steel);
    rib.position.set(0, -0.36, 0.11);
    const sight = box(0.06, 0.1, 0.06, M.steel);
    sight.position.set(0, -0.62, 0.14);
    const drum = box(0.22, 0.26, 0.22, M.steel);
    drum.position.y = -0.13;
    const frame = box(0.16, 0.3, 0.16, M.steel);
    const hammer = box(0.1, 0.14, 0.1, M.steel);
    hammer.position.set(0, 0.12, -0.1);
    // 木のグリップは、腕から見て後ろ下へ伸びる
    const grip = box(0.15, 0.2, 0.34, M.wood);
    grip.position.set(0, 0.06, -0.2);
    grip.rotation.x = 0.35;
    const guard = box(0.12, 0.1, 0.2, M.steel);
    guard.position.set(0, -0.07, -0.11);

    gun.add(barrel, rib, sight, drum, frame, hammer, grip, guard);
    this.armR.add(gun);
    // 銃口の位置を世界座標で取るための目印
    this.muzzleTip = new THREE.Object3D();
    this.muzzleTip.position.y = -0.72;
    gun.add(this.muzzleTip);
    return gun;
  }

  #buildGrave() {
    const g = new THREE.Group();
    g.position.set(0, -1.4, -0.9);
    g.scale.setScalar(0.001);

    const stoneMat = new THREE.MeshStandardMaterial({ map: TEX.stone, roughness: 1 });
    const mound = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 10), new THREE.MeshStandardMaterial({ map: TEX.dirt, roughness: 1 }));
    mound.scale.set(1, 0.22, 0.7);
    mound.position.y = 0.05;
    mound.receiveShadow = true;

    const stone = box(0.85, 1.0, 0.22, stoneMat);
    stone.position.y = 0.75;
    const front = new THREE.Mesh(
      new THREE.BoxGeometry(0.85, 1.0, 0.02),
      new THREE.MeshStandardMaterial({ map: TEX.graveFront, roughness: 1 })
    );
    front.position.set(0, 0.75, 0.12);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.425, 16, 12), stoneMat);
    cap.scale.set(1, 0.55, 0.52);
    cap.position.y = 1.25;
    cap.castShadow = true;

    g.add(mound, stone, front, cap);
    return g;
  }

  dispose() {
    disposeModel(this.root);
  }

  reset() {
    this.mode = 'idle';
    this.modeTime = 0;
    this.rigBob.rotation.set(0, 0, 0);
    this.rigBob.position.set(0, 0, 0);
    this.torso.rotation.set(0, 0, 0);
    this.aiming = false;
    this.recoil = 0;
    for (const m of this.bodyMats) {
      m.opacity = 1;
      m.emissive.setRGB(0, 0, 0);
    }
    this.grave.scale.setScalar(0.001);
    this.grave.position.y = -1.4;
  }

  // 銃を撃った瞬間。しばらく腕が跳ね上がる
  fire() {
    this.recoil = 1;
  }

  // 銃口の世界座標。弾はここから出す
  muzzlePoint(out = new THREE.Vector3()) {
    if (!this.muzzleTip) return out.set(0, 0, 0);
    this.muzzleTip.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(this.muzzleTip.matrixWorld);
  }

  get burrowFinished() {
    return this.mode === 'burrow' && this.modeTime >= BURROW_TIME;
  }

  get emergeFinished() {
    return this.mode === 'emerge' && this.modeTime >= EMERGE_TIME;
  }

  setMode(name) {
    if (this.mode === name) return;
    if (this.mode === 'death') this.reset();
    // 潜り／出現をやめたら、回して沈めたぶんを戻す
    if (this.mode === 'burrow' || this.mode === 'emerge') {
      this.rigBob.rotation.set(0, 0, 0);
      this.rigBob.position.set(0, 0, 0);
      for (const m of this.bodyMats) m.emissive.setRGB(0, 0, 0);
    }
    this.torso.rotation.set(0, 0, 0);
    this.neck.rotation.set(0, 0, 0);
    this.mode = name;
    this.modeTime = 0;
  }

  // 同じ攻撃を続けて出すため、attack のときだけ頭出しをやり直せるようにする
  restartAttack() {
    this.setMode('attack');
    this.modeTime = 0;
  }

  get deathFinished() {
    return this.mode === 'death' && this.modeTime > 2.3;
  }

  // 振り下ろしが当たる瞬間。攻撃側はこのタイミングでダメージを出す
  get attackLanded() {
    return this.mode === 'attack' && this.modeTime >= ATTACK_HIT_TIME;
  }

  get attackFinished() {
    return this.mode === 'attack' && this.modeTime >= ATTACK_TIME;
  }

  // 歩きの速さの倍率。足の速いゾンビは手足も速く振る
  set walkRate(rate) {
    this._walkRate = rate;
  }

  update(dt) {
    this.time += dt * (this._walkRate ?? 1);
    this.modeTime += dt;
    const t = this.time;
    const lt = this.modeTime;

    if (this.mode === 'idle') {
      this.rigBob.position.y = Math.sin(t * 1.4) * 0.03;
      this.neck.rotation.set(0, Math.sin(t * 0.6) * 0.15, 0);
      this.torso.rotation.x = 0;
      this.armL.rotation.set(-0.1 + Math.sin(t * 1.4) * 0.03, 0, 0.05);
      this.armR.rotation.set(-0.1 - Math.sin(t * 1.4) * 0.03, 0, -0.05);
      this.legL.rotation.x = 0;
      this.legR.rotation.x = 0;
    } else if (this.mode === 'walk') {
      const swing = Math.sin(t * 4.5);
      this.rigBob.position.y = Math.abs(swing) * 0.06;
      this.neck.rotation.set(0.1, 0, 0);
      this.torso.rotation.x = 0;
      this.armL.rotation.set(-1.3 + swing * 0.2, 0, 0.08);
      this.armR.rotation.set(-1.3 - swing * 0.2, 0, -0.08);
      this.legL.rotation.x = swing * 0.6;
      this.legR.rotation.x = -swing * 0.6;
    } else if (this.mode === 'attack') {
      // 右腕を後ろに振りかぶってから前に叩きつける
      const p = Math.min(lt / ATTACK_TIME, 1);
      let armX, armZ, twist;
      if (p < 0.32) {
        const w = easeOutCubic(p / 0.32);
        armX = -0.1 - w * 2.0;
        armZ = -w * 0.5;
        twist = w * 0.25;
      } else if (p < 0.55) {
        const s = easeOutCubic((p - 0.32) / 0.23);
        armX = -2.1 + s * 2.5;
        armZ = -0.5 + s * 0.5;
        twist = 0.25 - s * 0.45;
      } else {
        const r = easeOutCubic((p - 0.55) / 0.45);
        armX = 0.4 - r * 0.5;
        armZ = 0;
        twist = -0.2 + r * 0.2;
      }
      this.rigBob.position.y = Math.sin(t * 1.4) * 0.02;
      this.torso.rotation.set(0, twist, 0);
      this.neck.rotation.set(0, -twist * 0.5, 0);
      this.armR.rotation.set(armX, 0, armZ);
      this.armL.rotation.set(-0.35, 0, 0.15);
      this.legL.rotation.x = 0.1;
      this.legR.rotation.x = -0.1;
    } else if (this.mode === 'hit') {
      const recoil = Math.sin(Math.min(lt / 0.7, 1) * Math.PI);
      this.rigBob.position.y = 0;
      this.torso.rotation.x = -recoil * 0.35;
      this.neck.rotation.set(-recoil * 0.5, 0, 0);
      this.armL.rotation.set(-0.3 - recoil * 0.9, 0, 0.35 + recoil * 0.3);
      this.armR.rotation.set(-0.3 - recoil * 0.9, 0, -0.35 - recoil * 0.3);
      this.legL.rotation.x = -recoil * 0.15;
      this.legR.rotation.x = -recoil * 0.15;
      const flash = Math.max(0, 1 - lt / 0.25);
      for (const m of this.bodyMats) m.emissive.setRGB(flash * 0.7, 0, 0);
      if (lt > 0.7) this.setMode('idle');
    } else if (this.mode === 'death') {
      const fall = easeOutCubic(Math.min(lt / 1.0, 1));
      this.rigBob.rotation.x = -fall * (Math.PI / 2.05);
      this.rigBob.position.y = -fall * 0.05;
      this.torso.rotation.x = 0;
      this.neck.rotation.set(0.15, 0, 0);
      this.armL.rotation.set(-0.4 - fall * 0.3, 0, 0.5 * fall);
      this.armR.rotation.set(-0.4 - fall * 0.3, 0, -0.5 * fall);
      this.legL.rotation.x = 0.05;
      this.legR.rotation.x = -0.05;

      const fade = THREE.MathUtils.clamp((lt - 1.3) / 0.9, 0, 1);
      for (const m of this.bodyMats) {
        m.opacity = 1 - fade;
        m.emissive.setRGB(0, 0, 0);
      }

      const rise = THREE.MathUtils.clamp((lt - 1.4) / 0.9, 0, 1);
      this.grave.scale.setScalar(Math.max(0.001, easeOutBack(rise)));
      this.grave.position.y = -1.4 + Math.min(rise * 1.6, 1.4);
    } else if (this.mode === 'burrow') {
      // 両腕で地面をかき分け、体をひねりながら沈んでいく
      const p = Math.min(lt / BURROW_TIME, 1);
      const dig = Math.sin(p * Math.PI * 6);
      this.rigBob.rotation.y = p * p * Math.PI * 2.6;
      this.rigBob.position.y = -easeInCubic(p) * SINK;
      this.torso.rotation.set(0.35 + dig * 0.12, 0, 0);
      this.neck.rotation.set(0.4, 0, dig * 0.15);
      this.armL.rotation.set(-2.5 + dig * 0.5, 0, 0.6);
      this.armR.rotation.set(-2.5 - dig * 0.5, 0, -0.6);
      this.legL.rotation.x = 0.5 - p * 0.4;
      this.legR.rotation.x = -0.5 + p * 0.4;
    } else if (this.mode === 'emerge') {
      // 前半：地面を突き破って飛び出す。後半：身構えてうなる（この間はまだ襲ってこない）
      const p = Math.min(lt / EMERGE_TIME, 1);
      const burst = Math.min(p / 0.3, 1);
      const rise = easeOutBack(burst);
      this.rigBob.position.y = -(1 - rise) * SINK;
      this.rigBob.rotation.y = (1 - burst) * -Math.PI * 1.8;

      if (p < 0.3) {
        // 万歳の形で飛び出す
        this.torso.rotation.set(-0.25, 0, 0);
        this.neck.rotation.set(-0.35, 0, 0);
        this.armL.rotation.set(-2.9, 0, 0.5);
        this.armR.rotation.set(-2.9, 0, -0.5);
        this.legL.rotation.x = 0.5;
        this.legR.rotation.x = 0.5;
      } else {
        // 着地して低く構え、小刻みに震えながらこちらを狙う
        const s = easeOutCubic(Math.min((p - 0.3) / 0.35, 1));
        const shiver = Math.sin(t * 22) * 0.05 * (1 - s * 0.5);
        this.rigBob.position.y = -s * 0.12;
        this.torso.rotation.set(-0.25 + s * 0.55, shiver, 0);
        this.neck.rotation.set(-0.35 + s * 0.2, shiver * 2, 0);
        this.armL.rotation.set(-2.9 + s * 1.5, 0, 0.5 + s * 0.2);
        this.armR.rotation.set(-2.9 + s * 1.5, 0, -0.5 - s * 0.2);
        this.legL.rotation.x = 0.5 - s * 0.7;
        this.legR.rotation.x = 0.5 - s * 0.7;
      }
      // 出てくる直前まで、体は土に隠れている扱いなので光らせない
      const glow = Math.max(0, Math.sin(p * Math.PI)) * 0.35;
      for (const m of this.bodyMats) m.emissive.setRGB(glow * 0.5, 0, glow);
    }

    if (this.gun) this.#aimGun(dt);
  }

  // 銃を構える動き。歩きや待機のモーションの上から、右腕だけを上書きする
  #aimGun(dt) {
    this.recoil = Math.max(0, this.recoil - dt * 4.2);
    const dead = this.mode === 'death' || this.mode === 'hit';
    if (!this.aiming || dead) return;

    const kick = easeOutCubic(this.recoil);
    // 腕を前へ倒すと、銃口が正面（モデルの +Z）を向く。
    // 撃った反動では、さらに倒して銃口を跳ね上げる
    this.armR.rotation.set(-Math.PI / 2 - kick * 0.5, 0, -0.05);
    // 半身に構え、顔は的のほうへ残す
    this.torso.rotation.y = -0.14 - kick * 0.12;
    this.neck.rotation.set(this.neck.rotation.x, 0.2, 0);
    this.rigBob.position.y -= kick * 0.04;
  }
}
