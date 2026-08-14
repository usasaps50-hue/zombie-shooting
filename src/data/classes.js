// クラス（職業）のレベル。どのレベルも1つ上げるのに同じコインがかかる
export const CLASS_LEVEL_COST = 200;
export const CLASS_MAX_LEVEL = 5;

// 効果は下のレベルのぶんも重なって残る
export const CLASS_LEVELS = [
  { desc: '基本性能' },
  { speedBonus: 0.1, desc: '移動速度+10%' },
  { ultStock: 2, desc: '必殺技を2回ためておける' },
  { damageReduction: 0.1, desc: '受けるダメージ-10%' },
  { slots: 4, desc: '武器を4つ持っていける' },
];

export function classEffects(level) {
  const merged = {};
  for (let i = 0; i < Math.min(level, CLASS_LEVELS.length); i++) {
    const { desc, ...rest } = CLASS_LEVELS[i];
    Object.assign(merged, rest);
  }
  return merged;
}

// 買うときの値段。0 なら最初から持っている
export const JOB_PRICE = { soldier: 0, medic: 100, architect: 500 };
export const ITEM_PRICE = { shovel: 0, pistol: 50, ak47: 300, megaphone: 200, hammer: 0, bandage: 0 };

// 装甲を着たゾンビは、銃とタレットのダメージをこの割合だけ減らす
export const ARMOR_GUN_REDUCTION = 0.15;
