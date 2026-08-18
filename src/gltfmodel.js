import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

// 外から持ってきた3Dモデル（glTF）を読み込んで、
// これまでの手作りモデルと同じ使い方ができる形にする。
//
// 手作りのモデル（zombie.js など）は setMode('walk') のように状態で動かしていた。
// glTF はアニメーションの名前で動かすので、その対応表をここで持つ。
//
// 読み込みに失敗しても遊べなくならないよう、失敗したら手作りのほうに戻る。

const loader = new GLTFLoader();
const fbxLoader = new FBXLoader();
const texLoader = new THREE.TextureLoader();
// id -> { scene, animations, height }
const loaded = new Map();

// 読み込む物の一覧。パスはページからの相対
const SOURCES = {
  zombie: 'assets/models/zombiekit/Characters/glTF/Zombie_Basic.gltf',
  zombieChubby: 'assets/models/zombiekit/Characters/glTF/Zombie_Chubby.gltf',
  zombieThin: 'assets/models/zombiekit/Characters/glTF/Zombie_Ribcage.gltf',
  // 人。武器が手に持たされた状態で入っているので、表示を切り替えて持ち替える
  human: 'assets/models/zombiekit/Characters/glTF/Characters_Matt.gltf',
  human2: 'assets/models/zombiekit/Characters/glTF/Characters_Sam.gltf',
  human3: 'assets/models/zombiekit/Characters/glTF/Characters_Shaun.gltf',
  human4: 'assets/models/zombiekit/Characters/glTF/Characters_Lis.gltf',
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
  // 斧。仲間から見えているのと同じモデルを、自分の手元にも出す
  shovel: { url: 'assets/models/zombiekit/Weapons/glTF/Axe.gltf', length: 0.86, lift: 0.04 },
  hammer: { url: 'assets/models/zombiekit/Weapons/glTF/WoodenBat_Barbed.gltf', length: 0.9, lift: 0.04 },
};

// id -> { scene, length }
const props = new Map();

// ---- 街のビル（FBX）----
// FBX には色の指定が入っていないので、32x32 の小さな色パレットを
// こちらで貼る。UV がそのパレットの色を指している作り
const BUILDING_DIR = 'assets/models/buildings/Textured Models/Finished Textured Buildings/FBX/';
const PALETTE_DIR = 'assets/models/buildings/Textured Models/Textures/';
// センチで作られているので 1/100。さらに、1階ぶんが約3mになるようにそろえる
const BUILDING_SCALE = 0.024;

const BUILDING_NAMES = [
  '1Story', '1Story_GableRoof', '1Story_RoundRoof', '1Story_Sign',
  '2Story', '2Story_2', '2Story_Balcony', '2Story_Center', '2Story_Columns',
  '2Story_Double', '2Story_GableRoof', '2Story_RoundRoof', '2Story_Sidehouse',
  '2Story_Sign', '2Story_Slim', '2Story_Stairs', '2Story_Wide', '2Story_Wide_2Doors',
  '3Story_Balcony', '3Story_Slim', '3Story_Small',
  '4Story', '4Story_Center', '4Story_Wide_2Doors', '4Story_Wide_2Doors_Roof',
  '6Story_Stack',
];

// 街に並べたときの色の出かた。落ち着いた色を多めに、
// 派手な色は少しだけ混ぜる（同じ名前を複数回書くと、それだけ出やすくなる）
const PALETTES = [
  'Texture_Grey', 'Texture_Grey', 'Texture_Grey',
  'Texture_Light', 'Texture_Light', 'Texture_Light2', 'Texture_Light2',
  'Texture_Dark', 'Texture_Dark',
  'Texture_DarkBlue', 'Texture_DarkPurple',
  'Texture_Red', 'Texture_Blue', 'Texture_Yellow', 'Texture_Casino',
];

// どのパレットにも入っている、まっ赤な色（屋根やひさしに使われている）
const ROOF_SLOT = [0xed, 0x1c, 0x24];
// 屋根の塗りかえ色。廃れた街に合う、くすんだ色をならべる
const ROOF_COLORS = [
  [0x7a, 0x4a, 0x3a], [0x4c, 0x4f, 0x55], [0x5c, 0x61, 0x57],
  [0x6b, 0x5f, 0x4a], [0x38, 0x3c, 0x42],
];

// パレットの絵の「まっ赤」だけを、別の色に塗りかえた写しを作る
function recolorRoof(tex, rgb) {
  const img = tex.image;
  if (!img || !img.width) return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i] !== ROOF_SLOT[0] || px[i + 1] !== ROOF_SLOT[1] || px[i + 2] !== ROOF_SLOT[2]) continue;
      px[i] = rgb[0];
      px[i + 1] = rgb[1];
      px[i + 2] = rgb[2];
    }
    ctx.putImageData(data, 0, 0);
    const out = new THREE.CanvasTexture(canvas);
    out.colorSpace = THREE.SRGBColorSpace;
    out.magFilter = THREE.NearestFilter;
    out.minFilter = THREE.NearestFilter;
    out.generateMipmaps = false;
    out.flipY = false;
    return out;
  } catch {
    // 絵を読み取れない環境（file:// で開いたときなど）は、そのまま使う
    return null;
  }
}

// name -> { object, size }
const buildings = new Map();
const palettes = [];

// 道路タイル1枚の大きさ（m）
export const ROAD_TILE = 8;

// ---- 街の置物（車・街灯・信号・小物・道路）----
// 車はキットの glTF（テクスチャ入り）。街灯と信号は道路パックの FBX（色なし）
const SCENERY = {
  // 乗り捨てられた車。6台ぶん
  carPickup: { url: 'assets/models/zombiekit/Vehicles/glTF/Vehicle_Pickup.gltf', kind: 'gltf' },
  carPickupArmored: { url: 'assets/models/zombiekit/Vehicles/glTF/Vehicle_Pickup_Armored.gltf', kind: 'gltf' },
  carSports: { url: 'assets/models/zombiekit/Vehicles/glTF/Vehicle_Sports.gltf', kind: 'gltf' },
  carSportsArmored: { url: 'assets/models/zombiekit/Vehicles/glTF/Vehicle_Sports_Armored.gltf', kind: 'gltf' },
  carTruck: { url: 'assets/models/zombiekit/Vehicles/glTF/Vehicle_Truck.gltf', kind: 'gltf' },
  carTruckArmored: { url: 'assets/models/zombiekit/Vehicles/glTF/Vehicle_Truck_Armored.gltf', kind: 'gltf' },
  // 街灯・信号・標識。センチで作られているので 1/100 にする
  // 道路パックは建物と縮尺がちがうので、倍率ではなく「高さ何m」で合わせる
  streetlight: { url: 'assets/models/streets/FBX/Streetlight_Single.fbx', kind: 'fbx', height: 5.5, color: 0x3f444b },
  streetlight2: { url: 'assets/models/streets/FBX/Streetlight_Double.fbx', kind: 'fbx', height: 5.8, color: 0x3f444b },
  trafficLight: { url: 'assets/models/streets/FBX/TrafficLight.fbx', kind: 'fbx', height: 4.2, color: 0x3a3f45 },
  signStop: { url: 'assets/models/streets/FBX/Sign_Stop.fbx', kind: 'fbx', height: 2.4, color: 0x9c3b33 },
  // 散らばっている小物
  barrel: { url: 'assets/models/zombiekit/Environment/glTF/Barrel.gltf', kind: 'gltf' },
  cone: { url: 'assets/models/zombiekit/Environment/glTF/TrafficCone_1.gltf', kind: 'gltf' },
  barrier: { url: 'assets/models/zombiekit/Environment/glTF/TrafficBarrier_1.gltf', kind: 'gltf' },
  plasticBarrier: { url: 'assets/models/zombiekit/Environment/glTF/PlasticBarrier.gltf', kind: 'gltf' },
  hydrant: { url: 'assets/models/zombiekit/Environment/glTF/FireHydrant.gltf', kind: 'gltf' },
  container: { url: 'assets/models/zombiekit/Environment/glTF/Container_Red.gltf', kind: 'gltf' },
  trash: { url: 'assets/models/zombiekit/Environment/glTF/TrashBag_1.gltf', kind: 'gltf' },
  trash2: { url: 'assets/models/zombiekit/Environment/glTF/TrashBag_2.gltf', kind: 'gltf' },
  cinder: { url: 'assets/models/zombiekit/Environment/glTF/CinderBlock.gltf', kind: 'gltf' },
  pallet: { url: 'assets/models/zombiekit/Environment/glTF/Pallet.gltf', kind: 'gltf' },
  palletBroken: { url: 'assets/models/zombiekit/Environment/glTF/Pallet_Broken.gltf', kind: 'gltf' },
  pipes: { url: 'assets/models/zombiekit/Environment/glTF/Pipes.gltf', kind: 'gltf' },
  couch: { url: 'assets/models/zombiekit/Environment/glTF/Couch.gltf', kind: 'gltf' },
  waterTower: { url: 'assets/models/zombiekit/Environment/glTF/WaterTower.gltf', kind: 'gltf' },
  blood: { url: 'assets/models/zombiekit/Environment/glTF/Blood_1.gltf', kind: 'gltf' },
  blood2: { url: 'assets/models/zombiekit/Environment/glTF/Blood_2.gltf', kind: 'gltf' },
  containerGreen: { url: 'assets/models/zombiekit/Environment/glTF/Container_Green.gltf', kind: 'gltf' },
  // 道路タイル。8m四方で、歩道と白線が付いている
  roadStraight: { url: 'assets/models/zombiekit/Environment/glTF/Street_Straight.gltf', kind: 'gltf' },
  roadCrack1: { url: 'assets/models/zombiekit/Environment/glTF/Street_Straight_Crack1.gltf', kind: 'gltf' },
  roadCrack2: { url: 'assets/models/zombiekit/Environment/glTF/Street_Straight_Crack2.gltf', kind: 'gltf' },
  road4Way: { url: 'assets/models/zombiekit/Environment/glTF/Street_4Way.gltf', kind: 'gltf' },
  roadT: { url: 'assets/models/zombiekit/Environment/glTF/Street_T.gltf', kind: 'gltf' },
  // 高架の道。ここに登ればタイタンの衝撃波を避けられる。
  // 道路タイルと同じ8m四方になるように合わせる
  bridge: {
    url: 'assets/models/streets/FBX/Street_Bridge.fbx', kind: 'fbx',
    width: ROAD_TILE, color: 0x5a5e66,
  },
  bridgeRamp: {
    url: 'assets/models/streets/FBX/Street_Bridge_Ramp.fbx', kind: 'fbx',
    width: ROAD_TILE, color: 0x5a5e66,
  },
  bridgeUnder: {
    url: 'assets/models/streets/FBX/Street_Bridge_Underpass.fbx', kind: 'fbx',
    width: ROAD_TILE, color: 0x5a5e66,
  },
  tyres: { url: 'assets/models/zombiekit/Environment/glTF/Wheels_Stack.gltf', kind: 'gltf' },
  chest: { url: 'assets/models/zombiekit/Environment/glTF/Chest.gltf', kind: 'gltf' },
  chestSpecial: { url: 'assets/models/zombiekit/Environment/glTF/Chest_Special.gltf', kind: 'gltf' },
  townSign: { url: 'assets/models/zombiekit/Environment/glTF/TownSign.gltf', kind: 'gltf' },
  kitLamp: { url: 'assets/models/zombiekit/Environment/glTF/StreetLights.gltf', kind: 'gltf' },
  roadTurn: { url: 'assets/models/zombiekit/Environment/glTF/Street_Turn.gltf', kind: 'gltf' },

  // ---- 待機場のキャンプ道具（サバイバルパック）----
  // どれもセンチで作られていて、素材に色が付いている。
  // 塗りつぶさず（keepMaterial）、ゲームでの高さだけ合わせる
  tent: { url: 'assets/models/survival/FBX/Tent.fbx', kind: 'fbx', height: 2.3, keepMaterial: true },
  bonfire: { url: 'assets/models/survival/FBX/Bonfire_Fire.fbx', kind: 'fbx', height: 1.15, keepMaterial: true },
  woodLog: { url: 'assets/models/survival/FBX/WoodLog.fbx', kind: 'fbx', height: 0.5, keepMaterial: true },
  trashcan: { url: 'assets/models/survival/FBX/Trashcan.fbx', kind: 'fbx', height: 1.0, keepMaterial: true },
  propaneTank: { url: 'assets/models/survival/FBX/PropaneTank.fbx', kind: 'fbx', height: 0.85, keepMaterial: true },
  gasCan: { url: 'assets/models/survival/FBX/GasCan.fbx', kind: 'fbx', height: 0.5, keepMaterial: true },
  radio: { url: 'assets/models/survival/FBX/Radio.fbx', kind: 'fbx', height: 0.42, keepMaterial: true },
  backpack: { url: 'assets/models/survival/FBX/Backpack.fbx', kind: 'fbx', height: 0.62, keepMaterial: true },
  firstAid: { url: 'assets/models/survival/FBX/FirstAidKit.fbx', kind: 'fbx', height: 0.34, keepMaterial: true },
  torchFire: { url: 'assets/models/survival/FBX/WoodenTorch_Fire.fbx', kind: 'fbx', height: 1.5, keepMaterial: true },
  pot: { url: 'assets/models/survival/FBX/Pot.fbx', kind: 'fbx', height: 0.4, keepMaterial: true },
  waterBottle: { url: 'assets/models/survival/FBX/WaterBottle_1.fbx', kind: 'fbx', height: 0.32, keepMaterial: true },

  // ---- 待機場の家（色つきの建物パック）----
  // 廃都市のビルとは別のパック。こちらは色が付いているので、そのまま使う
  house1: { url: 'assets/models/buildings-simple/FBX/House1.fbx', kind: 'fbx', height: 4.6, keepMaterial: true },
  house2: { url: 'assets/models/buildings-simple/FBX/House2.fbx', kind: 'fbx', height: 4.2, keepMaterial: true },
  block1S: { url: 'assets/models/buildings-simple/FBX/Building1_Small.fbx', kind: 'fbx', height: 6.6, keepMaterial: true },
  block1L: { url: 'assets/models/buildings-simple/FBX/Building1_Large.fbx', kind: 'fbx', height: 8.6, keepMaterial: true },
  block2S: { url: 'assets/models/buildings-simple/FBX/Building2_Small.fbx', kind: 'fbx', height: 6.8, keepMaterial: true },
  block2L: { url: 'assets/models/buildings-simple/FBX/Building2_Large.fbx', kind: 'fbx', height: 8.8, keepMaterial: true },
  block3S: { url: 'assets/models/buildings-simple/FBX/Building3_Small.fbx', kind: 'fbx', height: 7.2, keepMaterial: true },
  block3B: { url: 'assets/models/buildings-simple/FBX/Building3_Big.fbx', kind: 'fbx', height: 9.4, keepMaterial: true },
  block4: { url: 'assets/models/buildings-simple/FBX/Building4.fbx', kind: 'fbx', height: 8.0, keepMaterial: true },
};

// id -> { object, size }
const scenery = new Map();

export function hasScenery(id) {
  return scenery.has(id);
}

export function scenerySize(id) {
  return scenery.get(id)?.size ?? null;
}

// 街の置物を1つ作る
export function makeScenery(id) {
  const src = scenery.get(id);
  if (!src) return null;
  const obj = src.object.clone(true);
  obj.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
  });
  return obj;
}

export function buildingNames() {
  return [...buildings.keys()];
}

export function buildingSize(name) {
  return buildings.get(name)?.size ?? null;
}

// ビルを1棟作る。palette は色の番号（省略すると名前から決まるので、
// 同じビルはいつも同じ色になり、街並みが毎回変わらない）
export function makeBuilding(name, paletteIndex = null) {
  const src = buildings.get(name);
  if (!src || !palettes.length) return null;
  const obj = src.object.clone(true);
  const tex = palettes[(paletteIndex ?? hashOf(name)) % palettes.length];
  obj.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0 });
  });
  return obj;
}

// 名前から決まる番号。同じ名前なら必ず同じ色になる
function hashOf(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

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
  // 壁を這い上がるときの、四つんばいの動き
  crawl: ['Crawl', 'Walk'],
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

// 読み込んだ素の中身。GltfAvatar から使う
export function sourceOf(id) {
  return loaded.get(id) ?? null;
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

  // 色パレット。小さいので、にじまないよう「点のまま」拡大する。
  // 同じ絵を何度も読まないよう、まず種類ごとに1回だけ読む。
  // どのパレットも屋根がまっ赤（ROOF_SLOT）なので、そこだけ塗りかえて
  // 屋根の色ちがいを何種類か作る。街並みが赤一色にならない
  const paletteFiles = new Map();
  const palJobs = [...new Set(PALETTES)].map(async (name) => {
    try {
      const tex = await texLoader.loadAsync(`${PALETTE_DIR}${name}.png`);
      tex.colorSpace = THREE.SRGBColorSpace;
      // 32x32 の色見本なので、なめらかに伸ばすと隣の色がにじむ
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.flipY = false;
      paletteFiles.set(name, ROOF_COLORS.map((rgb) => recolorRoof(tex, rgb) ?? tex));
    } catch { /* 読めなければ色なしで出る */ }
  });

  // 街のビル
  const buildingJobs = BUILDING_NAMES.map(async (name) => {
    try {
      const obj = await fbxLoader.loadAsync(`${BUILDING_DIR}${name}.fbx`);
      obj.scale.setScalar(BUILDING_SCALE);
      obj.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(obj);
      // 足元が原点に来るように下げておく
      obj.position.y -= box.min.y;
      obj.updateMatrixWorld(true);
      buildings.set(name, {
        object: obj,
        size: new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3()),
      });
    } catch { /* 読めなければ、これまでの箱のビルで出る */ }
  });

  // 街の置物
  const sceneryJobs = Object.entries(SCENERY).map(async ([id, cfg]) => {
    try {
      let obj;
      if (cfg.kind === 'fbx') {
        obj = await fbxLoader.loadAsync(cfg.url);
        // 素材によって単位がばらばらなので、決めた高さに合わせる
        obj.updateMatrixWorld(true);
        const raw = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
        obj.scale.setScalar(
          cfg.width ? cfg.width / Math.max(0.001, raw.x)
            : cfg.height ? cfg.height / Math.max(0.001, raw.y)
              : (cfg.scale ?? 0.01)
        );
        // 道路パックには色が入っていないので、こちらで塗る。
        // キャンプ道具や家（keepMaterial）は、素材にちゃんと色が付いているので
        // その色をそのまま使い、材質だけ他と同じ種類にそろえる
        obj.traverse((o) => {
          if (!o.isMesh) return;
          if (cfg.keepMaterial) {
            o.material = [o.material].flat().map((m) => new THREE.MeshStandardMaterial({
              color: m.color ?? 0xffffff, map: m.map ?? null, roughness: 0.9, metalness: 0,
            }));
            if (o.material.length === 1) [o.material] = o.material;
            return;
          }
          o.material = new THREE.MeshStandardMaterial({
            color: cfg.color ?? 0x6b7078, roughness: 0.85, metalness: 0.1,
          });
        });
      } else {
        obj = (await loader.loadAsync(cfg.url)).scene;
      }
      obj.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(obj);
      // 足元が原点に来るようにそろえる
      obj.position.y -= box.min.y;
      obj.updateMatrixWorld(true);
      scenery.set(id, {
        object: obj,
        size: new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3()),
      });
    } catch { /* 読めなければ、これまでの手作りで出る */ }
  });

  await Promise.all([...jobs, ...propJobs, ...palJobs, ...buildingJobs, ...sceneryJobs]);

  // 読み終わってから、書いた順どおりに並べる。
  // 読めた順に入れると、開くたびに街の色が変わってしまう
  for (const name of PALETTES) {
    const variants = paletteFiles.get(name);
    if (variants) palettes.push(...variants);
  }
  return {
    characters: [...loaded.keys()],
    props: [...props.keys()],
    buildings: [...buildings.keys()],
  };
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
    // 歩きと這いは、種類ごとの速さ（animRate）に合わせて再生を速くする
    const paced = name === 'walk' || name === 'crawl';
    next.action.setEffectiveTimeScale(paced ? this.walkScale * (this._walkRate ?? 1) : 1);
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
    if (this._walkRate === rate) return;
    this._walkRate = rate;
    if ((this.mode === 'walk' || this.mode === 'crawl') && this.current) {
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
