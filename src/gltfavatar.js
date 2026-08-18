import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { sourceOf } from './gltfmodel.js';
import { JOBS } from './data/jobs.js';

// 人（自分・仲間・他のプレイヤー・店員）の見た目。
// 手作りの Avatar（avatar.js）と同じ使い方ができるようにしてある。
//
// 素材のキャラは、武器を最初から手に持った状態で入っている。
// 持ち替えは「どれを表示するか」を切り替えるだけでよい。

export const AVATAR_HEIGHT = 1.8;

// ゲームのアイテム → モデルに入っている武器の名前
const HELD = {
  pistol: 'Pistol',
  ak47: 'Rifle',
  knife: 'Knife',
  spear: 'Spear',
  shovel: 'Axe',
  hammer: 'WoodenBat_Barbed',
};
// 銃を持っているときは、構えた立ち方のアニメーションに変える
const GUNS = new Set(['pistol', 'ak47']);

// ゲームの動き → 素材のアニメーション名。
// 手に持っているものによって変わるものは、下の #clipFor で分ける
const CLIPS = {
  swing: ['Slash', 'Punch'],
  spin: ['Slash', 'Punch'],
  reload: ['Duck', 'Idle'],
  hurt: ['HitReact'],
  wave: ['Wave'],
  shout: ['Yes', 'Wave'],
  rally: ['Wave', 'Yes'],
  cast: ['Slash', 'Punch'],
  swap: ['Idle'],
  fire: ['Idle_Gun', 'Idle'],
  death: ['Death'],
};

export function canUseGltfAvatar() {
  return !!sourceOf('human');
}

export class GltfAvatar {
  // color は職業の色。素材に色分けは無いので、帽子の色に使う
  constructor(color = 0x5f7f9f, id = 'human') {
    const source = sourceOf(id) ?? sourceOf('human');
    this.source = source;
    this.root = new THREE.Group();
    this.color = color;
    this.downed = false;
    this.itemId = null;

    const model = cloneSkinned(source.scene);
    model.scale.setScalar(AVATAR_HEIGHT / source.height);
    this.root.add(model);
    this.model = model;

    // 手に持っている武器を集めて、いったん全部しまう
    this.held = new Map();
    this.bodyMats = [];
    model.traverse((o) => {
      if (o.name === 'Head') this.head = o;
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.material = o.material.clone();
      this.bodyMats.push(o.material);
    });
    for (const name of Object.values(HELD)) {
      const node = model.getObjectByName(name);
      if (node) {
        node.visible = false;
        this.held.set(name, node);
      }
    }
    // 素材に入っているが、ゲームで使わない武器も隠す
    for (const extra of ['Guitar', 'Shotgun', 'SMG', 'WoodenBat_Saw']) {
      const node = model.getObjectByName(extra);
      if (node) node.visible = false;
    }

    this.mixer = new THREE.AnimationMixer(model);
    this.actions = new Map();
    this.current = null;
    this.currentName = '';
    this.#play('Idle');
  }

  // 職業ごとの帽子。素材には無いので、頭のボーンに小さな箱をかぶせる
  setHat(jobId) {
    if (this.hat) {
      this.hat.parent?.remove(this.hat);
      this.hat.geometry.dispose();
      this.hat.material.dispose();
      this.hat = null;
    }
    const job = JOBS[jobId];
    if (!job || !this.head) return;
    const scale = this.source.height / AVATAR_HEIGHT;
    const hat = new THREE.Mesh(
      new THREE.BoxGeometry(0.42 * scale, 0.14 * scale, 0.42 * scale),
      new THREE.MeshStandardMaterial({ color: job.color ?? this.color, roughness: 0.8 })
    );
    hat.position.y = 0.3 * scale;
    hat.castShadow = true;
    this.head.add(hat);
    this.hat = hat;
  }

  // 持ち替え。表示する武器を切り替えるだけ
  setItem(id, gold = false) {
    if (this.itemId === id && this.gold === gold) return;
    this.itemId = id;
    this.gold = gold;
    for (const node of this.held.values()) node.visible = false;
    const name = HELD[id];
    const node = name ? this.held.get(name) : null;
    if (node) {
      node.visible = true;
      // レベル5の金色は、持っている武器にも出す
      node.traverse((o) => {
        if (!o.isMesh) return;
        if (!o.userData.baseColor) o.userData.baseColor = o.material.color.clone();
        o.material.color.copy(gold ? new THREE.Color(0xe0b23c) : o.userData.baseColor);
      });
    }
  }

  setDowned(downed) {
    if (this.downed === downed) return;
    this.downed = downed;
    if (downed) this.#play('Death');
    else this.#play('Idle');
  }

  #clipFor(name, speed) {
    if (this.downed) return 'Death';
    const gun = GUNS.has(this.itemId);
    if (name === 'idle' || name === 'walk' || !CLIPS[name]) {
      const moving = speed > 0.6;
      if (gun) return moving ? 'Run_Gun' : 'Idle_Gun';
      return moving ? 'Run' : 'Idle';
    }
    for (const c of CLIPS[name]) {
      if (this.source.animations.some((a) => a.name === c)) return c;
    }
    return 'Idle';
  }

  #play(clipName) {
    if (this.currentName === clipName) return;
    let entry = this.actions.get(clipName);
    if (!entry) {
      const clip = this.source.animations.find((a) => a.name === clipName);
      if (!clip) return;
      const action = this.mixer.clipAction(clip);
      if (clipName === 'Death') {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      entry = { action, duration: clip.duration };
      this.actions.set(clipName, entry);
    }
    if (this.current && this.current.action !== entry.action) this.current.action.fadeOut(0.18);
    entry.action.reset().fadeIn(0.18).play();
    this.current = entry;
    this.currentName = clipName;
  }

  update(dt, { anim = { name: 'idle', t: 0 }, speed = 0, pitch = 0 } = {}) {
    this.#play(this.#clipFor(anim.name, speed));
    this.mixer.update(dt);
    // 上下の狙いは、頭だけ少し向ける
    if (this.head && !this.downed) {
      this.head.rotation.x = THREE.MathUtils.clamp(-pitch * 0.4, -0.5, 0.5);
    }
  }

  dispose() {
    this.mixer.stopAllAction();
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of [o.material].flat()) m.dispose();
    });
  }
}
