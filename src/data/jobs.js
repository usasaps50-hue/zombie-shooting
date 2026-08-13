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

const NORMAL_ZOMBIE = {
  id: 'normal',
  name: '通常ゾンビ',
  skin: 'green',
  armor: null,
  hp: 75,
  sight: 14,
  walkSpeed: 1.1,
  chaseSpeed: 2.7,
  damage: 10,
  reach: 2.0,
  structureDamage: 20,
};

export const ENEMIES = {
  normal: NORMAL_ZOMBIE,
  // 肌が青いゾンビ。通常との違いは索敵範囲が1.8倍という点だけ
  blue: {
    ...NORMAL_ZOMBIE,
    id: 'blue',
    name: '青ゾンビ',
    skin: 'blue',
    sight: NORMAL_ZOMBIE.sight * 1.8,
  },
  // 装甲を着たゾンビ。装甲のぶんHPが上がる
  silver: {
    ...NORMAL_ZOMBIE,
    id: 'silver',
    name: '銀の装甲ゾンビ',
    armor: 'silver',
    hp: NORMAL_ZOMBIE.hp + 50,
  },
  gold: {
    ...NORMAL_ZOMBIE,
    id: 'gold',
    name: '金の装甲ゾンビ',
    armor: 'gold',
    hp: NORMAL_ZOMBIE.hp + 100,
  },
};
