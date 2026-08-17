export const WAVE = {
  // 同時に出せる数の上限。ここを超えないよう小分けに湧かせる
  aliveMax: 20,
  // 何秒おきに、何体ずつ湧かすか
  batchInterval: 2.0,
  batchSize: 5,
  // ウェーブとウェーブの間の休み
  breakTime: 6,
  clearCoins: 10,
};

// ボスは確率で出る。ただし「運が悪いと永久に出ない」と困るので、
// 出ないウェーブが続くほど確率が上がり、いずれ必ず出るようにしてある
export const BOSS = {
  // これより前のウェーブには出ない
  fromWave: 8,
  // 前のボスから、最低これだけウェーブを空ける
  minGap: 4,
  // 条件を満たしたウェーブでの、はじめの確率
  baseChance: 0.18,
  // 出なかったウェーブが1つ増えるごとに、これだけ確率が上がる
  ramp: 0.12,
  // 前のボスからこれだけ空いたら、必ず出る
  guaranteeGap: 14,
};

// 出てくるボスの一覧。from はそのボスが出はじめるウェーブ
export const BOSS_TABLE = [
  { id: 'titan', from: 8, rarity: 1.0 },
  { id: 'mother', from: 12, rarity: 1.0 },
];

// このウェーブにボスが出るか。since は前にボスが出てから何ウェーブ経ったか
export function rollBoss(wave, since) {
  if (wave < BOSS.fromWave) return false;
  if (since < BOSS.minGap) return false;
  if (since >= BOSS.guaranteeGap) return true;
  // minGap を超えたぶんだけ確率が上がっていく
  const chance = BOSS.baseChance + BOSS.ramp * (since - BOSS.minGap);
  return Math.random() < Math.min(1, chance);
}

// 出るボスを1体えらぶ
export function pickBoss(wave) {
  const usable = BOSS_TABLE.filter((b) => wave >= b.from);
  if (!usable.length) return null;
  const total = usable.reduce((a, b) => a + b.rarity, 0);
  let roll = Math.random() * total;
  for (const b of usable) {
    roll -= b.rarity;
    if (roll <= 0) return b.id;
  }
  return usable[usable.length - 1].id;
}

// 1ウェーブ5体から、1ウェーブごとに5体ずつ増える。
// ボスの回は、ボス1体＋おともだけにして数を絞る
export function waveCount(wave, boss = false) {
  if (boss) return 1 + 12;
  return 5 * wave;
}

// ボスのHPもウェーブに合わせて増やす。ただし雑魚ほどは伸ばさない
export function bossHpScale(wave) {
  return 1 + 0.35 * Math.max(0, Math.floor((wave - BOSS.fromWave) / 6));
}

// 5ウェーブごとに、ゾンビのHPが元の50%ずつ増える
export function hpScale(wave) {
  return 1 + 0.5 * Math.floor(wave / 5);
}

// 上から順に強くなる並び。from はそのゾンビが出はじめるウェーブ。
// rarity は同じ強さ帯の中での出やすさ（ミュータントはやや少なめ）
export const SPAWN_TABLE = [
  { id: 'normal', from: 1, rarity: 1.0 },
  { id: 'fast', from: 2, rarity: 0.9 },
  { id: 'blue', from: 2, rarity: 1.0 },
  { id: 'silver', from: 3, rarity: 1.0 },
  { id: 'purple', from: 4, rarity: 0.8 },
  { id: 'blueSilver', from: 4, rarity: 1.0 },
  { id: 'swarm', from: 4, rarity: 0.7 },
  { id: 'skeleton', from: 5, rarity: 0.9 },
  { id: 'gold', from: 5, rarity: 1.0 },
  { id: 'skeletonArcher', from: 6, rarity: 0.75 },
  { id: 'blueGold', from: 6, rarity: 1.0 },
  { id: 'mutant', from: 7, rarity: 0.6 },
  { id: 'shrieker', from: 7, rarity: 0.45 },
  { id: 'gamma', from: 8, rarity: 0.5 },
  { id: 'mutantSilver', from: 9, rarity: 0.55 },
  { id: 'mutantGold', from: 11, rarity: 0.5 },
];

// ウェーブが進むほど「よく出る強さ」の狙いが表の下（強い側）へ動く。
// その前後は出るが、離れるほど減るので、進むほど強いゾンビが主力になる
const FOCUS_PER_WAVE = 0.55;

export function pickType(wave) {
  const usable = SPAWN_TABLE.filter((t) => wave >= t.from);
  const focus = Math.min(usable.length - 1, (wave - 1) * FOCUS_PER_WAVE);
  const weights = usable.map((t, i) => t.rarity / (1 + Math.abs(i - focus)));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < usable.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return usable[i].id;
  }
  return usable[usable.length - 1].id;
}
