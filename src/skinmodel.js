import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { makeProp, hasProp } from './gltfmodel.js';

// スキン（見た目）のモデル。
//
// 52体ぜんぶが同じ骨組みなので、動きは BaseCharacter の1体ぶんだけ読んで、
// 全員でそれを使い回す。だから1体ぶんのファイルは「形と色」だけで軽い。
//
// 使う直前に読み込む（最初に52体ぜんぶ読むと重すぎる）。
// 読めていないあいだは、これまでのアバターがそのまま出る。

const DIR = 'assets/models/skins/';
const loader = new GLTFLoader();

// ゲームでの背丈。ゾンビ（1.8m）と同じにそろえる
export const SKIN_HEIGHT = 1.8;

// 武器を持たせる手の骨。
// glTF では 'Fist.R' だが、three.js は点を取りのぞいて 'FistR' にする
const HAND_BONES = ['FistR', 'Fist.R'];

// ゲームの動き → BaseCharacter に入っているアニメーションの名前。
// 左から順に探して、無ければ次の候補へ
const CLIPS = {
  idle: ['Idle'],
  walk: ['Walk'],
  run: ['Run'],
  swing: ['SwordSlash', 'Punch'],
  spin: ['SwordSlash', 'Punch'],
  cast: ['SwordSlash', 'Punch'],
  thrust: ['SwordSlash', 'Punch'],
  fire: ['Shoot_OneHanded', 'Idle'],
  reload: ['PickUp', 'Idle'],
  hurt: ['RecieveHit'],
  death: ['Death'],
  downed: ['Defeat'],
  wave: ['Victory'],
  shout: ['Victory'],
  rally: ['Victory'],
  swap: ['PickUp', 'Idle'],
  jump: ['Jump'],
};

// id -> { scene } / 読み込み中は Promise
const cache = new Map();
let animations = null;
let animationJob = null;

const box = new THREE.Box3();
const part = new THREE.Box3();

// 足元から頭のてっぺんまで。武器は持っていないモデルなので素直に測れる
function bodyHeight(scene) {
  scene.updateMatrixWorld(true);
  box.makeEmpty();
  scene.traverse((o) => {
    if (!o.isMesh) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    part.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
    box.union(part);
  });
  return box.isEmpty() ? 1.5 : Math.max(0.1, box.max.y - Math.min(0, box.min.y));
}

// 全員で使い回す動きを、1回だけ読む
function loadAnimations() {
  animationJob ??= loader.loadAsync(`${DIR}BaseCharacter.gltf`)
    .then((gltf) => { animations = gltf.animations; return animations; })
    .catch(() => { animations = []; return animations; });
  return animationJob;
}

// スキンを1体ぶん読む。読み終わっていればすぐ返る
export function loadSkin(id) {
  if (cache.has(id)) return cache.get(id);
  const job = Promise.all([loader.loadAsync(`${DIR}${id}.gltf`), loadAnimations()])
    .then(([gltf]) => {
      const entry = { scene: gltf.scene, height: bodyHeight(gltf.scene) };
      cache.set(id, entry);
      return entry;
    })
    .catch(() => {
      cache.delete(id);
      return null;
    });
  cache.set(id, job);
  return job;
}

export function skinReady(id) {
  const hit = cache.get(id);
  return !!hit && !(hit instanceof Promise);
}

function sourceOfSkin(id) {
  const hit = cache.get(id);
  return hit instanceof Promise ? null : hit;
}

// 読み込みずみのスキンから、動かせる見た目を1体作る。
// これまでのアバター（avatar.js / gltfavatar.js）と同じ使い方ができる
export class SkinAvatar {
  constructor(id, { hat = null } = {}) {
    const src = sourceOfSkin(id);
    if (!src) throw new Error(`スキンが読めていない: ${id}`);
    this.skinId = id;
    this.root = new THREE.Group();
    this.downed = false;
    this.itemId = null;

    const model = cloneSkinned(src.scene);
    model.scale.setScalar(SKIN_HEIGHT / src.height);
    this.root.add(model);
    this.model = model;

    this.bodyMats = [];
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.material = o.material.clone();
        this.bodyMats.push(o.material);
      }
      if (HAND_BONES.includes(o.name)) this.hand = o;
      if (o.name === 'Head') this.head = o;
      if (o.name === 'Torso') this.torso = o;
    });

    this.mixer = new THREE.AnimationMixer(model);
    this.actions = new Map();
    this.current = null;
    this.#play('Idle');

    if (hat) this.#addHat(hat);
  }

  // 帽子や髪は別のモデルなので、頭の骨にくっつける
  #addHat(hatId) {
    const src = sourceOfSkin(hatId);
    if (!src || !this.head) return;
    const hat = cloneSkinned(src.scene);
    // 頭の骨はモデル全体の縮尺の中にいるので、追加の拡大はいらない
    this.head.add(hat);
    hat.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.material = o.material.clone();
      this.bodyMats.push(o.material);
    });
  }

  #clipFor(name, speed) {
    if (this.downed) return CLIPS.downed;
    if (name === 'idle' && speed > 0.2) return speed > 5 ? CLIPS.run : CLIPS.walk;
    return CLIPS[name] ?? CLIPS.idle;
  }

  #play(names) {
    const list = Array.isArray(names) ? names : [names];
    let clip = null;
    for (const n of list) {
      clip = (animations ?? []).find((c) => c.name === n);
      if (clip) break;
    }
    if (!clip) clip = (animations ?? [])[0];
    if (!clip) return;
    if (this.current?.getClip() === clip) return;
    let action = this.actions.get(clip.name);
    if (!action) {
      action = this.mixer.clipAction(clip);
      this.actions.set(clip.name, action);
    }
    if (this.current && this.current !== action) this.current.fadeOut(0.15);
    action.reset().fadeIn(0.15).play();
    this.current = action;
  }

  // 手に持つもの。素材の武器モデルを、手の骨にぶら下げる
  setItem(id) {
    if (this.itemId === id) return;
    this.itemId = id;
    if (this.held) {
      this.held.parent?.remove(this.held);
      this.held = null;
    }
    if (!id || !hasProp(id) || !this.hand) return;
    const prop = makeProp(id);
    if (!prop) return;
    // 武器は「握りが原点、切っ先が -Z」。手の骨に合わせて少し倒して持たせる
    prop.rotation.set(-Math.PI / 2, 0, 0);
    prop.position.set(0, 0.02, 0);
    this.hand.add(prop);
    this.held = prop;
  }

  // 職業の帽子は、スキンでは使わない（スキンそのものが見た目なので）
  setHat() {}

  setDowned(downed) {
    this.downed = downed;
  }

  update(dt, { anim = { name: 'idle', t: 0 }, speed = 0, pitch = 0 } = {}) {
    this.#play(this.#clipFor(anim.name, speed));
    this.mixer.update(dt);
    // どこを狙っているかが、まわりから見て分かるように顔と胸を動かす
    if (!this.downed) {
      const look = THREE.MathUtils.clamp(-pitch, -1.2, 1.2);
      if (this.head) this.head.rotation.x = look * 0.7;
      if (this.torso) this.torso.rotation.x = look * 0.25;
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
