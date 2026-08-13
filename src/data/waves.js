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

// 1→15体、2→30体、10→200体になる式
export function waveCount(wave) {
  return Math.round(15 * wave + 0.7 * (wave - 1) * (wave - 2));
}

// 上から順に強くなる並び。from はそのゾンビが出はじめるウェーブ。
// rarity は同じ強さ帯の中での出やすさ（ミュータントはやや少なめ）
export const SPAWN_TABLE = [
  { id: 'normal', from: 1, rarity: 1.0 },
  { id: 'blue', from: 2, rarity: 1.0 },
  { id: 'silver', from: 3, rarity: 1.0 },
  { id: 'blueSilver', from: 4, rarity: 1.0 },
  { id: 'gold', from: 5, rarity: 1.0 },
  { id: 'blueGold', from: 6, rarity: 1.0 },
  { id: 'mutant', from: 7, rarity: 0.6 },
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
