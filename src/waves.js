import * as THREE from 'three';
import { WAVE, waveCount, pickType } from './data/waves.js';

// ウェーブの進行役。決まった数を小分けに湧かせて、全部倒したら次へ進む
export class Waves {
  constructor(pool, spawns, { onWaveStart, onWaveClear }) {
    this.pool = pool;
    this.spawns = spawns;
    this.onWaveStart = onWaveStart;
    this.onWaveClear = onWaveClear;
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
    this.left = waveCount(this.wave);
    this.state = 'spawning';
    this.timer = 0;
    this.onWaveStart(this.wave, this.left);
  }

  #spawnBatch() {
    const room = WAVE.aliveMax - this.alive;
    const n = Math.min(WAVE.batchSize, room, this.left);
    for (let i = 0; i < n; i++) {
      const enemy = this.pool.find((e) => !e.active);
      if (!enemy) break;
      const mouth = this.spawns[Math.floor(Math.random() * this.spawns.length)];
      // 同じ口から複数出るとき、少しずらして重ならないようにする
      const spread = (Math.random() - 0.5) * 4;
      const spot = new THREE.Vector3(
        mouth.x + (mouth.x ? 0 : spread),
        0,
        mouth.z + (mouth.z ? 0 : spread)
      );
      enemy.spawnAs(pickType(this.wave), spot);
      this.left--;
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
