import { ITEMS } from './items.js';

export const MAX_LEVEL = 5;
// レベルが1上がるごとに火力が5%ずつ増える（レベル5で+20%）
export const DAMAGE_PER_LEVEL = 0.05;

// levels[0] がレベル1。cost は「そのレベルにするのに必要なコイン」。
// 効果は下のレベルのぶんも重なって残る
export const UPGRADES = {
  pistol: {
    id: 'pistol',
    levels: [
      { desc: '基本性能（弾6発）' },
      { cost: 100, magazine: 10, desc: '弾が10発になる' },
      { cost: 200, healOnKill: 5, silencer: 6, desc: 'サイレンサーが付く／倒すとHPが5回復' },
      { cost: 500, invulnOnKill: 0.2, desc: 'ピストルで倒すと0.2秒だけ無敵' },
      { cost: 750, magazine: 12, gold: true, desc: '見た目が金色／弾12発／AK47のレベル3が開放' },
    ],
  },
  ak47: {
    id: 'ak47',
    levels: [
      { desc: '基本性能（弾24発／0.3秒に1発／音が大きい）' },
      { cost: 150, fireInterval: 0.2, reloadTime: 4.5, desc: '0.2秒に1発／リロード4.5秒' },
      // ピストルをLv5にするまで開放されない
      { cost: 400, needs: { pistol: 5 }, desc: '火力+10%（ピストルLv5で開放）' },
      { cost: 700, magazine: 40, silencer: 10, desc: 'サイレンサーが付く／弾40発' },
      { cost: 1000, magazine: 48, fireInterval: 0.1, gold: true, desc: '見た目が金色／弾48発／0.1秒に1発' },
    ],
  },
  shovel: {
    id: 'shovel',
    levels: [
      { desc: '基本性能' },
      { cost: 100, speedBonus: 0.1, desc: '持っている間だけ移動速度+10%' },
      { cost: 200, skill: 'rollingSmash', desc: 'スキル「ローリングスマッシュ」が使える' },
      { cost: 500, rangeBonus: 0.1, desc: '攻撃範囲+10%' },
      { cost: 750, gold: true, lifesteal: 0.5, unlocks: 'sword', desc: '見た目が金色／与ダメージの半分を回復／ソードのレベル3が開放' },
    ],
  },
};

// 攻撃を当てた回数がこれだけ貯まるとスキルが撃てる
export const ROLLING_SMASH = { need: 5, range: 4.2, damageScale: 1.0, spinTime: 0.7 };

// 頭に当てたときの倍率
export const HEADSHOT = { multiplier: 1.1, from: 0.78 };

export function levelCost(itemId, level) {
  return UPGRADES[itemId]?.levels[level - 1]?.cost ?? null;
}

// レベル1から今のレベルまでの効果を重ねる。上のレベルの値が勝つ
export function effects(itemId, level) {
  const def = UPGRADES[itemId];
  if (!def) return {};
  const merged = {};
  for (let i = 0; i < Math.min(level, def.levels.length); i++) {
    const { cost, desc, ...rest } = def.levels[i];
    Object.assign(merged, rest);
  }
  return merged;
}

// レベルを反映したアイテム。ゲーム中はこれを使う
export function upgradedItem(itemId, level) {
  const base = ITEMS[itemId];
  const bonus = effects(itemId, level);
  const item = { ...base, level, effects: bonus };
  if (base.damage) item.damage = Math.max(1, Math.round(base.damage * (1 + DAMAGE_PER_LEVEL * (level - 1))));
  if (bonus.magazine) item.magazine = bonus.magazine;
  if (bonus.fireInterval) item.fireInterval = bonus.fireInterval;
  if (bonus.reloadTime) item.reloadTime = bonus.reloadTime;
  if (bonus.rangeBonus && base.range) item.range = base.range * (1 + bonus.rangeBonus);
  // サイレンサーを付けると、音が届く距離が短くなる
  if (bonus.silencer) item.noise = bonus.silencer;
  return item;
}

// そのレベルに上げるのに、別の武器のレベルが要るか
export function requirement(itemId, level) {
  return UPGRADES[itemId]?.levels[level - 1]?.needs ?? null;
}
