import * as THREE from 'three';
import { canvasTexture, grungeTexture, muscleTexture, paint, boxGeometry, disposeModel } from './textures.js';
import { IS_TOUCH } from './device.js';

// ボス「タイタン」。ミュータントの3倍近い背丈の巨体。
// 肩と膝の装甲4枚をすべて割ると、胸の装甲も落ちて中の核が出る。
// 核が出ている間は弱点として大ダメージが通る。

// 横に広がりすぎると冷蔵庫のように見えるので、
// 「脚が長くて肩が張った」縦長のシルエットにする
const TORSO_W = 2.2, TORSO_H = 2.2, TORSO_D = 1.35;
const HEAD_W = 0.8, HEAD_H = 0.72, HEAD_D = 0.8;
const ARM_W = 0.82, ARM_H = 3.1, ARM_D = 0.82;
const FIST_W = 1.25, FIST_H = 0.9, FIST_D = 1.25;
const LEG_W = 0.92, LEG_H = 2.3, LEG_D = 0.98;
const LEG_GAP = 0.5;
const HUNCH = 0.24;

export const TITAN_HEIGHT = 7.0;
const RIG_HEIGHT = LEG_H + TORSO_H + HEAD_H;
const TITAN_SCALE = TITAN_HEIGHT / RIG_HEIGHT;

// 踏みつけ。大きく振り上げてから踏み下ろす
const STOMP_TIME = 1.5;
const STOMP_HIT_TIME = 0.85;
// 掴んで投げる
const THROW_TIME = 1.3;
const THROW_RELEASE_TIME = 0.72;
// 咆哮
const ROAR_TIME = 1.8;
// ビームの溜めと発射
const BEAM_CHARGE_TIME = 1.5;
const BEAM_FIRE_TIME = 0.7;

const easeOutCubic = (x) => 1 - (1 - x) ** 3;
const easeInCubic = (x) => x * x * x;
const clamp01 = (x) => Math.min(1, Math.max(0, x));

// 落ちくぼんだ眼窩の奥に、燃える目
function faceTexture() {
  const { canvas, ctx, size } = paint();
  ctx.fillStyle = '#4d4438';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 130; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? '#2b251d' : '#6b6152';
    ctx.globalAlpha = 0.1 + Math.random() * 0.18;
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, 1 + Math.random() * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // 深い眼窩
  ctx.fillStyle = '#140f0a';
  ctx.beginPath(); ctx.ellipse(42, 58, 20, 14, -0.12, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(86, 58, 20, 14, 0.12, 0, Math.PI * 2); ctx.fill();
  // 燃える瞳
  ctx.fillStyle = '#ff7a2a';
  ctx.beginPath(); ctx.ellipse(44, 60, 9, 6, -0.12, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(84, 60, 9, 6, 0.12, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffe08a';
  ctx.beginPath(); ctx.ellipse(44, 60, 4, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(84, 60, 4, 3, 0, 0, Math.PI * 2); ctx.fill();
  // 食いしばった歯
  ctx.strokeStyle = '#1a1410';
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(34, 98); ctx.lineTo(94, 98); ctx.stroke();
  ctx.fillStyle = '#cfc4ac';
  for (let i = 0; i < 6; i++) ctx.fillRect(36 + i * 10, 92, 7, 12);
  return canvasTexture(canvas);
}

const TEX = {
  skin: muscleTexture('#6b5f4a', '#3a3327', '#8a7d63'),
  skinDark: muscleTexture('#4f4636', '#2a251b', '#6b6250'),
  face: faceTexture(),
  plate: grungeTexture('#5c6068', '#33363c', '#7d838d', 200),
};

function box(w, h, d, material, shadow = !IS_TOUCH) {
  const m = new THREE.Mesh(boxGeometry(w, h, d), material);
  m.castShadow = shadow;
  return m;
}

export class Titan {
  constructor() {
    const skinned = (map) => new THREE.MeshStandardMaterial({ map, roughness: 0.95, transparent: true });
    this.mats = {
      skin: skinned(TEX.skin),
      skinDark: skinned(TEX.skinDark),
      face: skinned(TEX.face),
      plate: new THREE.MeshStandardMaterial({
        map: TEX.plate, roughness: 0.35, metalness: 0.45, transparent: true,
      }),
      trim: new THREE.MeshStandardMaterial({
        color: 0x8a6a2a, roughness: 0.4, metalness: 0.5, transparent: true,
      }),
    };
    this.bodyMats = Object.values(this.mats);
    // 核は自分で光るので、明かりの影響を受けない材質にする
    this.coreMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true });

    this.root = new THREE.Group();
    this.root.scale.setScalar(TITAN_SCALE);

    this.rigBob = new THREE.Group();
    this.root.add(this.rigBob);
    this.hip = new THREE.Group();
    this.hip.position.y = LEG_H;
    this.rigBob.add(this.hip);

    this.legL = this.#buildLeg(-1);
    this.legR = this.#buildLeg(1);

    this.torso = new THREE.Group();
    this.torso.position.y = TORSO_H / 2;
    this.torso.rotation.x = HUNCH;
    this.hip.add(this.torso);
    this.torso.add(box(TORSO_W, TORSO_H, TORSO_D, this.mats.skin, true));

    this.neck = new THREE.Group();
    this.neck.position.set(0, TORSO_H / 2 + 0.18, TORSO_D * 0.08);
    this.torso.add(this.neck);
    const head = new THREE.Mesh(
      boxGeometry(HEAD_W, HEAD_H, HEAD_D),
      [this.mats.skinDark, this.mats.skinDark, this.mats.skinDark,
        this.mats.skinDark, this.mats.face, this.mats.skinDark]
    );
    head.position.y = HEAD_H / 2 + 0.06;
    head.castShadow = true;
    this.neck.add(head);
    this.head = head;

    this.armL = this.#buildArm(-1);
    this.armR = this.#buildArm(1);

    // ---- 胸の装甲と、その中の核 ----
    this.chestPlate = box(TORSO_W * 0.86, TORSO_H * 0.56, TORSO_D * 1.14, this.mats.plate);
    this.chestPlate.position.set(0, 0.18, 0);
    this.torso.add(this.chestPlate);
    const belt = box(TORSO_W * 1.04, TORSO_H * 0.12, TORSO_D * 1.1, this.mats.trim);
    belt.position.y = -TORSO_H * 0.36;
    this.torso.add(belt);

    // 核。胸の装甲が落ちるまでは隠れている
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), this.coreMat);
    this.core.position.set(0, 0.18, TORSO_D * 0.52);
    this.core.visible = false;
    this.torso.add(this.core);
    // 核のまわりのぼんやりした光
    this.coreHalo = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.72, 0),
      new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.2, depthWrite: false })
    );
    this.coreHalo.position.copy(this.core.position);
    this.coreHalo.visible = false;
    this.torso.add(this.coreHalo);

    // ---- 割れる装甲4枚。肩2枚・膝2枚 ----
    // ここに入っている順に「0=左肩 1=右肩 2=左膝 3=右膝」
    this.plates = [this.shoulderL, this.shoulderR, this.kneeL, this.kneeR];
    this.plateAlive = [true, true, true, true];

    this.mode = 'idle';
    this.modeTime = 0;
    this.time = Math.random() * 10;
    this.beamFlash = 0;
    this.reset();
  }

  #buildLeg(side) {
    const pivot = new THREE.Group();
    pivot.position.x = side * (LEG_W / 2 + LEG_GAP / 2);
    this.hip.add(pivot);
    const main = box(LEG_W, LEG_H * 0.8, LEG_D, this.mats.skinDark);
    main.position.y = -(LEG_H * 0.8) / 2;
    const foot = box(LEG_W * 1.15, LEG_H * 0.2, LEG_D * 1.25, this.mats.skinDark);
    foot.position.set(0, -(LEG_H * 0.8) - (LEG_H * 0.2) / 2, LEG_D * 0.1);
    pivot.add(main, foot);

    // 膝の装甲。撃って割れる
    const knee = box(LEG_W * 1.32, LEG_H * 0.3, LEG_D * 1.34, this.mats.plate);
    knee.position.y = -LEG_H * 0.45;
    knee.name = 'plate';
    pivot.add(knee);
    if (side < 0) this.kneeL = knee;
    else this.kneeR = knee;
    return pivot;
  }

  #buildArm(side) {
    const pivot = new THREE.Group();
    pivot.position.set(side * (TORSO_W / 2 + ARM_W / 2 + 0.12), TORSO_H / 2 - 0.12, 0);
    this.torso.add(pivot);
    const main = box(ARM_W, ARM_H * 0.72, ARM_D, this.mats.skin);
    main.position.y = -(ARM_H * 0.72) / 2;
    const fist = box(FIST_W, FIST_H, FIST_D, this.mats.skinDark);
    fist.position.y = -(ARM_H * 0.72) - FIST_H / 2 + 0.05;
    pivot.add(main, fist);
    if (side < 0) this.fistL = fist;
    else this.fistR = fist;

    // 肩の装甲。撃って割れる
    const pauldron = box(ARM_W * 1.9, ARM_H * 0.22, ARM_D * 1.8, this.mats.plate);
    pauldron.position.set(side * ARM_W * 0.16, ARM_H * 0.02, 0);
    pauldron.rotation.z = -side * 0.12;
    pauldron.name = 'plate';
    pivot.add(pauldron);
    if (side < 0) this.shoulderL = pauldron;
    else this.shoulderR = pauldron;
    return pivot;
  }

  // ---- 装甲 ----

  // 1枚割る。割れたら true
  breakPlate(index) {
    if (!this.plateAlive[index]) return false;
    this.plateAlive[index] = false;
    this.plates[index].visible = false;
    return true;
  }

  get platesLeft() {
    return this.plateAlive.filter(Boolean).length;
  }

  // 4枚とも割れたあと。胸の装甲を落として核を出す
  exposeCore() {
    if (this.coreExposed) return false;
    this.coreExposed = true;
    this.chestPlate.visible = false;
    this.core.visible = true;
    this.coreHalo.visible = true;
    return true;
  }

  // 撃たれた物が装甲なら、その番号を返す。核なら 'core'、それ以外は null
  partOf(object) {
    if (object === this.core || object === this.coreHalo) return 'core';
    const index = this.plates.indexOf(object);
    return index >= 0 && this.plateAlive[index] ? index : null;
  }

  // 弾を当てられる部分（生きている装甲と、出ている核）
  hitTargets() {
    const list = [];
    this.plates.forEach((p, i) => { if (this.plateAlive[i]) list.push(p); });
    if (this.coreExposed) list.push(this.core);
    return list;
  }

  dispose() {
    disposeModel(this.root);
    this.core.geometry.dispose();
    this.coreHalo.geometry.dispose();
    this.coreMat.dispose();
    this.coreHalo.material.dispose();
  }

  reset() {
    this.mode = 'idle';
    this.modeTime = 0;
    this.coreExposed = false;
    this.plateAlive = [true, true, true, true];
    for (const p of this.plates) p.visible = true;
    this.chestPlate.visible = true;
    this.core.visible = false;
    this.coreHalo.visible = false;
    this.rigBob.rotation.set(0, 0, 0);
    this.rigBob.position.set(0, 0, 0);
    this.torso.rotation.set(HUNCH, 0, 0);
    this.neck.rotation.set(0, 0, 0);
    this.beamFlash = 0;
    for (const m of this.bodyMats) {
      m.opacity = 1;
      m.emissive?.setRGB(0, 0, 0);
    }
  }

  setMode(name) {
    if (this.mode === name) return;
    if (this.mode === 'death') this.reset();
    // 溜めや咆哮で赤く光らせたぶんを戻す
    for (const m of this.bodyMats) m.emissive?.setRGB(0, 0, 0);
    this.rigBob.position.y = 0;
    this.torso.rotation.set(HUNCH, 0, 0);
    this.neck.rotation.set(0, 0, 0);
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

  // 踏み下ろした足が地面に着く瞬間
  get attackLanded() {
    return this.mode === 'attack' && this.modeTime >= STOMP_HIT_TIME;
  }

  get attackFinished() {
    return this.mode === 'attack' && this.modeTime >= STOMP_TIME;
  }

  // 掴んだゾンビを放す瞬間
  get throwReleased() {
    return this.mode === 'throw' && this.modeTime >= THROW_RELEASE_TIME;
  }

  get throwFinished() {
    return this.mode === 'throw' && this.modeTime >= THROW_TIME;
  }

  get roarFinished() {
    return this.mode === 'roar' && this.modeTime >= ROAR_TIME;
  }

  // ビームを撃ち出す瞬間と、撃ち終わり
  get beamFired() {
    return this.mode === 'beam' && this.modeTime >= BEAM_CHARGE_TIME;
  }

  get beamFinished() {
    return this.mode === 'beam' && this.modeTime >= BEAM_CHARGE_TIME + BEAM_FIRE_TIME;
  }

  get deathFinished() {
    return this.mode === 'death' && this.modeTime > 3.2;
  }

  // 口のあたり。ビームはここから出す
  mouthPoint(out = new THREE.Vector3()) {
    return this.head.getWorldPosition(out);
  }

  update(dt) {
    this.time += dt;
    this.modeTime += dt;
    const t = this.time;
    const lt = this.modeTime;

    // 核は常に脈打たせる。近づくほど弱点だと分かるように
    if (this.coreExposed) {
      const pulse = 0.85 + Math.sin(t * 5) * 0.15;
      this.core.scale.setScalar(pulse);
      this.coreHalo.scale.setScalar(1 + Math.sin(t * 5) * 0.12);
      this.coreMat.opacity = 0.9;
      this.coreHalo.material.opacity = 0.16 + Math.sin(t * 5) * 0.06;
    }

    if (this.mode === 'idle') {
      this.rigBob.position.y = Math.sin(t * 0.8) * 0.05;
      this.torso.rotation.set(HUNCH + Math.sin(t * 0.8) * 0.02, 0, 0);
      this.neck.rotation.y = Math.sin(t * 0.35) * 0.14;
      this.armL.rotation.set(Math.sin(t * 0.8) * 0.04, 0, 0.05);
      this.armR.rotation.set(Math.sin(t * 0.8 + 1) * 0.04, 0, -0.05);
      this.legL.rotation.set(0, 0, 0);
      this.legR.rotation.set(0, 0, 0);
    } else if (this.mode === 'walk') {
      // 重い足取り。1歩ごとに体が沈む
      const step = t * 2.2 * (this._walkRate ?? 1);
      this.legL.rotation.x = Math.sin(step) * 0.5;
      this.legR.rotation.x = -Math.sin(step) * 0.5;
      this.armL.rotation.x = -Math.sin(step) * 0.3;
      this.armR.rotation.x = Math.sin(step) * 0.3;
      this.armL.rotation.z = 0.08;
      this.armR.rotation.z = -0.08;
      this.rigBob.position.y = -Math.abs(Math.cos(step)) * 0.1;
      this.torso.rotation.set(HUNCH + Math.abs(Math.cos(step)) * 0.04, Math.sin(step) * 0.05, 0);
    } else if (this.mode === 'attack') {
      // 踏みつけ。片足と両腕を大きく振り上げてから落とす
      const up = clamp01(lt / STOMP_HIT_TIME);
      const raise = easeOutCubic(Math.min(up * 1.25, 1));
      const drop = lt >= STOMP_HIT_TIME
        ? easeOutCubic(clamp01((lt - STOMP_HIT_TIME) / (STOMP_TIME - STOMP_HIT_TIME)))
        : 0;
      const swing = raise * (1 - drop);
      this.legR.rotation.x = -swing * 1.0;
      this.armL.rotation.x = -swing * 1.5;
      this.armR.rotation.x = -swing * 1.5;
      this.rigBob.position.y = swing * 0.35 - drop * 0.25;
      this.torso.rotation.x = HUNCH - swing * 0.25 + drop * 0.3;
    } else if (this.mode === 'throw') {
      // 掴んで投げる。腕を後ろへ引いてから前へ振り抜く
      const wind = easeOutCubic(clamp01(lt / THROW_RELEASE_TIME));
      const fling = easeInCubic(clamp01((lt - THROW_RELEASE_TIME) / (THROW_TIME - THROW_RELEASE_TIME)));
      this.armR.rotation.x = -wind * 2.4 + fling * 3.6;
      this.armL.rotation.x = -wind * 0.4;
      this.torso.rotation.y = wind * 0.5 - fling * 0.9;
      this.torso.rotation.x = HUNCH - wind * 0.1;
    } else if (this.mode === 'charge') {
      // 跳ぶ前の溜め。沈み込んで、体が赤熱する
      const p = Math.min(lt / 1.2, 1);
      this.rigBob.position.y = -p * 0.45;
      this.legL.rotation.x = p * 0.5;
      this.legR.rotation.x = p * 0.5;
      this.armL.rotation.x = p * 0.8;
      this.armR.rotation.x = p * 0.8;
      this.torso.rotation.x = HUNCH + p * 0.3;
      const heat = p * (0.55 + Math.sin(t * 22) * 0.35);
      for (const m of this.bodyMats) m.emissive?.setRGB(heat, heat * 0.13, 0);
    } else if (this.mode === 'jump') {
      // 空中。手足を大きく開く
      this.rigBob.position.y = 0;
      this.legL.rotation.x = -0.7;
      this.legR.rotation.x = 0.5;
      this.armL.rotation.set(-2.2, 0, 0.5);
      this.armR.rotation.set(-2.2, 0, -0.5);
      this.torso.rotation.x = HUNCH - 0.2;
      for (const m of this.bodyMats) m.emissive?.setRGB(0.5, 0.07, 0);
    } else if (this.mode === 'roar') {
      // 咆哮。のけぞって吠える
      const p = clamp01(lt / ROAR_TIME);
      const open = Math.sin(p * Math.PI);
      this.neck.rotation.x = -open * 0.7;
      this.torso.rotation.x = HUNCH - open * 0.35;
      this.armL.rotation.set(-open * 1.9, 0, 0.9 * open);
      this.armR.rotation.set(-open * 1.9, 0, -0.9 * open);
      this.rigBob.position.y = open * 0.15;
      // 体が細かく震える
      this.rigBob.rotation.z = Math.sin(t * 40) * 0.02 * open;
      const heat = open * 0.5;
      for (const m of this.bodyMats) m.emissive?.setRGB(heat, heat * 0.2, 0);
    } else if (this.mode === 'beam') {
      // 溜めて、口から音波を撃つ
      const charge = clamp01(lt / BEAM_CHARGE_TIME);
      const firing = lt >= BEAM_CHARGE_TIME;
      this.neck.rotation.x = -charge * 0.45;
      this.torso.rotation.x = HUNCH - charge * 0.2;
      this.armL.rotation.set(-charge * 0.6, 0, 0.4);
      this.armR.rotation.set(-charge * 0.6, 0, -0.4);
      // 溜めるほど激しく点滅し、撃つ瞬間に一番明るくなる
      const blink = 0.3 + 0.7 * Math.abs(Math.sin(lt * (6 + charge * 26)));
      const heat = firing ? 1 : charge * blink;
      for (const m of this.bodyMats) m.emissive?.setRGB(heat * 0.8, heat * 0.5, heat * 0.1);
      this.rigBob.rotation.z = firing ? Math.sin(t * 60) * 0.03 : 0;
      this.beamFlash = firing ? 1 : charge;
    } else if (this.mode === 'hit') {
      // のけぞる。大きい体なので、揺れは控えめ
      const p = clamp01(lt / 0.35);
      const kick = Math.sin(p * Math.PI);
      this.torso.rotation.x = HUNCH - kick * 0.12;
      this.rigBob.position.y = -kick * 0.06;
      if (lt > 0.35) this.setMode('idle');
    } else if (this.mode === 'death') {
      // ゆっくり膝から崩れて、前のめりに倒れる
      const knee = easeOutCubic(clamp01(lt / 1.2));
      const fall = easeInCubic(clamp01((lt - 0.9) / 1.6));
      this.legL.rotation.x = knee * 1.0;
      this.legR.rotation.x = knee * 1.0;
      this.rigBob.position.y = -knee * 0.7;
      this.rigBob.rotation.x = fall * 1.5;
      this.armL.rotation.x = knee * 0.6;
      this.armR.rotation.x = knee * 0.6;
      this.neck.rotation.x = knee * 0.5;
      // 核の光が消えていく
      if (this.coreExposed) {
        this.coreMat.opacity = Math.max(0, 0.9 - fall * 1.2);
        this.coreHalo.material.opacity = Math.max(0, 0.16 - fall * 0.3);
      }
      const fade = clamp01((lt - 2.2) / 1.0);
      for (const m of this.bodyMats) m.opacity = 1 - fade;
    }
  }
}
