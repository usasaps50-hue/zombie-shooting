import * as THREE from 'three';
import { canvasTexture, grungeTexture, muscleTexture, paint, boxGeometry, disposeModel } from './textures.js';
import { IS_TOUCH } from './device.js';
import { ARMORS } from './zombie.js';

// 前かがみで腕が太い大型ゾンビ。通常ゾンビより頭ひとつ大きい
const TORSO_W = 2.3, TORSO_H = 1.9, TORSO_D = 1.35;
const HEAD_W = 0.68, HEAD_H = 0.62, HEAD_D = 0.68;
const ARM_W = 0.85, ARM_H = 2.1, ARM_D = 0.85;
const FIST_W = 1.0, FIST_H = 0.6, FIST_D = 1.0;
const LEG_W = 0.95, LEG_H = 1.15, LEG_D = 0.95;
const LEG_GAP = 0.1;
// 背中の丸まり。前かがみのシルエットを作る
const HUNCH = 0.34;

export const MUTANT_HEIGHT = 2.6;
const RIG_HEIGHT = LEG_H + TORSO_H + HEAD_H;
const MUTANT_SCALE = MUTANT_HEIGHT / RIG_HEIGHT;

// 叩きつけ。振りかぶってから地面に拳を落とす
const ATTACK_TIME = 0.95;
const ATTACK_HIT_TIME = 0.55;

const easeOutCubic = (x) => 1 - (1 - x) ** 3;
const easeInCubic = (x) => x * x * x;

// 小さくて吊り上がった、光る目
function faceTexture() {
  const { canvas, ctx, size } = paint();
  ctx.fillStyle = '#557a3f';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 100; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? '#2e4526' : '#7a9c5c';
    ctx.globalAlpha = 0.08 + Math.random() * 0.14;
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, 1 + Math.random() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#16210f';
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(26, 42); ctx.lineTo(50, 52); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(102, 42); ctx.lineTo(78, 52); ctx.stroke();
  ctx.fillStyle = '#f2ff5a';
  ctx.beginPath(); ctx.ellipse(42, 60, 8, 5, -0.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(86, 60, 8, 5, 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#16210f';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(40, 96); ctx.lineTo(88, 96); ctx.stroke();
  return canvasTexture(canvas);
}

const TEX = {
  skin: muscleTexture('#557a3f', '#2e4526', '#7a9c5c'),
  skinDark: muscleTexture('#3e5c2e', '#22331b', '#5c7a45'),
  shorts: grungeTexture('#33475e', '#1c2836', '#4a6180', 180),
  face: faceTexture(),
};

function box(w, h, d, material, shadow = !IS_TOUCH) {
  const m = new THREE.Mesh(boxGeometry(w, h, d), material);
  m.castShadow = shadow;
  return m;
}

export class Mutant {
  constructor(armorId = null) {
    const armor = ARMORS[armorId];
    const skinned = (map) => new THREE.MeshStandardMaterial({ map, roughness: 0.95, transparent: true });
    this.mats = {
      skin: skinned(TEX.skin),
      skinDark: skinned(TEX.skinDark),
      shorts: skinned(TEX.shorts),
      face: skinned(TEX.face),
    };
    if (armor) {
      const metal = (color, rough) =>
        new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.3, transparent: true });
      this.mats.plate = metal(armor.plate, 0.3);
      this.mats.trim = metal(armor.trim, 0.45);
    }
    this.armor = armor ? { plate: this.mats.plate, trim: this.mats.trim } : null;
    this.bodyMats = Object.values(this.mats);

    this.root = new THREE.Group();
    this.root.scale.setScalar(MUTANT_SCALE);

    this.rigBob = new THREE.Group();
    this.root.add(this.rigBob);
    this.hip = new THREE.Group();
    this.hip.position.y = LEG_H;
    this.rigBob.add(this.hip);

    this.legL = this.#buildLeg(-1);
    this.legR = this.#buildLeg(1);

    const shorts = box(TORSO_W * 0.75, LEG_H * 0.42, LEG_D * 1.1, this.mats.shorts);
    shorts.position.y = LEG_H * 0.24;
    this.hip.add(shorts);

    // 前かがみの角度はここで作る。以降のモーションもこれを基準に足す
    this.torso = new THREE.Group();
    this.torso.position.y = TORSO_H / 2;
    this.torso.rotation.x = HUNCH;
    this.hip.add(this.torso);
    this.torso.add(box(TORSO_W, TORSO_H, TORSO_D, this.mats.skin, true));

    this.neck = new THREE.Group();
    this.neck.position.set(0, TORSO_H / 2, TORSO_D * 0.12);
    this.torso.add(this.neck);
    const head = new THREE.Mesh(
      boxGeometry(HEAD_W, HEAD_H, HEAD_D),
      [this.mats.skinDark, this.mats.skinDark, this.mats.skinDark,
        this.mats.skinDark, this.mats.face, this.mats.skinDark]
    );
    head.position.y = HEAD_H / 2 + 0.05;
    head.castShadow = true;
    this.neck.add(head);

    if (this.armor) this.#buildArmor();

    this.armL = this.#buildArm(-1);
    this.armR = this.#buildArm(1);

    this.mode = 'idle';
    this.modeTime = 0;
    this.time = Math.random() * 10;
    this.reset();
  }

  #buildLeg(side) {
    const pivot = new THREE.Group();
    pivot.position.x = side * (LEG_W / 2 + LEG_GAP / 2);
    this.hip.add(pivot);
    const main = box(LEG_W, LEG_H * 0.82, LEG_D, this.mats.skinDark);
    main.position.y = -(LEG_H * 0.82) / 2;
    const foot = box(LEG_W * 1.05, LEG_H * 0.18, LEG_D * 1.15, this.mats.skinDark);
    foot.position.set(0, -(LEG_H * 0.82) - (LEG_H * 0.18) / 2, LEG_D * 0.08);
    pivot.add(main, foot);
    return pivot;
  }

  #buildArm(side) {
    const pivot = new THREE.Group();
    pivot.position.set(side * (TORSO_W / 2 + ARM_W / 2 - 0.05), TORSO_H / 2 - 0.05, 0);
    this.torso.add(pivot);
    const main = box(ARM_W, ARM_H * 0.75, ARM_D, this.mats.skin);
    main.position.y = -(ARM_H * 0.75) / 2;
    const fist = box(FIST_W, FIST_H, FIST_D, this.mats.skinDark);
    fist.position.y = -(ARM_H * 0.75) - FIST_H / 2 + 0.05;
    pivot.add(main, fist);

    if (this.armor) {
      const pauldron = box(ARM_W * 1.3, ARM_H * 0.26, ARM_D * 1.3, this.armor.plate);
      pauldron.position.y = -ARM_H * 0.07;
      pivot.add(pauldron);
    }
    return pivot;
  }

  #buildArmor() {
    const chest = box(TORSO_W * 1.04, TORSO_H * 0.6, TORSO_D * 1.1, this.armor.plate);
    chest.position.y = 0.2;
    const belt = box(TORSO_W * 1.06, TORSO_H * 0.12, TORSO_D * 1.12, this.armor.trim);
    belt.position.y = -0.55;
    this.torso.add(chest, belt);

    // 目より上だけを覆う
    const helmet = box(HEAD_W * 1.16, HEAD_H * 0.4, HEAD_D * 1.16, this.armor.plate);
    helmet.position.y = HEAD_H * 0.92;
    const crest = box(HEAD_W * 0.16, HEAD_H * 0.26, HEAD_D * 1.2, this.armor.trim);
    crest.position.y = HEAD_H * 1.12;
    this.neck.add(helmet, crest);
  }

  dispose() {
    disposeModel(this.root);
  }

  reset() {
    this.mode = 'idle';
    this.modeTime = 0;
    this.rigBob.rotation.set(0, 0, 0);
    this.rigBob.position.set(0, 0, 0);
    this.torso.rotation.set(HUNCH, 0, 0);
    this.neck.rotation.set(0, 0, 0);
    for (const m of this.bodyMats) {
      m.opacity = 1;
      m.emissive.setRGB(0, 0, 0);
    }
  }

  setMode(name) {
    if (this.mode === name) return;
    if (this.mode === 'death') this.reset();
    this.torso.rotation.set(HUNCH, 0, 0);
    this.neck.rotation.set(0, 0, 0);
    this.mode = name;
    this.modeTime = 0;
  }

  restartAttack() {
    this.setMode('attack');
    this.modeTime = 0;
  }

  get deathFinished() {
    return this.mode === 'death' && this.modeTime > 2.3;
  }

  // 拳が地面に着く瞬間。ここで地割れとダメージを出す
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
      this.rigBob.position.y = Math.sin(t * 1.1) * 0.035;
      this.torso.rotation.set(HUNCH + Math.sin(t * 1.1) * 0.02, 0, 0);
      this.neck.rotation.y = Math.sin(t * 0.5) * 0.12;
      this.armL.rotation.set(Math.sin(t * 1.1) * 0.03, 0, 0.03);
      this.armR.rotation.set(-Math.sin(t * 1.1) * 0.03, 0, -0.03);
      this.legL.rotation.x = 0;
      this.legR.rotation.x = 0;
    } else if (this.mode === 'walk') {
      const swing = Math.sin(t * 2.1);
      this.rigBob.position.y = Math.abs(swing) * 0.11;
      this.torso.rotation.set(HUNCH + Math.abs(swing) * 0.04, 0, swing * 0.03);
      this.neck.rotation.y = 0;
      // 腕は力を抜いてぶら下げ、体の揺れに合わせて振れるだけ
      this.armL.rotation.set(swing * 0.12, 0, 0.04);
      this.armR.rotation.set(-swing * 0.12, 0, -0.04);
      this.legL.rotation.x = swing * 0.45;
      this.legR.rotation.x = -swing * 0.45;
    } else if (this.mode === 'attack') {
      const p = Math.min(lt / ATTACK_TIME, 1);
      let armX, armZ, torsoX, bobY;
      if (p < 0.4) {
        const w = easeOutCubic(p / 0.4);
        armX = -0.25 - w * 2.6;
        armZ = 0.18 + w * 0.55;
        torsoX = HUNCH - w * 0.22;
        bobY = w * 0.12;
      } else if (p < 0.58) {
        const s = easeInCubic((p - 0.4) / 0.18);
        armX = -2.85 + s * 3.35;
        armZ = 0.73 - s * 0.73;
        torsoX = HUNCH - 0.22 + s * 0.55;
        bobY = 0.12 - s * 0.22;
      } else {
        const r = easeOutCubic((p - 0.58) / 0.42);
        armX = 0.5 - r * 0.75;
        armZ = 0;
        torsoX = HUNCH + 0.33 - r * 0.33;
        bobY = -0.1 + r * 0.1;
      }
      this.rigBob.position.y = bobY;
      this.torso.rotation.set(torsoX, 0, 0);
      this.neck.rotation.y = 0;
      this.armL.rotation.set(armX, 0, armZ);
      this.armR.rotation.set(armX, 0, -armZ);
      this.legL.rotation.x = p < 0.58 ? -0.15 : 0;
      this.legR.rotation.x = p < 0.58 ? -0.15 : 0;
    } else if (this.mode === 'jump') {
      // 飛び上がって体を丸め、拳を振り上げたまま落ちてくる
      this.rigBob.position.y = 0;
      this.torso.rotation.set(HUNCH + 0.25, 0, 0);
      this.neck.rotation.set(0.2, 0, 0);
      this.armL.rotation.set(-2.4, 0, 0.5);
      this.armR.rotation.set(-2.4, 0, -0.5);
      this.legL.rotation.x = 0.7;
      this.legR.rotation.x = 0.7;
    } else if (this.mode === 'hit') {
      const recoil = Math.sin(Math.min(lt / 0.4, 1) * Math.PI);
      this.rigBob.position.y = 0;
      this.torso.rotation.set(HUNCH - recoil * 0.1, 0, 0);
      this.neck.rotation.set(-recoil * 0.2, 0, 0);
      this.armL.rotation.set(-0.25 - recoil * 0.2, 0, 0.18);
      this.armR.rotation.set(-0.25 - recoil * 0.2, 0, -0.18);
      const flash = Math.max(0, 1 - lt / 0.25);
      for (const m of this.bodyMats) m.emissive.setRGB(flash * 0.7, 0, 0);
      if (lt > 0.4) this.setMode('idle');
    } else if (this.mode === 'death') {
      const fall = easeInCubic(Math.min(lt / 0.85, 1));
      this.rigBob.rotation.x = fall * (Math.PI / 2.1);
      this.rigBob.position.y = -fall * 0.05;
      this.torso.rotation.set(HUNCH, 0, 0);
      this.neck.rotation.set(0, 0, 0);
      this.armL.rotation.set(-0.4 - fall * 0.5, 0, 0.3 + fall * 0.2);
      this.armR.rotation.set(-0.4 - fall * 0.5, 0, -0.3 - fall * 0.2);
      this.legL.rotation.x = -fall * 0.1;
      this.legR.rotation.x = -fall * 0.1;

      const fade = THREE.MathUtils.clamp((lt - 1.3) / 0.9, 0, 1);
      for (const m of this.bodyMats) {
        m.opacity = 1 - fade;
        m.emissive.setRGB(0, 0, 0);
      }
    }
  }
}
