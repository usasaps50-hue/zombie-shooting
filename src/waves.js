import * as THREE from 'three';
import {
  WAVE, waveCount, pickType, hpScale, rollBoss, pickBoss, bossHpScale,
} from './data/waves.js';
import { ENEMIES } from './data/jobs.js';

// ウェーブの進行役。決まった数を小分けに湧かせて、全部倒したら次へ進む
export class Waves {
  constructor(pool, spawns, { onWaveStart, onWaveClear, onBossSpawn }) {
    this.pool = pool;
    this.spawns = spawns;
    this.onWaveStart = onWaveStart;
    this.onWaveClear = onWaveClear;
    this.onBossSpawn = onBossSpawn;
    this.reset();
  }

  reset() {
    for (const enemy of this.pool) enemy.retire();
    this.wave = 0;
    this.left = 0;
    this.timer = 0;
    // 'break' はウェーブ間の休み。始まるまでのカウントダウンにも使う
    this.state = 'break';
    this.timer = 2.0;
    this.bossPending = false;
    this.bossId = null;
    // 前にボスが出てから何ウェーブ経ったか
    this.sinceBoss = 0;
  }

  // 倒れて消えるまでの数秒は「残り」に数えない。倒した手応えがすぐ出る
  get alive() {
    return this.pool.reduce((n, e) => n + (e.active && e.alive ? 1 : 0), 0);
  }

  // 画面に出す「残り」は、まだ湧いていないぶんと今いるぶんの合計
  get remaining() {
    return this.left + this.alive;
  }

  get total() {
    return this.wave ? waveCount(this.wave) : 0;
  }

  #startWave() {
    this.wave++;
    // ボスが出るかは確率で決める。出ない回が続くほど確率が上がる
    this.bossId = rollBoss(this.wave, this.sinceBoss) ? pickBoss(this.wave) : null;
    this.sinceBoss = this.bossId ? 0 : this.sinceBoss + 1;
    this.left = waveCount(this.wave, !!this.bossId);
    this.state = 'spawning';
    this.timer = 0;
    // ボスの回は、まずボスを1体出してから、おともを湧かせる
    this.bossPending = !!this.bossId;
    this.onWaveStart(this.wave, this.left, this.bossPending);
  }

  // いま出ているボス（HPバーの表示に使う）
  get boss() {
    return this.pool.find((e) => e.active && e.alive && e.def.boss) ?? null;
  }

  #spawnBatch() {
    // ボスは真っ先に、北のトンネルから出す
    if (this.bossPending) {
      const slot = this.pool.find((e) => !e.active);
      if (slot) {
        this.bossPending = false;
        slot.spawnAs(this.bossId, this.spawns[0].clone(), bossHpScale(this.wave));
        this.left--;
        this.onBossSpawn?.(slot);
      }
    }

    let room = WAVE.aliveMax - this.alive;
    let n = Math.min(WAVE.batchSize, room, this.left);
    while (n > 0) {
      const typeId = pickType(this.wave);
      // 群れゾンビは1体ずつではなく、まとまって湧く。
      // 群れは「1回に出す数」の上限を超えてもよい（ばらばらに出ると群れにならない）
      const packSize = ENEMIES[typeId].packSize ?? 1;
      const pack = Math.min(packSize, packSize > 1 ? room : n, this.left);
      const mouth = this.spawns[Math.floor(Math.random() * this.spawns.length)];
      let spawned = 0;
      for (let i = 0; i < pack; i++) {
        const enemy = this.pool.find((e) => !e.active);
        if (!enemy) break;
        // 同じ口から複数出るとき、少しずらして重ならないようにする
        const spread = (Math.random() - 0.5) * (pack > 1 ? 5.5 : 4);
        const along = pack > 1 ? (Math.random() - 0.5) * 3 : 0;
        const spot = new THREE.Vector3(
          mouth.x + (mouth.x ? along : spread),
          0,
          mouth.z + (mouth.z ? along : spread)
        );
        enemy.spawnAs(typeId, spot, hpScale(this.wave));
        this.left--;
        spawned++;
      }
      if (!spawned) break;
      n -= spawned;
      room -= spawned;
      if (room <= 0) break;
    }
  }

  update(dt) {
    this.timer -= dt;

    if (this.state === 'break') {
      if (this.timer <= 0) this.#startWave();
      return;
    }

    if (this.timer <= 0) {
      this.#spawnBatch();
      this.timer = WAVE.batchInterval;
    }

    // 湧かす予定を出し切って、画面のゾンビも全部倒したらクリア
    if (this.left <= 0 && this.alive === 0) {
      this.onWaveClear(this.wave);
      this.state = 'break';
      this.timer = WAVE.breakTime;
    }
  }
}
