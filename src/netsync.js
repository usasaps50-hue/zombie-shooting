import * as THREE from 'three';
import { BUILDS } from './data/builds.js';
import { createStructure } from './structures.js';

// 親が送る「世界のようす」を作るところと、子がそれを取り込むところ。
// ゾンビ・建物・ウェーブの3つをまとめて1通にして、通信の回数を減らしている。

// 番号でやり取りするので、並び順を変えると相手と食い違う。増やすときは末尾に足す
const BUILD_IDS = Object.keys(BUILDS);

const r2 = (n) => Math.round(n * 100) / 100;

// 親：いまの世界をまとめる。nextKey は建物につける通し番号を返すために使う
export function packWorld(enemies, structures, waves, nextKey) {
  let key = nextKey;
  const e = [];
  enemies.forEach((enemy, i) => {
    if (enemy.active) e.push(enemy.netPack(i));
  });

  const s = [];
  for (const o of structures) {
    if (!o.alive) continue;
    o.netKey ??= ++key;
    s.push([
      o.netKey,
      BUILD_IDS.indexOf(o.def.id),
      r2(o.root.position.x), r2(o.root.position.y), r2(o.root.position.z),
      r2(o.root.rotation.y),
      Math.round(o.hp),
    ]);
  }

  const msg = {
    w: [
      waves.wave,
      waves.remaining,
      waves.total,
      waves.state === 'break' ? 0 : 1,
      r2(Math.max(0, waves.timer)),
    ],
    e,
    s,
  };
  return { msg, nextKey: key };
}

// 子：届いたゾンビの一覧に自分の画面を合わせる。
// 送られてこなかった個体は、もう居ないものとして隠す
export function applyEnemies(rows, enemies) {
  const seen = new Set();
  for (const row of rows) {
    const enemy = enemies[row[0]];
    if (!enemy) continue;
    enemy.netApply(row);
    seen.add(row[0]);
  }
  enemies.forEach((enemy, i) => {
    if (!seen.has(i)) enemy.netRetire();
  });
}

// 子：届いた建物の一覧に自分の画面を合わせる。
// 無い建物は建て、消えた建物は片づける
export function applyStructures(rows, { scene, builder }) {
  const seen = new Set();
  for (const [key, typeIdx, x, y, z, yaw, hp] of rows) {
    seen.add(key);
    let s = builder.structures.find((o) => o.netKey === key);
    if (!s) {
      const typeId = BUILD_IDS[typeIdx];
      if (!typeId) continue;
      s = createStructure(typeId, new THREE.Vector3(x, y, z), yaw);
      s.netKey = key;
      scene.add(s.root);
      s.refreshBox();
      builder.structures.push(s);
    }
    s.setHp(hp);
  }
  for (let i = builder.structures.length - 1; i >= 0; i--) {
    if (!seen.has(builder.structures[i].netKey)) builder.remove(builder.structures[i]);
  }
}

// 子：ウェーブの数字を取り出す
export function unpackWaves(row) {
  const [wave, remaining, total, spawning, timer] = row;
  return { wave, remaining, total, timer, state: spawning ? 'spawning' : 'break' };
}
