import { UPGRADES, MAX_LEVEL, levelCost, requirement } from './data/upgrades.js';
import { JOBS } from './data/jobs.js';
import {
  CLASS_LEVEL_COST, CLASS_MAX_LEVEL, classEffects, JOB_PRICE, ITEM_PRICE,
} from './data/classes.js';

// アカウントごとに `zombie-shooting-progress:<アカウントid>` へ保存する。
// アカウントを入れる前からあった保存データは、一番はじめのアカウントが引き継ぐ
const KEY = 'zombie-shooting-progress';
const OLD_BACKUP_KEY = 'zombie-shooting-progress-backup';

// 値段0のものは最初から持っている
const freeIds = (prices) => Object.keys(prices).filter((id) => !prices[id]);

const empty = () => ({
  // オンラインで他の人に見える名前（＝ログインしたアカウントのなまえ）
  name: '',
  coins: 0,
  levels: Object.fromEntries(Object.keys(UPGRADES).map((id) => [id, 1])),
  classLevels: Object.fromEntries(Object.keys(JOBS).map((id) => [id, 1])),
  ownedItems: freeIds(ITEM_PRICE),
  ownedJobs: freeIds(JOB_PRICE),
});

function readSave(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

// 足りないところを初期値でうめる。買ったものが消えないよう、無料のものと合わせる
function normalize(saved) {
  const base = empty();
  if (!saved) return base;
  return {
    name: typeof saved.name === 'string' ? saved.name : '',
    coins: Number(saved.coins) || 0,
    levels: { ...base.levels, ...saved.levels },
    classLevels: { ...base.classLevels, ...saved.classLevels },
    ownedItems: [...new Set([...base.ownedItems, ...(saved.ownedItems ?? [])])],
    ownedJobs: [...new Set([...base.ownedJobs, ...(saved.ownedJobs ?? [])])],
  };
}

// ゲーム中はずっとこの1つを見る。ログインするたび中身を入れ替える
export const progress = empty();
// ログインするまでは保存先が決まらないので、その間は保存しない
let saveKey = null;
// いま入っているアカウント（Supabase のときは cloud: true）
let account = null;
// Supabase に送る役。cloud.js が入れてくれる（設定がなければ何もしない）
let remoteSaver = null;

export function setRemoteSaver(fn) {
  remoteSaver = fn;
}

// ログインした人の保存データに切り替える。
//  - cloudData … Supabase から読んだ進み具合（無ければ null）
//  - takeOldSave … アカウントより前の保存データを引き継ぐか（一番はじめの人だけ）
export function useAccount(nextAccount, { cloudData = null, takeOldSave = false } = {}) {
  account = nextAccount;
  saveKey = `${KEY}:${nextAccount.id}`;
  // Supabase にあるものが本物。無いときだけ、この端末に残っているものを見る
  let saved = cloudData ?? readSave(saveKey);
  if (!saved && takeOldSave) saved = consumeOldSave();
  Object.assign(progress, normalize(saved));
  // なまえはアカウントのものにそろえる
  progress.name = nextAccount.name;
  save();
}

// ログアウト。保存先を外して、中身を空に戻す
export function clearAccount() {
  saveKey = null;
  account = null;
  Object.assign(progress, empty());
}

// この端末に残っている、そのアカウントの控え（引き継ぎに使う）
export function savedProgressOf(accountId) {
  return readSave(`${KEY}:${accountId}`);
}

// アカウントの仕組みを入れる前の保存データを、1回だけ取り出す。
// 取ったあとは名前を変えて残すので、2人目には渡らない（コインの増殖よけ）
export function consumeOldSave() {
  const saved = readSave(KEY);
  if (!saved) return null;
  try {
    localStorage.setItem(OLD_BACKUP_KEY, JSON.stringify(saved));
    localStorage.removeItem(KEY);
  } catch { /* 動かせなくても、引き継ぎ自体はできている */ }
  return saved;
}

export function currentAccount() {
  return account;
}

export function save() {
  if (!saveKey) return;
  try {
    // 端末にも控えを置いておく。つながらないときに前回の続きから遊べる
    localStorage.setItem(saveKey, JSON.stringify(progress));
  } catch {
    /* 保存できない環境ではその場かぎりの進行になる */
  }
  remoteSaver?.(account, progress);
}

// オンラインで他の人に見えるなまえ。ログインしたアカウントのなまえを使う
export function playerName() {
  return progress.name || 'プレイヤー';
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
