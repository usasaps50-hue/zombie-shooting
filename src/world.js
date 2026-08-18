import * as THREE from 'three';
import { QUALITY } from './device.js';
import {
  buildingNames, buildingSize, makeBuilding,
  hasScenery, makeScenery, ROAD_TILE,
} from './gltfmodel.js';

// 廃都市の戦場。見えているものは、外から持ってきた素材だけで組んである。
// 手で作っているのは「見えない当たり判定」と地面だけ。
//
// 置くときは必ず place() を通す。すでに何か置いてある場所には置かないので、
// ビルや車が重なって変な見た目になることがない。

export const ARENA = 36;
// 交差点まわりの広場の広さ。車や街灯は、ここより外に置く
const OPEN_RADIUS = 10;
// 大通りの幅。道路タイルの車道ぶん
const ROAD_HALF = 4.2;
// 坂を歩いて上れるように、見えない段をいくつに割るか
const RAMP_STEPS = 6;
// 陸橋を置く場所（南の大通り）。ここには道路タイルを敷かない
const BRIDGE_TILES = [-8, -16, -24];
// 陸橋の高さ。橋げたの上と、土台の段
const BRIDGE_DECK = 3.0;
const BRIDGE_BASE = 0.48;
// 橋げたの幅の半分。素材の車道ぶん
const BRIDGE_HALF = 2.7;

export function createWorld() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8e8a7e);
  scene.fog = new THREE.Fog(0x8e8a7e, 34, 120);

  scene.add(new THREE.HemisphereLight(0xb6b2a4, 0x4a4740, 2.0));
  const sun = new THREE.DirectionalLight(0xffe6be, 2.5);
  sun.position.set(18, 34, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(QUALITY.shadowMap, QUALITY.shadowMap);
  sun.shadow.camera.left = -ARENA;
  sun.shadow.camera.right = ARENA;
  sun.shadow.camera.top = ARENA;
  sun.shadow.camera.bottom = -ARENA;
  sun.shadow.camera.far = 120;
  // 丸みのあるモデルに、自分の影が斑点のように落ちるのを防ぐ
  sun.shadow.normalBias = 0.06;
  sun.shadow.bias = -0.0006;
  scene.add(sun);

  const colliders = [];
  // ゾンビが高いところへ上がるときの道しるべ。{ bottom, top } の組
  const stairPoints = [];
  // すでに何か置いた場所。ここに重ねて置かない
  const taken = [];

  // 毎回おなじ街になるよう、決まった順番の乱数を使う
  const rand = (() => {
    let seed = 20260818;
    return () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
  })();

  // ---- 置き場所の管理 ----
  const box3 = new THREE.Box3();

  // その四角が、すでに置いたものと重なっていないか
  const isFree = (minX, maxX, minZ, maxZ, margin) => !taken.some((t) =>
    minX - margin < t.maxX && maxX + margin > t.minX
    && minZ - margin < t.maxZ && maxZ + margin > t.minZ);

  const claim = (minX, maxX, minZ, maxZ) => taken.push({ minX, maxX, minZ, maxZ });

  // 大通りの上か。道の真ん中にはビルを建てない
  const onRoad = (minX, maxX, minZ, maxZ) =>
    (minX < ROAD_HALF && maxX > -ROAD_HALF) || (minZ < ROAD_HALF && maxZ > -ROAD_HALF);

  // モデルを1つ置く。重なる場所なら置かずに false を返す。
  //   solid   … 当たり判定をつけるか
  //   margin  … 隣のものとどれだけ間を空けるか
  //   avoidRoad … 大通りを避けるか（ビル用）
  const place = (object, x, z, yaw, {
    solid = false, margin = 0.4, avoidRoad = false, reserve = true,
  } = {}) => {
    if (!object) return false;
    object.position.set(x, 0, z);
    object.rotation.y = yaw;
    object.updateMatrixWorld(true);
    box3.setFromObject(object);
    const { min, max } = box3;
    if (avoidRoad && onRoad(min.x, max.x, min.z, max.z)) return false;
    // 場外にはみ出すものは置かない
    if (min.x < -ARENA || max.x > ARENA || min.z < -ARENA || max.z > ARENA) return false;
    if (reserve && !isFree(min.x, max.x, min.z, max.z, margin)) return false;
    scene.add(object);
    if (reserve) claim(min.x, max.x, min.z, max.z);
    if (solid) colliders.push(box3.clone());
    return true;
  };

  // 見えない当たり判定だけを置く（場外の壁と、スロープの段）
  const addHiddenBox = (x, y, z, w, h, d) => {
    colliders.push(new THREE.Box3(
      new THREE.Vector3(x - w / 2, y, z - d / 2),
      new THREE.Vector3(x + w / 2, y + h, z + d / 2)
    ));
  };

  // ---- 地面 ----
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA * 2 + 20, ARENA * 2 + 20),
    new THREE.MeshStandardMaterial({ color: 0x3f4146, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // ---- 道路。十字の大通りをタイルで敷く ----
  const hasRoads = hasScenery('roadStraight') && hasScenery('road4Way');
  const roadEnd = Math.floor((ARENA - ROAD_TILE * 0.5) / ROAD_TILE);
  if (hasRoads) {
    const cracks = ['roadCrack1', 'roadCrack2'].filter(hasScenery);
    const cross = makeScenery('road4Way');
    cross.position.set(0, 0, 0);
    scene.add(cross);
    for (let i = 1; i <= roadEnd; i++) {
      for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        // 陸橋のところは道路を敷かない。重なって変に見えるため
        if (dx === 0 && dz === -1 && BRIDGE_TILES.includes(-i * ROAD_TILE)) continue;
        const useCrack = cracks.length && (i * 3 + dx * 7 + dz * 11) % 4 === 0;
        const tile = makeScenery(useCrack ? cracks[i % cracks.length] : 'roadStraight');
        tile.position.set(dx * i * ROAD_TILE, 0, dz * i * ROAD_TILE);
        tile.rotation.y = dx ? Math.PI / 2 : 0;
        scene.add(tile);
      }
    }
  }

  // ---- 陸橋。南の大通りが、ここだけ持ち上がっている ----
  // 上は地面より3m高いので、タイタンの衝撃波が足元をすり抜ける。
  // 見た目は素材の橋そのまま。坂は当たり判定が箱だと登れないので、
  // 見えない段を6つ重ねて、歩いて上がれるようにしてある
  function overpass() {
    if (!hasScenery('bridge') || !hasScenery('bridgeRamp')) return;
    const half = ROAD_TILE / 2;
    const zs = BRIDGE_TILES;
    const near = Math.max(...zs) + half;
    const far = Math.min(...zs) - half;
    claim(-half, half, far, near);

    // 素材の底が地面より下に沈んでいるぶん、持ち上げてから置く
    const put = (id, z, yaw) => {
      const o = makeScenery(id);
      o.position.set(0, 0, z);
      o.rotation.y = yaw;
      o.updateMatrixWorld(true);
      box3.setFromObject(o);
      o.position.y = -box3.min.y;
      scene.add(o);
    };
    // 橋は素材のままで z 方向。坂は x 方向に作られているので90度まわす
    put('bridgeRamp', zs[0], -Math.PI / 2);
    put('bridge', zs[1], 0);
    put('bridgeRamp', zs[2], Math.PI / 2);

    // 土台。まわりからは0.48mの段なので、そのまま歩いて乗れる
    for (const z of zs) addHiddenBox(0, 0, z, ROAD_TILE, BRIDGE_BASE, ROAD_TILE);
    // 橋げたの上
    addHiddenBox(0, 0, zs[1], BRIDGE_HALF * 2, BRIDGE_DECK, ROAD_TILE);

    // 坂の見えない段。橋に近いほど高い
    const stepDepth = ROAD_TILE / RAMP_STEPS;
    for (const [rampZ, toBridge] of [[zs[0], -1], [zs[2], 1]]) {
      for (let i = 0; i < RAMP_STEPS; i++) {
        const h = BRIDGE_BASE + (BRIDGE_DECK - BRIDGE_BASE) * ((i + 1) / RAMP_STEPS);
        const offset = -half + stepDepth * (i + 0.5);
        addHiddenBox(0, 0, rampZ + toBridge * offset, BRIDGE_HALF * 2, h, stepDepth);
      }
      // 坂の下は、車や小物を置かないように空けておく
      const footZ = rampZ - toBridge * (half + 1.6);
      claim(-3, 3, footZ - 2.4, footZ + 2.4);
      // ゾンビが上ってこられるよう、上り口と上の場所を覚えさせる
      stairPoints.push({
        bottom: new THREE.Vector3(0, 0, footZ),
        top: new THREE.Vector3(0, BRIDGE_DECK, zs[1]),
      });
    }
  }

  // ---- 外周。見えない壁で場外へ出られないようにする ----
  // ビルより先に置いて、場所を押さえておく
  const WALL = ARENA - 0.6;
  for (const side of [-1, 1]) {
    const half = (ARENA - ROAD_HALF - 1) / 2;
    const mid = ROAD_HALF + 1 + half;
    for (const [x, z, w, d] of [
      [side * mid, -WALL, half * 2, 2.0], [side * mid, WALL, half * 2, 2.0],
      [-WALL, side * mid, 2.0, half * 2], [WALL, side * mid, 2.0, half * 2],
    ]) {
      addHiddenBox(x, 0, z, w, 10, d);
      claim(x - w / 2, x + w / 2, z - d / 2, z + d / 2);
    }
  }

  // ---- 陸橋 ----
  overpass();

  // 給水塔。遠くからも見える目印なので、ビルより先に場所を取る
  if (hasScenery('waterTower')) {
    place(makeScenery('waterTower'), 21.5, -21.5, 0.4, { solid: true, margin: 0.4 });
  }

  // ---- ビル。街区のふちに、肩を並べるように建てる ----
  const models = buildingNames()
    .map((name) => ({ name, size: buildingSize(name) }))
    .filter((m) => m.size);

  // 高さの近いものを何個か出す。同じ場所ならいつも同じ並びになる
  const nearHeight = (wantH) => models
    .slice()
    .sort((a, b) => Math.abs(a.size.y - wantH) - Math.abs(b.size.y - wantH))
    .slice(0, 8);

  // 通りに沿って、ビルを1列ぶん詰めて並べる。
  //   (sx, sz) … 列の始まり  (dx, dz) … 列の伸びる向き
  //   (nx, nz) … ビルが向く向き（通りのほう）
  function packRow(sx, sz, dx, dz, length, nx, nz, wantH) {
    const yaw = nz < 0 ? 0 : nz > 0 ? Math.PI : (nx > 0 ? Math.PI / 2 : -Math.PI / 2);
    const pool = nearHeight(wantH);
    let cursor = 0.4;
    let guard = 0;
    while (cursor < length - 2.6 && guard++ < 60) {
      // 残りの幅に収まるビルだけから選ぶ。はみ出して隣とぶつかるのを防ぐ
      const room = length - cursor;
      const fits = pool.filter((m) => m.size.x <= room);
      if (!fits.length) break;
      const pick = fits[Math.floor(rand() * fits.length)];
      const w = pick.size.x;
      const depth = pick.size.z;
      const along = cursor + w / 2;
      const x = sx + dx * along - nx * (depth / 2);
      const z = sz + dz * along - nz * (depth / 2);
      const model = makeBuilding(pick.name, Math.abs(Math.round(x * 7 + z * 11)));
      const ok = place(model, x, z, yaw, { solid: true, margin: 0.25, avoidRoad: true });
      cursor += ok ? w + 0.2 + rand() * 0.4 : 1.5;
    }
  }

  // 街区ひとつぶん。四方のふちにビルを並べる
  function block(x0, x1, z0, z1, wantH) {
    const w = Math.abs(x1 - x0);
    const d = Math.abs(z1 - z0);
    const lx = Math.min(x0, x1);
    const lz = Math.min(z0, z1);
    packRow(lx, lz, 1, 0, w, 0, -1, wantH);          // 手前のふち
    packRow(lx, lz + d, 1, 0, w, 0, 1, wantH);       // 奥のふち
    packRow(lx, lz, 0, 1, d, -1, 0, wantH);          // 左のふち
    packRow(lx + w, lz, 0, 1, d, 1, 0, wantH);       // 右のふち
  }

  // 内側の街区は低く、外側ほど高く。あいだの細道は歩いて抜けられる
  const BAND_A = [6.2, 18.6];
  const BAND_B = [22.2, 34.6];
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    for (const [bandX, hx] of [[BAND_A, 8], [BAND_B, 13]]) {
      for (const [bandZ, hz] of [[BAND_A, 8], [BAND_B, 13]]) {
        block(sx * bandX[0], sx * bandX[1], sz * bandZ[0], sz * bandZ[1], Math.max(hx, hz));
      }
    }
  }

  // ---- ゾンビの出てくる所。大通りの端 ----
  const spawns = [
    new THREE.Vector3(0, 0, -(ARENA - 3)),
    new THREE.Vector3(0, 0, ARENA - 3),
    new THREE.Vector3(-(ARENA - 3), 0, 0),
    new THREE.Vector3(ARENA - 3, 0, 0),
  ];

  // ---- 街の置物 ----
  // 乗り捨てられた車。大通りぞいに、車道からは少しずらして置く
  const carIds = ['carPickup', 'carSports', 'carTruck', 'carPickupArmored', 'carSportsArmored', 'carTruckArmored']
    .filter(hasScenery);
  if (carIds.length) {
    const spots = [];
    for (let d = OPEN_RADIUS + 3; d < ARENA - 5; d += 6.5) {
      spots.push([-2.6, d, 0.06], [2.6, -d, Math.PI + 0.04]);
      spots.push([d, 2.6, Math.PI / 2 + 0.05], [-d, -2.6, -Math.PI / 2 + 0.03]);
    }
    spots.forEach(([x, z, yaw], i) => {
      // ぜんぶ埋めると通れなくなるので、3台に2台くらいにする
      if (i % 3 === 2) return;
      place(makeScenery(carIds[i % carIds.length]), x, z, yaw, { solid: true, margin: 0.6 });
    });
  }

  // 街灯と信号。交差点と大通りぞいに
  const lampIds = ['streetlight', 'streetlight2'].filter(hasScenery);
  if (lampIds.length) {
    for (let d = OPEN_RADIUS + 2; d < ARENA - 4; d += 11) {
      for (const [x, z, yaw] of [
        [-5.4, d, 0], [5.4, -d, Math.PI], [d, 5.4, Math.PI / 2], [-d, -5.4, -Math.PI / 2],
      ]) {
        place(makeScenery(lampIds[Math.floor(rand() * lampIds.length)]), x, z, yaw,
          { solid: false, margin: 0.3 });
      }
    }
  }
  for (const [id, x, z, yaw] of [
    ['trafficLight', -5.2, 5.2, 0], ['trafficLight', 5.2, -5.2, Math.PI],
    ['trafficLight', 5.2, 5.2, -Math.PI / 2], ['trafficLight', -5.2, -5.2, Math.PI / 2],
    ['signStop', -5.2, 12, Math.PI], ['signStop', 5.2, -12, 0],
  ]) {
    if (hasScenery(id)) place(makeScenery(id), x, z, yaw, { solid: false, margin: 0.3 });
  }

  // 遮蔽物になる大きめの置物。広場と大通りに、隠れられるように置く
  const coverIds = ['container', 'containerGreen', 'barrier', 'plasticBarrier'].filter(hasScenery);
  if (coverIds.length) {
    const pickCover = () => coverIds[Math.floor(rand() * coverIds.length)];
    // 広場のまわり
    for (let i = 0; i < 12; i++) {
      const a = rand() * Math.PI * 2;
      const d = 4.5 + rand() * (OPEN_RADIUS - 5.5);
      place(makeScenery(pickCover()), Math.sin(a) * d, Math.cos(a) * d,
        rand() * Math.PI * 2, { solid: true, margin: 1.4 });
    }
    // 大通りぞい。道をふさがないよう端に寄せる
    for (let d = 13; d < ARENA - 6; d += 7) {
      for (const [x, z] of [[-3.1, d], [3.1, -d], [d, 3.1], [-d, -3.1]]) {
        if (rand() < 0.45) continue;
        place(makeScenery(pickCover()), x, z, rand() * Math.PI * 2,
          { solid: true, margin: 0.8 });
      }
    }
  }

  // 散らばった小物。当たり判定はつけない
  const debrisIds = ['cinder', 'pallet', 'palletBroken', 'trash', 'trash2', 'pipes', 'couch', 'tyres', 'barrel', 'cone', 'hydrant']
    .filter(hasScenery);
  if (debrisIds.length) {
    for (let i = 0; i < 160; i++) {
      const a = rand() * Math.PI * 2;
      const d = rand() * (ARENA - 2);
      place(makeScenery(debrisIds[Math.floor(rand() * debrisIds.length)]),
        Math.sin(a) * d, Math.cos(a) * d, rand() * Math.PI * 2, { solid: false, margin: 0.5 });
    }
    for (const id of ['blood', 'blood2'].filter(hasScenery)) {
      for (let i = 0; i < 6; i++) {
        const a = rand() * Math.PI * 2;
        const d = rand() * 18;
        place(makeScenery(id), Math.sin(a) * d, Math.cos(a) * d, rand() * Math.PI * 2,
          { solid: false, margin: 0, reserve: false });
      }
    }
  }

  return { scene, colliders, spawns, stairPoints };
}
