import * as THREE from 'three';
import { QUALITY } from './device.js';

export const ARENA = 40;
// 真ん中はこの半径のぶん、何も置かずに開けておく
const OPEN_RADIUS = 12;
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

export function createWorld() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9aa3ad);
  scene.fog = new THREE.Fog(0x9aa3ad, 30, 130);

  scene.add(new THREE.HemisphereLight(0xc3cfdc, 0x4a4f55, 2.2));

  const sun = new THREE.DirectionalLight(0xffeedd, 2.6);
  sun.position.set(20, 40, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(QUALITY.shadowMap, QUALITY.shadowMap);
  sun.shadow.camera.left = -ARENA;
  sun.shadow.camera.right = ARENA;
  sun.shadow.camera.top = ARENA;
  sun.shadow.camera.bottom = -ARENA;
  sun.shadow.camera.far = 120;
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

  // ---- 地面。ひび割れたアスファルトのつもり ----
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(ARENA * 2, ARENA * 2), mat(0x5c6068, 1));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const plaza = new THREE.Mesh(new THREE.CircleGeometry(OPEN_RADIUS, 40), mat(0x6d727a, 1));
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.02;
  plaza.receiveShadow = true;
  scene.add(plaza);

  // 十字の大通り。トンネルから真ん中まで一本道でつながる
  for (const road of [[ARENA * 2, 9], [9, ARENA * 2]]) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(road[0], road[1]), mat(0x676c74, 1));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.01;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // ---- 外周の壁。4方向にトンネルぶんの切れ目をあける ----
  const WALL_H = 7;
  const half = (ARENA * 2 - TUNNEL_WIDTH) / 2;
  const offset = (TUNNEL_WIDTH + half) / 2;
  for (const side of [-1, 1]) {
    addBox(side * offset, 0, -ARENA, half, WALL_H, 1.4, 0x6b6f74);
    addBox(side * offset, 0, ARENA, half, WALL_H, 1.4, 0x6b6f74);
    addBox(-ARENA, 0, side * offset, 1.4, WALL_H, half, 0x6b6f74);
    addBox(ARENA, 0, side * offset, 1.4, WALL_H, half, 0x6b6f74);
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
      return addBox(pos.x, 0, pos.z, sizeX, h, sizeZ, 0x585d63);
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
      new THREE.MeshBasicMaterial({ color: 0x14171b })
    );
    dark.position.copy(mouth).addScaledVector(along, depth - 0.1);
    dark.position.y = 2.6;
    dark.lookAt(0, 2.6, 0);
    scene.add(dark);

    // ゾンビが出てくる位置は、口から少し内側
    spawns.push(mouth.clone().addScaledVector(along, -3));
  }

  // ---- 階段。1段ずつ箱を積んで、上れる高さにそろえる ----
  // yaw は上る向き（0 なら -Z へ上がる）
  function stairs(x, z, yaw, steps, width) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    scene.add(group);
    for (let i = 0; i < steps; i++) {
      const h = STAIR_RISE * (i + 1);
      const step = new THREE.Mesh(new THREE.BoxGeometry(width, h, 0.9), mat(0x767b82));
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
    addBox(cx - w / 2 + 1, 0, cz, 2, floor1, d, 0x7a7168);
    addBox(cx + w / 2 - 1, 0, cz, 2, floor1, d, 0x7a7168);
    addBox(cx, 0, cz - d / 2 + 1, w, floor1, 2, 0x7a7168);

    // 1階の床（＝2階のゆか）と、その上の壁
    addBox(cx, floor1, cz, w, 0.6, d, 0x8a8177);
    addBox(cx - w / 2 + 1, floor1 + 0.6, cz + 2, 2, floor2 - floor1, d - 4, 0x7a7168);
    addBox(cx + w / 2 - 1, floor1 + 0.6, cz - 2, 2, floor2 - floor1, d - 4, 0x7a7168);
    // 屋上
    addBox(cx, floor2 + 0.6, cz, w, 0.6, d, 0x8a8177);
    // 屋上のふち。落ちにくくする低い壁
    for (const s of [-1, 1]) {
      addBox(cx + s * (w / 2 - 0.4), floor2 + 1.2, cz, 0.8, 1.0, d, 0x6f675f);
      addBox(cx, floor2 + 1.2, cz + s * (d / 2 - 0.4), w, 1.0, 0.8, 0x6f675f);
    }

    // 1階へ上がる階段（正面から）と、屋上へ上がる階段（建物の中）
    stairs(cx + 4.5, cz + d / 2 + 5.4, 0, 7, 3.4);
    stairs(cx - 4.5, cz + d / 2 - 1.2, Math.PI, 7, 3.4);
  }

  // ---- ちょっとした足場。階段は必ず真ん中の広場を向くようにする ----
  function platform(cx, cz) {
    const height = 2.0;
    const size = 7;
    addBox(cx, 0, cz, size, height, size, 0x6f7078);

    // 広場から足場へ向かう向きが「上る向き」。stairs は局所の -Z へ上がる
    const dir = new THREE.Vector3(cx, 0, cz).normalize();
    const yaw = Math.atan2(-dir.x, -dir.z);
    stairs(cx - dir.x * (size / 2 + 3.4), cz - dir.z * (size / 2 + 3.4), yaw, 4, 3.0);
    // 目印になる残骸
    addBox(cx + 1.6, height, cz - 1.6, 1.2, 1.6, 1.2, 0x59606a);
  }

  bigRuin(-19, -17);
  platform(19, -16);
  platform(-17, 19);
  platform(21, 17);

  // ---- 廃ビル。登れないが街らしさを出す ----
  const BUILDINGS = [
    [-30, -30, 8, 9, 14], [-8, -30, 7, 8, 18], [12, -31, 9, 7, 11],
    [31, -28, 7, 9, 20], [32, -6, 8, 10, 15], [30, 6, 7, 8, 9],
    [31, 30, 9, 9, 17], [8, 32, 8, 7, 12], [-10, 31, 7, 9, 13],
    [-31, 30, 8, 8, 16], [-32, 8, 9, 8, 19], [-31, -5, 7, 9, 10],
    [-20, 6, 6, 6, 7], [17, 4, 6, 6, 8], [4, 20, 6, 6, 9],
  ];
  // 窓。板を壁のすぐ外側に貼る。当たり判定はつけない
  // 割れていない窓は空を映して明るく、割れた窓は中が見えて真っ暗
  const windowMat = new THREE.MeshStandardMaterial({ color: 0x8fa9bd, roughness: 0.12 });
  const brokenMat = new THREE.MeshStandardMaterial({ color: 0x14181d, roughness: 1 });
  const windowGeo = new THREE.PlaneGeometry(0.9, 1.2);

  function windows(x, z, w, d, h) {
    // 2.5m ごとの階に、1.6m 間隔で窓を並べる
    for (let floorY = 2.0; floorY < h - 1.0; floorY += 2.5) {
      for (const [nx, nz, span] of [[0, 1, w], [0, -1, w], [1, 0, d], [-1, 0, d]]) {
        const cols = Math.max(1, Math.floor(span / 1.6));
        for (let i = 0; i < cols; i++) {
          const offset = (i - (cols - 1) / 2) * 1.6;
          // ときどき割れて真っ暗な窓にする
          const pane = new THREE.Mesh(windowGeo, Math.random() < 0.3 ? brokenMat : windowMat);
          pane.position.set(
            x + nx * (d / 2 + 0.03) + (nx ? 0 : offset),
            floorY,
            z + nz * (d === span ? w / 2 + 0.03 : d / 2 + 0.03) + (nz ? 0 : offset)
          );
          if (nx) {
            pane.position.x = x + nx * (w / 2 + 0.03);
            pane.position.z = z + offset;
            pane.rotation.y = nx * Math.PI / 2;
          } else {
            pane.position.z = z + nz * (d / 2 + 0.03);
            pane.rotation.y = nz > 0 ? 0 : Math.PI;
          }
          scene.add(pane);
        }
      }
    }
  }

  for (const [x, z, w, d, h] of BUILDINGS) {
    if (Math.hypot(x, z) < OPEN_RADIUS + 3) continue;
    const shade = 0.5 + Math.random() * 0.2;
    addBox(x, 0, z, w, h, d, new THREE.Color().setHSL(0.08, 0.06, shade).getHex());
    windows(x, z, w, d, h);
    // 崩れかけの上部
    addBox(x + w * 0.2, h, z - d * 0.2, w * 0.5, 1.2 + Math.random() * 2, d * 0.5, 0x5f5b56);
  }

  // ---- 転がっている瓦礫。当たり判定はつけず、見た目だけ ----
  for (let i = 0; i < 40; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = OPEN_RADIUS + 2 + Math.random() * (ARENA - OPEN_RADIUS - 6);
    const x = Math.sin(angle) * dist;
    const z = Math.cos(angle) * dist;
    const rubble = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.4 + Math.random() * 0.8, 0),
      mat(0x6a6660, 1)
    );
    rubble.position.set(x, 0.2, z);
    rubble.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    rubble.castShadow = true;
    rubble.receiveShadow = true;
    scene.add(rubble);
  }

  return { scene, colliders, spawns, stairPoints };
}
