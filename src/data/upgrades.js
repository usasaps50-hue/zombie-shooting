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
      { cost: 400, needs: { pistol: 5 }, damageScale: 1.1, desc: '火力+10%（ピストルLv5で開放）' },
      { cost: 700, magazine: 40, silencer: 10, desc: 'サイレンサーが付く／弾40発' },
      {
        cost: 1000,
        magazine: 48,
        fireInterval: 0.1,
        damage: 6,
        gold: true,
        desc: '見た目が金色／1発6ダメージ／弾48発／0.1秒に1発',
      },
    ],
  },
  shovel: {
    id: 'shovel',
    levels: [
      { desc: '基本性能' },
      { cost: 100, speedBonus: 0.1, desc: '持っている間だけ移動速度+10%' },
      { cost: 200, skill: 'rollingSmash', desc: 'スキル「ローリングスマッシュ」が使える' },
      { cost: 500, rangeBonus: 0.1, desc: '攻撃範囲+10%' },
      {
        cost: 750,
        gold: true,
        lifesteal: 0.5,
        unlocks: 'sword',
        desc: '見た目が金色／ローリングスマッシュの与ダメージの半分を回復／ソードのレベル3が開放',
      },
    ],
  },
  knife: {
    id: 'knife',
    levels: [
      { desc: '相手のいまのHPの25%＋10ダメージ／1秒に1回／血+5' },
      { cost: 200, speedBonus: 0.2, cooldown: 0.8, bloodGain: 6, desc: '移動速度+20%／0.8秒に1回／血+6' },
      { cost: 400, skill: 'bloodRelease', desc: 'スキル「血の解放」が使える' },
      { cost: 700, hpPercent: 0.39, damage: 30, desc: '相手のいまのHPの39%＋30ダメージ' },
      { cost: 1000, gold: true, cooldown: 0.6, desc: '見た目が金色／0.6秒に1回' },
    ],
  },
  megaphone: {
    id: 'megaphone',
    levels: [
      { speedUp: 0.1, desc: '基本性能（仲間の移動速度+10%を10秒）' },
      { cost: 150, speedUp: 0.15, desc: '移動速度+15%' },
      { cost: 300, powerUp: 0.1, desc: '攻撃力+10% が加わる' },
      { cost: 600, guard: 0.05, desc: '受けるダメージ-5% が加わる' },
      {
        cost: 900,
        gold: true,
        speedUp: 0.2,
        powerUp: 0.2,
        guard: 0.1,
        desc: '見た目が金色／被ダメージ-10%・移動速度+20%・攻撃力+20%',
      },
    ],
  },
};

// 拡声器でかかる効果をまとめる。何もつかないレベルは buff を返さない
export function buffOf(item) {
  const e = item?.effects ?? {};
  const buff = {
    speedUp: e.speedUp ?? 0,
    powerUp: e.powerUp ?? 0,
    guard: e.guard ?? 0,
  };
  return buff.speedUp || buff.powerUp || buff.guard ? buff : null;
}

// 「移動+20%／攻撃+20%／被ダメ-10%」のような表示用の文
export function buffText(buff) {
  if (!buff) return '';
  const parts = [];
  if (buff.speedUp) parts.push(`移動+${Math.round(buff.speedUp * 100)}%`);
  if (buff.powerUp) parts.push(`攻撃+${Math.round(buff.powerUp * 100)}%`);
  if (buff.guard) parts.push(`被ダメ-${Math.round(buff.guard * 100)}%`);
  return parts.join('／');
}

// 攻撃を当てた回数がこれだけ貯まるとスキルが撃てる
export const ROLLING_SMASH = { need: 5, range: 4.2, damageScale: 1.0, spinTime: 0.7 };

// 血のゲージ（ナイフ）。溜めるほど強くなり、足も速くなる
export const BLOOD = {
  max: 100,
  // ゲージが満タンのときの移動速度のボーナス
  speedAtMax: 0.5,
  // 「血の解放」中：この秒数ごとに1ずつ減り、当てるたびにHPが回復する
  drainEvery: 0.1,
  healPerHit: 5,
};

// ナイフの威力。血のゲージが満タンのときが、書いてある数字そのもの
export function knifeDamage(item, targetHp, bloodRatio) {
  const pct = item.hpPercent ?? 0;
  return Math.max(1, Math.ceil(targetHp * pct * bloodRatio + item.damage));
}

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
  if (base.damage) {
    let damage = base.damage * (1 + DAMAGE_PER_LEVEL * (level - 1));
    if (bonus.damageScale) damage *= bonus.damageScale;
    // 端数は切り上げる。四捨五入だと、元の火力が小さい武器
    // （AK47など）でレベルを上げても数字が変わらないことがある
    item.damage = Math.max(1, Math.ceil(bonus.damage ?? damage));
  }
  if (bonus.magazine) item.magazine = bonus.magazine;
  if (bonus.fireInterval) item.fireInterval = bonus.fireInterval;
  if (bonus.reloadTime) item.reloadTime = bonus.reloadTime;
  if (bonus.rangeBonus && base.range) item.range = base.range * (1 + bonus.rangeBonus);
  // ナイフ用。振る間隔・相手のHPを削る割合・溜まる血の量
  if (bonus.cooldown) item.cooldown = bonus.cooldown;
  if (bonus.hpPercent) item.hpPercent = bonus.hpPercent;
  if (bonus.bloodGain) item.bloodGain = bonus.bloodGain;
  // サイレンサーを付けると、音が届く距離が短くなる
  if (bonus.silencer) item.noise = bonus.silencer;
  return item;
}

// そのレベルに上げるのに、別の武器のレベルが要るか
export function requirement(itemId, level) {
  return UPGRADES[itemId]?.levels[level - 1]?.needs ?? null;
}
