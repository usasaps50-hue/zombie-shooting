// 職業ごとの必殺技。charge は貯まり方の種類、need はゲージ満タンに必要な量
export const ULTIMATES = {
  soldier: {
    jobId: 'soldier',
    name: 'ボム',
    charge: 'damage',
    need: 250,
    startCharge: 0,
    desc: '一番近いゾンビにボムを投げる（爆発で50ダメージ）。合計250ダメージでチャージ完了。',
  },
  medic: {
    jobId: 'medic',
    name: '野戦病院',
    charge: 'heal',
    need: 100,
    startCharge: 0,
    desc: '小さな病院を建てる。近くにいると毎秒8回復。合計100回復でチャージ完了（蘇生はそのキャラのHP分）。',
  },
  criminal: {
    jobId: 'criminal',
    name: '血の宴',
    charge: 'damage',
    need: 200,
    startCharge: 0,
    desc: '血のゲージが一気に満タンになり、HPも40回復する。合計200ダメージでチャージ完了。',
  },
  architect: {
    jobId: 'architect',
    name: 'ゴッドタレット',
    charge: 'time',
    need: 30,
    startCharge: 0.5,
    desc: 'ロケット砲とドローン3機を呼ぶ。30秒でチャージ完了（開始時は半分）。',
  },
};

export const BOMB = { damage: 50, radius: 4.5, speed: 17, gravity: 22 };

// 犯罪者の必殺技。血のゲージを満タンにして、そのぶん体力も戻す
export const BLOOD_FEAST = { heal: 40 };

// ゴッドタレットは運任せ。残りは失敗（チャージは消える）
export const GOD_TURRET_ODDS = { drones: 0.3, rocket: 0.3 };

export const HOSPITAL = { healPerSecond: 8, radius: 5 };

// ロケットの爆発範囲はボムより小さい
export const GOD_TURRET = { damage: 30, radius: 2.4, interval: 5, range: 26, speed: 22, turnSpeed: 3 };

export const DRONE = {
  // 1回の必殺技で count 機ずつ増え、max を超えると古い機から消える
  count: 3,
  max: 6,
  hp: 20,
  damage: 10,
  interval: 0.5,
  range: 18,
  // スマホの横画面は縦の視野が狭い。見上げなくても入るよう、低めを広く回らせる
  height: 2.3,
  orbitRadius: 4.0,
  orbitSpeed: 0.7,
};
