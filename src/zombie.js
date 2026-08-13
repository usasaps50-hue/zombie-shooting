import * as THREE from 'three';

// canvas は sRGB なので明示しないと色が線形として扱われ、白飛びする
function canvasTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const TORSO_W = 1.5, TORSO_H = 1.5, TORSO_D = 0.75;
const HEAD_W = 1.0, HEAD_H = 0.95, HEAD_D = 1.0;
const ARM_W = 0.55, ARM_H = 1.5, ARM_D = 0.55;
const LEG_W = 0.62, LEG_H = 1.5, LEG_D = 0.62;
const LEG_GAP = 0.06;

// R6リグは全高3.95。人の背丈(約1.8m)に合わせて縮める
export const ZOMBIE_SCALE = 1.8 / (LEG_H + TORSO_H + HEAD_H);
export const ZOMBIE_HEIGHT = 1.8;

function grungeTexture(base, dark, spot, density = 260) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < density; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? dark : spot;
    ctx.globalAlpha = 0.08 + Math.random() * 0.18;
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, 1 + Math.random() * 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return canvasTexture(canvas);
}

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
  ctx.fillStyle = '#141414';
  ctx.beginPath(); ctx.ellipse(42, 55, 7, 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(86, 55, 7, 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#141414';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(64, 100, 22, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();
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

// 肌の色。face は顔、hand は袖から出た手、foot は裾から出た足
const SKINS = {
  green: { face: '#7c8873', dark: '#4c5642', light: '#9aa78a', hand: '#9aa78a', foot: '#6b7860' },
  blue: { face: '#5d8cb6', dark: '#2f5d7d', light: '#a6cbe4', hand: '#7fabce', foot: '#48708f' },
};

// 装甲の色。素の金属らしく見せたいのでテクスチャは貼らない
const ARMORS = {
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

const easeOutCubic = (x) => 1 - (1 - x) ** 3;
const easeOutBack = (x) => 1 + 2.7 * (x - 1) ** 3 + 1.7 * (x - 1) ** 2;

function box(w, h, d, material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export class Zombie {
  constructor(skinId = 'green', armorId = null) {
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
    this.torso.add(box(TORSO_W, TORSO_H, TORSO_D, this.mats.sleeve));

    this.neck = new THREE.Group();
    this.neck.position.y = TORSO_H / 2;
    this.torso.add(this.neck);
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(HEAD_W, HEAD_H, HEAD_D),
      [this.mats.dark, this.mats.dark, this.mats.dark, this.mats.dark, this.mats.face, this.mats.dark]
    );
    head.position.y = HEAD_H / 2;
    head.castShadow = true;
    this.neck.add(head);

    if (this.armor) this.#buildArmor();

    this.armL = this.#buildArm(-1);
    this.armR = this.#buildArm(1);

    this.grave = this.#buildGrave();
    this.root.add(this.grave);

    this.mode = 'idle';
    this.modeTime = 0;
    this.time = Math.random() * 10;
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

  reset() {
    this.mode = 'idle';
    this.modeTime = 0;
    this.rigBob.rotation.set(0, 0, 0);
    this.rigBob.position.set(0, 0, 0);
    this.torso.rotation.set(0, 0, 0);
    for (const m of this.bodyMats) {
      m.opacity = 1;
      m.emissive.setRGB(0, 0, 0);
    }
    this.grave.scale.setScalar(0.001);
    this.grave.position.y = -1.4;
  }

  setMode(name) {
    if (this.mode === name) return;
    if (this.mode === 'death') this.reset();
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

  update(dt) {
    this.time += dt;
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
    }
  }
}
