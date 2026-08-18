// 見た目（スキン）の一覧。
//
// モデルは assets/models/skins にある52体。ぜんぶ同じ骨組みなので、
// 動きは BaseCharacter.gltf のぶんを全員で使い回している（src/skinmodel.js）。
//
// rarity は出やすさの階級。ガチャはまず階級を抽選して、
// そのなかから「まだ持っていないもの」を1つ選ぶ（だからダブらない）。

export const GACHA_COST = 100;

// 階級ごとの、1回まわしたときの当たる割合と、見た目の色
export const RARITY = {
  n: { name: 'ノーマル', chance: 0.60, color: '#9aa6b4' },
  r: { name: 'レア', chance: 0.25, color: '#5b9bd5' },
  sr: { name: 'スーパーレア', chance: 0.12, color: '#b06fd8' },
  ssr: { name: 'ウルトラレア', chance: 0.03, color: '#e0b23c' },
};

export const RARITY_ORDER = ['n', 'r', 'sr', 'ssr'];

// id はファイル名。name は日本語の表示名。
// hair / hat は、その体に重ねてかぶせるモデル（別ファイルになっているもの）
export const SKINS = [
  // ---- ノーマル ----
  { id: 'Casual_Male', name: 'ふつうの男', rarity: 'n' },
  { id: 'Casual_Female', name: 'ふつうの女', rarity: 'n' },
  { id: 'Casual2_Male', name: 'パーカーの男', rarity: 'n' },
  { id: 'Casual2_Female', name: 'パーカーの女', rarity: 'n' },
  { id: 'Casual3_Male', name: 'シャツの男', rarity: 'n' },
  { id: 'Casual3_Female', name: 'シャツの女', rarity: 'n' },
  { id: 'Casual_Bald', name: 'スキンヘッド', rarity: 'n' },
  { id: 'Worker_Male', name: 'さぎょういん', rarity: 'n' },
  { id: 'Worker_Female', name: 'さぎょういん（女）', rarity: 'n' },
  { id: 'Suit_Male', name: 'スーツの男', rarity: 'n' },
  { id: 'Suit_Female', name: 'スーツの女', rarity: 'n' },
  { id: 'OldClassy_Male', name: 'しんし', rarity: 'n' },
  { id: 'OldClassy_Female', name: 'ふじん', rarity: 'n' },

  // ---- レア ----
  { id: 'Soldier_Male', name: 'へいし', rarity: 'r' },
  { id: 'Soldier_Female', name: 'へいし（女）', rarity: 'r' },
  { id: 'BlueSoldier_Male', name: '青いへいし', rarity: 'r' },
  { id: 'BlueSoldier_Female', name: '青いへいし（女）', rarity: 'r' },
  { id: 'Doctor_Male_Young', name: 'いしゃ', rarity: 'r' },
  { id: 'Doctor_Female_Young', name: 'いしゃ（女）', rarity: 'r' },
  { id: 'Doctor_Male_Old', name: 'はくいのろうじん', rarity: 'r' },
  { id: 'Doctor_Female_Old', name: 'ベテランいしゃ', rarity: 'r' },
  { id: 'Chef_Male', name: 'コック', rarity: 'r', hat: 'Chef_Hat' },
  { id: 'Chef_Female', name: 'コック（女）', rarity: 'r', hat: 'Chef_Hat' },
  { id: 'Cowboy_Male', name: 'カウボーイ', rarity: 'r', hat: 'Cowboy_Hair' },
  { id: 'Cowboy_Female', name: 'カウガール', rarity: 'r' },

  // ---- スーパーレア ----
  { id: 'Ninja_Male', name: 'にんじゃ', rarity: 'sr' },
  { id: 'Ninja_Female', name: 'くのいち', rarity: 'sr' },
  { id: 'Ninja_Sand', name: 'すなのにんじゃ', rarity: 'sr' },
  { id: 'Ninja_Sand_Female', name: 'すなのくのいち', rarity: 'sr' },
  { id: 'Pirate_Male', name: 'かいぞく', rarity: 'sr' },
  { id: 'Pirate_Female', name: 'かいぞく（女）', rarity: 'sr' },
  { id: 'Viking_Male', name: 'バイキング', rarity: 'sr', hat: 'VikingHelmet' },
  { id: 'Viking_Female', name: 'バイキング（女）', rarity: 'sr', hat: 'VikingHelmet' },
  { id: 'Kimono_Male', name: 'きもの', rarity: 'sr' },
  { id: 'Kimono_Female', name: 'きもの（女）', rarity: 'sr' },
  { id: 'Knight_Male', name: 'きし', rarity: 'sr' },

  // ---- ウルトラレア ----
  { id: 'Knight_Golden_Male', name: '金のきし', rarity: 'ssr' },
  { id: 'Knight_Golden_Female', name: '金のきし（女）', rarity: 'ssr' },
  { id: 'Witch', name: 'まじょ', rarity: 'ssr' },
  { id: 'Wizard', name: 'まほうつかい', rarity: 'ssr' },
  { id: 'Elf', name: 'エルフ', rarity: 'ssr' },
  { id: 'Goblin_Male', name: 'ゴブリン', rarity: 'ssr' },
  { id: 'Goblin_Female', name: 'ゴブリン（女）', rarity: 'ssr' },
  { id: 'Zombie_Male', name: 'ゾンビ', rarity: 'ssr' },
  { id: 'Zombie_Female', name: 'ゾンビ（女）', rarity: 'ssr' },
  { id: 'Pug', name: 'パグ', rarity: 'ssr' },
  { id: 'Cow', name: 'うし', rarity: 'ssr' },
];

// 最初から持っているスキン。これがないと着るものが無くなる
export const DEFAULT_SKIN = 'Casual_Male';

export const SKIN_BY_ID = Object.fromEntries(SKINS.map((s) => [s.id, s]));

export function skinsOfRarity(rarity) {
  return SKINS.filter((s) => s.rarity === rarity);
}

// まだ持っていないスキンの中から1つ選ぶ。
// 階級を先に抽選して、その階級が品切れなら下の階級へずらす。
// こうすると「持っているものがまた出る」ことが起きない
export function rollSkin(owned) {
  const left = SKINS.filter((s) => !owned.includes(s.id));
  if (!left.length) return null;

  // 残っている階級だけで、割合を計算しなおす
  const pools = RARITY_ORDER
    .map((r) => ({ rarity: r, list: left.filter((s) => s.rarity === r) }))
    .filter((p) => p.list.length);
  const total = pools.reduce((sum, p) => sum + RARITY[p.rarity].chance, 0);

  let roll = Math.random() * total;
  for (const pool of pools) {
    roll -= RARITY[pool.rarity].chance;
    if (roll <= 0) return pool.list[Math.floor(Math.random() * pool.list.length)];
  }
  const last = pools[pools.length - 1];
  return last.list[Math.floor(Math.random() * last.list.length)];
}
