import * as THREE from 'three';
import { QUALITY } from './device.js';
import { makeAvatar } from './avatar.js';
import { canvasTexture, paint } from './textures.js';
import { hasScenery, makeScenery, scenerySize, ROAD_TILE } from './gltfmodel.js';

// 待機場。バトルに行く前にいる、安全なキャンプ。
// 生き残りが、街の交差点をコンテナでふさいで住みついた場所、という作り。
//
// 見えているものは、外から持ってきた素材だけで組んである。
// 手で作るのは「見えない当たり判定」「地面」「日本語の看板」だけ。
// 素材が読めなかったときも、看板と話しかける場所は残るので遊べなくならない。

// 真ん中の広場の広さ。ここには何も置かない
const PLAZA_RADIUS = 11;
// キャンプの広さ。この外には出られない
const YARD = 27.5;
// お店の家の正面が来る場所（真ん中からの距離）
const SHOP_FRONT = 15.4;
// バリケード（コンテナや車の壁）を並べる輪の大きさ
const BARRICADE = 25.2;

// 話しかけられる距離
export const TALK_RANGE = 3.2;

// 広場の真ん中より少し南。ここから北のバトルゲートが正面に見える
export const HUB_SPAWN = new THREE.Vector3(0, 0, 6);

function sign(text, sub, color = '#2f3a4a') {
  const { canvas, ctx } = paint(256);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = 'rgba(255,255,255,.1)';
  ctx.fillRect(8, 8, 240, 240);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  let size = 46;
  do {
    ctx.font = `bold ${size}px system-ui, sans-serif`;
    size -= 2;
  } while (ctx.measureText(text).width > 216 && size > 16);
  ctx.fillText(text, 128, 118);

  ctx.fillStyle = '#c9d6e4';
  ctx.font = '24px system-ui, sans-serif';
  ctx.fillText(sub, 128, 162);

  return canvasTexture(canvas);
}

// 文字を出す板。素材には日本語が入っていないので、ここだけ手で作る。
// +Z の面に文字が出るので、置くときは見せたいほうへ +Z を向ける
function signBoard(text, sub, color, width = 3.4) {
  const frame = new THREE.MeshStandardMaterial({ color: 0x2b323b, roughness: 0.9 });
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(width, width * 0.36, 0.14),
    [frame, frame, frame, frame,
      new THREE.MeshStandardMaterial({ map: sign(text, sub, color), roughness: 0.9 }), frame]
  );
  board.castShadow = true;
  board.receiveShadow = true;
  return board;
}

export function createHub() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xa8c6e0);
  scene.fog = new THREE.Fog(0xa8c6e0, 42, 130);

  scene.add(new THREE.HemisphereLight(0xdcecff, 0x6a6f66, 2.2));
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.6);
  sun.position.set(18, 30, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(QUALITY.shadowMap, QUALITY.shadowMap);
  sun.shadow.camera.left = -YARD - 6;
  sun.shadow.camera.right = YARD + 6;
  sun.shadow.camera.top = YARD + 6;
  sun.shadow.camera.bottom = -YARD - 6;
  sun.shadow.camera.far = 90;
  // 丸みのあるモデルに、自分の影が斑点のように落ちるのを防ぐ
  sun.shadow.normalBias = 0.06;
  sun.shadow.bias = -0.0006;
  scene.add(sun);

  const colliders = [];
  const npcs = [];
  const zones = [];
  // すでに何か置いた場所。ここに重ねて置かない
  const taken = [];

  // 毎回おなじキャンプになるよう、決まった順番の乱数を使う
  const rand = (() => {
    let seed = 76310924;
    return () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
  })();

  const box3 = new THREE.Box3();

  const claim = (minX, maxX, minZ, maxZ) => taken.push({ minX, maxX, minZ, maxZ });

  // その四角が、すでに置いたものと重なっていないか
  const isFree = (minX, maxX, minZ, maxZ, margin) => !taken.some((t) =>
    minX - margin < t.maxX && maxX + margin > t.minX
    && minZ - margin < t.maxZ && maxZ + margin > t.minZ);

  // 素材を1つ置く。重なる場所なら置かずに false を返す
  const place = (object, x, z, yaw, {
    solid = false, margin = 0.5, reserve = true, limit = YARD,
  } = {}) => {
    if (!object) return false;
    object.position.set(x, 0, z);
    object.rotation.y = yaw;
    object.updateMatrixWorld(true);
    box3.setFromObject(object);
    const { min, max } = box3;
    if (min.x < -limit || max.x > limit || min.z < -limit || max.z > limit) return false;
    if (reserve && !isFree(min.x, max.x, min.z, max.z, margin)) return false;
    object.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
    });
    scene.add(object);
    if (reserve) claim(min.x, max.x, min.z, max.z);
    if (solid) colliders.push(box3.clone());
    return true;
  };

  // 見えない当たり判定だけを置く（キャンプの外へ出られないようにする壁）
  const addHiddenBox = (x, y, z, w, h, d) => {
    colliders.push(new THREE.Box3(
      new THREE.Vector3(x - w / 2, y, z - d / 2),
      new THREE.Vector3(x + w / 2, y + h, z + d / 2)
    ));
  };

  // 角度と「真ん中からの距離」で場所を出す。
  // side は、その方向を向いたときの横ずれ（右が＋）
  const spot = (angle, r, side = 0) => new THREE.Vector3(
    Math.sin(angle) * r + Math.cos(angle) * side, 0,
    Math.cos(angle) * r - Math.sin(angle) * side
  );

  // ---- 地面 ----
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(YARD * 4, YARD * 4),
    new THREE.MeshStandardMaterial({ color: 0x6d7551, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  // 道路タイルと同じ高さだと、ちらついてまだらに見える。少しだけ下げる
  ground.position.y = -0.04;
  ground.receiveShadow = true;
  scene.add(ground);

  // ---- 道。十字の交差点をタイルで敷いて、そのまわりに住んでいる形にする ----
  if (hasScenery('road4Way') && hasScenery('roadStraight')) {
    const cross = makeScenery('road4Way');
    cross.receiveShadow = true;
    cross.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
    scene.add(cross);
    claim(-ROAD_TILE / 2, ROAD_TILE / 2, -ROAD_TILE / 2, ROAD_TILE / 2);

    for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const tile = makeScenery('roadStraight');
      tile.position.set(dx * ROAD_TILE, 0, dz * ROAD_TILE);
      tile.rotation.y = dx ? Math.PI / 2 : 0;
      tile.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
      scene.add(tile);
      claim(dx * ROAD_TILE - ROAD_TILE / 2, dx * ROAD_TILE + ROAD_TILE / 2,
        dz * ROAD_TILE - ROAD_TILE / 2, dz * ROAD_TILE + ROAD_TILE / 2);
    }
  } else {
    // 道路タイルが読めなかったとき用の、ただの広場
    const plaza = new THREE.Mesh(
      new THREE.CircleGeometry(PLAZA_RADIUS, 40),
      new THREE.MeshStandardMaterial({ color: 0x9aa2ab, roughness: 0.95 })
    );
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.y = 0.02;
    plaza.receiveShadow = true;
    scene.add(plaza);
    claim(-PLAZA_RADIUS, PLAZA_RADIUS, -PLAZA_RADIUS, PLAZA_RADIUS);
  }

  // ---- お店 ----
  // 家は素材そのまま。前にバリケードを並べてカウンターにして、
  // その内側に店員が立つ。看板だけは日本語なので手作り
  function shop(id, title, subtitle, angle, houseId, keeper) {
    // 建物と店員は、広場のほう（角度＋半回転）を向く
    const facing = angle + Math.PI;
    const size = hasScenery(houseId) ? scenerySize(houseId) : null;

    if (size) {
      const house = makeScenery(houseId);
      const at = spot(angle, SHOP_FRONT + size.z / 2);
      place(house, at.x, at.z, facing, { solid: true, margin: 0 });

      // 店の看板。家の正面の、扉より上に貼る。
      // はみ出さないよう、家の横幅より少しせまくする
      const board = signBoard(title, subtitle, '#2f3a4a', Math.min(3.4, size.x - 0.6));
      const front = spot(angle, SHOP_FRONT - 0.12);
      board.position.set(front.x, 2.5, front.z);
      board.rotation.y = facing;
      scene.add(board);
    }

    // カウンター。道路用のバリケードを3つ並べる
    for (const side of [-1.65, 0, 1.65]) {
      const at = spot(angle, SHOP_FRONT - 2.0, side);
      const bar = makeScenery('barrier') ?? makeScenery('plasticBarrier');
      if (!bar) break;
      place(bar, at.x, at.z, facing, { solid: true, margin: 0, reserve: false });
    }

    // 店員。カウンターの内側に立って、広場のほうを向く
    const avatar = makeAvatar(keeper.color, keeper.variant);
    avatar.setHat(keeper.hat);
    avatar.setItem(keeper.item ?? null);
    const stand = spot(angle, SHOP_FRONT - 0.9);
    avatar.root.position.set(stand.x, 0, stand.z);
    // アバターは +Z が正面。facing のぶんだけ回すと広場のほうを向く
    avatar.root.rotation.y = facing;
    scene.add(avatar.root);
    npcs.push({ avatar, name: keeper.name });

    // 店のまわりは、あとから小物を置かないように場所を取っておく
    const center = spot(angle, SHOP_FRONT + 1);
    claim(center.x - 5, center.x + 5, center.z - 5, center.z + 5);

    // 話しかける位置はカウンターの手前
    const front = spot(angle, SHOP_FRONT - 3.6);
    zones.push({ id, title, label: keeper.prompt, position: front });
  }

  shop('shopItem', 'アイテムショップ', 'そうび を えらぶ', -Math.PI / 2, 'block1S', {
    name: 'ハルさん',
    color: 0x4f7d68,
    hat: 'soldier',
    item: 'pistol',
    prompt: 'アイテムを見せてもらう',
  });

  shop('shopJob', 'クラスショップ', 'しょくぎょう を えらぶ', Math.PI / 2, 'block2S', {
    name: 'ミナさん',
    color: 0x8a5f9f,
    hat: 'medic',
    item: 'bandage',
    prompt: 'クラスの話を聞く',
  });

  // バトルゲートが北（-Z）なので、レベルアップ所は南（+Z）に置いて重ならないようにする
  shop('levelUp', 'レベルアップ所', 'ただいま せいさくちゅう', 0, 'block3S', {
    name: 'ゲンさん',
    color: 0x9f7f4f,
    hat: 'architect',
    item: 'hammer',
    prompt: 'レベルアップの話を聞く',
  });

  // スキンショップ。アイテムショップの反対どなりに置く
  shop('shopSkin', 'スキンショップ', 'みため を かえる', Math.PI * 0.25, 'block4', {
    name: 'ノアさん',
    color: 0xc86f9f,
    hat: 'criminal',
    item: null,
    prompt: 'スキンを見せてもらう',
  });

  // ---- バトルゲート（北）----
  // コンテナで通りをふさぎ、あいだの赤い光をくぐるとバトルへ行く。
  // くぐるのではなく、前に立って決定する
  const GATE_Z = -17.5;
  for (const side of [-1, 1]) {
    const wall = makeScenery('container') ?? makeScenery('containerGreen');
    if (wall) place(wall, side * 5.9, GATE_Z, 0, { solid: true, margin: 0, reserve: false });
    // コンテナの上にもう1段。壁らしく高くする
    const stack = makeScenery(side < 0 ? 'containerGreen' : 'container');
    if (stack) {
      stack.position.set(side * 5.9, 2.62, GATE_Z);
      stack.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      scene.add(stack);
    }
  }
  claim(-11, 11, GATE_Z - 3, GATE_Z + 3);

  // 通り道の赤い光
  const portal = new THREE.Mesh(
    new THREE.PlaneGeometry(5.6, 3.4),
    new THREE.MeshBasicMaterial({ color: 0xd05656, transparent: true, opacity: 0.42, side: THREE.DoubleSide })
  );
  portal.position.set(0, 1.7, GATE_Z);
  scene.add(portal);

  // 道にせり出す標識。ゲートの手前にまたがせて、遠くからでも分かるようにする。
  // 素材は「柱が右はし、板が左へ伸びる」形なので、柱を道の右わきに置く
  const gantry = makeScenery('townSign');
  if (gantry) {
    gantry.position.set(4.6, 0, GATE_Z + 3.7);
    gantry.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(gantry);
  }
  // 標識の板に、日本語の看板をぶら下げる
  const gateBoard = signBoard('バトルへ', 'ゾンビ の まちへ', '#5a2a2a', 4.2);
  gateBoard.position.set(1.1, 4.3, GATE_Z + 4.6);
  scene.add(gateBoard);

  // ゲートの前の道しるべ。コーンとバリケードを少し散らす
  for (const [x, z] of [[-3.4, GATE_Z + 3.6], [3.4, GATE_Z + 3.6], [-2.2, GATE_Z + 5.4], [2.2, GATE_Z + 5.4]]) {
    const cone = makeScenery('cone');
    if (cone) place(cone, x, z, rand() * Math.PI, { solid: false, margin: 0, reserve: false });
  }

  zones.push({
    id: 'battle',
    title: 'バトルゲート',
    label: 'バトルに行く',
    position: new THREE.Vector3(0, 0, -(PLAZA_RADIUS + 4.0)),
  });

  // ---- あやしい端末（北西）----
  // 広場から振り向いただけで見えるように、光る柱を立てておく
  const secretAngle = -Math.PI * 0.75;
  const secretPos = spot(secretAngle, PLAZA_RADIUS + 4.5);
  const secretFacing = secretAngle + Math.PI;

  // うしろの壁がわりのコンテナ。端末が空き地に浮かないように、背にする
  const shed = makeScenery('containerGreen');
  if (shed) {
    const back = spot(secretAngle, PLAZA_RADIUS + 8.6);
    place(shed, back.x, back.z, secretFacing, { solid: true, margin: 0, reserve: false });
  }
  // 台になるパレットと木箱、その上のラジオ。これが「端末」
  const pallet = makeScenery('pallet');
  if (pallet) place(pallet, secretPos.x, secretPos.z, secretFacing, { solid: false, margin: 0, reserve: false });
  const crateId = ['chestSpecial', 'chest'].find(hasScenery);
  let crateTop = scenerySize('pallet')?.y ?? 0;
  if (crateId) {
    const crate = makeScenery(crateId);
    crate.position.set(secretPos.x, crateTop, secretPos.z);
    crate.rotation.y = secretFacing;
    crate.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(crate);
    crateTop += scenerySize(crateId).y;
  }
  const radio = makeScenery('radio');
  if (radio) {
    radio.position.set(secretPos.x, crateTop, secretPos.z);
    radio.rotation.y = secretFacing;
    radio.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(radio);
  }

  // 遠くからでも見つかるように、光る柱と看板を立てる。
  // 光るものは素材にないので、ここだけ手で作る
  const beaconPos = spot(secretAngle, PLAZA_RADIUS + 4.5, -2.8);
  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.22, 7.5, 8),
    new THREE.MeshStandardMaterial({ color: 0x3a424c, roughness: 0.6 })
  );
  mast.position.set(beaconPos.x, 3.75, beaconPos.z);
  mast.castShadow = true;
  const beaconGlow = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 6.4, 10, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x6bff9a, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide,
    })
  );
  beaconGlow.position.set(beaconPos.x, 4.2, beaconPos.z);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0x6bff9a })
  );
  beacon.position.set(beaconPos.x, 7.7, beaconPos.z);
  const ringLight = new THREE.Mesh(
    new THREE.RingGeometry(2.5, 2.9, 28),
    new THREE.MeshBasicMaterial({
      color: 0x6bff9a, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide,
    })
  );
  ringLight.rotation.x = -Math.PI / 2;
  ringLight.position.set(secretPos.x, 0.06, secretPos.z);
  const secretBoard = signBoard('？？？', 'あやしい たんまつ', '#16301f', 3.2);
  secretBoard.position.set(beaconPos.x, 5.4, beaconPos.z);
  secretBoard.rotation.y = secretFacing;
  scene.add(mast, beaconGlow, beacon, ringLight, secretBoard);
  claim(secretPos.x - 5, secretPos.x + 5, secretPos.z - 5, secretPos.z + 5);

  // 話しかける位置は、端末の広場側の手前
  zones.push({
    id: 'secret',
    title: 'あやしい端末',
    label: 'あやしい端末をしらべる',
    position: spot(secretAngle, PLAZA_RADIUS + 2.1),
  });

  // ---- テント。生き残りが寝泊まりしている場所 ----
  // たき火より先に置く。あとから置くと、たき火の場所とぶつかって消えてしまう
  for (const [angle, r, side] of [
    [Math.PI * 0.75, 20, 6], [Math.PI * 0.75, 20, -6],
    [Math.PI * 0.25, 18, 0], [-Math.PI * 0.25, 17, 5],
  ]) {
    const at = spot(angle, r, side);
    const tent = makeScenery('tent');
    if (!tent) break;
    if (!place(tent, at.x, at.z, angle + Math.PI, { solid: true, margin: 0.8 })) continue;
    // テントのわきの荷物
    for (const id of ['backpack', 'gasCan', 'firstAid', 'waterBottle']) {
      const prop = makeScenery(id);
      if (prop) {
        place(prop, at.x + (rand() - 0.5) * 5, at.z + (rand() - 0.5) * 5, rand() * Math.PI * 2,
          { solid: false, margin: 0.4 });
      }
    }
  }

  // ---- たき火。北東の広場ぎわ。みんなが集まる場所 ----
  const camp = spot(Math.PI * 0.75, PLAZA_RADIUS + 3.2);
  const fire = makeScenery('bonfire');
  if (fire) place(fire, camp.x, camp.z, 0, { solid: false, margin: 0, reserve: false });
  // たき火のあかり
  const fireLight = new THREE.PointLight(0xffa24a, 14, 12, 2);
  fireLight.position.set(camp.x, 1.1, camp.z);
  scene.add(fireLight);
  // まわりに丸太のいす
  for (let i = 0; i < 4; i++) {
    const a = Math.PI * 0.75 + i * (Math.PI / 2) + 0.4;
    const log = makeScenery('woodLog');
    if (log) {
      place(log, camp.x + Math.sin(a) * 2.4, camp.z + Math.cos(a) * 2.4, a,
        { solid: false, margin: 0, reserve: false });
    }
  }
  const pot = makeScenery('pot');
  if (pot) place(pot, camp.x + 1.5, camp.z - 1.2, 0.6, { solid: false, margin: 0, reserve: false });
  const propane = makeScenery('propaneTank');
  if (propane) place(propane, camp.x - 1.9, camp.z - 1.6, 0.4, { solid: false, margin: 0, reserve: false });
  claim(camp.x - 3.2, camp.x + 3.2, camp.z - 3.2, camp.z + 3.2);

  // 給水塔。キャンプの目印になる
  if (hasScenery('waterTower')) {
    const at = spot(-Math.PI * 0.25, 20);
    place(makeScenery('waterTower'), at.x, at.z, 0.4, { solid: true, margin: 0.6 });
  }

  // ---- 街灯。広場のまわりに立てる ----
  for (const angle of [Math.PI * 0.25, Math.PI * 0.75, -Math.PI * 0.25, -Math.PI * 0.75]) {
    const at = spot(angle, PLAZA_RADIUS - 1.5);
    const lamp = makeScenery('kitLamp') ?? makeScenery('streetlight');
    // 端末の柱と近すぎるところは、街灯を立てない
    if (lamp && Math.hypot(at.x - beaconPos.x, at.z - beaconPos.z) > 6) {
      place(lamp, at.x, at.z, angle, { solid: false, margin: 0.4, reserve: false });
    }
  }

  // ---- バリケード。キャンプをぐるりと囲む壁 ----
  // コンテナ・乗り捨てられた車・柵を、輪になるように並べる
  const wallIds = ['container', 'containerGreen', 'carTruck', 'carPickupArmored', 'carSports', 'barrier']
    .filter(hasScenery);
  if (wallIds.length) {
    for (let i = 0; i < 30; i++) {
      const angle = (i / 30) * Math.PI * 2 + 0.15;
      const at = spot(angle, BARRICADE - rand() * 1.2);
      const id = wallIds[i % wallIds.length];
      // 出入り口のぶん、北の通りだけは空けておく
      if (Math.abs(at.x) < 5 && at.z < 0) continue;
      place(makeScenery(id), at.x, at.z, angle + Math.PI / 2 + (rand() - 0.5) * 0.2,
        { solid: true, margin: 0.4, limit: YARD + 2 });
    }
  }

  // ---- 外の街。バリケードの向こうに家を並べて、街の中にいるように見せる ----
  const outerIds = ['block1L', 'block2L', 'block3B', 'block4', 'block1S', 'block2S', 'block3S', 'house1', 'house2']
    .filter(hasScenery);
  if (outerIds.length) {
    for (let i = 0; i < 44; i++) {
      const angle = (i / 44) * Math.PI * 2;
      const id = outerIds[Math.floor(rand() * outerIds.length)];
      const size = scenerySize(id);
      const at = spot(angle, YARD + 4.5 + size.z / 2 + rand() * 2);
      place(makeScenery(id), at.x, at.z, angle + Math.PI, { solid: false, margin: 0.6, limit: YARD + 22 });
    }
  }

  // ---- 散らばった小物。当たり判定はつけない ----
  const debrisIds = ['trashcan', 'barrel', 'propaneTank', 'chest', 'pallet', 'tyres', 'cinder', 'cone', 'pipes', 'trash', 'waterBottle', 'torchFire']
    .filter(hasScenery);
  if (debrisIds.length) {
    for (let i = 0; i < 70; i++) {
      const a = rand() * Math.PI * 2;
      const d = PLAZA_RADIUS - 3 + rand() * (BARRICADE - PLAZA_RADIUS);
      place(makeScenery(debrisIds[Math.floor(rand() * debrisIds.length)]),
        Math.sin(a) * d, Math.cos(a) * d, rand() * Math.PI * 2, { solid: false, margin: 0.6 });
    }
  }

  // ---- 姿見（すがたみ）。いま着ているスキンが立っている台 ----
  // ゲームは一人称なので、自分の姿は自分から見えない。
  // ここに立たせておけば、着がえた結果をその場で確かめられる
  const mirrorAngle = Math.PI * 0.25 - 0.42;
  const mirrorPos = spot(mirrorAngle, PLAZA_RADIUS + 1.6);
  const mirrorFacing = mirrorAngle + Math.PI;
  // 台。パレットを2枚重ねる
  let standTop = 0;
  for (let i = 0; i < 2; i++) {
    const pad = makeScenery('pallet');
    if (!pad) break;
    pad.position.set(mirrorPos.x, standTop, mirrorPos.z);
    pad.rotation.y = mirrorFacing;
    pad.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(pad);
    standTop += scenerySize('pallet').y;
  }
  // 足元の光る輪。遠くからでも「ここに何かある」と分かる
  const mirrorRing = new THREE.Mesh(
    new THREE.RingGeometry(1.5, 1.8, 24),
    new THREE.MeshBasicMaterial({
      color: 0x8fd0ff, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide,
    })
  );
  mirrorRing.rotation.x = -Math.PI / 2;
  mirrorRing.position.set(mirrorPos.x, 0.06, mirrorPos.z);
  const mirrorBoard = signBoard('いまのすがた', 'きがえた すがたを みる', '#20344a', 2.8);
  mirrorBoard.position.set(mirrorPos.x, 3.2, mirrorPos.z);
  mirrorBoard.rotation.y = mirrorFacing;
  scene.add(mirrorRing, mirrorBoard);
  claim(mirrorPos.x - 3, mirrorPos.x + 3, mirrorPos.z - 3, mirrorPos.z + 3);

  // 台の上に立つ人形。着がえるたびに作り直す
  let mannequin = null;
  const setSkin = (skin) => {
    if (mannequin) {
      scene.remove(mannequin.root);
      mannequin.dispose?.();
      mannequin = null;
    }
    mannequin = makeAvatar(0x5f7f9f, 'human', { skin });
    mannequin.root.position.set(mirrorPos.x, standTop, mirrorPos.z);
    mannequin.root.rotation.y = mirrorFacing;
    scene.add(mannequin.root);
  };
  const updateMannequin = (dt, time) => {
    mannequin?.update(dt, { anim: { name: 'wave', t: time }, speed: 0, pitch: 0 });
  };

  // ---- 外周。見えない壁で、キャンプの外へ出られないようにする ----
  for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    addHiddenBox(dx * YARD, 0, dz * YARD, dx ? 1.2 : YARD * 2 + 2, 8, dz ? 1.2 : YARD * 2 + 2);
  }

  return { scene, colliders, npcs, zones, setSkin, updateMannequin, spawn: HUB_SPAWN.clone() };
}
