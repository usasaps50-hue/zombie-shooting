import * as THREE from 'three';
import { QUALITY } from './device.js';

// 廃都市の戦場。広すぎると敵を探して歩くだけの時間が長くなるので、
// street（大通り）と block（街区）を詰めて置き、路地で入り組ませてある。
export const ARENA = 33;
// 真ん中はこの半径のぶん、何も置かずに開けておく
const OPEN_RADIUS = 10;
// 十字の大通りの幅
const ROAD_WIDTH = 9;
// トンネルの口の幅
const TUNNEL_WIDTH = 7;
const STAIR_RISE = 0.5;

// 4方向のトンネル。ここからゾンビが出てくる
const TUNNEL_DIRS = [
  { name: '北', x: 0, z: -1 },
  { name: '南', x: 0, z: 1 },
  { name: '西', x: -1, z: 0 },
  { name: '東', x: 1, z: 0 },
];

// 街区の設計図。ひとつの角（x>0, z>0）ぶんだけ書いて、4方向に写して使う。
// [x, z, 幅, 奥行き, 高さ] ／ 高さは写すときに少しずつ変える
const BLOCK = [
  [10.5, 10.5, 7, 7, 13],
  [10.5, 20, 7, 8.5, 18],
  [10, 29, 6, 6.5, 10],
  [20, 10, 8.5, 6, 15],
  [20.5, 20.5, 8, 8, 21],
  [29, 10.5, 6, 7, 12],
  [29, 20.5, 6, 8, 17],
  [21, 29.5, 8, 6, 14],
  [29.5, 29.5, 6, 6, 16],
];

// 乗り捨てられた車の色
const CAR_COLORS = [0x7d3b34, 0x35506b, 0x6d6a60, 0x4a5b3f, 0x82724a, 0x3f3f46];

export function createWorld() {
  const scene = new THREE.Scene();
  // 砂ぼこりの立ちこめた空。遠くほど白く霞ませて、狭さを感じさせない
  scene.background = new THREE.Color(0x8e8a7e);
  scene.fog = new THREE.Fog(0x8e8a7e, 34, 118);

  // 空からの光は弱め、地面からの照り返しは暗く。くすんだ街にする
  scene.add(new THREE.HemisphereLight(0xb6b2a4, 0x4a4740, 2.0));

  const sun = new THREE.DirectionalLight(0xffe6be, 2.5);
  sun.position.set(18, 34, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(QUALITY.shadowMap, QUALITY.shadowMap);
  sun.shadow.camera.left = -ARENA;
  sun.shadow.camera.right = ARENA;
  sun.shadow.camera.top = ARENA;
  sun.shadow.camera.bottom = -ARENA;
  sun.shadow.camera.far = 110;
  scene.add(sun);

  const colliders = [];
  // ゾンビが高いところへ上がるときの道しるべ。{ bottom, top } の組
  const stairPoints = [];
  const mat = (color, rough = 0.95) => new THREE.MeshStandardMaterial({ color, roughness: rough });

  // 箱を1つ置く。blocking を false にすると、通り抜けられる飾りになる
  const addBox = (x, y, z, width, height, depth, color, blocking = true) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat(color));
    mesh.position.set(x, y + height / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    if (blocking) {
      mesh.updateMatrixWorld(true);
      colliders.push(new THREE.Box3().setFromObject(mesh));
    }
    return mesh;
  };

  // 平らな板を地面に敷く（道路の白線や歩道の上面など）
  const addDecal = (x, z, width, depth, color, y = 0.03) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), mat(color, 1));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };

  // ---- 地面。ひび割れたアスファルトのつもり ----
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(ARENA * 2, ARENA * 2), mat(0x44464b, 1));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // 十字の大通り。トンネルから真ん中まで一本道でつながる
  for (const road of [[ARENA * 2, ROAD_WIDTH], [ROAD_WIDTH, ARENA * 2]]) {
    addDecal(0, 0, road[0], road[1], 0x4a4d53, 0.01);
  }

  // 大通りの中央線。破線にすると道路らしく見える
  const dashGeo = new THREE.PlaneGeometry(0.34, 2.2);
  const dashMat = mat(0x9b9270, 1);
  const dashes = [];
  for (let d = OPEN_RADIUS + 2; d < ARENA; d += 4.4) {
    for (const s of [-1, 1]) {
      dashes.push([0, s * d, 0], [s * d, 0, Math.PI / 2]);
    }
  }
  const dashMesh = new THREE.InstancedMesh(dashGeo, dashMat, dashes.length);
  dashes.forEach(([x, z, rot], i) => {
    const m = new THREE.Matrix4()
      .makeRotationX(-Math.PI / 2)
      .premultiply(new THREE.Matrix4().makeRotationY(rot))
      .setPosition(x, 0.02, z);
    dashMesh.setMatrixAt(i, m);
  });
  dashMesh.receiveShadow = true;
  scene.add(dashMesh);

  // 広場。まん中のロータリーのつもり
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(OPEN_RADIUS, 40), mat(0x51545a, 1));
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.02;
  plaza.receiveShadow = true;
  scene.add(plaza);

  // 広場の焼け跡。当たり判定のない模様なので、戦いの邪魔にはならない
  for (const [x, z, r, color] of [
    [-4.5, 2.5, 3.2, 0x33353a], [3.8, -3.4, 2.6, 0x2f3136], [1.2, 5.6, 2.0, 0x383a3f],
    [-6.2, -5.5, 1.6, 0x353840], [6.4, 4.2, 1.4, 0x303237],
  ]) {
    const scorch = new THREE.Mesh(new THREE.CircleGeometry(r, 12), mat(color, 1));
    scorch.rotation.x = -Math.PI / 2;
    // 円をすこし歪ませて、自然な焦げ跡に見せる
    scorch.scale.set(1, 0.7 + (r % 0.5), 1);
    scorch.position.set(x, 0.025, z);
    scorch.receiveShadow = true;
    scene.add(scorch);
  }

  // ---- 歩道。大通りの両側に一段高い縁石を置いて、街路らしくする ----
  const CURB_H = 0.16;
  for (const s of [-1, 1]) {
    for (const along of [-1, 1]) {
      const start = OPEN_RADIUS + 1;
      const len = ARENA - start;
      const mid = along * (start + len / 2);
      // 南北の通りの両脇
      addBox(s * (ROAD_WIDTH / 2 + 1.1), 0, mid, 2.2, CURB_H, len, 0x585b61, false);
      // 東西の通りの両脇
      addBox(mid, 0, s * (ROAD_WIDTH / 2 + 1.1), len, CURB_H, 2.2, 0x585b61, false);
    }
  }

  // ---- 外周の壁。4方向にトンネルぶんの切れ目をあける ----
  const WALL_H = 7;
  const half = (ARENA * 2 - TUNNEL_WIDTH) / 2;
  const offset = (TUNNEL_WIDTH + half) / 2;
  for (const side of [-1, 1]) {
    addBox(side * offset, 0, -ARENA, half, WALL_H, 1.4, 0x4a4b47);
    addBox(side * offset, 0, ARENA, half, WALL_H, 1.4, 0x4a4b47);
    addBox(-ARENA, 0, side * offset, 1.4, WALL_H, half, 0x4a4b47);
    addBox(ARENA, 0, side * offset, 1.4, WALL_H, half, 0x4a4b47);
  }

  // ---- トンネル。切れ目に短い通路をかぶせる ----
  const spawns = [];
  for (const dir of TUNNEL_DIRS) {
    const along = new THREE.Vector3(dir.x, 0, dir.z);
    const across = new THREE.Vector3(-dir.z, 0, dir.x);
    const mouth = along.clone().multiplyScalar(ARENA);
    const depth = 8;

    const put = (offsetAlong, offsetAcross, w, h, d) => {
      const pos = mouth.clone()
        .addScaledVector(along, offsetAlong)
        .addScaledVector(across, offsetAcross);
      // 通路の向きに合わせて、幅と奥行きを入れ替える
      const sizeX = dir.x ? d : w;
      const sizeZ = dir.x ? w : d;
      return addBox(pos.x, 0, pos.z, sizeX, h, sizeZ, 0x53545a);
    };

    // 通路の左右の壁と天井
    for (const s of [-1, 1]) {
      put(depth / 2, s * (TUNNEL_WIDTH / 2 + 0.7), 1.4, 5.2, depth);
    }
    const roof = put(depth / 2, 0, TUNNEL_WIDTH + 2.8, 1.2, depth);
    roof.position.y = 5.2 + 0.6;

    // 口を暗く見せる板。奥から出てくる感じを出す
    const dark = new THREE.Mesh(
      new THREE.PlaneGeometry(TUNNEL_WIDTH, 5.2),
      new THREE.MeshBasicMaterial({ color: 0x0f1216 })
    );
    dark.position.copy(mouth).addScaledVector(along, depth - 0.1);
    dark.position.y = 2.6;
    dark.lookAt(0, 2.6, 0);
    scene.add(dark);

    // ゾンビが出てくる位置は、口から少し内側
    spawns.push(mouth.clone().addScaledVector(along, -3));
  }

  // ---- 階段。1段ずつ箱を積んで、上れる高さにそろえる ----
  // yaw は上る向き（0 なら -Z へ上がる）。baseY は上りはじめの床の高さ
  function stairs(x, z, yaw, steps, width, baseY = 0) {
    const group = new THREE.Group();
    group.position.set(x, baseY, z);
    group.rotation.y = yaw;
    scene.add(group);
    for (let i = 0; i < steps; i++) {
      const h = STAIR_RISE * (i + 1);
      const step = new THREE.Mesh(new THREE.BoxGeometry(width, h, 0.9), mat(0x6e6f74));
      step.position.set(0, h / 2, -i * 0.9);
      step.castShadow = true;
      step.receiveShadow = true;
      group.add(step);
    }
    group.updateMatrixWorld(true);
    for (const step of group.children) colliders.push(new THREE.Box3().setFromObject(step));

    // 下の入口と上の出口を覚えておく。ゾンビはこれを目印に上る
    const local = (lz, ly) => new THREE.Vector3(0, ly, lz).applyMatrix4(group.matrixWorld);
    stairPoints.push({
      bottom: local(1.4, 0),
      top: local(-(steps - 1) * 0.9 - 1.2, STAIR_RISE * steps),
    });
    return group;
  }

  // ---- 登れる廃墟（大）。2階建てで、階段で屋上まで行ける ----
  function bigRuin(cx, cz) {
    const w = 15, d = 13;
    const floor1 = 3.0;
    const floor2 = 6.0;

    // 1階の外壁。正面はゾンビも入れるよう大きく開けておく
    addBox(cx - w / 2 + 1, 0, cz, 2, floor1, d, 0x6f675f);
    addBox(cx + w / 2 - 1, 0, cz, 2, floor1, d, 0x6f675f);
    addBox(cx, 0, cz - d / 2 + 1, w, floor1, 2, 0x6f675f);

    // 1階の床（＝2階のゆか）と、その上の壁
    addBox(cx, floor1, cz, w, 0.6, d, 0x807768);
    addBox(cx - w / 2 + 1, floor1 + 0.6, cz + 2, 2, floor2 - floor1, d - 4, 0x6f675f);
    addBox(cx + w / 2 - 1, floor1 + 0.6, cz - 2, 2, floor2 - floor1, d - 4, 0x6f675f);

    // 2階の床と屋上の高さ（人が立つ面）
    const deck2 = floor1 + 0.6;
    const roofTop = floor2 + 1.2;

    // 屋上へ上がる階段は、2階に着いてすぐの所から始める。
    // 上り口が2階の床のまん中にないと、ゾンビが辿り着けない
    const upStart = cz + d / 2 - 2.5;
    const steps = 7;
    // 階段が通る範囲（上り口の手前から、上りきった先まで）
    const holeW = 4.0;
    const holeFront = upStart + 0.7;
    const holeBack = upStart - (steps - 1) * 0.9 - 0.7;

    // 屋上。吹き抜けを避けて4枚に分けて張る
    const side = (w / 2 - holeW / 2) / 2;
    addBox(cx - holeW / 2 - side, floor2 + 0.6, cz, side * 2, 0.6, d, 0x807768);
    addBox(cx + holeW / 2 + side, floor2 + 0.6, cz, side * 2, 0.6, d, 0x807768);
    addBox(cx, floor2 + 0.6, (holeBack + cz - d / 2) / 2, holeW, 0.6, holeBack - (cz - d / 2), 0x807768);
    addBox(cx, floor2 + 0.6, (holeFront + cz + d / 2) / 2, holeW, 0.6, cz + d / 2 - holeFront, 0x807768);

    // 屋上のふち。落ちにくくする低い壁
    for (const s of [-1, 1]) {
      addBox(cx + s * (w / 2 - 0.4), roofTop, cz, 0.8, 1.0, d, 0x635b53);
      addBox(cx, roofTop, cz + s * (d / 2 - 0.4), w, 1.0, 0.8, 0x635b53);
    }

    // 1階へ上がる階段（建物の正面＝南から）
    stairs(cx + 4.5, cz + d / 2 + 5.4, 0, 7, 3.4);
    // 屋上へ上がる階段（建物の中）。1階の階段と同じ向きに、2階の床から上げる
    stairs(cx, upStart, 0, steps, 3.4, deck2);
  }

  // ---- ちょっとした足場 ----
  // (ux, uz) は階段を上っていく向き。斜めにすると、段の当たり判定が
  // 大きくふくらんで上り口を自分でふさいでしまうので、必ず東西南北のどれかにする
  function platform(cx, cz, ux, uz) {
    const height = 2.0;
    const size = 7;
    addBox(cx, 0, cz, size, height, size, 0x676870);

    // stairs は局所の -Z へ上がるので、その向きに回す
    const yaw = Math.atan2(-ux, -uz);
    stairs(cx - ux * (size / 2 + 3.4), cz - uz * (size / 2 + 3.4), yaw, 4, 3.0);
    // 目印になる残骸。階段の上り口をふさがないよう、必ず階段と反対のはしに置く
    addBox(cx + ux * 2.0, height, cz + uz * 2.0, 1.2, 1.6, 1.2, 0x52585f);
  }

  // 登れる建物と足場を先に置いて、その場所を「空けておく区画」として覚える。
  // あとから街区のビルを建てるとき、ここに重なるものは建てない
  const reserved = [];
  const reserve = (cx, cz, w, d) => reserved.push({
    minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2,
  });

  // 廃墟は建物のぶんと、正面の階段のぶんを空ける
  reserve(-16, -12, 19, 24);
  bigRuin(-16, -14);
  // 足場は本体と、階段がのびるぶんを空ける。階段の向きは東西南北のどれか
  for (const [px, pz, ux, uz] of [
    [16, -13.5, 0, -1],
    [-14.5, 16, 0, 1],
    [17, 15, 1, 0],
  ]) {
    // 足場(7)＋階段(約7)ぶんを、上り向きにのばして空ける
    reserve(px - ux * 5, pz - uz * 5, 9 + Math.abs(ux) * 12, 9 + Math.abs(uz) * 12);
    platform(px, pz, ux, uz);
  }

  // ---- 街区。ひとつの角ぶんの設計図を、4方向に写して街にする ----
  // 窓は数がとても多いので、1枚ずつ置かずにまとめて描く（InstancedMesh）
  const panes = { intact: [], broken: [] };

  function windows(x, z, w, d, h) {
    // 2.5m ごとの階に、1.7m 間隔で窓を並べる
    for (let floorY = 2.0; floorY < h - 1.2; floorY += 2.5) {
      for (const [nx, nz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const span = nx ? d : w;
        const cols = Math.max(1, Math.floor(span / 1.7));
        for (let i = 0; i < cols; i++) {
          const offset = (i - (cols - 1) / 2) * 1.7;
          const px = nx ? x + nx * (w / 2 + 0.03) : x + offset;
          const pz = nx ? z + offset : z + nz * (d / 2 + 0.03);
          const rot = nx ? nx * Math.PI / 2 : (nz > 0 ? 0 : Math.PI);
          // ときどき割れて真っ暗な窓にする
          (Math.random() < 0.34 ? panes.broken : panes.intact).push([px, floorY, pz, rot]);
        }
      }
    }
  }

  const blocks = [];
  for (const [bx, bz, w, d, h] of BLOCK) {
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      // 角ごとに高さを変えて、写したように見えないようにする
      const vary = 1 + (sx * 0.09) + (sz * 0.05);
      blocks.push([bx * sx, bz * sz, w, d, Math.round(h * vary * 10) / 10]);
    }
  }

  const overlapsReserved = (x, z, w, d) => reserved.some((r) =>
    x - w / 2 < r.maxX && x + w / 2 > r.minX && z - d / 2 < r.maxZ && z + d / 2 > r.minZ);

  for (const [x, z, w, d, h] of blocks) {
    // 大通りと広場にはみ出すものは置かない
    if (Math.hypot(x, z) < OPEN_RADIUS + 3) continue;
    if (Math.abs(x) - w / 2 < ROAD_WIDTH / 2 + 1.2 && Math.abs(z) - d / 2 < ROAD_WIDTH / 2 + 1.2) continue;
    // 登れる廃墟・足場の場所には建てない
    if (overlapsReserved(x, z, w, d)) continue;
    // コンクリート・すすけた茶・焼けた灰の3系統に散らす。
    // 全部同じ明るさだと模型みたいに見えるので、暗いものを多めにする
    const tone = Math.random();
    const hue = tone < 0.45 ? 0.09 : tone < 0.8 ? 0.06 : 0.55;
    const sat = tone < 0.45 ? 0.04 : tone < 0.8 ? 0.11 : 0.03;
    const shade = 0.20 + Math.random() * 0.20;
    addBox(x, 0, z, w, h, d, new THREE.Color().setHSL(hue, sat, shade).getHex());
    windows(x, z, w, d, h);
    // 崩れかけの上部。ビルごとに削れ方を変える
    const cw = w * (0.35 + Math.random() * 0.3);
    const cd = d * (0.35 + Math.random() * 0.3);
    addBox(
      x + (Math.random() - 0.5) * (w - cw), h, z + (Math.random() - 0.5) * (d - cd),
      cw, 1.0 + Math.random() * 2.4, cd, 0x35322e
    );
  }

  // 窓をまとめて1回で描く
  const paneGeo = new THREE.PlaneGeometry(0.95, 1.25);
  const paneMats = {
    intact: new THREE.MeshStandardMaterial({ color: 0x6f8091, roughness: 0.2 }),
    broken: new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 1 }),
  };
  for (const kind of ['intact', 'broken']) {
    const list = panes[kind];
    if (!list.length) continue;
    const mesh = new THREE.InstancedMesh(paneGeo, paneMats[kind], list.length);
    const m4 = new THREE.Matrix4();
    list.forEach(([px, py, pz, rot], i) => {
      m4.makeRotationY(rot).setPosition(px, py, pz);
      mesh.setMatrixAt(i, m4);
    });
    scene.add(mesh);
  }

  // ---- 街の小物 ----
  // 大通りぞいと路地に置く。位置は決め打ちにして、毎回同じ街並みにする
  const rand = (() => {
    // 同じ見た目を毎回作りたいので、簡単な決まった乱数を使う
    let seed = 20260817;
    return () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
  })();

  // 乗り捨てられた車。壁のかわりになる遮蔽物なので、当たり判定をつける
  function car(x, z, yaw, color) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.75, 4.2), mat(color, 0.6));
    body.position.y = 0.62;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.7, 2.0), mat(0x2b2f35, 0.35));
    cabin.position.set(0, 1.32, -0.15);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.34, 0.5), mat(0x3a3d42, 0.5));
    nose.position.set(0, 0.55, 2.2);
    for (const m of [body, cabin, nose]) {
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
    }
    // タイヤは潰れている想定で、低く小さく
    const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.3, 8);
    const wheelMat = mat(0x1d1f22, 0.9);
    for (const [wx, wz] of [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]]) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, 0.32, wz);
      group.add(wheel);
    }
    scene.add(group);
    group.updateMatrixWorld(true);
    // 当たり判定は車体だけ。タイヤまで含めると引っかかりやすい
    colliders.push(new THREE.Box3().setFromObject(body));
    return group;
  }

  // 大通りの路肩に、向きをばらして並べる
  const CARS = [
    [-3.2, 16, 0.1], [3.4, 24, 3.0], [-3.0, 29, 0.4],
    [3.2, -17, 3.2], [-3.4, -25, 0.2], [3.0, -30.5, 2.9],
    [16, 3.2, 1.6], [24.5, -3.2, 4.6], [30, 3.0, 1.4],
    [-17, -3.0, 4.7], [-25, 3.3, 1.7], [-30, -3.2, 4.5],
    [12.5, 12.5, 0.8], [-12.5, 13, 2.3], [13, -12.5, 5.6], [-13, -12.8, 3.9],
  ];
  for (const [x, z, yaw] of CARS) {
    car(x, z, yaw, CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)]);
  }

  // 折れかけの街灯。飾りなので当たり判定はつけない（引っかかると邪魔）
  function lamp(x, z, tilt) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.z = tilt;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 5.4, 6), mat(0x4b4e53, 0.7));
    pole.position.y = 2.7;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.14, 0.14), mat(0x4b4e53, 0.7));
    arm.position.set(0.8, 5.3, 0);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.4), mat(0x3a3d42, 0.7));
    head.position.set(1.55, 5.18, 0);
    for (const m of [pole, arm, head]) {
      m.castShadow = true;
      group.add(m);
    }
    scene.add(group);
  }
  for (const [x, z, tilt] of [
    [-6.2, 13, 0.08], [6.2, 21, -0.05], [-6.2, 28, 0.22],
    [6.2, -14, -0.1], [-6.2, -22, 0.06], [6.2, -29, -0.24],
    [13, -6.2, 0.12], [22, 6.2, -0.07], [29, -6.2, 0.19],
    [-14, 6.2, -0.09], [-23, -6.2, 0.05], [-30, 6.2, -0.2],
  ]) lamp(x, z, tilt);

  // コンクリートの車止め。低い遮蔽物として、広場の入口に置く
  for (const [x, z, yaw] of [
    [-5.5, 9.5, 0], [5.5, 9.5, 0], [-5.5, -9.5, 0], [5.5, -9.5, 0],
    [9.5, 5.5, Math.PI / 2], [9.5, -5.5, Math.PI / 2],
    [-9.5, 5.5, Math.PI / 2], [-9.5, -5.5, Math.PI / 2],
  ]) {
    const barrier = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 0.7), mat(0x8a8578, 0.9));
    barrier.position.set(x, 0.45, z);
    barrier.rotation.y = yaw;
    barrier.castShadow = true;
    barrier.receiveShadow = true;
    scene.add(barrier);
    barrier.updateMatrixWorld(true);
    colliders.push(new THREE.Box3().setFromObject(barrier));
  }

  // 枯れ木。歩道ぞいに立てて、街路樹だった感じを出す
  function deadTree(x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 3.4, 6), mat(0x4a3f33, 0.95));
    trunk.position.y = 1.7;
    trunk.castShadow = true;
    group.add(trunk);
    for (const [ax, ay, az, rot] of [[0.5, 3.0, 0, 0.7], [-0.45, 3.3, 0.2, -0.8], [0.1, 3.5, -0.5, 0.5]]) {
      const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 1.4, 5), mat(0x4a3f33, 0.95));
      branch.position.set(ax, ay, az);
      branch.rotation.set(rot * 0.6, 0, rot);
      branch.castShadow = true;
      group.add(branch);
    }
    scene.add(group);
  }
  for (const [x, z] of [
    [-6.2, 17.5], [6.2, 25.5], [6.2, -18.5], [-6.2, -27],
    [17.5, 6.2], [26, -6.2], [-18.5, -6.2], [-27, 6.2],
  ]) deadTree(x, z);

  // ---- 転がっている瓦礫。当たり判定はつけず、見た目だけ ----
  // これも数が多いので、まとめて1回で描く
  const rubbleGeo = new THREE.IcosahedronGeometry(0.55, 0);
  const rubbleMesh = new THREE.InstancedMesh(rubbleGeo, mat(0x4c4944, 1), 90);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const scl = new THREE.Vector3();
  for (let i = 0; i < 90; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = OPEN_RADIUS - 2 + rand() * (ARENA - OPEN_RADIUS);
    const s = 0.5 + rand() * 1.1;
    e.set(rand() * 3, rand() * 3, rand() * 3);
    q.setFromEuler(e);
    scl.set(s, s * 0.7, s);
    m4.compose(
      new THREE.Vector3(Math.sin(angle) * dist, 0.15 + s * 0.15, Math.cos(angle) * dist),
      q, scl
    );
    rubbleMesh.setMatrixAt(i, m4);
  }
  rubbleMesh.castShadow = true;
  rubbleMesh.receiveShadow = true;
  scene.add(rubbleMesh);

  return { scene, colliders, spawns, stairPoints };
}
