import { UPGRADES, MAX_LEVEL, levelCost, requirement } from './data/upgrades.js';
import { JOBS } from './data/jobs.js';
import {
  CLASS_LEVEL_COST, CLASS_MAX_LEVEL, classEffects, JOB_PRICE, ITEM_PRICE,
} from './data/classes.js';

const KEY = 'zombie-shooting-progress';

// 値段0のものは最初から持っている
const freeIds = (prices) => Object.keys(prices).filter((id) => !prices[id]);

const empty = () => ({
  coins: 0,
  levels: Object.fromEntries(Object.keys(UPGRADES).map((id) => [id, 1])),
  classLevels: Object.fromEntries(Object.keys(JOBS).map((id) => [id, 1])),
  ownedItems: freeIds(ITEM_PRICE),
  ownedJobs: freeIds(JOB_PRICE),
});

// レベルは次に遊ぶときも残ってほしいので、ブラウザに保存する。
// プライベートモードなどで保存できなくても、遊べなくならないようにする
function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (!saved) return empty();
    const base = empty();
    return {
      coins: Number(saved.coins) || 0,
      levels: { ...base.levels, ...saved.levels },
      classLevels: { ...base.classLevels, ...saved.classLevels },
      // 買ったものが消えないよう、無料のものと合わせる
      ownedItems: [...new Set([...base.ownedItems, ...(saved.ownedItems ?? [])])],
      ownedJobs: [...new Set([...base.ownedJobs, ...(saved.ownedJobs ?? [])])],
    };
  } catch {
    return empty();
  }
}

export const progress = load();

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(progress));
  } catch {
    /* 保存できない環境ではその場かぎりの進行になる */
  }
}

export function addCoins(amount) {
  progress.coins += amount;
  save();
}

function spend(cost) {
  if (progress.coins < cost) return false;
  progress.coins -= cost;
  save();
  return true;
}

// ---- 武器のレベル ----

export function levelOf(itemId) {
  return progress.levels[itemId] ?? 1;
}

// 次のレベルに上げられるか、上げられないなら理由を返す
export function upgradeStatus(itemId) {
  const level = levelOf(itemId);
  if (level >= MAX_LEVEL) return { max: true };
  const cost = levelCost(itemId, level + 1);
  // 他の武器を育てないと開放されないレベルがある
  const needs = requirement(itemId, level + 1);
  const locked = needs
    ? Object.entries(needs).find(([id, lv]) => levelOf(id) < lv)
    : null;
  return {
    max: false,
    next: level + 1,
    cost,
    afford: progress.coins >= cost,
    locked: locked ? { id: locked[0], level: locked[1] } : null,
  };
}

export function upgrade(itemId) {
  const status = upgradeStatus(itemId);
  if (status.max || status.locked || !status.afford) return false;
  if (!spend(status.cost)) return false;
  progress.levels[itemId] = status.next;
  save();
  return true;
}

// ---- クラスのレベル ----

export function classLevelOf(jobId) {
  return progress.classLevels[jobId] ?? 1;
}

export function classStatus(jobId) {
  const level = classLevelOf(jobId);
  if (level >= CLASS_MAX_LEVEL) return { max: true, level };
  return {
    max: false,
    level,
    next: level + 1,
    cost: CLASS_LEVEL_COST,
    afford: progress.coins >= CLASS_LEVEL_COST,
  };
}

export function upgradeClass(jobId) {
  const status = classStatus(jobId);
  if (status.max || !status.afford) return false;
  if (!spend(status.cost)) return false;
  progress.classLevels[jobId] = status.next;
  save();
  return true;
}

// いま選んでいるクラスのレベルでつく効果
export function classBonus(jobId) {
  return classEffects(classLevelOf(jobId));
}

// 持っていける武器の数。クラスLv5で4つになる
export function maxSlots(jobId) {
  return classBonus(jobId).slots ?? 3;
}

// ---- 買う ----

export function ownsItem(id) {
  return progress.ownedItems.includes(id);
}

export function ownsJob(id) {
  return progress.ownedJobs.includes(id);
}

export function buyItem(id) {
  if (ownsItem(id) || !spend(ITEM_PRICE[id] ?? 0)) return false;
  progress.ownedItems.push(id);
  save();
  return true;
}

export function buyJob(id) {
  if (ownsJob(id) || !spend(JOB_PRICE[id] ?? 0)) return false;
  progress.ownedJobs.push(id);
  save();
  return true;
}
