import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

// 外から持ってきた3Dモデル（glTF）を読み込んで、
// これまでの手作りモデルと同じ使い方ができる形にする。
//
// 手作りのモデル（zombie.js など）は setMode('walk') のように状態で動かしていた。
// glTF はアニメーションの名前で動かすので、その対応表をここで持つ。
//
// 読み込みに失敗しても遊べなくならないよう、失敗したら手作りのほうに戻る。

const loader = new GLTFLoader();
// id -> { scene, animations, height }
const loaded = new Map();

// 読み込む物の一覧。パスはページからの相対
const SOURCES = {
  zombie: 'assets/models/zombiekit/Characters/glTF/Zombie_Basic.gltf',
  zombieChubby: 'assets/models/zombiekit/Characters/glTF/Zombie_Chubby.gltf',
  zombieThin: 'assets/models/zombiekit/Characters/glTF/Zombie_Ribcage.gltf',
};

// 動かない置物（武器・街の小物）。
// どれも「握り（根元）が原点で、+Z の向きに伸びている」形なので、
// ゲームの向き（-Z が前）に合わせて半回転させて使う。
// length は、ゲームでの長さ（m）。素材の大きさはここに合わせる
const PROPS = {
  // length はゲームでの長さ(m)、lift は構えたときの高さの微調整
  pistol: { url: 'assets/models/zombiekit/Weapons/glTF/Pistol.gltf', length: 0.38, lift: 0.05 },
  ak47: { url: 'assets/models/zombiekit/Weapons/glTF/Rifle.gltf', length: 0.86, lift: 0.08 },
  knife: { url: 'assets/models/zombiekit/Weapons/glTF/Knife.gltf', length: 0.46, lift: 0.03 },
  spear: { url: 'assets/models/zombiekit/Weapons/glTF/Spear.gltf', length: 1.4, lift: 0.05 },
};

// id -> { scene, length }
const props = new Map();

export function hasProp(id) {
  return props.has(id);
}

// 置物を1つ作る。向きと大きさはゲームに合わせてある。
// gold を立てると金色に、tint を渡すとその色をかける
export function makeProp(id, { gold = false, tint = null } = {}) {
  const src = props.get(id);
  if (!src) return null;
  const group = new THREE.Group();
  const model = src.scene.clone(true);
  // 素材は +Z に伸びている。ゲームは -Z が前なので半回転させる
  model.rotation.y = Math.PI;
  model.scale.setScalar(src.scale);
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = false;
    o.receiveShadow = false;
    // 形も材質も1本ずつ複製する。clone だけだと元のモデルと共有してしまい、
    // どこかで片づけたときに他の場所の武器まで消えてしまう
    o.geometry = o.geometry.clone();
    o.material = o.material.clone();
    if (gold) o.material.color.set(0xe0b23c);
    else if (tint) o.material.color.multiply(new THREE.Color(tint));
    if (gold) {
      o.material.metalness = 0.7;
      o.material.roughness = 0.3;
    }
  });
  group.add(model);

  // 素材によって原点の位置がばらばらなので、
  // 「握るところが原点、切っ先が -Z」にそろえる
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  model.position.z -= box.max.z - GRIP_BACK;
  model.position.y -= (box.min.y + box.max.y) / 2 - (src.lift ?? 0);
  return group;
}

// 握りの後ろ端を、原点からこれだけ後ろに置く
const GRIP_BACK = 0.16;

// ゲームの状態 → glTF のアニメーション名。
// 左が無いときは右の候補を順に探し、どれも無ければ Idle に落とす
const CLIPS = {
  idle: ['Idle'],
  walk: ['Run', 'Walk'],
  attack: ['Punch', 'Idle_Attack'],
  hit: ['HitReact'],
  death: ['Death'],
  emerge: ['Crawl', 'Idle'],
  burrow: ['Crawl', 'Idle'],
  charge: ['Jump_Idle', 'Idle'],
  jump: ['Jump', 'Idle'],
  revive: ['Crawl', 'Idle'],
  shoot: ['Idle'],
};

// 殴りモーションの、何割のところで当たったことにするか
const ATTACK_HIT = 0.45;

export function isLoaded(id) {
  return loaded.has(id);
}

// はじめに1回だけ呼ぶ。読めたものだけ使えるようになる
export async function preloadModels() {
  const jobs = Object.entries(SOURCES).map(async ([id, url]) => {
    try {
      const gltf = await loader.loadAsync(url);
      const box = new THREE.Box3().setFromObject(gltf.scene);
      loaded.set(id, {
        scene: gltf.scene,
        animations: gltf.animations,
        // 素の高さ。ゲーム側の背丈に合わせるときに使う
        height: Math.max(0.1, box.max.y - box.min.y),
      });
    } catch {
      // 読めなくても、手作りのモデルで遊べる
    }
  });
  // 武器などの置物も、同じように読む
  const propJobs = Object.entries(PROPS).map(async ([id, { url, length }]) => {
    try {
      const gltf = await loader.loadAsync(url);
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const size = box.getSize(new THREE.Vector3());
      // 一番長い辺を、ゲームで決めた長さに合わせる
      const longest = Math.max(size.x, size.y, size.z) || 1;
      props.set(id, { scene: gltf.scene, scale: length / longest, lift: PROPS[id].lift ?? 0 });
    } catch {
      // 読めなければ、手作りのモデルで出る
    }
  });

  await Promise.all([...jobs, ...propJobs]);
  return { characters: [...loaded.keys()], props: [...props.keys()] };
}

// 手作りのモデルと同じ使い方ができる、glTF のキャラクター。
// zombie.js の Zombie と入れ替えられるように、名前と役割をそろえてある
export class GltfCharacter {
  // tint を渡すと、その色をかけて色違いにできる（元は1体でも見た目を変えられる）
  constructor(id, { height = 1.8, tint = null, walkScale = 1 } = {}) {
    const source = loaded.get(id);
    if (!source) throw new Error(`モデルが読めていない: ${id}`);
    this.source = source;
    this.walkScale = walkScale;

    this.root = new THREE.Group();
    const model = cloneSkinned(source.scene);
    // ゲームで決めた背丈に合わせる
    model.scale.setScalar(height / source.height);
    this.root.add(model);

    // 材質は1体ずつ複製する。色を変えても他の個体に影響しないように
    this.bodyMats = [];
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.material = o.material.clone();
      if (tint) o.material.color.multiply(new THREE.Color(tint));
      this.bodyMats.push(o.material);
    });

    this.mixer = new THREE.AnimationMixer(model);
    this.actions = new Map();
    this.mode = 'idle';
    this.modeTime = 0;
    this.current = null;
    this.setMode('idle');
  }

  // その状態に合うアニメーションを探して用意する
  #actionFor(mode) {
    if (this.actions.has(mode)) return this.actions.get(mode);
    const names = CLIPS[mode] ?? ['Idle'];
    let clip = null;
    for (const name of names) {
      clip = this.source.animations.find((c) => c.name === name);
      if (clip) break;
    }
    clip ??= this.source.animations.find((c) => c.name === 'Idle') ?? this.source.animations[0];
    if (!clip) return null;
    const action = this.mixer.clipAction(clip);
    // 倒れる動きは繰り返さず、最後の姿勢で止める
    if (mode === 'death') {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    this.actions.set(mode, { action, duration: clip.duration });
    return this.actions.get(mode);
  }

  setMode(name) {
    if (this.mode === name && this.current) return;
    const next = this.#actionFor(name);
    if (!next) return;
    if (this.current && this.current.action !== next.action) {
      this.current.action.fadeOut(0.15);
    }
    next.action.reset();
    next.action.setEffectiveTimeScale(name === 'walk' ? this.walkScale * (this._walkRate ?? 1) : 1);
    next.action.fadeIn(0.15).play();
    this.current = next;
    this.mode = name;
    this.modeTime = 0;
  }

  // 殴りを最初からやり直す（同じ状態のままもう一度振らせたいとき）
  restartAttack() {
    const next = this.#actionFor('attack');
    if (!next) return;
    if (this.current && this.current.action !== next.action) this.current.action.fadeOut(0.1);
    next.action.reset().fadeIn(0.1).play();
    this.current = next;
    this.mode = 'attack';
    this.modeTime = 0;
  }

  set walkRate(rate) {
    this._walkRate = rate;
    if (this.mode === 'walk' && this.current) {
      this.current.action.setEffectiveTimeScale(this.walkScale * rate);
    }
  }

  // 拳が当たる瞬間と、振り終わり
  get attackLanded() {
    return this.mode === 'attack' && this.modeTime >= this.#duration * ATTACK_HIT;
  }

  get attackFinished() {
    return this.mode === 'attack' && this.modeTime >= this.#duration;
  }

  get deathFinished() {
    return this.mode === 'death' && this.modeTime >= this.#duration + 0.8;
  }

  // スケルトンの組み直し用。いまは使わないが、形をそろえておく
  get reviveWindow() {
    return this.mode === 'death' && this.modeTime > 0.5 && this.modeTime < this.#duration;
  }

  get reviveFinished() {
    return this.mode === 'revive' && this.modeTime >= this.#duration;
  }

  get #duration() {
    return this.current?.duration ?? 1;
  }

  reset() {
    this.mixer.stopAllAction();
    this.actions.clear();
    this.current = null;
    this.mode = 'idle';
    this.modeTime = 0;
    for (const m of this.bodyMats) {
      m.opacity = 1;
      m.transparent = false;
      m.emissive?.setRGB(0, 0, 0);
    }
    this.setMode('idle');
  }

  update(dt) {
    this.modeTime += dt;
    this.mixer.update(dt);
    // 倒れきったあとは、ゆっくり消えていく
    if (this.mode === 'death') {
      const fade = Math.min(1, Math.max(0, (this.modeTime - this.#duration) / 0.8));
      if (fade > 0) {
        for (const m of this.bodyMats) {
          m.transparent = true;
          m.opacity = 1 - fade;
        }
      }
    }
  }

  dispose() {
    this.mixer.stopAllAction();
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      // 形は元のモデルと共有しているので消さない。材質だけ1体ぶんを片づける
      for (const m of [o.material].flat()) m.dispose();
    });
  }
}
