export const JOBS = {
  soldier: {
    id: 'soldier',
    name: '一般兵',
    desc: '標準的なHPと移動速度。',
    hp: 100,
    speedScale: 1.0,
    bandages: 0,
    bandagesPerWave: 0,
    canRevive: false,
    color: 0x5f7f9f,
  },
  medic: {
    id: 'medic',
    name: '衛生兵',
    desc: '包帯を3つ所持（毎ウェーブ+1）。倒れた味方を3秒長押しで蘇生。移動はやや遅い。',
    hp: 100,
    speedScale: 0.9,
    bandages: 3,
    bandagesPerWave: 1,
    canRevive: true,
    color: 0x9f5f5f,
  },
  architect: {
    id: 'architect',
    name: '建築士',
    desc: 'ハンマーで壁とタレットを建てられる。壁は仲間だけすり抜けられる。移動はやや遅い。',
    hp: 100,
    speedScale: 0.95,
    bandages: 0,
    bandagesPerWave: 0,
    canRevive: false,
    color: 0x9f8a5f,
    // レンガと鉄はまだ入手手段がないので、動作確認用に最初から配る
    materials: { wood: 100, brick: 60, iron: 40 },
  },
};

export const PLAYER = {
  reviveInvulnTime: 3.0,
  reviveHp: 50,
  hitInvulnTime: 0.6,
  // 被弾したときの、画面の赤みとのけぞりモーションの長さ
  hurtTime: 0.5,
};

// drop は [最小, 最大]。倒したときにこの範囲で素材を落とす
const NORMAL_ZOMBIE = {
  id: 'normal',
  name: '通常ゾンビ',
  model: 'zombie',
  skin: 'green',
  armor: null,
  hp: 75,
  height: 1.8,
  sight: 14,
  walkSpeed: 1.1,
  chaseSpeed: 2.7,
  damage: 10,
  reach: 2.0,
  attackCooldown: 1.2,
  structureDamage: 20,
  breaksDrones: false,
  drop: { wood: [4, 10] },
};

// 肌が青いゾンビ。通常との違いは索敵範囲が1.8倍という点だけ
const BLUE_ZOMBIE = {
  ...NORMAL_ZOMBIE,
  id: 'blue',
  name: '青ゾンビ',
  skin: 'blue',
  sight: NORMAL_ZOMBIE.sight * 1.8,
  drop: { wood: [10, 10], brick: [5, 5] },
};

// 巨大なミュータント。地面を叩き割り、瀕死になると跳んでくる
const MUTANT = {
  ...NORMAL_ZOMBIE,
  id: 'mutant',
  name: 'ミュータントゾンビ',
  model: 'mutant',
  hp: 300,
  height: 2.6,
  sight: 18,
  walkSpeed: 1.0,
  chaseSpeed: 2.4,
  damage: 20,
  reach: 3.0,
  attackCooldown: 1.6,
  structureDamage: 40,
  breaksDrones: true,
  droneDamage: 20,
  crackRadius: 2.6,
  // HPがこの割合を下回ると、密集地点へ一度だけ大ジャンプする
  slamAt: 0.2,
  slamDamage: 50,
  slamRadius: 5.0,
  slamRange: 26,
  slamTime: 1.2,
  slamHeight: 7,
  drop: { brick: [30, 30], iron: [50, 50] },
};

// 装甲を着るとHPが増え、落とす素材も増える
const ARMOR_BONUS = {
  silver: { hp: 50, drop: { brick: [5, 5] } },
  gold: { hp: 100, drop: { brick: [15, 15], iron: [4, 10] } },
};

function mergeDrop(base, extra) {
  const drop = {};
  for (const id of new Set([...Object.keys(base), ...Object.keys(extra)])) {
    const [aMin, aMax] = base[id] ?? [0, 0];
    const [bMin, bMax] = extra[id] ?? [0, 0];
    drop[id] = [aMin + bMin, aMax + bMax];
  }
  return drop;
}

function armored(base, armorId, id, name) {
  const bonus = ARMOR_BONUS[armorId];
  return {
    ...base,
    id,
    name,
    armor: armorId,
    hp: base.hp + bonus.hp,
    drop: mergeDrop(base.drop, bonus.drop),
  };
}

export const ENEMIES = {
  normal: NORMAL_ZOMBIE,
  blue: BLUE_ZOMBIE,
  silver: armored(NORMAL_ZOMBIE, 'silver', 'silver', '銀の装甲ゾンビ'),
  gold: armored(NORMAL_ZOMBIE, 'gold', 'gold', '金の装甲ゾンビ'),
  blueSilver: armored(BLUE_ZOMBIE, 'silver', 'blueSilver', '銀装甲の青ゾンビ'),
  blueGold: armored(BLUE_ZOMBIE, 'gold', 'blueGold', '金装甲の青ゾンビ'),
  mutant: MUTANT,
  mutantSilver: armored(MUTANT, 'silver', 'mutantSilver', '銀装甲のミュータント'),
  mutantGold: armored(MUTANT, 'gold', 'mutantGold', '金装甲のミュータント'),
};
