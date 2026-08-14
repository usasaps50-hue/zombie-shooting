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

// 1ウェーブ5体から、1ウェーブごとに5体ずつ増える
export function waveCount(wave) {
  return 5 * wave;
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
  { id: 'skeleton', from: 5, rarity: 0.9 },
  { id: 'gold', from: 5, rarity: 1.0 },
  { id: 'skeletonArcher', from: 6, rarity: 0.75 },
  { id: 'blueGold', from: 6, rarity: 1.0 },
  { id: 'mutant', from: 7, rarity: 0.6 },
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
