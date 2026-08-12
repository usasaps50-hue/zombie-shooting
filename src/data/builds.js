export const MATERIALS = {
  wood: { id: 'wood', name: '木', color: 0x9a6f3f },
  brick: { id: 'brick', name: 'レンガ', color: 0xa4574a },
  iron: { id: 'iron', name: '鉄', color: 0x8c949e },
};

export const WALL_SIZE = { width: 2.4, height: 2.4, depth: 0.35 };

export const BUILDS = {
  wood: { id: 'wood', kind: 'wall', name: '木の壁', cost: { wood: 100 }, hp: 150 },
  brick: { id: 'brick', kind: 'wall', name: 'レンガの壁', cost: { brick: 100 }, hp: 300 },
  iron: { id: 'iron', kind: 'wall', name: '鉄の壁', cost: { iron: 100 }, hp: 600 },
  turret: { id: 'turret', kind: 'turret', name: 'タレット', cost: { brick: 30, iron: 20 }, hp: 75 },
  // 必殺技で出るもの。素材では建てられないので BUILD_ORDER には入れない
  hospital: { id: 'hospital', kind: 'hospital', name: '野戦病院', cost: {}, hp: 50 },
  godturret: { id: 'godturret', kind: 'godturret', name: 'ゴッドタレット', cost: {}, hp: 75 },
};

export const BUILD_ORDER = ['wood', 'brick', 'iron', 'turret'];

export const TURRET = {
  damage: 3,
  fireInterval: 0.1,
  magazine: 30,
  cooldown: 2.0,
  range: 22,
  turnSpeed: 6,
};

// 通常ゾンビを倒したときの木のドロップ
export const WOOD_DROP = { min: 4, max: 10 };
