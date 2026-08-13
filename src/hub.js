import * as THREE from 'three';
import { QUALITY } from './device.js';
import { Avatar } from './avatar.js';
import { canvasTexture, paint } from './textures.js';

// 待機場の広さ。真ん中の広場は何も置かず、建物は外周に並べる
const PLAZA_RADIUS = 11;
const YARD = 30;

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

export function createHub() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xa8c6e0);
  scene.fog = new THREE.Fog(0xa8c6e0, 40, 120);

  scene.add(new THREE.HemisphereLight(0xdcecff, 0x6a6f66, 2.2));
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.6);
  sun.position.set(18, 30, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(QUALITY.shadowMap, QUALITY.shadowMap);
  sun.shadow.camera.left = -YARD;
  sun.shadow.camera.right = YARD;
  sun.shadow.camera.top = YARD;
  sun.shadow.camera.bottom = -YARD;
  sun.shadow.camera.far = 90;
  scene.add(sun);

  const colliders = [];
  const npcs = [];
  const zones = [];

  const mat = (color, rough = 0.85) => new THREE.MeshStandardMaterial({ color, roughness: rough });

  const solid = (mesh, blocking = true) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    if (blocking) {
      mesh.updateMatrixWorld(true);
      colliders.push(new THREE.Box3().setFromObject(mesh));
    }
    return mesh;
  };

  // 芝生と、真ん中の石畳の広場
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(YARD * 2, YARD * 2), mat(0x6f8f55, 1));
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  scene.add(grass);

  const plaza = new THREE.Mesh(new THREE.CircleGeometry(PLAZA_RADIUS, 48), mat(0x9aa2ab, 0.95));
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.02;
  plaza.receiveShadow = true;
  scene.add(plaza);

  const rim = new THREE.Mesh(new THREE.RingGeometry(PLAZA_RADIUS, PLAZA_RADIUS + 0.6, 48), mat(0x7c848d, 0.95));
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.03;
  rim.receiveShadow = true;
  scene.add(rim);

  // 広場から各建物へ伸びる石畳の道
  for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const path = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 12), mat(0x8d959e, 0.95));
    path.rotation.set(-Math.PI / 2, 0, -angle);
    path.position.set(Math.sin(angle) * (PLAZA_RADIUS + 5), 0.015, Math.cos(angle) * (PLAZA_RADIUS + 5));
    path.receiveShadow = true;
    scene.add(path);
  }

  // 店。カウンター越しに店員と話す形にする
  function shop(id, title, subtitle, color, accent, angle, keeper) {
    const dist = PLAZA_RADIUS + 6.5;
    const x = Math.sin(angle) * dist;
    const z = Math.cos(angle) * dist;
    // 建物は広場の中心を向く
    const facing = angle + Math.PI;

    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = facing;

    const w = 7.4, h = 3.4, d = 5;
    // 店員が立つ隙間をあけたいので、建物の前面はカウンターより 1.2m 奥にする
    const back = -d / 2 - 1.2;
    const walls = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
    walls.position.set(0, h / 2, back);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.9, 0.4, d + 1.4), mat(accent, 0.7));
    roof.position.set(0, h + 0.2, back);
    // 屋根の上の三角。ただの箱に見えないように
    const gable = new THREE.Mesh(new THREE.ConeGeometry(w * 0.62, 1.5, 4), mat(accent, 0.7));
    gable.rotation.y = Math.PI / 4;
    gable.position.set(0, h + 1.15, back);

    const counter = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 1.1, 0.7), mat(0x8a6a45, 0.9));
    counter.position.set(0, 0.55, 0.5);
    const top = new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, 0.12, 1.1), mat(0xb08a5c, 0.8));
    top.position.set(0, 1.16, 0.45);

    // ひさし。柱2本で支える。低いと店員の帽子が隠れるので高めに張る
    const awning = new THREE.Mesh(new THREE.BoxGeometry(w * 0.95, 0.16, 2.6), mat(accent, 0.7));
    awning.position.set(0, 3.05, 0.7);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 3.05, 8), mat(0x6d5540, 0.9));
      post.position.set(side * w * 0.44, 1.52, 1.85);
      group.add(post);
    }

    const board = new THREE.Mesh(
      new THREE.BoxGeometry(4.4, 1.6, 0.16),
      [mat(0x2f3a4a), mat(0x2f3a4a), mat(0x2f3a4a), mat(0x2f3a4a),
        new THREE.MeshStandardMaterial({ map: sign(title, subtitle), roughness: 0.9 }), mat(0x2f3a4a)]
    );
    board.position.set(0, 3.95, 0.85);

    group.add(walls, roof, gable, counter, top, awning, board);
    group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(group);

    group.updateMatrixWorld(true);
    // 当たり判定は建物とカウンターだけ。ひさしの下は通れる
    for (const part of [walls, counter]) {
      colliders.push(new THREE.Box3().setFromObject(part));
    }

    // 店員はカウンターの内側の一段高いところに立つ。
    // 床と同じ高さだと、カウンターに隠れて頭しか見えない
    const step = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.7, 1.0), mat(0x9a7550, 0.9));
    step.position.set(0, 0.35, -0.55);
    group.add(step);
    step.castShadow = true;
    step.receiveShadow = true;

    const avatar = new Avatar(keeper.color);
    avatar.setHat(keeper.hat);
    avatar.setItem(keeper.item ?? null);
    const inside = new THREE.Vector3(0, 0, -0.55).applyAxisAngle(new THREE.Vector3(0, 1, 0), facing);
    avatar.root.position.set(x + inside.x, 0.7, z + inside.z);
    // アバターは +Z が正面。facing のぶんだけ回すと広場のほうを向く
    avatar.root.rotation.y = facing;
    scene.add(avatar.root);
    npcs.push({ avatar, name: keeper.name });

    // 話しかける位置はカウンターの手前
    const front = new THREE.Vector3(0, 0, 2.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), facing);
    zones.push({
      id,
      title,
      label: keeper.prompt,
      position: new THREE.Vector3(x + front.x, 0, z + front.z),
    });

    return group;
  }

  shop('shopItem', 'アイテムショップ', 'そうび を えらぶ', 0xd8cdb8, 0xb2543f, -Math.PI / 2, {
    name: 'ハルさん',
    color: 0x4f7d68,
    hat: 'soldier',
    item: 'pistol',
    prompt: 'アイテムを見せてもらう',
  });

  shop('shopJob', 'クラスショップ', 'しょくぎょう を えらぶ', 0xc8d2dd, 0x3f6ab2, Math.PI / 2, {
    name: 'ミナさん',
    color: 0x8a5f9f,
    hat: 'medic',
    item: 'bandage',
    prompt: 'クラスの話を聞く',
  });

  // バトルゲートが北（-Z）なので、レベルアップ所は南（+Z）に置いて重ならないようにする
  shop('levelUp', 'レベルアップ所', 'ただいま せいさくちゅう', 0xc9c2a8, 0x8a7a3f, 0, {
    name: 'ゲンさん',
    color: 0x9f7f4f,
    hat: 'architect',
    item: 'hammer',
    prompt: 'レベルアップの話を聞く',
  });

  // バトルゲート。くぐるのではなく、前に立って決定する
  const gate = new THREE.Group();
  gate.position.set(0, 0, -(PLAZA_RADIUS + 6.5));
  const gateMat = mat(0x4a5260, 0.7);
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 5.2, 1.1), gateMat);
    pillar.position.set(side * 2.8, 2.6, 0);
    gate.add(pillar);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(7.2, 1.0, 1.3), gateMat);
  lintel.position.y = 5.4;
  const portal = new THREE.Mesh(
    new THREE.PlaneGeometry(4.5, 4.6),
    new THREE.MeshBasicMaterial({ color: 0xd05656, transparent: true, opacity: 0.42, side: THREE.DoubleSide })
  );
  portal.position.y = 2.6;
  const gateBoard = new THREE.Mesh(
    new THREE.BoxGeometry(4.6, 1.5, 0.16),
    [gateMat, gateMat, gateMat, gateMat,
      new THREE.MeshStandardMaterial({ map: sign('バトルへ', 'ゾンビ の まちへ', '#5a2a2a'), roughness: 0.9 }), gateMat]
  );
  gateBoard.position.set(0, 6.6, 0.2);
  gate.add(lintel, portal, gateBoard);
  gate.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(gate);
  gate.updateMatrixWorld(true);
  for (const pillar of gate.children.filter((c) => c.geometry?.type === 'BoxGeometry' && c.position.y < 4)) {
    colliders.push(new THREE.Box3().setFromObject(pillar));
  }
  zones.push({
    id: 'battle',
    title: 'バトルゲート',
    label: 'バトルに行く',
    position: new THREE.Vector3(0, 0, -(PLAZA_RADIUS + 4.0)),
  });

  // 外の飾り。木と街灯を、道と広場を避けて並べる
  const treeMat = mat(0x4d7a3a, 1);
  const trunkMat = mat(0x6b4a2f, 1);
  for (let i = 0; i < 26; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 20 + Math.random() * 12;
    const x = Math.sin(angle) * dist;
    const z = Math.cos(angle) * dist;
    // 道の延長線上は空けておく
    if (Math.abs(x) < 4 || Math.abs(z) < 4) continue;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 1.8, 7), trunkMat);
    trunk.position.set(x, 0.9, z);
    const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5 + Math.random() * 0.6, 0), treeMat);
    leaves.position.set(x, 2.7, z);
    solid(trunk);
    leaves.castShadow = true;
    scene.add(leaves);
  }

  for (const angle of [Math.PI / 4, Math.PI * 0.75, -Math.PI / 4, -Math.PI * 0.75]) {
    const x = Math.sin(angle) * (PLAZA_RADIUS + 2.2);
    const z = Math.cos(angle) * (PLAZA_RADIUS + 2.2);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 3.6, 8), mat(0x3f4650, 0.6));
    pole.position.set(x, 1.8, z);
    solid(pole);
    const lamp = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), new THREE.MeshBasicMaterial({ color: 0xffe9b0 }));
    lamp.position.set(x, 3.75, z);
    scene.add(lamp);
  }

  // 外周の柵。落ちていかないように囲う
  for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const fence = new THREE.Mesh(
      new THREE.BoxGeometry(dx ? 0.6 : YARD * 2, 2.2, dz ? 0.6 : YARD * 2),
      mat(0x5d6b52, 0.95)
    );
    fence.position.set(dx * YARD, 1.1, dz * YARD);
    solid(fence);
  }

  return { scene, colliders, npcs, zones, spawn: HUB_SPAWN.clone() };
}
