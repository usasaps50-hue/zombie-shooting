// noise は音がゾンビに届く距離（m）。0 なら誰にも気づかれない
export const ITEMS = {
  pistol: {
    id: 'pistol',
    name: 'ピストル',
    kind: 'gun',
    damage: 15,
    magazine: 6,
    fireInterval: 0.3,
    reloadTime: 1.6,
    range: 60,
    noise: 22,
    icon: '🔫',
  },
  ak47: {
    id: 'ak47',
    name: 'AK47',
    kind: 'gun',
    damage: 2,
    magazine: 24,
    fireInterval: 0.3,
    reloadTime: 5.0,
    range: 70,
    // 音が大きいので、遠くのゾンビまで寄ってくる
    noise: 34,
    icon: '🔫',
  },
  shovel: {
    id: 'shovel',
    name: 'シャベル',
    kind: 'melee',
    damage: 10,
    swingTime: 0.28,
    cooldown: 0.5,
    range: 2.4,
    arc: Math.PI / 3,
    // 振っても、ほとんど音がしない
    noise: 3,
    icon: '🪏',
  },
  hammer: {
    id: 'hammer',
    name: 'ハンマー',
    kind: 'build',
    swingTime: 0.4,
    cooldown: 0.35,
    jobOnly: 'architect',
    icon: '🔨',
  },
  bandage: {
    id: 'bandage',
    name: '包帯',
    kind: 'support',
    heal: 30,
    useTime: 1.0,
    reviveTime: 3.0,
    jobOnly: 'medic',
    icon: '🩹',
  },
  // 犯罪者だけが持つナイフ。相手の「いまのHP」の割合で削る。
  // 血のゲージが溜まっているほど強く、足も速くなる
  knife: {
    id: 'knife',
    name: 'ナイフ',
    kind: 'melee',
    // 与えるのは「相手のいまのHP × hpPercent × 血の割合 ＋ damage」
    damage: 10,
    hpPercent: 0.25,
    // 1回当てるごとに溜まる血のゲージ
    bloodGain: 5,
    swingTime: 0.22,
    cooldown: 1.0,
    range: 2.2,
    arc: Math.PI / 2.2,
    // 刃物なので、ほとんど音がしない
    noise: 3,
    jobOnly: 'criminal',
    icon: '🔪',
  },
  // ネクロマンサーの2本のロッド。どちらも狙った所で爆ぜる範囲魔法を撃つ。
  // リボーンロッドで倒した敵は、確率で味方として起き上がる
  reborn: {
    id: 'reborn',
    name: 'リボーンロッド',
    kind: 'magic',
    damage: 8,
    // 魔法が爆ぜる半径
    blast: 2.6,
    cooldown: 1.4,
    // 連射するので、振りのモーションは短くする
    swingTime: 0.4,
    range: 26,
    // 倒した敵が味方になる確率
    reviveChance: 0.2,
    noise: 14,
    jobOnly: 'necromancer',
    icon: '🪄',
  },
  death: {
    id: 'death',
    name: 'デスロッド',
    kind: 'magic',
    damage: 16,
    blast: 3.0,
    // レベル1の間隔。レベルを上げると data/upgrades.js の値で上書きされる
    cooldown: 3.6,
    swingTime: 0.55,
    range: 26,
    noise: 20,
    jobOnly: 'necromancer',
    icon: '💀',
  },
  // 散らばった味方を、自分のところへ呼び集める旗の杖
  team: {
    id: 'team',
    name: 'チームロッド',
    kind: 'summon',
    cooldown: 20,
    swingTime: 0.7,
    // 呼びかけが届く距離
    range: 30,
    // 集まった味方を、最大HPのこの割合ぶん回復する
    heal: 0,
    // 旗を振って呼ぶので、そこそこ音がする
    noise: 12,
    jobOnly: 'necromancer',
    icon: '🚩',
  },
  // 攻撃はできないが、近くの仲間（と自分）をまとめて強くする
  megaphone: {
    id: 'megaphone',
    name: '拡声器',
    kind: 'buff',
    // 使ってから次に使えるまで
    cooldown: 15,
    swingTime: 0.6,
    // 声が届いて効果がかかる距離
    range: 14,
    // 効果が続く時間
    buffTime: 10,
    // 大声なので、遠くのゾンビにも気づかれる
    noise: 30,
    icon: '📢',
  },
};

export const SELECTABLE_ITEMS = [
  'pistol', 'ak47', 'shovel', 'megaphone', 'knife', 'reborn', 'death', 'team', 'hammer',
];
// 持てる数はクラスのレベルで変わる（progress.js の maxSlots）
export const BASE_SLOTS = 3;
