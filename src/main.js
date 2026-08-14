import * as THREE from 'three';
import { createWorld } from './world.js';
import { Input } from './input.js';
import { Player, EYE_HEIGHT, floorHeight } from './player.js';
import { Weapons } from './weapons.js';
import { ViewModel } from './viewmodel.js';
import { Hud } from './hud.js';
import { Lobby } from './lobby.js';
import { createHub, TALK_RANGE } from './hub.js';
import { Shop, syncJobItems, randomPass } from './shop.js';
import { makeItemIcons } from './itemicon.js';
import { upgradedItem, MAX_LEVEL, ROLLING_SMASH, HEADSHOT } from './data/upgrades.js';
import { Waves } from './waves.js';
import { WAVE } from './data/waves.js';
import { progress, levelOf, addCoins, classBonus, maxSlots } from './progress.js';
import { Teammate, Enemy } from './entities.js';
import { Effects } from './effects.js';
import { Builder } from './build.js';
import { createStructure, overlaps } from './structures.js';
import { UltimateCharge, Projectiles, Drones } from './ultimates.js';
import { ITEMS } from './data/items.js';
import { JOBS, PLAYER } from './data/jobs.js';
import { TURRET, MATERIALS } from './data/builds.js';
import { ULTIMATES, HOSPITAL, DRONE, GOD_TURRET_ODDS } from './data/ultimates.js';
import { ARMOR_GUN_REDUCTION } from './data/classes.js';
import { IS_TOUCH, QUALITY } from './device.js';

const canvas = document.getElementById('game');

// three r160 以降は WebGL2 必須。古い端末では真っ暗になる前に理由を出す
if (!canvas.getContext('webgl2')) {
  document.getElementById('nogl').classList.remove('hidden');
  document.getElementById('lobby').classList.add('hidden');
  throw new Error('WebGL2 not supported');
}

const renderer = new THREE.WebGLRenderer({ canvas, antialias: QUALITY.antialias, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, QUALITY.pixelRatio));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = QUALITY.softShadow ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 300);
const { scene, colliders, spawns, stairPoints } = createWorld();
scene.add(camera);

const input = new Input(canvas);
const hud = new Hud();
const viewModel = new ViewModel(camera);
const effects = new Effects(scene);
const raycaster = new THREE.Raycaster();
const pauseEl = document.getElementById('pause');

const teammates = [
  new Teammate(scene, { name: 'デモ（三人称）', color: 0x5f7f9f, jobId: 'soldier', position: new THREE.Vector3(0, 0, -4) }),
  new Teammate(scene, { name: 'アオイ', color: 0x9f5f5f, jobId: 'medic', position: new THREE.Vector3(4, 0, -6) }),
];
teammates[1].setDowned(true);

// 自分がダウンしたとき、その場に倒れる自分の体
const playerBody = new Teammate(scene, { name: 'あなた', color: 0x5f7f9f, jobId: 'soldier', position: new THREE.Vector3() });
playerBody.setVisible(false);

// ゾンビは作り直さず、この数だけ用意して使い回す。
// 同時に出るのは WAVE.aliveMax 体までなので、これで足りる
const enemies = Array.from(
  { length: WAVE.aliveMax },
  () => new Enemy(scene, new THREE.Vector3(0, 0, 0))
);

const waves = new Waves(enemies, spawns, {
  onWaveStart: (wave, count) => hud.setToast(`ウェーブ ${wave} — ゾンビ ${count} 体`, 2.6),
  onWaveClear: (wave) => {
    addCoins(WAVE.clearCoins);
    if (game) game.coins += WAVE.clearCoins;
    hud.setToast(`ウェーブ ${wave} クリア！ 🪙+${WAVE.clearCoins}`, 3);
  },
});

const builder = new Builder(scene, colliders, {});
const projectiles = new Projectiles(scene, effects);
const drones = new Drones(scene);

const muzzle = new THREE.PointLight(0xffd9a0, 0, 8);
scene.add(muzzle);

const SHOVEL_KNOCKBACK = 4.0;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
// 構えたときの画角。狭くするとズームして見える
const FOV_NORMAL = 75;
const FOV_AIM = 42;

// HUDと店で使う武器アイコン。実際の3Dモデルを描いた画像（金色版も作っておく）
const ITEM_ICONS = makeItemIcons([
  'pistol', 'ak47', 'shovel', 'hammer', 'bandage',
  'pistol:gold', 'ak47:gold', 'shovel:gold',
]);
hud.setIcons(ITEM_ICONS);

const hub = createHub();

let game = null;
let paused = false;
// 'lobby'（合言葉の画面）／'hub'（待機場）／'battle'
let place = 'lobby';
let hubPlayer = null;
let hubTime = 0;
let usePressed = false;
// 最初はシャベルだけ。ピストルもクラスも待機場のお店で買う
let loadout = { passphrase: randomPass(), jobId: 'soldier', items: ['shovel'] };

const shop = new Shop(ITEM_ICONS, {
  onChange: () => hud.setToast('そうびを変えた', 1.2),
  onBattle: () => startGame(loadout),
});
const lobby = new Lobby(enterHub);

// 待機場へ。カメラを待機場のシーンに移して歩けるようにする
function enterHub(next) {
  if (next) {
    loadout = { ...next, items: [...next.items] };
    syncJobItems(loadout);
  }
  game = null;
  paused = false;
  place = 'hub';
  hubTime = 0;
  hubPlayer = new Player(JOBS[loadout.jobId]);
  hubPlayer.position.set(hub.spawn.x, EYE_HEIGHT, hub.spawn.z);
  // 広場とバトルゲートのほう（-Z）を向いて始める
  hubPlayer.yaw = 0;
  hub.scene.add(camera);
  viewModel.setItem(null);
  input.reset();
  shop.close();
  document.body.classList.add('hub');
  pauseEl.classList.add('hidden');
  hud.show();
  hud.setToast('待機場へようこそ。お店で装備をえらんで、奥のゲートからバトルへ', 4);
  if (IS_TOUCH) goLandscapeFullscreen();
  input.requestLock();
}

function startGame(loadout) {
  const job = JOBS[loadout.jobId];
  const player = new Player(job);
  // レベルを反映したアイテムを持っていく
  const weapons = new Weapons(loadout.items.map((id) => upgradedItem(id, levelOf(id))), onWeaponEvent);
  const hasSkill = loadout.items.some((id) => upgradedItem(id, levelOf(id)).effects.skill);

  const bonus = classBonus(job.id);
  player.damageReduction = bonus.damageReduction ?? 0;

  game = {
    player, weapons, loadout, job, hold: 0, holdAction: null,
    bonus,
    ult: new UltimateCharge(job.id, bonus.ultStock ?? 1),
    skill: hasSkill ? { name: 'ローリングスマッシュ', charge: 0, need: ROLLING_SMASH.need, ready: false } : null,
    spin: 0,
    coins: 0,
  };
  place = 'battle';
  hubPlayer = null;
  scene.add(camera);
  document.body.classList.remove('hub');
  input.reset();
  builder.clear();
  projectiles.clear();
  drones.clear();
  builder.materials = { ...(job.materials ?? {}) };
  waves.reset();
  playerBody.setVisible(false);
  playerBody.setDowned(false);
  playerBody.avatar.setHat(job.id);
  hud.buildSlots(loadout.items, maxSlots(job.id));
  hud.show();
  viewModel.setItem(weapons.current?.id ?? null);
  hud.setToast(`バトル開始！ 合言葉「${loadout.passphrase}」`, 2.5);
  if (IS_TOUCH) goLandscapeFullscreen();
  resume();
}

// スタート操作のうちに全画面と横固定を頼む。対応していない端末では黙って何も起きない
async function goLandscapeFullscreen() {
  try {
    await document.documentElement.requestFullscreen?.();
    await screen.orientation?.lock?.('landscape');
  } catch {
    /* iOS Safari など未対応。#rotate の案内でカバーする */
  }
}

function resume() {
  paused = false;
  pauseEl.classList.add('hidden');
  input.requestLock();
}

function pause() {
  paused = true;
  input.reset();
  builder.hideGhost();
  pauseEl.classList.remove('hidden');
  input.releaseLock();
}

function toLobby() {
  game = null;
  paused = false;
  place = 'lobby';
  hubPlayer = null;
  projectiles.clear();
  drones.clear();
  scene.add(camera);
  document.body.classList.remove('hub');
  shop.close();
  pauseEl.classList.add('hidden');
  hud.hide();
  viewModel.setItem(null);
  builder.hideGhost();
  playerBody.setVisible(false);
  lobby.show();
}

document.getElementById('btn-resume').addEventListener('click', resume);
document.getElementById('btn-tolobby').addEventListener('click', toLobby);
document.getElementById('btn-tohub').addEventListener('click', () => {
  projectiles.clear();
  drones.clear();
  builder.clear();
  playerBody.setVisible(false);
  enterHub();
});
const playing = () => place !== 'lobby' && !paused && !shop.open;

document.getElementById('btn-pause').addEventListener('click', () => {
  if (place !== 'lobby') paused ? resume() : pause();
});
canvas.addEventListener('click', () => {
  if (playing()) input.requestLock();
});
addEventListener('keydown', (e) => {
  if (place === 'lobby') return;
  if (e.code === 'Escape') {
    if (shop.open) shop.close();
    else paused ? resume() : pause();
  }
  if (e.code === 'KeyG' && game && !paused) applyDamage(25);
});
document.addEventListener('pointerlockchange', () => {
  if (playing() && !input.locked && !input.isTouch) pause();
});

function onWeaponEvent(ev) {
  if (ev.type === 'shoot') shoot(ev.item);
  else if (ev.type === 'swing') swing(ev.item);
  else if (ev.type === 'empty') hud.setToast('弾切れ — R でリロード');
  else if (ev.type === 'reloaded') hud.setToast('リロード完了');
  else if (ev.type === 'build') return build();
  else if (ev.type === 'cycleBuild') {
    const def = builder.cycleType(1);
    hud.setToast(`${def.name}を選択`, 1.0);
  }
}

function build() {
  const result = builder.place();
  hud.setToast(result.message, result.ok ? 1.4 : 1.6);
  return result.ok;
}

// 倒したゾンビの種類ごとに決まった素材を落とす
function rollDrops(def) {
  const gained = [];
  for (const [id, [min, max]] of Object.entries(def.drop)) {
    const amount = min + Math.floor(Math.random() * (max - min + 1));
    if (amount <= 0) continue;
    builder.add(id, amount);
    gained.push(`${MATERIALS[id].name}+${amount}`);
  }
  return gained.join('　');
}

// source はダメージを出した武器。レベルの特典はこれで判定する
function damageEnemy(enemy, amount, now, source = null) {
  // 装甲を着たゾンビは、銃とタレットの弾が通りにくい
  if (enemy.def.armor && source?.kind === 'gun') amount *= 1 - ARMOR_GUN_REDUCTION;
  amount = Math.max(1, Math.round(amount));
  const dealt = Math.min(amount, enemy.hp);
  // ジャンプ中など、当たらないこともある
  if (!enemy.hit(amount, now)) return false;
  game?.ult.add('damage', dealt);

  const bonus = source?.effects;
  // Lv5のシャベル：当てたダメージの半分を吸収する
  if (bonus?.lifesteal && game) game.player.heal(dealt * bonus.lifesteal);

  if (enemy.alive) return false;

  if (game) {
    const coins = enemy.def.coins;
    addCoins(coins);
    game.coins += coins;
    // Lv3・Lv4のピストル：その武器で倒したときだけ効く
    if (bonus?.healOnKill) game.player.heal(bonus.healOnKill);
    if (bonus?.invulnOnKill) {
      game.player.invulnUntil = Math.max(game.player.invulnUntil, game.player.time + bonus.invulnOnKill);
    }
    hud.setToast(`${enemy.def.name}撃破 — ${rollDrops(enemy.def)}　🪙+${coins}`, 1.6);
  }
  return true;
}

// 弾道と発砲炎は目の中ではなく、手に持った銃の銃口から出す
function muzzleOrigin(dir) {
  const right = new THREE.Vector3().crossVectors(dir, WORLD_UP).normalize();
  return camera.position.clone()
    .addScaledVector(right, 0.28)
    .addScaledVector(WORLD_UP, -0.24)
    .addScaledVector(dir, 0.95);
}

// 銃声。届いた範囲のゾンビが音のした場所へ寄ってくる
function makeNoise(position, radius, now) {
  if (!radius) return;
  for (const enemy of enemies) {
    if (enemy.active && enemy.alive && enemy.position.distanceTo(position) <= radius) {
      enemy.alert(position, now);
    }
  }
}

function shoot(item) {
  const now = performance.now() / 1000;
  const dir = camera.getWorldDirection(new THREE.Vector3());
  muzzle.position.copy(camera.position);
  // サイレンサー付きは発砲炎も控えめ
  muzzle.intensity = item.effects?.silencer ? 4 : 12;
  raycaster.set(camera.position, dir);
  raycaster.far = item.range;
  const hitboxes = enemies.filter((e) => e.alive).map((e) => e.hitbox);
  const hit = raycaster.intersectObjects(hitboxes, false)[0];
  const end = hit ? hit.point : camera.position.clone().addScaledVector(dir, item.range);
  const from = muzzleOrigin(dir);
  effects.muzzleFlash(from, dir);
  effects.tracer(from, end);
  makeNoise(camera.position.clone(), item.noise ?? 0, now);

  if (!hit) return;
  const enemy = enemies.find((e) => e.hitbox === hit.object);
  // 当たった高さが頭の位置なら、ヘッドショット
  const head = hit.point.y - enemy.position.y >= enemy.def.height * HEADSHOT.from;
  const damage = head ? Math.round(item.damage * HEADSHOT.multiplier) : item.damage;
  if (head) effects.headshot(hit.point);
  // 倒したときの表示は damageEnemy 側が出す
  if (!damageEnemy(enemy, damage, now, item)) {
    hud.setToast(head ? `ヘッドショット！ -${damage}` : `ヒット -${damage}`, 0.8);
  }
}

// タレットやドローンの弾も「銃」扱いにして、装甲のダメージ減を効かせる
const BEAM_SOURCE = { kind: 'gun', effects: {} };

// タレットやドローンの射撃。銃口の爆発と弾道は他の人からも見える
function beamShot(shooter, target, damage, now) {
  const from = shooter.muzzle();
  const to = target.position.clone().setY(1.0);
  effects.muzzleFlash(from, to.clone().sub(from).normalize());
  effects.tracer(from, to);
  damageEnemy(target, damage, now, BEAM_SOURCE);
}

function explode(center, radius, damage, now) {
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    const to = enemy.position.clone().sub(center).setY(0);
    if (enemy.position.distanceTo(center) > radius) continue;
    damageEnemy(enemy, damage, now);
    enemy.knockback(to.normalize(), 3.5);
  }
}

function nearestEnemy(from) {
  let best = null;
  let bestDist = Infinity;
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    const dist = enemy.position.distanceTo(from);
    if (dist < bestDist) {
      bestDist = dist;
      best = enemy;
    }
  }
  return best;
}

// 必殺技で出る建物は、見ている方向の少し先に置く
function placeUltStructure(typeId, distance) {
  const dir = camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
  const spot = new THREE.Vector3(game.player.position.x, 0, game.player.position.z).addScaledVector(dir, distance);
  // 高台の上で使ったら、その床の上に置く
  const feet = game.player.position.y - EYE_HEIGHT;
  spot.y = floorHeight(colliders, spot.x, spot.z, feet + 0.4);
  const structure = createStructure(typeId, spot, Math.atan2(-dir.x, -dir.z));
  scene.add(structure.root);
  structure.root.updateMatrixWorld(true);
  structure.refreshBox();

  if (overlaps(structure.box, colliders, builder.structures)) {
    scene.remove(structure.root);
    structure.dispose();
    hud.setToast('ここには置けない — 開けた場所で使おう', 1.8);
    return null;
  }
  builder.enforceLimit(typeId);
  builder.structures.push(structure);
  return structure;
}

const ULT_ACTIONS = {
  soldier: () => {
    const target = nearestEnemy(game.player.position);
    if (!target) {
      hud.setToast('近くにゾンビがいない', 1.4);
      return false;
    }
    projectiles.bomb(muzzleOrigin(camera.getWorldDirection(new THREE.Vector3())), target.position);
    hud.setToast(`${ULTIMATES.soldier.name}を投げた！`, 1.6);
    return true;
  },

  medic: () => {
    if (!placeUltStructure('hospital', 4.2)) return false;
    hud.setToast(`${ULTIMATES.medic.name}を建てた！ 近くにいると毎秒${HOSPITAL.healPerSecond}回復`, 2.4);
    return true;
  },

  // 何が出るかは運。3割でドローン、3割でロケット砲、4割は失敗
  architect: () => {
    const roll = Math.random();
    if (roll < GOD_TURRET_ODDS.drones) {
      drones.spawn(game.player.position);
      hud.setToast(`${ULTIMATES.architect.name}：ドローン${DRONE.count}機！（いま${drones.count}／${DRONE.max}機）`, 2.4);
      return true;
    }
    if (roll < GOD_TURRET_ODDS.drones + GOD_TURRET_ODDS.rocket) {
      if (!placeUltStructure('godturret', 4.0)) return false;
      hud.setToast(`${ULTIMATES.architect.name}：ロケット砲！`, 2.4);
      return true;
    }
    hud.setToast(`${ULTIMATES.architect.name}：失敗… 何も出なかった`, 2.4);
    return true;
  },
};

function useUltimate() {
  const { player, ult, job } = game;
  if (player.downed) return;
  if (!ult.ready) {
    hud.setToast(`${ult.def.name}はチャージ中（${Math.floor(ult.value * 100)}%）`, 1.4);
    return;
  }
  if (ULT_ACTIONS[job.id]()) ult.consume();
}

// 野戦病院の周りにいる味方とタレットを回復し続ける
function healAround(hospital, dt) {
  const amount = HOSPITAL.healPerSecond * dt;
  const center = hospital.root.position;

  for (const s of builder.structures) {
    if (s === hospital || !s.alive) continue;
    if (s.def.kind !== 'turret' && s.def.kind !== 'godturret') continue;
    if (s.root.position.distanceTo(center) <= HOSPITAL.radius) s.heal(amount);
  }

  if (!game || paused || game.player.downed) return;
  const p = game.player.position;
  if (Math.hypot(p.x - center.x, p.z - center.z) <= HOSPITAL.radius) game.player.heal(amount);
}

function swing(item) {
  const origin = camera.position;
  const flat = camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
  effects.swingArc(new THREE.Vector3(origin.x, 1.1, origin.z), game.player.yaw, item.range, item.arc);
  // シャベルはほとんど音がしないので、すぐ近くにしか気づかれない
  makeNoise(origin.clone(), item.noise ?? 0, performance.now() / 1000);

  let hits = 0;
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    const to = enemy.position.clone().sub(origin);
    to.y = 0;
    const dist = to.length();
    if (dist > item.range) continue;
    if (to.normalize().dot(flat) < Math.cos(item.arc / 2)) continue;
    damageEnemy(enemy, item.damage, performance.now() / 1000, item);
    enemy.knockback(to, SHOVEL_KNOCKBACK);
    hits++;
  }
  if (!hits) return;
  hud.setToast(`ヒット -${item.damage}`, 0.8);
  chargeSkill(item);
}

// 攻撃を当てた回数でスキルが貯まる。1回の振りで何体当てても1回ぶん
function chargeSkill(item) {
  const { skill } = game;
  if (!skill || !item.effects?.skill || skill.ready) return;
  skill.charge = Math.min(skill.need, skill.charge + 1);
  skill.ready = skill.charge >= skill.need;
  if (skill.ready) hud.setToast(`${skill.name}が使える！`, 1.6);
}

// シャベルLv3のスキル。回転して全方向のゾンビを巻き込む
function useSkill() {
  const { player, weapons, skill } = game;
  if (!skill || player.downed) return;
  const item = weapons.current;
  if (!item?.effects?.skill) {
    hud.setToast('シャベルを持っているときに使えます', 1.4);
    return;
  }
  if (!skill.ready) {
    hud.setToast(`${skill.name}は 攻撃${skill.need - skill.charge}回ぶん たりない`, 1.4);
    return;
  }

  skill.charge = 0;
  skill.ready = false;
  game.spin = ROLLING_SMASH.spinTime;
  weapons.play('swing', ROLLING_SMASH.spinTime);

  const origin = camera.position;
  const range = ROLLING_SMASH.range * (1 + (item.effects.rangeBonus ?? 0));
  effects.swingArc(new THREE.Vector3(origin.x, 1.1, origin.z), player.yaw, range, Math.PI * 2);

  const now = performance.now() / 1000;
  const damage = Math.round(item.damage * ROLLING_SMASH.damageScale);
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    const to = enemy.position.clone().sub(origin).setY(0);
    if (to.length() > range) continue;
    damageEnemy(enemy, damage, now, item);
    enemy.knockback(to.normalize(), SHOVEL_KNOCKBACK);
  }
  hud.setToast(`${skill.name}！`, 1.4);
}

// ミュータントが狙う候補。人・味方・建てたものの位置を集める
function slamTargets() {
  const spots = builder.structures.filter((s) => s.alive).map((s) => s.root.position);
  for (const mate of teammates) spots.push(mate.position);
  spots.push(...drones.positions());
  if (game && !paused && !game.player.downed) {
    spots.push(new THREE.Vector3(game.player.position.x, 0, game.player.position.z));
  }
  return spots;
}

// ミュータントの着地。地面が割れて、周りのもの全部にダメージ
function slam(enemy, damage, radius, now) {
  const center = enemy.position.clone().setY(0);
  effects.groundCrack(center, radius);
  hud.setToast(`${enemy.def.name}が着地した！`, 1.6);

  for (const s of builder.structures) {
    if (s.alive && s.root.position.distanceTo(center) <= radius && s.damage(damage)) {
      hud.setToast(`${s.def.name}が壊された`, 1.4);
    }
  }
  drones.damageAt(center, radius, damage);

  if (!game || paused) return;
  const p = game.player.position;
  if (Math.hypot(p.x - center.x, p.z - center.z) <= radius) applyDamage(damage);
}

// 叩きつけで地面が割れる
function smashGround(enemy) {
  const dir = new THREE.Vector3(-Math.sin(enemy.facing), 0, -Math.cos(enemy.facing));
  const spot = enemy.position.clone().setY(0).addScaledVector(dir, enemy.def.reach * 0.6);
  effects.groundCrack(spot, enemy.def.crackRadius);
}

// 被弾モーションは、撃つ・振るモーションより優先して他の人に見せる
function hurtAnim(player) {
  const t = (player.time - player.hurtAt) / PLAYER.hurtTime;
  return t >= 0 && t < 1 ? { name: 'hurt', t } : null;
}

// 回転斬りの最中は、三人称でもぐるぐる回して見せる
function spinAnim() {
  if (!game.spin) return null;
  return { name: 'spin', t: 1 - game.spin / ROLLING_SMASH.spinTime };
}

function applyDamage(amount) {
  const { player } = game;
  const wentDown = player.damage(amount);
  if (!wentDown) return;
  playerBody.position.set(player.position.x, 0, player.position.z);
  playerBody.avatar.root.rotation.y = player.yaw + Math.PI;
  playerBody.setDowned(true);
  playerBody.setVisible(true);
  hud.setToast('ダウン — 衛生兵の蘇生を待とう', 3);
}

function contextAction(dt) {
  const { player, job } = game;
  if (player.downed) return { text: '倒れています（味方の蘇生を待っています）', progress: 0 };

  const downedNear = teammates.find(
    (t) => t.downed && t.position.distanceTo(player.position) < 2.5
  );

  if (job.canRevive && player.bandages > 0 && downedNear) {
    return holdAction(dt, 'revive', ITEMS.bandage.reviveTime,
      `${downedNear.name} を蘇生（${input.isTouch ? '「使」長押し' : 'E長押し'}）`,
      () => {
        downedNear.setDowned(false);
        player.bandages--;
        // 蘇生は、その味方のHPぶんを回復したものとして必殺技に加算する
        game.ult.add('heal', downedNear.maxHp);
        hud.setToast(`${downedNear.name} を蘇生！ ${PLAYER.reviveInvulnTime}秒間無敵`, 2.5);
      });
  }

  if (player.bandages > 0 && player.hp < player.maxHp) {
    return holdAction(dt, 'heal', ITEMS.bandage.useTime,
      `包帯を使う（HP+${ITEMS.bandage.heal}／残り${player.bandages}）`,
      () => {
        game.ult.add('heal', player.heal(ITEMS.bandage.heal));
        player.bandages--;
        hud.setToast(`包帯を使った（HP+${ITEMS.bandage.heal}）`);
      });
  }

  game.hold = 0;
  game.holdAction = null;
  return { text: '', progress: 0 };
}

function holdAction(dt, key, duration, text, onDone) {
  if (game.holdAction !== key) {
    game.holdAction = key;
    game.hold = 0;
  }
  if (input.use) {
    game.hold += dt;
    if (game.hold >= duration) {
      game.hold = 0;
      onDone();
      return { text: '', progress: 0 };
    }
  } else {
    game.hold = 0;
  }
  return { text, progress: game.hold / duration };
}

// 話しかけられる相手が近くにいるか
function nearestZone() {
  let best = null;
  let bestDist = TALK_RANGE;
  for (const zone of hub.zones) {
    const dist = Math.hypot(hubPlayer.position.x - zone.position.x, hubPlayer.position.z - zone.position.z);
    if (dist < bestDist) {
      best = zone;
      bestDist = dist;
    }
  }
  return best;
}

function enterZone(zone) {
  shop.show(zone.id, loadout);
  input.reset();
  input.releaseLock();
}

function updateHub(dt) {
  hubTime += dt;
  // 店員はずっと手を振っている
  for (const npc of hub.npcs) {
    npc.avatar.update(dt, { anim: { name: 'wave', t: hubTime }, speed: 0, pitch: 0 });
  }

  if (shop.open || paused) {
    hud.updateHub(dt, '');
    usePressed = false;
    return;
  }

  hubPlayer.update(dt, input, hub.colliders);
  hubPlayer.applyToCamera(camera);

  const zone = nearestZone();
  // 押しっぱなしで開き直さないよう、押した瞬間だけ拾う
  if (zone && input.use && !usePressed) enterZone(zone);
  usePressed = input.use;

  const hint = input.isTouch ? '使' : 'E';
  hud.updateHub(dt, zone ? `${zone.label}（${hint}）` : '');
}

const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.1);
  const now = performance.now() / 1000;

  if (place === 'hub') {
    updateHub(dt);
    renderer.render(hub.scene, camera);
    return;
  }

  muzzle.intensity = Math.max(0, muzzle.intensity - dt * 90);

  const world = {
    colliders,
    structures: builder.structures,
    player: game && !paused ? game.player : null,
    onHitPlayer: (enemy, amount) => {
      applyDamage(amount);
      if (enemy.def.crackRadius) smashGround(enemy);
      // ミュータントは殴った範囲のドローンも巻き込む
      if (enemy.def.breaksDrones) {
        drones.damageAt(enemy.position, enemy.def.reach + 1.5, enemy.def.droneDamage);
      }
    },
    onBreak: (enemy, structure, amount) => {
      if (enemy.def.crackRadius) smashGround(enemy);
      if (structure.damage(amount)) hud.setToast(`${structure.def.name}が壊された`, 1.4);
    },
    onSlam: (enemy, damage, radius) => slam(enemy, damage, radius, now),
    slamTargets,
    stairPoints,
  };
  if (game && !paused) waves.update(dt);
  for (const e of enemies) e.update(dt, now, world);
  for (const s of builder.structures) {
    if (s.def.kind === 'turret') s.update(dt, enemies, (turret, target) => beamShot(turret, target, TURRET.damage, now));
    else if (s.def.kind === 'godturret') s.update(dt, enemies, (turret, target) => projectiles.rocket(turret.muzzle(), target.position));
    else if (s.def.kind === 'hospital') healAround(s, dt);
  }
  projectiles.update(dt, enemies, (center, radius, damage) => explode(center, radius, damage, now));

  builder.removeDead();
  effects.update(dt);

  if (game && !paused) {
    const { player, weapons, ult } = game;
    player.update(dt, input, colliders);
    if (!player.downed) player.applyToCamera(camera);
    weapons.update(dt);

    ult.tick(dt);
    drones.update(dt, player.position, enemies, (drone, target) => beamShot(drone, target, DRONE.damage, now));

    game.spin = Math.max(0, game.spin - dt);

    const slot = input.consumeSlot();
    if (slot !== null) weapons.select(slot);
    if (input.consumeReload()) weapons.reload();
    if (input.consumeUlt()) useUltimate();
    if (input.consumeSkill()) useSkill();
    if (input.fire && !player.downed) weapons.trigger();

    // 持っている武器のレベル特典（シャベルLv2の移動速度など）
    player.speedBonus = (weapons.current?.effects?.speedBonus ?? 0) + (game.bonus.speedBonus ?? 0);

    const held = player.downed ? null : weapons.current?.id ?? null;
    const heldGold = held ? levelOf(held) >= MAX_LEVEL : false;
    const heldSilencer = !!weapons.current?.effects?.silencer;
    viewModel.setItem(held, heldGold, heldSilencer);
    const anim = weapons.animProgress();

    // 銃を持っているときだけ構えられる。画角をなめらかに寄せる
    const canAim = weapons.current?.kind === 'gun' && !player.downed;
    const aiming = canAim && input.aim;
    viewModel.aim = aiming;
    hud.setAiming(canAim, aiming);
    const wantFov = aiming ? FOV_AIM : FOV_NORMAL;
    if (Math.abs(camera.fov - wantFov) > 0.05) {
      camera.fov = THREE.MathUtils.lerp(camera.fov, wantFov, Math.min(dt * 12, 1));
      camera.updateProjectionMatrix();
    }

    if (weapons.current?.kind === 'build' && !player.downed) builder.aim(camera, player.position);
    else builder.hideGhost();
    viewModel.update(dt, anim, Math.min(player.speed / 4.5, 1));

    teammates[0].avatar.setItem(held, heldGold, heldSilencer);
    teammates[0].update(dt, { itemId: held, anim: spinAnim() ?? hurtAnim(player) ?? anim });
    teammates[1].update(dt, { itemId: null, anim: { name: 'idle', t: 0 } });

    if (player.downed) {
      playerBody.update(dt, { itemId: null, anim: { name: 'idle', t: 0 } });
      // 倒れた瞬間は自分の体、そのあと味方を観戦する
      const watchSelf = player.time - player.downedAt < 2.5;
      const target = watchSelf ? playerBody : (teammates.find((t) => !t.downed) ?? teammates[0]);
      const eye = target.position.clone().add(new THREE.Vector3(0, 3.2, 4.5));
      camera.position.lerp(eye, Math.min(dt * 3, 1));
      camera.lookAt(target.position.clone().setY(watchSelf ? 0.4 : 1.2));
    }

    const ctx = contextAction(dt);
    hud.update(dt, {
      player,
      weapons,
      promptText: ctx.text,
      holdProgress: ctx.progress,
      builder: game.job.materials ? builder : null,
      ult,
      skill: game.skill,
      coins: progress.coins,
      waves,
    });
  } else if (game) {
    hud.update(dt, {
      player: game.player,
      weapons: game.weapons,
      promptText: '',
      holdProgress: 0,
      builder: game.job.materials ? builder : null,
      ult: game.ult,
      skill: game.skill,
      coins: progress.coins,
      waves,
    });
  } else {
    camera.position.set(0, EYE_HEIGHT, 8);
    camera.rotation.set(0, Math.sin(now * 0.12) * 0.35, 0, 'YXZ');
    teammates[0].update(dt, { itemId: 'pistol', anim: { name: 'idle', t: 0 } });
    teammates[1].update(dt, { itemId: null, anim: { name: 'idle', t: 0 } });
  }

  renderer.render(scene, camera);
}
frame();

const rotateEl = document.getElementById('rotate');

function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, QUALITY.pixelRatio));

  const portrait = IS_TOUCH && innerHeight > innerWidth;
  rotateEl.classList.toggle('hidden', !portrait);
  if (portrait) input.reset();
}

addEventListener('resize', resize);
// iOS は回転直後の innerWidth が古いままなので、少し待ってもう一度合わせる
addEventListener('orientationchange', () => setTimeout(resize, 300));
resize();
