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

export const SELECTABLE_ITEMS = ['pistol', 'shovel', 'hammer'];
export const MAX_SLOTS = 3;
