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
  reborn: {
    id: 'reborn',
    levels: [
      { desc: '8ダメージ／1.4秒に1回／半径2.6m／倒すと20%で味方になる' },
      { cost: 250, damage: 11, cooldown: 1.2, blast: 2.8, reviveChance: 0.3, desc: '11ダメージ／1.2秒に1回／半径2.8m／味方になる確率30%' },
      { cost: 450, damage: 14, cooldown: 1.0, blast: 3.0, reviveChance: 0.35, desc: '14ダメージ／1秒に1回／半径3.0m／確率35%' },
      { cost: 700, damage: 17, cooldown: 0.8, blast: 3.2, reviveChance: 0.4, desc: '17ダメージ／0.8秒に1回／半径3.2m／確率40%' },
      {
        cost: 1000,
        gold: true,
        damage: 20,
        cooldown: 0.6,
        blast: 3.5,
        reviveChance: 0.5,
        desc: '見た目が金色／20ダメージ／0.6秒に1回／半径3.5m／確率50%',
      },
    ],
  },
  death: {
    id: 'death',
    levels: [
      // 1発の重さと範囲で勝負する杖。それでも間が空きすぎて使いづらかったので、
      // リボーンロッドの秒あたりの火力を超えないところまで間隔を詰めた
      // （Lv5：40 ÷ 2.2秒 ≒ 18/秒。リボーンは 20 ÷ 0.6秒 ≒ 33/秒）
      { desc: '16ダメージ／3.6秒に1回／半径3.0m' },
      { cost: 250, damage: 22, cooldown: 3.2, blast: 3.3, desc: '22ダメージ／3.2秒に1回／半径3.3m' },
      { cost: 450, damage: 28, cooldown: 2.9, blast: 3.7, desc: '28ダメージ／2.9秒に1回／半径3.7m' },
      { cost: 700, damage: 34, cooldown: 2.5, blast: 4.1, desc: '34ダメージ／2.5秒に1回／半径4.1m' },
      {
        cost: 1000,
        gold: true,
        damage: 40,
        cooldown: 2.2,
        blast: 4.5,
        desc: '見た目が金色／40ダメージ／2.2秒に1回／半径4.5m',
      },
    ],
  },
  team: {
    id: 'team',
    levels: [
      { desc: '30m以内の味方を呼び集める／20秒に1回' },
      { cost: 200, range: 40, cooldown: 16, desc: '40m以内／16秒に1回' },
      { cost: 400, range: 50, cooldown: 13, heal: 0.2, desc: '50m以内／13秒に1回／集まった味方をHP20%回復' },
      { cost: 700, range: 70, cooldown: 10, heal: 0.35, desc: '70m以内／10秒に1回／35%回復' },
      {
        cost: 1000,
        gold: true,
        range: 9999,
        cooldown: 8,
        heal: 0.5,
        desc: '見た目が金色／マップ全体から呼べる／8秒に1回／50%回復',
      },
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
  // チームロッド用。呼びかけの届く距離と、集まった味方を回復する割合
  if (bonus.range) item.range = bonus.range;
  if (bonus.heal) item.heal = bonus.heal;
  // ナイフ用。振る間隔・相手のHPを削る割合・溜まる血の量
  if (bonus.cooldown) item.cooldown = bonus.cooldown;
  if (bonus.hpPercent) item.hpPercent = bonus.hpPercent;
  if (bonus.bloodGain) item.bloodGain = bonus.bloodGain;
  // ロッド用。爆ぜる半径と、倒した敵が味方になる確率
  if (bonus.blast) item.blast = bonus.blast;
  if (bonus.reviveChance) item.reviveChance = bonus.reviveChance;
  // サイレンサーを付けると、音が届く距離が短くなる
  if (bonus.silencer) item.noise = bonus.silencer;
  return item;
}

// そのレベルに上げるのに、別の武器のレベルが要るか
export function requirement(itemId, level) {
  return UPGRADES[itemId]?.levels[level - 1]?.needs ?? null;
}
