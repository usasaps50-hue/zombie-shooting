export const JOBS = {
  soldier: {
    id: 'soldier',
    name: '一般兵',
    desc: '標準的なHPと移動速度。',
    hp: 100,
    speedScale: 1.0,
    bandages: 0,
    bandagesPerWave: 0,
    canRevive: false,
    color: 0x5f7f9f,
  },
  medic: {
    id: 'medic',
    name: '衛生兵',
    desc: '包帯を3つ所持（毎ウェーブ+1）。倒れた味方を3秒長押しで蘇生。移動はやや遅い。',
    hp: 100,
    speedScale: 0.9,
    bandages: 3,
    bandagesPerWave: 1,
    canRevive: true,
    color: 0x9f5f5f,
  },
  criminal: {
    id: 'criminal',
    name: '犯罪者',
    desc: 'ナイフで相手の残りHPを削り、当てるほど血のゲージが溜まって足が速くなる。HPはやや低い。',
    hp: 90,
    speedScale: 1.0,
    bandages: 0,
    bandagesPerWave: 0,
    canRevive: false,
    color: 0x4a3f52,
  },
  necromancer: {
    id: 'necromancer',
    name: 'ネクロマンサー',
    desc: '2本のロッドで範囲魔法を撃つ。リボーンロッドで倒した敵は味方になって、ついてきて戦う。HPは低い。',
    hp: 80,
    speedScale: 0.95,
    bandages: 0,
    bandagesPerWave: 0,
    canRevive: false,
    color: 0x3d3357,
  },
  architect: {
    id: 'architect',
    name: '建築士',
    desc: 'ハンマーで壁とタレットを建てられる。壁は仲間だけすり抜けられる。移動はやや遅い。',
    hp: 100,
    speedScale: 0.95,
    bandages: 0,
    bandagesPerWave: 0,
    canRevive: false,
    color: 0x9f8a5f,
    // レンガと鉄はまだ入手手段がないので、動作確認用に最初から配る
    materials: { wood: 100, brick: 60, iron: 40 },
  },
};

export const PLAYER = {
  reviveInvulnTime: 3.0,
  reviveHp: 50,
  hitInvulnTime: 0.6,
  // 被弾したときの、画面の赤みとのけぞりモーションの長さ
  hurtTime: 0.5,
};

// ゾンビが「人より近い建物」を壊しに行く距離
export const BUILD_LURE = 11;

// drop は [最小, 最大]。倒したときにこの範囲で素材を落とす
const NORMAL_ZOMBIE = {
  id: 'normal',
  name: '通常ゾンビ',
  model: 'zombie',
  skin: 'green',
  // 外から持ってきたモデルを使うときの名前。読めていなければ手作りのほうで動く。
  // 種類ごとに zombie（標準）/ zombieChubby（太め）/ zombieThin（やせ）を選ぶ。
  // tint はモデルにかける色、animRate は手足を振る速さ
  gltf: 'zombie',
  tint: null,
  armor: null,
  hp: 75,
  height: 1.8,
  sight: 14,
  walkSpeed: 1.1,
  chaseSpeed: 2.7,
  damage: 5,
  reach: 2.0,
  attackCooldown: 1.2,
  structureDamage: 20,
  breaksDrones: false,
  drop: { wood: [4, 10] },
};

// 肌が青いゾンビ。通常との違いは索敵範囲が1.8倍という点だけ
const BLUE_ZOMBIE = {
  ...NORMAL_ZOMBIE,
  id: 'blue',
  name: '索敵ゾンビ',
  skin: 'blue',
  // 青白い肌。首をのばして探るように、ゆっくり歩く
  tint: 0x5f8ce8,
  animRate: 0.9,
  sight: NORMAL_ZOMBIE.sight * 1.8,
  drop: { wood: [10, 10], brick: [5, 5] },
};

// 足の速い赤いゾンビ。硬さと引き換えに、走って詰めてくる
const FAST_ZOMBIE = {
  ...NORMAL_ZOMBIE,
  id: 'fast',
  name: '俊足ゾンビ',
  skin: 'red',
  // 肉が落ちたやせ型。赤黒くて、手足を速く振る
  gltf: 'zombieThin',
  tint: 0xd06a5a,
  stretch: [0.94, 1.02, 0.94],
  hp: 50,
  sight: 20,
  walkSpeed: 2.0,
  chaseSpeed: 5.6,
  attackCooldown: 0.85,
  // 手足を振る速さ。走りに合わせて速くする
  animRate: 1.9,
  drop: { wood: [6, 12] },
};

// 紫ゾンビ。半分まで削ると地中へ逃げ、こちらの足元から出てくる
const PURPLE_ZOMBIE = {
  ...NORMAL_ZOMBIE,
  id: 'purple',
  name: '紫ゾンビ',
  skin: 'purple',
  // ぶくぶくに膨れた紫。重そうに、のっそり歩く
  gltf: 'zombieChubby',
  tint: 0xa87fc8,
  animRate: 0.85,
  hp: 90,
  sight: 18,
  chaseSpeed: 3.0,
  // HPがこの割合を下回ったとき、この確率で一度だけ潜る
  burrowAt: 0.5,
  burrowChance: 0.5,
  // 地中にいる時間。出てきてから襲いはじめるまでの2秒は、
  // src/zombie.js の EMERGE_TIME（出現モーションの長さ）で決まる
  burrowTime: 3.5,
  // 相手からどれくらい離れた所に出てくるか
  emergeRange: [3.0, 5.0],
  drop: { wood: [8, 14], brick: [4, 8] },
};

// ガンマゾンビ。カウボーイ姿で、遠くから見つけて撃ってくる。
// 一度見つけた相手は、索敵範囲の外に出てもずっと追いかける
const GAMMA_ZOMBIE = {
  ...NORMAL_ZOMBIE,
  id: 'gamma',
  name: 'ガンマゾンビ',
  skin: 'gamma',
  outfit: 'cowboy',
  behavior: 'gunner',
  // 日に焼けた黄土色。撃つために足を止めるので、歩きはゆっくり
  tint: 0xc8b070,
  animRate: 0.95,
  hp: 120,
  sight: 75,
  walkSpeed: 1.3,
  chaseSpeed: 2.9,
  damage: 10,
  // 一番近くまでは行かず、この距離を保って撃つ
  keepRange: 11,
  shootRange: 30,
  shootCooldown: [1.5, 3.0],
  spread: 0.045,
  lockOn: true,
  // 弾はドローンにも当たる
  breaksDrones: true,
  droneDamage: 10,
  // 見つけた相手の位置を仲間に知らせる
  shares: true,
  avoidsWalls: true,
  attackCooldown: 1.2,
  structureDamage: 14,
  drop: { wood: [10, 16], brick: [6, 12], iron: [2, 6] },
};

// スケルトン。倒しても半分の確率で組み上がって起き上がる
const SKELETON = {
  ...NORMAL_ZOMBIE,
  id: 'skeleton',
  name: 'スケルトン',
  model: 'skeleton',
  // 骨だけの体は持ってきた素材に無いので、手作りのモデルで出す
  gltf: null,
  weapon: 'club',
  skin: null,
  hp: 100,
  sight: 16,
  walkSpeed: 1.2,
  chaseSpeed: 3.0,
  damage: 5,
  reach: 2.2,
  attackCooldown: 1.1,
  // 死んだときに、この確率でHP半分になって復活する（1体につき1回だけ）
  reviveChance: 0.5,
  drop: { wood: [6, 10], brick: [4, 8] },
};

const SKELETON_ARCHER = {
  ...SKELETON,
  id: 'skeletonArcher',
  name: '弓スケルトン',
  weapon: 'bow',
  behavior: 'archer',
  hp: 100,
  damage: 6,
  chaseSpeed: 2.7,
  // 弓の届く距離まで見えないと、いつまでも近づくだけになってしまう
  sight: 26,
  keepRange: 15,
  shootRange: 26,
  // 矢はドローンにも当たる
  breaksDrones: true,
  droneDamage: 6,
  shootCooldown: [1.8, 3.2],
  spread: 0.03,
  avoidsWalls: true,
  drop: { wood: [8, 12], brick: [5, 9] },
};

// 群れゾンビ。1体ずつではなく、まとまって湧いてくる小型
const SWARM_ZOMBIE = {
  ...NORMAL_ZOMBIE,
  id: 'swarm',
  name: '群れゾンビ',
  skin: 'swarm',
  // 小さくやせている。ちょこちょこと小刻みに走る
  gltf: 'zombieThin',
  tint: 0xa8b878,
  animRate: 1.7,
  // 小さいので、モデル全体を縮める
  stretch: [0.72, 0.68, 0.72],
  hp: 25,
  height: 1.25,
  sight: 18,
  walkSpeed: 1.6,
  chaseSpeed: 4.4,
  damage: 2,
  reach: 1.7,
  attackCooldown: 0.8,
  structureDamage: 8,
  // 湧くときは、この数がまとめて出てくる
  packSize: 6,
  drop: { wood: [1, 3] },
};

// 叫びゾンビ。自分では殴らず、まわりのゾンビの足を速くする
const SHRIEKER_ZOMBIE = {
  ...NORMAL_ZOMBIE,
  id: 'shrieker',
  name: '叫びゾンビ',
  skin: 'shrieker',
  behavior: 'shrieker',
  // あばらの浮いた青白い体。落ち着きなく、せかせか動く
  gltf: 'zombieThin',
  tint: 0xd8dcc0,
  animRate: 1.3,
  // やせこけて背だけ高い
  stretch: [0.82, 1.12, 0.82],
  hp: 70,
  height: 2.0,
  sight: 30,
  walkSpeed: 1.4,
  chaseSpeed: 3.4,
  // 殴ってこない。近づかれたら逃げる
  damage: 0,
  reach: 0,
  attackCooldown: 99,
  structureDamage: 0,
  // このくらいの距離を保って逃げ回る
  keepRange: 16,
  avoidsWalls: true,
  // 何秒ごとに叫ぶか／届く範囲／速くなる倍率と時間
  shriekCooldown: 10,
  shriekRadius: 22,
  hasteScale: 1.5,
  hasteTime: 6,
  drop: { wood: [6, 10], brick: [3, 6] },
};

// 天井ゾンビ。ビルの壁を這い上がって、屋上から飛び降りてくる。
// 地上では弱いので、下で捕まえれば怖くない
const CLIMBER_ZOMBIE = {
  ...NORMAL_ZOMBIE,
  id: 'climber',
  name: '天井ゾンビ',
  skin: 'climber',
  behavior: 'climber',
  // 影のような灰青。壁に張りつくので、暗い色にして見つけにくくする
  gltf: 'zombieThin',
  tint: 0x6f7d8a,
  animRate: 1.15,
  // 手足が長く、ひょろりと背が高い
  stretch: [0.74, 1.26, 0.74],
  hp: 60,
  height: 2.15,
  sight: 34,
  walkSpeed: 1.3,
  chaseSpeed: 3.2,
  // 地上での殴りは弱い
  damage: 8,
  reach: 2.0,
  attackCooldown: 1.3,
  structureDamage: 12,
  avoidsWalls: true,
  // 登れる壁の高さの範囲と、探す距離
  climbMinTop: 4.5,
  climbMaxTop: 24,
  climbRange: 30,
  climbSpeed: 4.2,
  // 壁に張りついて待っていられる時間。これを過ぎたら、しびれを切らして降りる
  clingTime: 30,
  // 壁に張りついたまま待って、相手がこの距離まで来たら落ちてくる
  dropRange: 8,
  dropDamage: 22,
  dropRadius: 2.8,
  dropTime: 0.8,
  dropHeight: 2.5,
  // 一度降りたら、つぎに登りはじめるまでの待ち
  climbCooldown: 9,
  drop: { wood: [5, 9], brick: [3, 6] },
};

// 巨大なミュータント。地面を叩き割り、瀕死になると跳んでくる
const MUTANT = {
  ...NORMAL_ZOMBIE,
  id: 'mutant',
  name: 'ミュータントゾンビ',
  model: 'mutant',
  // 巨体は持ってきた素材に無いので、手作りのモデルで出す
  gltf: null,
  hp: 300,
  height: 2.6,
  sight: 18,
  walkSpeed: 1.0,
  chaseSpeed: 2.4,
  damage: 10,
  reach: 3.0,
  attackCooldown: 1.6,
  structureDamage: 40,
  breaksDrones: true,
  droneDamage: 20,
  crackRadius: 2.6,
  // HPがこの割合を下回ったとき、この確率で一度だけ大ジャンプする
  slamAt: 0.2,
  slamChance: 0.1,
  slamDamage: 50,
  slamRadius: 5.0,
  slamRange: 26,
  slamTime: 1.2,
  slamHeight: 7,
  // 跳ぶ前の溜め。この間は落ちる場所に印が出て、代わりに攻撃が通らない
  slamChargeTime: 1.5,
  drop: { brick: [30, 30], iron: [50, 50] },
};

// ボス「タイタン」。10ウェーブごとに1体だけ現れる。
// 中身の動きは src/boss.js、見た目は src/titan.js
const TITAN_BOSS = {
  ...NORMAL_ZOMBIE,
  id: 'titan',
  name: 'タイタン',
  model: 'titan',
  // ボスの姿は手作りのモデル（src/titan.js）
  gltf: null,
  // これが立っていると Enemy が専用の頭（TitanBrain）を用意する
  boss: true,
  hp: 2600,
  height: 7.0,
  sight: 60,
  walkSpeed: 1.6,
  chaseSpeed: 2.6,
  damage: 34,
  reach: 7.5,
  attackCooldown: 3.2,
  structureDamage: 200,
  breaksDrones: true,
  droneDamage: 60,
  // 味方になったときだけ使う跳びかかりの設定。
  // 敵として動いているときは TitanBrain が動かすので、ここは見ない
  slamRange: 22,
  slamRadius: 4.0,
  slamDamage: 40,
  slamChargeTime: 1.0,
  slamTime: 1.0,
  slamHeight: 6,
  drop: { wood: [60, 90], brick: [60, 90], iron: [40, 60] },
};

// ボス「マザー」。動かない代わりにゾンビを産み続ける母体。
// 4本の腕を全部落とさないと本体に攻撃が通らない
const MOTHER_BOSS = {
  ...NORMAL_ZOMBIE,
  id: 'mother',
  name: 'マザー',
  model: 'mother',
  // ボスの姿は手作りのモデル（src/mother.js）
  gltf: null,
  boss: true,
  // 動かないので、どのボスか見分けやすいよう別の頭を使う
  bossKind: 'mother',
  hp: 2000,
  height: 5.2,
  sight: 45,
  walkSpeed: 0,
  chaseSpeed: 0,
  damage: 28,
  reach: 8.5,
  attackCooldown: 2.6,
  structureDamage: 120,
  breaksDrones: true,
  droneDamage: 40,
  drop: { wood: [50, 80], brick: [50, 80], iron: [30, 50] },
};

// 装甲を着るとHPが増え、殴りも重くなり、落とす素材も増える
// tint は装甲を着た見た目の色。重い装甲を着ているので、歩きは少し重くなる
const ARMOR_BONUS = {
  silver: { hp: 50, damage: 8, tint: 0xb9c2cc, animRate: 0.85, drop: { brick: [5, 5] } },
  gold: { hp: 100, damage: 8, tint: 0xd8b455, animRate: 0.8, drop: { brick: [15, 15], iron: [4, 10] } },
};

// 2つの色を半分ずつ混ぜる
function mixColor(a, b) {
  const half = (shift) => {
    const av = (a >> shift) & 0xff;
    const bv = (b >> shift) & 0xff;
    return Math.round((av + bv) / 2) << shift;
  };
  return half(16) | half(8) | half(0);
}

function mergeDrop(base, extra) {
  const drop = {};
  for (const id of new Set([...Object.keys(base), ...Object.keys(extra)])) {
    const [aMin, aMax] = base[id] ?? [0, 0];
    const [bMin, bMax] = extra[id] ?? [0, 0];
    drop[id] = [aMin + bMin, aMax + bMax];
  }
  return drop;
}

function armored(base, armorId, id, name) {
  const bonus = ARMOR_BONUS[armorId];
  return {
    ...base,
    id,
    name,
    armor: armorId,
    // 装甲の色をかぶせる。元の色（索敵ゾンビの青など）と混ぜて、
    // 「銀装甲の索敵ゾンビ」も見分けがつくようにする
    tint: base.tint ? mixColor(base.tint, bonus.tint) : bonus.tint,
    animRate: (base.animRate ?? 1) * bonus.animRate,
    hp: base.hp + bonus.hp,
    // 装甲ゾンビの殴りは8。もともとそれより重いミュータントはそのまま
    damage: Math.max(base.damage, bonus.damage),
    drop: mergeDrop(base.drop, bonus.drop),
  };
}

// 落とすコインは硬さに比例させる。通常ゾンビ1枚、ミュータント5枚
function withCoins(def) {
  // ボスは倒した手応えに見合うぶんを、決め打ちで渡す
  if (def.boss) return { ...def, coins: 500 };
  return { ...def, coins: Math.max(1, Math.round(def.hp / 60)) };
}

export const ENEMIES = Object.fromEntries(Object.entries({
  normal: NORMAL_ZOMBIE,
  blue: BLUE_ZOMBIE,
  fast: FAST_ZOMBIE,
  purple: PURPLE_ZOMBIE,
  gamma: GAMMA_ZOMBIE,
  skeleton: SKELETON,
  skeletonArcher: SKELETON_ARCHER,
  swarm: SWARM_ZOMBIE,
  shrieker: SHRIEKER_ZOMBIE,
  climber: CLIMBER_ZOMBIE,
  silver: armored(NORMAL_ZOMBIE, 'silver', 'silver', '銀の装甲ゾンビ'),
  gold: armored(NORMAL_ZOMBIE, 'gold', 'gold', '金の装甲ゾンビ'),
  blueSilver: armored(BLUE_ZOMBIE, 'silver', 'blueSilver', '銀装甲の索敵ゾンビ'),
  blueGold: armored(BLUE_ZOMBIE, 'gold', 'blueGold', '金装甲の索敵ゾンビ'),
  mutant: MUTANT,
  mutantSilver: armored(MUTANT, 'silver', 'mutantSilver', '銀装甲のミュータント'),
  mutantGold: armored(MUTANT, 'gold', 'mutantGold', '金装甲のミュータント'),
  titan: TITAN_BOSS,
  mother: MOTHER_BOSS,
}).map(([id, def]) => [id, withCoins(def)]));
