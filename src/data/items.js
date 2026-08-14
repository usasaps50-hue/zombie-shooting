// noise は音がゾンビに届く距離（m）。0 なら誰にも気づかれない
export const ITEMS = {
  pistol: {
    id: 'pistol',
    name: 'ピストル',
    kind: 'gun',
    damage: 15,
    magazine: 6,
    fireInterval: 0.3,
    reloadTime: 1.6,
    range: 60,
    noise: 22,
    icon: '🔫',
  },
  ak47: {
    id: 'ak47',
    name: 'AK47',
    kind: 'gun',
    damage: 2,
    magazine: 24,
    fireInterval: 0.3,
    reloadTime: 5.0,
    range: 70,
    // 音が大きいので、遠くのゾンビまで寄ってくる
    noise: 34,
    icon: '🔫',
  },
  shovel: {
    id: 'shovel',
    name: 'シャベル',
    kind: 'melee',
    damage: 10,
    swingTime: 0.28,
    cooldown: 0.5,
    range: 2.4,
    arc: Math.PI / 3,
    // 振っても、ほとんど音がしない
    noise: 3,
    icon: '🪏',
  },
  hammer: {
    id: 'hammer',
    name: 'ハンマー',
    kind: 'build',
    swingTime: 0.4,
    cooldown: 0.35,
    jobOnly: 'architect',
    icon: '🔨',
  },
  bandage: {
    id: 'bandage',
    name: '包帯',
    kind: 'support',
    heal: 30,
    useTime: 1.0,
    reviveTime: 3.0,
    jobOnly: 'medic',
    icon: '🩹',
  },
};

export const SELECTABLE_ITEMS = ['pistol', 'ak47', 'shovel', 'hammer'];
// 持てる数はクラスのレベルで変わる（progress.js の maxSlots）
export const BASE_SLOTS = 3;
