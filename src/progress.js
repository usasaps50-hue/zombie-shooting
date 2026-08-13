import { UPGRADES, MAX_LEVEL, levelCost } from './data/upgrades.js';

const KEY = 'zombie-shooting-progress';

const empty = () => ({
  coins: 0,
  levels: Object.fromEntries(Object.keys(UPGRADES).map((id) => [id, 1])),
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

export function levelOf(itemId) {
  return progress.levels[itemId] ?? 1;
}

// 次のレベルに上げられるか、上げられないなら理由を返す
export function upgradeStatus(itemId) {
  const level = levelOf(itemId);
  if (level >= MAX_LEVEL) return { max: true };
  const cost = levelCost(itemId, level + 1);
  return { max: false, next: level + 1, cost, afford: progress.coins >= cost };
}

export function upgrade(itemId) {
  const status = upgradeStatus(itemId);
  if (status.max || !status.afford) return false;
  progress.coins -= status.cost;
  progress.levels[itemId] = status.next;
  save();
  return true;
}
