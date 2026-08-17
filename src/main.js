import * as THREE from 'three';
import { createWorld } from './world.js';
import { preloadModels } from './gltfmodel.js';
import { Input } from './input.js';
import { Player, EYE_HEIGHT, floorHeight } from './player.js';
import { Weapons } from './weapons.js';
import { ViewModel } from './viewmodel.js';
import { Hud } from './hud.js';
import { Lobby } from './lobby.js';
import { createHub, TALK_RANGE } from './hub.js';
import { Shop, syncJobItems, randomPass } from './shop.js';
import { makeItemIcons } from './itemicon.js';
import {
  upgradedItem, MAX_LEVEL, ROLLING_SMASH, HEADSHOT, buffOf, buffText, BLOOD, knifeDamage,
} from './data/upgrades.js';
import { Waves } from './waves.js';
import { WAVE, pickType, hpScale } from './data/waves.js';
import { progress, levelOf, addCoins, classBonus, maxSlots, playerName } from './progress.js';
import { Teammate, Enemy } from './entities.js';
import { Net, Ticker } from './net.js';
import { RemotePlayer, packPlayer } from './remote.js';
import { NET, playerHz, HUB_ROOM } from './data/netconfig.js';
import { packWorld, applyEnemies, applyStructures, unpackWaves } from './netsync.js';
import { Effects } from './effects.js';
import { Builder } from './build.js';
import { createStructure, overlaps } from './structures.js';
import { UltimateCharge, Projectiles, Drones } from './ultimates.js';
import { EnemyShots } from './enemyshots.js';
import { ITEMS } from './data/items.js';
import { JOBS, PLAYER, ENEMIES } from './data/jobs.js';
import { TURRET, MATERIALS } from './data/builds.js';
import {
  ULTIMATES, HOSPITAL, DRONE, GOD_TURRET_ODDS, BLOOD_FEAST, SHADOW_ARMY,
} from './data/ultimates.js';
import { ARMOR_GUN_REDUCTION } from './data/classes.js';
import { IS_TOUCH, QUALITY } from './device.js';
import { sfx } from './audio.js';
import { Minions, MINION, BOSS_MINION } from './minion.js';
import { Shockwave, TITAN, MOTHER } from './boss.js';
import { Chat, cleanText } from './chat.js';

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
// 外から持ってきたモデルを先に読み込む。
// 読めなくても手作りのモデルで遊べるので、失敗しても止めない
await preloadModels();

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
  onWaveStart: (wave, count) => {
    sfx.play('wave');
    hud.setToast(`ウェーブ ${wave} — ゾンビ ${count} 体`, 2.6);
  },
  onBossSpawn: (boss) => setupBoss(boss),
  onWaveClear: (wave) => {
    addCoins(WAVE.clearCoins);
    if (game) game.coins += WAVE.clearCoins;
    hud.setToast(`ウェーブ ${wave} クリア！ 🪙+${WAVE.clearCoins}`, 3);
  },
});

const builder = new Builder(scene, colliders, {});
const projectiles = new Projectiles(scene, effects);
const drones = new Drones(scene);
// ガンマゾンビの弾と、弓スケルトンの矢
const enemyShots = new EnemyShots(scene);
// ネクロマンサーが従える味方。連れて歩ける数に上限はない
const minions = new Minions(scene);

const muzzle = new THREE.PointLight(0xffd9a0, 0, 8);
scene.add(muzzle);

// ---- オンライン ----
const net = new Net();
// id -> RemotePlayer
const remotes = new Map();
const playerTick = new Ticker(NET.playerHz);
const worldTick = new Ticker(NET.worldHz);
// 子のとき、親から届いたウェーブの様子（HUDに出すだけ）
const netWaves = { wave: 0, remaining: 0, total: 0, state: 'break', timer: 0 };
// 親が建てたものを、子側で見つけるための番号
let structureKey = 0;
// 前のフレームで自分が親だったか。親が抜けた瞬間を見つけるのに使う
let wasHost = true;
// ゾンビに「誰を狙うか」を渡すための入れ物。毎フレーム作り直さず使い回す
const playerTargets = [];
const localTarget = { id: net.id, position: new THREE.Vector3(), downed: false, local: true };
setupNet();

const SHOVEL_KNOCKBACK = 4.0;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
// 構えたときの画角。狭くするとズームして見える
const FOV_NORMAL = 75;
const FOV_AIM = 42;

// HUDと店で使う武器アイコン。実際の3Dモデルを描いた画像（金色版も作っておく）
const ITEM_ICONS = makeItemIcons([
  'pistol', 'ak47', 'shovel', 'hammer', 'bandage', 'megaphone', 'knife', 'reborn', 'death', 'team', 'spear',
  'pistol:gold', 'ak47:gold', 'shovel:gold', 'megaphone:gold', 'knife:gold',
  'reborn:gold', 'death:gold', 'team:gold', 'spear:gold',
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
const lobby = new Lobby(enterHub, () => {
  // ログアウト。オンラインの部屋からも出て、チャットも消す
  leaveRoom();
  chat.clear();
  chat.hide();
});

// 待機場のチャット。書いている間はゲームの操作を止める
const chat = new Chat({
  onOpen: () => {
    input.setTextMode(true);
    input.releaseLock();
  },
  onClose: () => {
    input.setTextMode(false);
    if (place === 'hub' && !paused && !shop.open) input.requestLock();
  },
  onSend: (text) => {
    const me = loadout.name || playerName();
    chat.say(me, text, { self: true });
    sfx.play('chat');
    net.send('chat', { i: net.id, n: me, m: text });
  },
});

// 待機場へ。カメラを待機場のシーンに移して歩けるようにする
function enterHub(next) {
  if (next) {
    loadout = { ...next, items: [...next.items] };
    syncJobItems(loadout);
  }
  // 姿はシーンごとに置き直すので、いったん全部消す
  clearRemotes();
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
  chat.show();
  hud.setToast('待機場へようこそ。お店で装備をえらんで、奥のゲートからバトルへ（広場の左手前、緑に光る柱が「あやしい端末」）', 5);
  if (IS_TOUCH) goLandscapeFullscreen();
  input.requestLock();

  // 待機場は合言葉に関係なく、みんな同じ部屋に集まる
  net.join(HUB_ROOM, {
    name: loadout.name || playerName(),
    jobId: loadout.jobId,
  }).catch(() => {});
}

// 持っていく武器から、使えるスキルを決める
function makeSkill(loadout) {
  for (const id of loadout.items) {
    const kind = upgradedItem(id, levelOf(id)).effects.skill;
    if (kind === 'bloodRelease') {
      return { kind, name: '血の解放', itemName: 'ナイフ', charge: 0, need: 0, ready: true };
    }
    if (kind === 'rollingSmash') {
      return {
        kind, name: 'ローリングスマッシュ', itemName: 'シャベル',
        charge: 0, need: ROLLING_SMASH.need, ready: false,
      };
    }
  }
  return null;
}

function startGame(loadout) {
  const job = JOBS[loadout.jobId];
  const player = new Player(job);
  // レベルを反映したアイテムを持っていく
  const weapons = new Weapons(loadout.items.map((id) => upgradedItem(id, levelOf(id))), onWeaponEvent);

  const bonus = classBonus(job.id);
  player.damageReduction = bonus.damageReduction ?? 0;

  game = {
    player, weapons, loadout, job, hold: 0, holdAction: null,
    bonus,
    ult: new UltimateCharge(job.id, bonus.ultStock ?? 1),
    skill: makeSkill(loadout),
    spin: 0,
    coins: 0,
  };
  place = 'battle';
  hubPlayer = null;
  scene.add(camera);
  document.body.classList.remove('hub');
  chat.hide();
  input.reset();
  builder.clear();
  projectiles.clear();
  enemyShots.clear();
  minions.clear();
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

  // 同じ合言葉の人と同じ部屋に入る。設定していなければ、そのままひとりで遊ぶ
  clearRemotes();
  structureKey = 0;
  net.join(loadout.passphrase, {
    name: loadout.name || playerName(),
    jobId: job.id,
  }).catch(() => {});
}

// 部屋を出るときの後片付け
function clearRemotes() {
  for (const remote of remotes.values()) remote.dispose();
  remotes.clear();
}

function leaveRoom() {
  net.leave();
  clearRemotes();
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
  leaveRoom();
  projectiles.clear();
  enemyShots.clear();
  minions.clear();
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
  enemyShots.clear();
  minions.clear();
  drones.clear();
  builder.clear();
  shockwaves.length = 0;
  dashState = null;
  playerBody.setVisible(false);
  enterHub();
});
// ブラウザは操作があるまで音を出せない。最初のクリックやキーで用意する
for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
  addEventListener(ev, () => sfx.unlock(), { once: false, passive: true });
}

const playing = () => place !== 'lobby' && !paused && !shop.open && !chat.typing;

document.getElementById('btn-pause').addEventListener('click', () => {
  if (place !== 'lobby') paused ? resume() : pause();
});
canvas.addEventListener('click', () => {
  if (playing()) input.requestLock();
});
addEventListener('keydown', (e) => {
  if (place === 'lobby') return;
  // 待機場では Enter でチャットをひらく（入力中のキーは chat.js が止めている）
  if (e.code === 'Enter' && place === 'hub' && !paused && !shop.open) {
    e.preventDefault();
    chat.open();
    return;
  }
  if (chat.typing) return;
  if (e.code === 'Escape') {
    if (shop.open) shop.close();
    else paused ? resume() : pause();
  }
  if (e.code === 'KeyG' && game && !paused) applyDamage(25);
  if (e.code === 'KeyM') hud.setToast(sfx.toggleMute() ? '🔇 音を消した（M でもどす）' : '🔊 音を出した', 1.6);
});
document.addEventListener('pointerlockchange', () => {
  if (playing() && !input.locked && !input.isTouch) pause();
});

function onWeaponEvent(ev) {
  if (ev.type === 'shoot') shoot(ev.item);
  else if (ev.type === 'swing') swing(ev.item);
  else if (ev.type === 'empty') {
    sfx.play('empty');
    hud.setToast('弾切れ — R でリロード');
  } else if (ev.type === 'reloaded') {
    sfx.play('reload');
    hud.setToast('リロード完了');
  }
  else if (ev.type === 'build') return build();
  else if (ev.type === 'buff') return useMegaphone(ev.item);
  else if (ev.type === 'summon') return useTeamRod(ev.item);
  else if (ev.type === 'dash') return spearDash(ev.item);
  else if (ev.type === 'cast') return castRod(ev.item);
  else if (ev.type === 'cycleBuild') {
    const def = builder.cycleType(1);
    hud.setToast(`${def.name}を選択`, 1.0);
  }
}

// ロッドの範囲魔法。見ている先で爆ぜて、まわりのゾンビをまとめて削る
// 照準の先で最初にぶつかる場所。ゾンビ・壁・建てたもの・地面のうち
// 一番手前を選ぶ。これをしないと、足元を見て撃っても遠くへ飛んでしまう
const aimRay = new THREE.Ray();
const aimHit = new THREE.Vector3();
function aimPoint(dir, range) {
  const from = camera.position;
  let best = range;

  // ゾンビ
  raycaster.set(from, dir);
  raycaster.far = range;
  const hit = raycaster.intersectObjects(enemies.filter((e) => e.alive).map((e) => e.hitbox), false)[0];
  if (hit) best = Math.min(best, hit.distance);

  // 壁・建物・床
  aimRay.set(from, dir);
  for (const c of colliders) {
    if (aimRay.intersectBox(c, aimHit)) best = Math.min(best, aimHit.distanceTo(from));
  }
  for (const s of builder.structures) {
    if (s.alive && aimRay.intersectBox(s.box, aimHit)) best = Math.min(best, aimHit.distanceTo(from));
  }

  // 地面（当たり判定を持っていないので、y=0 の面として自分で見る）
  if (dir.y < -0.001) best = Math.min(best, from.y / -dir.y);

  return from.clone().addScaledVector(dir, Math.max(0.6, best));
}

// 杖の先。ここから魔法が飛んでいくように見せる
function rodTip(dir) {
  const right = new THREE.Vector3().crossVectors(dir, WORLD_UP).normalize();
  return camera.position.clone()
    .addScaledVector(right, 0.22)
    .addScaledVector(WORLD_UP, -0.08)
    .addScaledVector(dir, 1.1);
}

function castRod(item) {
  const { player } = game;
  if (player.downed) return false;
  const now = performance.now() / 1000;
  const dir = camera.getWorldDirection(new THREE.Vector3());

  // 見ている先の、ぶつかる所を狙う
  const spot = aimPoint(dir, item.range);
  // 魔法陣は足元に描きたいので、その真下の床に下ろす
  spot.y = floorHeight(colliders, spot.x, spot.z, spot.y + 0.6);

  const reborn = item.id === 'reborn';
  const color = reborn ? 0x6bd8ff : 0xb45cff;
  effects.magicBolt(rodTip(dir), spot, color);
  effects.magicBlast(spot, item.blast, color);
  sfx.play('cast');
  sfx.playAt('blast', spot);
  makeNoise(camera.position.clone(), item.noise ?? 0, now);

  let hits = 0;
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    if (enemy.position.distanceTo(spot) > item.blast) continue;
    // 倒したときに味方として起こしたいので、倒れる前の姿を控えておく
    const def = enemy.def;
    const spawn = enemy.position.clone();
    const killed = damageEnemy(enemy, item.damage, now, item);
    if (killed && reborn) tryRevive(def, spawn, item);
    hits++;
  }
  if (hits) hud.setToast(`${item.name} — ${hits}体に ${item.damage}ダメージ`, 1.2);
  return true;
}

// リボーンロッドで倒した敵を、確率で味方として起こす
function tryRevive(def, position, item, ownerId = net.id) {
  if (Math.random() >= (item.reviveChance ?? 0)) return false;
  // ふつうの敵は元のHPの半分。ボスはそのままだと硬すぎるので、もっと減らす
  const maxHp = def.boss
    ? Math.max(1, Math.round(def.hp * BOSS_MINION.hpScale))
    : Math.max(1, Math.round(def.hp / 2));
  minions.add({ defId: def.id, ownerId, maxHp }, position);
  effects.raise(position);
  sfx.playAt('raise', position);
  // 必殺技のゲージは「味方にした数」で貯まる。倒したのが他の人ならその人に渡す
  if (ownerId === net.id) {
    game?.ult.add('revive', 1);
    hud.setToast(def.boss
      ? `⭐ ${def.name}が味方になった！（弱くなっているが心強い）`
      : `${def.name}が味方になった！（味方 ${minions.count}体）`, def.boss ? 3.2 : 1.8);
  } else {
    net.send('mini', { to: ownerId, n: def.name });
  }
  return true;
}

// 拡声器。自分と、声の届く仲間をまとめて強くする
function useMegaphone(item) {
  const { player } = game;
  if (player.downed) return false;
  const buff = buffOf(item);
  if (!buff) {
    hud.setToast('この拡声器にはまだ効果がない', 1.6);
    return false;
  }

  const now = performance.now() / 1000;
  const range = item.range;
  player.applyBuff(buff, item.buffTime);
  effects.shout(new THREE.Vector3(player.position.x, player.position.y - EYE_HEIGHT, player.position.z), range);
  sfx.play('megaphone');
  // 大声なので、マップにいるゾンビ全部が声のした場所へ集まってくる
  const spot = player.position.clone();
  makeNoise(spot, Infinity, now, 25);
  net.send('fx', { k: 'call', p: [r2(spot.x), r2(spot.y), r2(spot.z)] });

  // 声の届く仲間にも同じ効果を配る
  let reached = 0;
  for (const remote of remotes.values()) {
    if (remote.downed || !remote.placed) continue;
    if (remote.position.distanceTo(player.position) > range) continue;
    net.send('buff', { to: remote.id, b: buff, t: item.buffTime });
    reached++;
  }

  const who = reached ? `自分と仲間${reached}人` : '自分';
  hud.setToast(`${item.name}！ ${who}に ${buffText(buff)}（${item.buffTime}秒）`, 2.6);
  return true;
}

// チームロッド。散らばった味方を自分のところへ呼び集める
function useTeamRod(item) {
  const { player } = game;
  if (player.downed) return false;
  const feet = new THREE.Vector3(player.position.x, player.position.y - EYE_HEIGHT, player.position.z);

  effects.rally(feet, 9);
  sfx.play('rally');
  makeNoise(player.position.clone(), item.noise ?? 0, performance.now() / 1000);

  // 味方を動かしているのは親。子のときは親に呼んでもらう
  if (net.online && !net.isHost) {
    net.send('gather', { by: net.id, r: item.range, h: item.heal ?? 0 });
    hud.setToast(`${item.name}！ 味方を呼んだ`, 1.8);
    return true;
  }

  const { called, healed } = minions.callTo(net.id, feet, item.range, item.heal ?? 0);
  if (!called) {
    hud.setToast('呼べる味方がいない', 1.4);
    return false;
  }
  const healText = healed > 0 ? `／HP+${Math.round(healed)}` : '';
  hud.setToast(`${item.name}！ 味方${called}体を呼んだ${healText}`, 2.0);
  return true;
}

function build() {
  // 子は自分では建てない。素材だけ払って、親に建ててもらう
  if (net.online && !net.isHost) {
    const check = builder.canPlace();
    if (!check.ok) {
      hud.setToast(check.message, 1.6);
      return false;
    }
    builder.payFor(builder.typeId);
    net.send('build', {
      t: builder.typeId,
      x: r2(builder.ghostPos.x), y: r2(builder.ghostPos.y), z: r2(builder.ghostPos.z),
      yaw: r2(builder.ghostYaw),
    });
    hud.setToast(`${builder.def.name}を建てた`, 1.4);
    return true;
  }

  const result = builder.place();
  if (result.ok) result.structure.netKey = ++structureKey;
  sfx.play(result.ok ? 'build' : 'empty');
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

// 倒したごほうび。コイン・素材・武器レベルの特典をまとめて渡す
function awardKill(def, source, mine = true) {
  if (!game) return;
  // コインは、誰が倒しても部屋にいる全員がもらう
  const coins = def.coins;
  addCoins(coins);
  game.coins += coins;
  sfx.play('coin');
  if (!mine) {
    hud.setToast(`${def.name}が倒された　🪙+${coins}`, 1.4);
    return;
  }
  const bonus = source?.effects;
  // Lv3・Lv4のピストル：その武器で倒したときだけ効く
  if (bonus?.healOnKill) game.player.heal(bonus.healOnKill);
  if (bonus?.invulnOnKill) {
    game.player.invulnUntil = Math.max(game.player.invulnUntil, game.player.time + bonus.invulnOnKill);
  }
  sfx.play('coin');
  hud.setToast(`${def.name}撃破 — ${rollDrops(def)}　🪙+${coins}`, 1.6);
}

// source はダメージを出した武器。レベルの特典はこれで判定する。
// by は「誰が当てたか」。オンラインでは、この人がコインと素材をもらう
function damageEnemy(enemy, amount, now, source = null, by = net.id, part = null) {
  // 拡声器がかかっている間は、自分の攻撃だけ威力が上がる
  if (by === net.id && game && source) amount *= game.player.powerScale;
  // 装甲を着たゾンビは、銃とタレットの弾が通りにくい
  if (enemy.def.armor && source?.kind === 'gun') amount *= 1 - ARMOR_GUN_REDUCTION;
  amount = Math.max(1, Math.round(amount));

  // 子はダメージを自分で決めない。親にお願いして、結果を待つ
  if (net.online && !net.isHost) {
    if (!enemy.alive || enemy.invulnerable) return false;
    net.send('hit', {
      i: enemies.indexOf(enemy), d: amount, by: net.id,
      // リボーンロッドで当てたときは、倒れたら親に生き返らせてもらう
      rev: source?.reviveChance ?? 0,
    });
    // 手ごたえだけは自分の画面ですぐ出す
    const guess = Math.min(amount, enemy.hp);
    game?.ult.add('damage', guess);
    if (source?.lifestealNow && source?.effects?.lifesteal && game) {
      game.player.heal(guess * source.effects.lifesteal);
    }
    return false;
  }

  const dealt = Math.min(amount, enemy.hp);
  // ジャンプ中など、当たらないこともある
  if (!enemy.hit(amount, now, part)) return false;

  const mine = by === net.id;
  if (mine) {
    game?.ult.add('damage', dealt);
    // Lv5のシャベル：ローリングスマッシュのときだけ、与ダメージの半分を吸収する
    if (source?.lifestealNow && source?.effects?.lifesteal && game) {
      game.player.heal(dealt * source.effects.lifesteal);
    }
  }

  if (enemy.alive) return false;
  sfx.playAt('die', enemy.position);
  awardKill(enemy.def, mine ? source : null, mine);
  // コインは全員ぶんなので、部屋のみんなに知らせる
  net.send('kill', { t: enemy.def.id, by });
  return true;
}

// ---- オンラインの受け取り口 ----

const r2 = (n) => Math.round(n * 100) / 100;

function setupNet() {
  // 部屋の顔ぶれが変わった。入った人を出し、いなくなった人の姿を消す
  net.on('peers', (list) => {
    for (const p of list) {
      if (p.self) continue;
      const remote = remotes.get(p.id);
      if (remote) {
        remote.setProfile(p);
      } else {
        remotes.set(p.id, new RemotePlayer(currentScene(), p));
        if (place === 'hub') chat.system(`${p.name} が待機場に入ってきた`);
        else hud.setToast(`${p.name} が入ってきた`, 2.4);
      }
    }
    for (const [id, remote] of remotes) {
      if (list.some((p) => p.id === id)) continue;
      if (place === 'hub') chat.system(`${remote.name} が出ていった`);
      else hud.setToast(`${remote.name} が出ていった`, 2.4);
      remote.dispose();
      remotes.delete(id);
    }
  });

  // 誰かの発言。左上の欄と、その人の頭の上に出す
  net.on('chat', (msg) => {
    const name = cleanText(msg?.n).slice(0, 16) || 'プレイヤー';
    const text = cleanText(msg?.m);
    if (!text) return;
    chat.say(name, text);
    remotes.get(msg.i)?.say(text);
    sfx.play('chat');
  });

  // つながった／切れたの知らせ。同じ知らせを何度も出さないようにする
  let lastStatus = '';
  net.on('status', () => {
    if (net.status === lastStatus) return;
    lastStatus = net.status;
    if (net.status === 'online') {
      hud.setToast(net.isHost ? `部屋「${net.room}」をひらいた（あなたが親）` : `部屋「${net.room}」に入った`, 2.6);
    } else if (net.status === 'error') {
      hud.setToast(`オンラインにつながりません — ${net.error}`, 4);
    }
  });

  // 他の人の位置と姿
  net.on('p', (msg) => {
    let remote = remotes.get(msg.i);
    if (!remote) {
      const info = net.peers.get(msg.i);
      if (!info) return;
      remote = new RemotePlayer(currentScene(), info);
      remotes.set(msg.i, remote);
    }
    remote.apply(msg.s, performance.now() / 1000);
    // 撃った瞬間なら、こちらの画面にも弾道を出す
    if (remote.justFired) remoteShot(remote);
  });

  // 親から届く世界のようす（ゾンビ・建物・ウェーブ）
  net.on('w', (msg) => {
    if (net.isHost) return;
    const next = unpackWaves(msg.w);

    // ウェーブが進んだ＝前のウェーブをクリアした。コインは各自でもらう
    if (netWaves.wave && next.wave > netWaves.wave) {
      addCoins(WAVE.clearCoins);
      if (game) game.coins += WAVE.clearCoins;
      hud.setToast(`ウェーブ ${netWaves.wave} クリア！ 🪙+${WAVE.clearCoins}`, 3);
    } else if (next.wave && next.wave !== netWaves.wave) {
      hud.setToast(`ウェーブ ${next.wave} — ゾンビ ${next.total} 体`, 2.6);
    }
    Object.assign(netWaves, next);

    applyEnemies(msg.e, enemies);
    applyStructures(msg.s ?? [], { scene, builder });
    drones.netApply(msg.d ?? []);
    minions.netApply(msg.m ?? []);
  });

  // 子から届いた「当てた」。親が本当に減らす
  net.on('hit', (msg) => {
    if (!net.isHost) return;
    const enemy = enemies[msg.i];
    if (!enemy || !enemy.active) return;
    // 倒したあとでは姿が分からなくなるので、先に控えておく
    const def = enemy.def;
    const spawn = enemy.position.clone();
    const killed = damageEnemy(enemy, msg.d, performance.now() / 1000, null, msg.by);
    if (killed && msg.rev) tryRevive(def, spawn, { reviveChance: msg.rev }, msg.by);
  });

  // 自分の味方が増えた（親が生き返らせてくれた）
  net.on('mini', (msg) => {
    if (msg.to !== net.id || !game) return;
    game.ult.add('revive', 1);
    sfx.play('raise');
    hud.setToast(`${msg.n}が味方になった！`, 1.8);
  });

  // 子から「影を呼びたい」と頼まれた
  net.on('shadow', (msg) => {
    if (!net.isHost) return;
    const owner = remotes.get(msg.by);
    if (!owner) return;
    for (let i = 0; i < SHADOW_ARMY.count; i++) {
      const angle = (i / SHADOW_ARMY.count) * Math.PI * 2;
      const spot = owner.position.clone().add(new THREE.Vector3(Math.sin(angle) * 2.2, 0, Math.cos(angle) * 2.2));
      spot.y = floorHeight(colliders, spot.x, spot.z, spot.y + 0.4);
      minions.add({ maxHp: SHADOW_ARMY.hp, black: true, ownerId: msg.by }, spot);
      effects.raise(spot);
    }
  });

  // 誰かがゾンビを倒した。コインは部屋にいる全員がもらう。
  // 味方として起こすのは親がやるので、ここではやらない
  net.on('kill', (msg) => {
    const def = ENEMIES[msg.t];
    if (!def) return;
    const mine = msg.by === net.id;
    awardKill(def, mine ? game?.weapons?.current ?? null : null, mine);
  });

  // 子から「味方を呼びたい」と頼まれた
  net.on('gather', (msg) => {
    if (!net.isHost) return;
    const owner = remotes.get(msg.by);
    if (!owner) return;
    minions.callTo(msg.by, owner.position, msg.r, msg.h ?? 0);
  });

  // 子から届いた「ここに建てたい」。置けるかどうかは親が決める
  net.on('build', (msg) => {
    if (!net.isHost) return;
    placeNetStructure(msg.t, new THREE.Vector3(msg.x, msg.y, msg.z), msg.yaw);
  });

  // 親から届いた「あなたがやられた」
  net.on('dmg', (msg) => {
    if (msg.to !== net.id || !game || paused) return;
    applyDamage(msg.d);
  });

  // 仲間の拡声器で強くしてもらった
  net.on('buff', (msg) => {
    if (msg.to !== net.id || !game || game.player.downed) return;
    game.player.applyBuff(msg.b, msg.t);
    sfx.play('buffed');
    hud.setToast(`仲間の拡声器！ ${buffText(msg.b)}（${msg.t}秒）`, 2.4);
  });

  // 味方に助け起こされた
  net.on('revive', (msg) => {
    if (msg.to !== net.id || !game || !game.player.downed) return;
    game.player.revive();
    sfx.play('revive');
    playerBody.setVisible(false);
    playerBody.setDowned(false);
    hud.setToast(`助けてもらった！ ${PLAYER.reviveInvulnTime}秒間無敵`, 2.5);
  });

  // 他の人の必殺技。見た目はみんなの画面に出す
  net.on('ult', (msg) => {
    const from = new THREE.Vector3(...(msg.f ?? [0, 0, 0]));
    const to = new THREE.Vector3(...(msg.t ?? [0, 0, 0]));
    if (msg.k === 'drones') {
      // 子から「ドローンを出して」と頼まれた。親がその人のまわりに出す
      if (!net.isHost) return;
      const owner = remotes.get(msg.by);
      if (owner) drones.spawn(owner.position, msg.by);
      return;
    }
    sfx.playAt('ultimate', from, { volume: 0.7 });
    if (msg.k === 'bomb') projectiles.bomb(from, to);
    else if (msg.k === 'rocket') projectiles.rocket(from, to);
  });

  // 親のゾンビが撃った弾。子の画面では見た目だけ飛ばす
  net.on('eshot', (msg) => {
    if (net.isHost) return;
    const from = new THREE.Vector3(...msg.f);
    const dir = new THREE.Vector3(...msg.d);
    sfx.playAt(msg.k === 'bullet' ? 'pistol' : 'bow', from, { volume: 0.8 });
    if (msg.k === 'bullet') {
      effects.muzzleFlash(from, dir);
      enemyShots.bulletAlong(from, dir, 0);
    } else {
      enemyShots.arrowAlong(from, dir, 0);
    }
  });

  // その他の見た目（地割れ・土けむり・着地の印）
  net.on('fx', (msg) => {
    const at = new THREE.Vector3(...msg.p);
    if (msg.k === 'call') {
      // 仲間が拡声器を使った。ゾンビを動かしている親が全部呼び寄せる
      if (net.isHost) makeNoise(at, Infinity, performance.now() / 1000, 25);
      sfx.playAt('megaphone', at, { volume: 0.8 });
      return;
    }
    if (msg.k === 'crack') {
      effects.groundCrack(at, msg.r);
      sfx.playAt('slam', at);
    } else if (msg.k === 'dirt') {
      effects.dirtBurst(at, !!msg.u);
      sfx.playAt('dig', at);
    } else if (msg.k === 'mark') {
      effects.slamMarker(at, msg.r, msg.l);
      sfx.playAt('growl', at, { volume: 1.4 });
    } else if (msg.k === 'shriek') {
      effects.shout(at, msg.r * 0.35);
      sfx.playAt('shriek', at, { volume: 1.3 });
    } else if (msg.k === 'dash') {
      effects.dashTrail(at, msg.y, msg.d);
      sfx.playAt('dash', at, { volume: 0.8 });
    } else if (msg.k === 'wave') {
      effects.shockwave(at, TITAN.waveRange, TITAN.waveRange / TITAN.waveSpeed);
      sfx.playAt('quake', at);
    } else if (msg.k === 'beam') {
      effects.sonicBeam(at, new THREE.Vector3(...msg.q), TITAN.beamHalfWidth);
      sfx.playAt('beam', at, { volume: 1.2 });
    } else if (msg.k === 'shot') {
      // 味方（ガンマ・弓スケルトン）が撃った光の筋
      const to = new THREE.Vector3(...msg.q);
      if (msg.b) effects.muzzleFlash(at, to.clone().sub(at).normalize());
      effects.tracer(at, to);
      sfx.playAt(msg.b ? 'pistol' : 'bow', at, { volume: 0.7 });
    }
  });
}

// 他の人が撃った弾道を、こちらの画面にも描く
function remoteShot(remote) {
  const from = remote.muzzle();
  const dir = remote.direction();
  raycaster.set(from, dir);
  raycaster.far = 60;
  const hit = raycaster.intersectObjects(enemies.filter((e) => e.alive).map((e) => e.hitbox), false)[0];
  const end = hit ? hit.point : from.clone().addScaledVector(dir, 40);
  effects.muzzleFlash(from, dir);
  effects.tracer(from, end);
  sfx.playAt('pistol', from, { volume: 0.8 });
}

// 親として建物を置く。素材の持ち主は建てた本人なので、ここでは減らさない
function placeNetStructure(typeId, position, yaw) {
  const structure = createStructure(typeId, position, yaw);
  scene.add(structure.root);
  structure.root.updateMatrixWorld(true);
  structure.refreshBox();
  if (overlaps(structure.box, colliders, builder.structures)) {
    scene.remove(structure.root);
    structure.dispose();
    return null;
  }
  builder.enforceLimit(typeId);
  structure.netKey = ++structureKey;
  builder.structures.push(structure);
  return structure;
}

// 親が送る、いまの世界のようす
function sendWorld() {
  const packed = packWorld(enemies, builder.structures, waves, structureKey, drones, minions);
  structureKey = packed.nextKey;
  net.send('w', packed.msg);
}

// 弾道と発砲炎は目の中ではなく、手に持った銃の銃口から出す
function muzzleOrigin(dir) {
  const right = new THREE.Vector3().crossVectors(dir, WORLD_UP).normalize();
  return camera.position.clone()
    .addScaledVector(right, 0.28)
    .addScaledVector(WORLD_UP, -0.24)
    .addScaledVector(dir, 0.95);
}

// ゾンビ側の射撃。ガンマゾンビは弾、弓スケルトンは矢を飛ばす。
// 撃つのは親だけで、飛んでいく向きを子にも送って同じ弾を見せる
function enemyShoot(enemy, kind, damage, target, now) {
  if (!target) return;
  const from = enemy.zombie.muzzlePoint
    ? enemy.zombie.muzzlePoint(new THREE.Vector3())
    : enemy.eyePoint();
  // 銃口が取れなかったときは、目の高さから出す
  if (from.lengthSq() < 0.01) enemy.eyePoint(from);
  const to = target.position.clone();
  const spread = enemy.def.spread ?? 0.04;

  let dir;
  sfx.playAt(kind === 'bullet' ? 'pistol' : 'bow', enemy.position, { volume: 0.8 });
  if (kind === 'bullet') {
    effects.muzzleFlash(from, to.clone().sub(from).normalize());
    dir = enemyShots.bullet(from, to, damage, spread);
    // 発砲音。近くのゾンビもこちらに気づく
    makeNoise(enemy.position.clone(), 26, now);
  } else {
    dir = enemyShots.arrow(from, to, damage, spread);
  }
  net.send('eshot', {
    k: kind,
    f: [r2(from.x), r2(from.y), r2(from.z)],
    d: [r2(dir.x), r2(dir.y), r2(dir.z)],
  });
}

// 銃声。届いた範囲のゾンビが音のした場所へ寄ってくる。
// radius に Infinity を渡すと、マップ中のゾンビ全部に届く
function makeNoise(position, radius, now, seconds = 8) {
  if (!radius) return;
  for (const enemy of enemies) {
    if (enemy.active && enemy.alive && enemy.position.distanceTo(position) <= radius) {
      enemy.alert(position, now, seconds);
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
  // ボスは装甲と核を別々に撃てるので、当たり判定を複数持っている
  const hitboxes = enemies.filter((e) => e.alive).flatMap((e) => e.hitTargets());
  const hit = raycaster.intersectObjects(hitboxes, false)[0];
  const end = hit ? hit.point : camera.position.clone().addScaledVector(dir, item.range);
  const from = muzzleOrigin(dir);
  effects.muzzleFlash(from, dir);
  effects.tracer(from, end);
  sfx.play(item.effects?.silencer ? 'silenced' : (item.id === 'ak47' ? 'ak47' : 'pistol'));
  makeNoise(camera.position.clone(), item.noise ?? 0, now);

  if (!hit) return;
  const enemy = enemies.find((e) => e.owns(hit.object));
  if (!enemy) return;
  const part = enemy.partOf(hit.object);
  // 装甲や核を撃ったときは、ヘッドショット扱いにしない
  const head = part === null
    && hit.point.y - enemy.position.y >= enemy.def.height * HEADSHOT.from;
  const damage = head ? Math.round(item.damage * HEADSHOT.multiplier) : item.damage;
  if (head) {
    effects.headshot(hit.point);
    sfx.play('headshot');
  }
  if (part === 'core') {
    effects.headshot(hit.point);
    sfx.play('headshot');
  }
  // 倒したときの表示は damageEnemy 側が出す
  if (!damageEnemy(enemy, damage, now, item, net.id, part)) {
    const label = part === 'core' ? '核にヒット！'
      : typeof part === 'number' ? '装甲にヒット'
        : head ? 'ヘッドショット！' : 'ヒット';
    hud.setToast(`${label} -${damage}`, 0.8);
  }
}

// タレットやドローンの弾も「銃」扱いにして、装甲のダメージ減を効かせる
const BEAM_SOURCE = { kind: 'gun', effects: {} };

// タレットやドローンの射撃。銃口の爆発と弾道は他の人からも見える
function beamShot(shooter, target, damage, now, kind = 'turret') {
  const from = shooter.muzzle();
  const to = target.position.clone().setY(1.0);
  effects.muzzleFlash(from, to.clone().sub(from).normalize());
  effects.tracer(from, to);
  sfx.playAt(kind, from, { volume: 0.55 });
  damageEnemy(target, damage, now, BEAM_SOURCE);
}

function explode(center, radius, damage, now) {
  sfx.playAt('explode', center);
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
  const yaw = Math.atan2(-dir.x, -dir.z);

  // 子は自分では置かず、親に置いてもらう（置けるかどうかも親が決める）
  if (net.online && !net.isHost) {
    net.send('build', { t: typeId, x: r2(spot.x), y: r2(spot.y), z: r2(spot.z), yaw: r2(yaw) });
    return true;
  }

  const structure = createStructure(typeId, spot, yaw);
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
  structure.netKey = ++structureKey;
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
    const from = muzzleOrigin(camera.getWorldDirection(new THREE.Vector3()));
    projectiles.bomb(from, target.position);
    // みんなの画面にも同じところへ飛ばす
    net.send('ult', {
      k: 'bomb',
      f: [r2(from.x), r2(from.y), r2(from.z)],
      t: [r2(target.position.x), r2(target.position.y), r2(target.position.z)],
    });
    hud.setToast(`${ULTIMATES.soldier.name}を投げた！`, 1.6);
    return true;
  },

  // 血のゲージを一気に満タンにして、体力も戻す
  criminal: () => {
    const { player } = game;
    player.blood = BLOOD.max;
    const healed = player.heal(BLOOD_FEAST.heal);
    const feet = new THREE.Vector3(player.position.x, player.position.y - EYE_HEIGHT, player.position.z);
    effects.shout(feet, 4.0);
    sfx.play('buffed');
    hud.setToast(`${ULTIMATES.criminal.name}！ 血が満タン／HP+${Math.round(healed)}`, 2.4);
    return true;
  },

  // 真っ黒な影の味方を3体呼ぶ
  necromancer: () => {
    const { player } = game;
    const feet = new THREE.Vector3(player.position.x, player.position.y - EYE_HEIGHT, player.position.z);
    // 味方を動かすのは親なので、子のときは親に呼んでもらう
    if (net.online && !net.isHost) {
      net.send('shadow', { by: net.id });
    } else {
      for (let i = 0; i < SHADOW_ARMY.count; i++) {
        const angle = (i / SHADOW_ARMY.count) * Math.PI * 2;
        const spot = feet.clone().add(new THREE.Vector3(Math.sin(angle) * 2.2, 0, Math.cos(angle) * 2.2));
        spot.y = floorHeight(colliders, spot.x, spot.z, feet.y + 0.4);
        minions.add({ maxHp: SHADOW_ARMY.hp, black: true, ownerId: net.id }, spot);
        effects.raise(spot, 0x9a6bff);
      }
    }
    sfx.play('raise');
    hud.setToast(`${ULTIMATES.necromancer.name}！ 影を${SHADOW_ARMY.count}体 呼んだ（味方 ${minions.count}体）`, 2.6);
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
      if (net.online && !net.isHost) net.send('ult', { k: 'drones', by: net.id });
      else drones.spawn(game.player.position, net.id);
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
  if (!ult.def) return;
  if (!ult.ready) {
    hud.setToast(`${ult.def.name}はチャージ中（${Math.floor(ult.value * 100)}%）`, 1.4);
    return;
  }
  const action = ULT_ACTIONS[job.id];
  if (!action) {
    hud.setToast('この職業には必殺技がありません', 1.6);
    return;
  }
  if (action()) {
    sfx.play('ultimate');
    ult.consume();
  }
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

// ---- スピア ----
// 突進の間ずっと、通り抜けた敵を刺していく。同じ敵は1回の突進で1度だけ
let dashState = null;

function spearDash(item) {
  const { player } = game;
  if (player.downed || player.dashing) return false;
  if (!player.startDash(item.dashDistance, item.dashTime)) return false;

  dashState = { item, hit: new Set(), left: item.dashTime };
  sfx.play('dash');
  effects.dashTrail(camera.position.clone(), player.yaw, item.dashDistance);
  makeNoise(camera.position.clone(), item.noise ?? 0, performance.now() / 1000);
  net.send('fx', {
    k: 'dash',
    p: [r2(camera.position.x), r2(camera.position.y), r2(camera.position.z)],
    y: r2(player.yaw), d: item.dashDistance,
  });
  return true;
}

// 突進している間、体が触れた敵を刺す
function updateDash(dt, now) {
  if (!dashState || !game) return;
  const { player } = game;
  const { item } = dashState;

  for (const enemy of enemies) {
    if (!enemy.alive || dashState.hit.has(enemy)) continue;
    const to = enemy.position.clone().sub(player.position);
    to.y = 0;
    if (to.length() > item.hitRadius + (enemy.def.height > 3 ? 1.4 : 0)) continue;
    dashState.hit.add(enemy);
    damageEnemy(enemy, item.damage, now, item);
    enemy.knockback(to, SHOVEL_KNOCKBACK * 1.3);
    effects.headshot(enemy.position.clone().setY(enemy.position.y + enemy.def.height * 0.6));
    sfx.play('hit');
  }

  dashState.left -= dt;
  // 突進が終わった。ここから「つぎに突進できるまで」を数えはじめる
  if (!player.dashing || dashState.left <= 0) {
    game.weapons.setCooldown(item.cooldown);
    if (dashState.hit.size) hud.setToast(`スピア　${dashState.hit.size}体を貫いた`, 0.9);
    dashState = null;
  }
}

function swing(item) {
  const origin = camera.position;
  const flat = camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
  effects.swingArc(new THREE.Vector3(origin.x, 1.1, origin.z), game.player.yaw, item.range, item.arc);
  sfx.play('swing');
  // シャベルはほとんど音がしないので、すぐ近くにしか気づかれない
  makeNoise(origin.clone(), item.noise ?? 0, performance.now() / 1000);

  const { player } = game;
  const isKnife = item.id === 'knife';
  let hits = 0;
  let shown = 0;
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    const to = enemy.position.clone().sub(origin);
    to.y = 0;
    const dist = to.length();
    if (dist > item.range) continue;
    if (to.normalize().dot(flat) < Math.cos(item.arc / 2)) continue;
    // ナイフは相手のいまのHPを削る。血のゲージが満タンのときが本来の威力
    const damage = isKnife
      ? knifeDamage(item, enemy.hp, player.bloodRatio)
      : item.damage;
    shown = Math.max(shown, damage);
    damageEnemy(enemy, damage, performance.now() / 1000, item);
    enemy.knockback(to, isKnife ? SHOVEL_KNOCKBACK * 0.4 : SHOVEL_KNOCKBACK);
    hits++;
  }
  if (!hits) return;
  sfx.play('hit');

  if (isKnife) {
    player.addBlood(item.bloodGain ?? 0);
    // 「血の解放」の最中に当てると、そのぶんHPが戻る
    if (player.releasing) {
      player.heal(BLOOD.healPerHit);
      game.ult.add('heal', BLOOD.healPerHit);
      sfx.play('heal');
    }
  }
  hud.setToast(`ヒット -${shown}`, 0.8);
  chargeSkill(item);
}

// 攻撃を当てた回数でスキルが貯まる。1回の振りで何体当てても1回ぶん
function chargeSkill(item) {
  const { skill } = game;
  if (!skill || skill.kind !== 'rollingSmash' || !item.effects?.skill || skill.ready) return;
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
    hud.setToast(`${skill.name}は ${skill.itemName}を持っているときに使えます`, 1.6);
    return;
  }

  // ナイフの「血の解放」。溜めた血を使って、当てるたびに回復する
  if (item.effects.skill === 'bloodRelease') {
    if (player.releasing) {
      hud.setToast('もう解放中', 1.2);
      return;
    }
    if (!player.startRelease()) {
      hud.setToast('血のゲージが空っぽ', 1.4);
      return;
    }
    sfx.play('buffed');
    effects.shout(new THREE.Vector3(player.position.x, player.position.y - EYE_HEIGHT, player.position.z), 3.2);
    hud.setToast(`${skill.name}！ 当てるたびにHP+${BLOOD.healPerHit}（あと${(player.blood * BLOOD.drainEvery).toFixed(1)}秒）`, 2.6);
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
    // この技のときだけ吸収が乗る（通常の振りでは回復しない）
    damageEnemy(enemy, damage, now, { ...item, lifestealNow: true });
    enemy.knockback(to.normalize(), SHOVEL_KNOCKBACK);
  }
  sfx.play('swing');
  hud.setToast(`${skill.name}！`, 1.4);
}

// ミュータントが狙う候補。人・味方・建てたものの位置を集める
function slamTargets() {
  const spots = builder.structures.filter((s) => s.alive).map((s) => s.root.position);
  // オンラインでは本物の仲間、オフラインではデモの仲間を狙う
  if (net.online) {
    for (const remote of remotes.values()) {
      if (!remote.downed && remote.placed) spots.push(remote.position);
    }
  } else {
    for (const mate of teammates) spots.push(mate.position);
  }
  spots.push(...drones.positions());
  spots.push(...minions.positions());
  if (game && !paused && !game.player.downed) {
    spots.push(new THREE.Vector3(game.player.position.x, 0, game.player.position.z));
  }
  return spots;
}

// ミュータントの着地。地面が割れて、周りのもの全部にダメージ
function slam(enemy, damage, radius, now) {
  const center = enemy.position.clone().setY(0);
  effects.groundCrack(center, radius);
  sfx.playAt('slam', enemy.position);
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

// ガンマ・弓スケルトンの味方が撃つ。
// 味方の弾はゾンビにしか当たらないので、飛ばさずにその場で当てて、
// 光の筋だけ描く（味方が増えても重くならない）
function minionShoot(minion, kind, damage, target, now) {
  if (!target?.alive) return;
  const from = minion.zombie.muzzlePoint
    ? minion.zombie.muzzlePoint(new THREE.Vector3())
    : minion.eyePoint();
  if (from.lengthSq() < 0.01) minion.eyePoint(from);
  const to = target.eyePoint ? target.eyePoint(new THREE.Vector3()) : target.position.clone();

  sfx.playAt(kind === 'bullet' ? 'pistol' : 'bow', minion.position, { volume: 0.7 });
  if (kind === 'bullet') effects.muzzleFlash(from, to.clone().sub(from).normalize());
  effects.tracer(from, to);
  net.send('fx', {
    k: 'shot',
    p: [r2(from.x), r2(from.y), r2(from.z)],
    q: [r2(to.x), r2(to.y), r2(to.z)],
    b: kind === 'bullet' ? 1 : 0,
  });
  damageEnemy(target, damage, now, null, minion.ownerId ?? net.id);
  // 銃声。近くのゾンビもそちらへ寄ってくる
  if (kind === 'bullet') makeNoise(minion.position.clone(), 26, now);
}

// ミュータントの味方が跳びかかって着地した。まわりのゾンビをまとめて削る
function minionSlam(minion, damage, radius, now) {
  const center = minion.position.clone().setY(0);
  effects.groundCrack(center, radius);
  sfx.playAt('slam', minion.position);
  net.send('fx', { k: 'crack', p: [r2(center.x), r2(center.y), r2(center.z)], r: radius });

  for (const enemy of enemies) {
    if (!enemy.active || !enemy.alive || enemy.invulnerable) continue;
    if (enemy.position.distanceTo(center) > radius) continue;
    damageEnemy(enemy, damage, now, null, minion.ownerId ?? net.id);
  }
}

// ---- ボス「タイタン」 ----

// いま動いている衝撃波。地面を輪になって広がっていく
const shockwaves = [];

// 衝撃波が当たりうる相手を集める。y は「立っている高さ」で、
// 高い所（足場・車の上）にいれば地面を走る波は当たらない
function waveTargets() {
  const list = [];
  if (game && !paused && !game.player.downed) {
    const p = game.player.position;
    list.push({ key: 'me', x: p.x, y: p.y - EYE_HEIGHT, z: p.z, kind: 'player' });
  }
  for (const s of builder.structures) {
    if (s.alive) list.push({ key: `s${s.key}`, x: s.root.position.x, y: s.root.position.y, z: s.root.position.z, kind: 'structure', ref: s });
  }
  for (const m of minions.list) {
    if (m.alive) list.push({ key: `m${m.id ?? minions.list.indexOf(m)}`, x: m.position.x, y: m.position.y, z: m.position.z, kind: 'minion', ref: m });
  }
  return list;
}

function spawnShockwave(from, damage) {
  const center = from.position.clone().setY(0);
  effects.shockwave(center, TITAN.waveRange, TITAN.waveRange / TITAN.waveSpeed);
  sfx.playAt('quake', from.position);
  net.send('fx', { k: 'wave', p: [r2(center.x), r2(center.y), r2(center.z)] });
  if (!net.isHost && net.online) return;
  shockwaves.push(new Shockwave(center, damage, (t, dmg) => {
    if (t.kind === 'player') applyDamage(dmg);
    else if (t.kind === 'structure') t.ref.damage(dmg);
    else if (t.kind === 'minion') t.ref.damage(dmg);
  }));
}

// 音波ビーム。壁を貫くので、まっすぐな帯に入っているかだけで判定する
function titanBeam(boss, damage) {
  const from = boss.zombie.mouthPoint(new THREE.Vector3());
  const dir = new THREE.Vector3(-Math.sin(boss.facing), 0, -Math.cos(boss.facing));
  const to = from.clone().addScaledVector(dir, TITAN.beamRange);
  effects.sonicBeam(from, to, TITAN.beamHalfWidth);
  sfx.playAt('beam', boss.position, { volume: 1.2 });
  net.send('fx', {
    k: 'beam',
    p: [r2(from.x), r2(from.y), r2(from.z)],
    q: [r2(to.x), r2(to.y), r2(to.z)],
  });
  if (net.online && !net.isHost) return;

  // 帯の中にいるかどうか。横に避ければかわせる
  const hitsLine = (px, py, pz) => {
    tmpVec.set(px - from.x, 0, pz - from.z);
    const along = tmpVec.dot(dir);
    if (along < 0 || along > TITAN.beamRange) return false;
    const side = Math.hypot(tmpVec.x - dir.x * along, tmpVec.z - dir.z * along);
    return side <= TITAN.beamHalfWidth;
  };
  if (game && !paused && !game.player.downed) {
    const p = game.player.position;
    if (hitsLine(p.x, p.y, p.z)) applyDamage(damage);
  }
  for (const s of builder.structures) {
    if (s.alive && hitsLine(s.root.position.x, s.root.position.y, s.root.position.z)) s.damage(damage);
  }
  for (const m of minions.list) {
    if (m.alive && hitsLine(m.position.x, m.position.y, m.position.z)) m.damage(damage);
  }
}

const tmpVec = new THREE.Vector3();

// ボスが湧いたとき。攻撃の受け口をつなぐ
function setupBoss(boss) {
  const brain = boss.boss;
  if (!brain) return;
  sfx.playAt('roar', boss.position, { volume: 1.4 });
  if (boss.def.bossKind === 'mother') return setupMother(boss, brain);

  hud.setToast(`⚠ ${boss.def.name} が現れた！　まずは光る装甲4枚をこわせ`, 4.5);

  brain.onPlateBroken = (b, index, left) => {
    const at = b.zombie.plates[index].getWorldPosition(new THREE.Vector3());
    effects.plateBreak(at);
    sfx.playAt('plate', at, { volume: 1.1 });
    hud.setToast(left > 0 ? `装甲をこわした！ 残り${left}枚` : '装甲が全部はがれた！', 2.2);
  };
  brain.onRoar = (b) => {
    sfx.playAt('roar', b.position, { volume: 1.4 });
    effects.shout(b.position.clone().setY(b.position.y + b.def.height * 0.8), 9);
  };
  brain.onPhase = (b, phase) => {
    if (phase === 2) hud.setToast('胸の核が出た！ そこが弱点だ', 3.2);
    else hud.setToast('⚠ タイタンが荒れ狂う！ 衝撃波は高い所へ、ビームは横に避けろ', 4);
  };
  brain.onGrab = (b, prey) => {
    sfx.playAt('zswing', b.position, { volume: 1.1 });
  };
  brain.onBeamCharge = (b) => {
    sfx.playAt('charge', b.position, { volume: 1.2 });
  };
  brain.onJumpLand = (b, damage, radius) => {
    slam(b, damage, radius, performance.now() / 1000);
  };
  brain.onSummon = (b, count) => summonForBoss(count);
}

// マザー。腕を落とすまで本体に通らない
function setupMother(boss, brain) {
  hud.setToast(`⚠ ${boss.def.name} が現れた！　4本の腕を全部落とせ`, 4.5);
  brain.onArmBroken = (b, index, left) => {
    const at = b.zombie.armPoint(index, new THREE.Vector3());
    effects.plateBreak(at);
    sfx.playAt('plate', at, { volume: 1.0 });
    hud.setToast(left > 0 ? `腕を落とした！ 残り${left}本` : '腕を全部落とした！ 本体を攻撃できる', 2.4);
  };
  brain.onArmRegrown = (b, index, left) => {
    sfx.playAt('raise', b.position, { volume: 1.1 });
    hud.setToast(`⚠ 腕が生えてきた！ 残り${left}本`, 2.4);
  };
  brain.onRoar = (b) => {
    sfx.playAt('roar', b.position, { volume: 1.4 });
    effects.shout(b.position.clone().setY(b.position.y + b.def.height * 0.8), 8);
  };
  brain.onPhase = (b, kind) => {
    if (kind === 'rage') hud.setToast('⚠ マザーが暴れだした！ 産む間隔が速くなる', 3.4);
  };
  brain.onBirthStart = (b) => sfx.playAt('growl', b.position, { volume: 1.2 });
}

// マザーが産むゾンビ。卵嚢の前から出てくる
function motherBirth(boss, count) {
  const at = boss.zombie.birthPoint(new THREE.Vector3());
  effects.dirtBurst(at.clone().setY(0), true);
  sfx.playAt('dig', boss.position, { volume: 1.0 });
  for (let i = 0; i < count; i++) {
    const slot = enemies.find((e) => !e.active);
    if (!slot) break;
    const a = Math.random() * Math.PI * 2;
    const spot = new THREE.Vector3(at.x + Math.sin(a) * 2.5, 0, at.z + Math.cos(a) * 2.5);
    slot.spawnAs(pickType(waves.wave), spot, hpScale(waves.wave));
  }
}

// ボスが呼ぶ雑魚。トンネルから湧かせる
function summonForBoss(count) {
  for (let i = 0; i < count; i++) {
    const slot = enemies.find((e) => !e.active);
    if (!slot) break;
    const mouth = spawns[Math.floor(Math.random() * spawns.length)];
    slot.spawnAs(pickType(waves.wave), mouth.clone(), hpScale(waves.wave));
  }
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
  const before = player.hp;
  const wentDown = player.damage(amount);
  if (player.hp < before) sfx.play('hurt');
  if (!wentDown) return;
  sfx.play('down');
  playerBody.position.set(player.position.x, 0, player.position.z);
  playerBody.avatar.root.rotation.y = player.yaw + Math.PI;
  playerBody.setDowned(true);
  playerBody.setVisible(true);
  hud.setToast('ダウン — 衛生兵の蘇生を待とう', 3);
}

function contextAction(dt) {
  const { player, job } = game;
  if (player.downed) {
    const helper = net.online ? '味方の蘇生を待っています' : '味方の蘇生を待っています';
    return { text: `倒れています（${helper}）`, progress: 0 };
  }

  // オンラインでは本物の仲間、オフラインではデモの仲間を助け起こす
  const candidates = net.online ? [...remotes.values()] : teammates;
  const downedNear = candidates.find(
    (t) => t.downed && t.position.distanceTo(player.position) < 2.5
  );

  if (job.canRevive && player.bandages > 0 && downedNear) {
    return holdAction(dt, 'revive', ITEMS.bandage.reviveTime,
      `${downedNear.name} を蘇生（${input.isTouch ? '「使」長押し' : 'E長押し'}）`,
      () => {
        downedNear.setDowned?.(false);
        player.bandages--;
        // 蘇生は、その味方のHPぶんを回復したものとして必殺技に加算する
        game.ult.add('heal', downedNear.maxHp);
        if (downedNear.id) net.send('revive', { to: downedNear.id });
        sfx.play('revive');
        hud.setToast(`${downedNear.name} を蘇生！ ${PLAYER.reviveInvulnTime}秒間無敵`, 2.5);
      });
  }

  if (player.bandages > 0 && player.hp < player.maxHp) {
    return holdAction(dt, 'heal', ITEMS.bandage.useTime,
      `包帯を使う（HP+${ITEMS.bandage.heal}／残り${player.bandages}）`,
      () => {
        game.ult.add('heal', player.heal(ITEMS.bandage.heal));
        player.bandages--;
        sfx.play('heal');
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
  sfx.setListener(camera);
  chat.update(dt);
  // 店員はずっと手を振っている
  for (const npc of hub.npcs) {
    npc.avatar.update(dt, { anim: { name: 'wave', t: hubTime }, speed: 0, pitch: 0 });
  }

  // 買い物中でも、まわりの人は動いて見えていてほしい
  updateRemotes(dt);
  hud.updateNet(net);

  if (shop.open || paused) {
    hud.updateHub(dt, '');
    usePressed = false;
    return;
  }

  hubPlayer.update(dt, input, hub.colliders);
  hubPlayer.applyToCamera(camera);

  // 待機場でも自分の姿を送る。武器は持っていないので手ぶら
  playerTick.hz = playerHz(net.count);
  if (net.online && playerTick.ready(dt)) {
    net.send('p', {
      i: net.id,
      s: packPlayer(hubPlayer, {
        itemId: null,
        gold: false,
        silencer: false,
        anim: { name: 'idle', t: 0 },
        feetY: hubPlayer.position.y - EYE_HEIGHT,
      }),
    });
  }

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
  sfx.setListener(camera);

  // ゾンビが狙う相手の一覧。自分と、つながっている人たち
  const targets = collectTargets();
  // 親（またはオフライン）だけがゾンビとウェーブを動かす
  const simulating = net.isHost;
  // 親が抜けたら、次に早く入った人が引き継ぐ
  if (simulating && !wasHost && net.online && netWaves.wave) takeOverAsHost();
  wasHost = simulating;

  const world = {
    colliders,
    structures: builder.structures,
    players: targets,
    onHitPlayer: (enemy, amount, target) => {
      sfx.playAt('hit', enemy.position);
      // 殴られたのが味方（ネクロマンサーの手下）なら、その子が受ける
      if (target?.minion) target.minion.damage(amount);
      // 自分なら自分で減らし、他の人ならその人に知らせる
      else if (target?.local) applyDamage(amount);
      else if (target) net.send('dmg', { to: target.id, d: amount });
      if (enemy.def.crackRadius) smashGround(enemy);
      // ミュータントは殴った範囲のドローンも巻き込む
      if (enemy.def.breaksDrones) {
        drones.damageAt(enemy.position, enemy.def.reach + 1.5, enemy.def.droneDamage);
      }
    },
    onBreak: (enemy, structure, amount) => {
      if (enemy.def.crackRadius) smashGround(enemy);
      sfx.playAt('break', structure.root.position);
      if (structure.damage(amount)) hud.setToast(`${structure.def.name}が壊された`, 1.4);
    },
    onSlam: (enemy, damage, radius) => slam(enemy, damage, radius, now),
    // 跳ぶ前の溜め。落ちてくる場所に印を出して、よけられるようにする
    onSlamAim: (enemy, spot, radius, life) => {
      effects.slamMarker(spot, radius, life);
      sfx.playAt('growl', enemy.position, { volume: 1.4 });
      net.send('fx', { k: 'mark', p: [r2(spot.x), r2(spot.y), r2(spot.z)], r: radius, l: life });
      hud.setToast(`${enemy.def.name}が跳ぶ構え！ 印から離れろ`, 2.0);
    },
    onShoot: (enemy, kind, damage, target) => enemyShoot(enemy, kind, damage, target, now),
    onSwing: (enemy) => sfx.playAt('zswing', enemy.position),
    // ---- ボスの攻撃 ----
    onStomp: (boss, damage, radius) => slam(boss, damage, radius, now),
    onJumpAim: (boss, spot, radius, life) => {
      effects.slamMarker(spot, radius, life);
      sfx.playAt('growl', boss.position, { volume: 1.6 });
      net.send('fx', { k: 'mark', p: [r2(spot.x), r2(spot.y), r2(spot.z)], r: radius, l: life });
      hud.setToast('タイタンが跳ぶ構え！ 印から離れろ', 2.0);
    },
    onShockwave: (boss, damage) => spawnShockwave(boss, damage),
    // ---- マザーの攻撃 ----
    onBirth: (boss, count) => motherBirth(boss, count),
    onSwipe: (boss, damage, radius) => slam(boss, damage, radius, now),
    onBeam: (boss, damage) => titanBeam(boss, damage),
    onSummon: (boss, count) => summonForBoss(count),
    // 掴んだ雑魚を投げつける。投げられた側もダメージを受ける
    onThrow: (boss, prey, target) => {
      if (!prey?.alive || !target) return;
      const to = target.position.clone();
      effects.tracer(prey.position.clone().setY(prey.position.y + 1), to);
      sfx.playAt('slam', to, { volume: 0.9 });
      // 投げられたゾンビは着地点へ飛ばされ、自分もダメージを負う
      prey.root.position.set(to.x + (Math.random() - 0.5) * 3, 0, to.z + (Math.random() - 0.5) * 3);
      damageEnemy(prey, 40, now, null, net.id);
      if (game && !paused && !game.player.downed
        && game.player.position.distanceTo(to) < 3.5) applyDamage(TITAN.throwDamage);
    },
    onBurrow: (enemy, phase) => {
      effects.dirtBurst(enemy.position, phase === 'out');
      sfx.playAt('dig', enemy.position);
      net.send('fx', {
        k: 'dirt',
        p: [r2(enemy.position.x), r2(enemy.position.y), r2(enemy.position.z)],
        u: phase === 'out' ? 1 : 0,
      });
      if (phase === 'in') hud.setToast(`${enemy.def.name}が地中にもぐった！`, 2.0);
      else hud.setToast(`${enemy.def.name}が足元から出てきた！`, 2.0);
    },
    // 叫びゾンビの声。届いた範囲のゾンビの足が速くなる
    onShriek: (enemy, radius, seconds, scale) => {
      const at = enemy.position.clone().setY(enemy.position.y + enemy.def.height * 0.8);
      effects.shout(at, radius * 0.35);
      sfx.playAt('shriek', enemy.position, { volume: 1.3 });
      net.send('fx', { k: 'shriek', p: [r2(at.x), r2(at.y), r2(at.z)], r: radius });
      let n = 0;
      for (const other of enemies) {
        if (other === enemy || !other.active || !other.alive) continue;
        if (other.position.distanceTo(enemy.position) > radius) continue;
        other.haste(now, seconds, scale);
        n++;
      }
      if (n) hud.setToast(`${enemy.def.name}の叫び！ ${n}体の足が速くなった`, 2.2);
    },
    // ガンマゾンビが見つけた相手の居場所は、離れた仲間にも伝わる
    onSpot: (enemy, spot, first) => {
      for (const other of enemies) {
        if (other !== enemy) other.alert(spot, now);
      }
      if (first) hud.setToast(`${enemy.def.name}に見つかった！ 居場所が仲間に伝わっている`, 2.6);
    },
    slamTargets,
    stairPoints,
  };

  if (simulating) {
    if (game && !paused) waves.update(dt);
    for (const e of enemies) e.update(dt, now, world);
    // 広がっている衝撃波を進める。当たり判定はここで出る
    if (shockwaves.length) {
      const targets = waveTargets();
      for (let i = shockwaves.length - 1; i >= 0; i--) {
        shockwaves[i].update(dt, targets);
        if (shockwaves[i].done) shockwaves.splice(i, 1);
      }
    }
  } else {
    // 子はゾンビを考えさせず、届いた場所へなじませるだけ
    for (const e of enemies) e.netUpdate(dt);
  }

  // ボスがいる間だけ、専用のHPバーを出す
  hud.updateBoss(enemies.find((e) => e.active && e.alive && e.def.boss) ?? null);

  // タレットとゴッドタレットが撃つのも親の仕事。子は見た目だけ動かす
  for (const s of builder.structures) {
    if (!simulating) {
      // 子でも砲塔はゾンビのほうを向く（撃つのは親だけなので、弾は出さない）
      s.update?.(dt, enemies, () => {});
      // 野戦病院の回復は、自分のHPは自分で管理しているのでここでかける
      if (s.def.kind === 'hospital') healAround(s, dt);
      continue;
    }
    if (s.def.kind === 'turret') s.update(dt, enemies, (turret, target) => beamShot(turret, target, TURRET.damage, now));
    else if (s.def.kind === 'godturret') {
      s.update(dt, enemies, (turret, target) => {
        const from = turret.muzzle();
        projectiles.rocket(from, target.position);
        net.send('ult', {
          k: 'rocket',
          f: [r2(from.x), r2(from.y), r2(from.z)],
          t: [r2(target.position.x), r2(target.position.y), r2(target.position.z)],
        });
      });
    }
    else if (s.def.kind === 'hospital') healAround(s, dt);
  }

  // ネクロマンサーの味方。近くの敵に襲いかかり、いなければ主人についてまわる
  if (simulating) {
    minions.update(dt, now, {
      enemies,
      colliders,
      structures: builder.structures,
      onAttack: (minion, target, damage) => {
        sfx.playAt('hit', minion.position, { volume: 0.7 });
        damageEnemy(target, damage, now, null, minion.ownerId ?? net.id);
      },
      // ガンマ・弓スケルトンの味方が撃った
      onShoot: (minion, kind, damage, target) => minionShoot(minion, kind, damage, target, now),
      // ミュータントの味方が跳びかかって着地した
      onSlam: (minion, damage, radius) => minionSlam(minion, damage, radius, now),
      // 跳ぶ前に、落ちる場所へ印を出す
      onSlamAim: (minion, spot, radius, life) => {
        effects.slamMarker(spot, radius, life);
        net.send('fx', { k: 'mark', p: [r2(spot.x), r2(spot.y), r2(spot.z)], r: radius, l: life });
      },
    });
  } else {
    minions.netUpdate(dt);
  }

  // 爆発のダメージも親が決める。子の画面では火の玉だけ出す
  projectiles.update(dt, enemies, (center, radius, damage) => {
    if (simulating) explode(center, radius, damage, now);
  });

  // ゾンビ側の弾と矢。親だけが当たり判定をして、当たった人に知らせる
  enemyShots.update(dt, simulating ? shotTargets(targets) : [], colliders, (damage, point, target) => {
    if (target.drone) {
      // ガンマの弾と弓スケルトンの矢は、ドローンを撃ち落とせる
      target.drone.damage(target.droneDamage ?? damage);
      effects.headshot(point);
      return;
    }
    if (target.local) {
      effects.headshot(point);
      applyDamage(damage);
    } else {
      net.send('dmg', { to: target.id, d: damage });
    }
  });

  if (simulating) builder.removeDead();
  effects.update(dt);

  if (game && !paused) {
    const { player, weapons, ult } = game;
    player.update(dt, input, colliders);
    if (!player.downed) player.applyToCamera(camera);
    weapons.update(dt);
    // スピアの突進中は、通り抜けた敵を刺していく
    updateDash(dt, now);

    ult.tick(dt);
    // 親（かオフライン）だけがドローンを動かす。子は届いた位置になじませるだけ
    if (simulating) {
      drones.update(dt, droneAnchor, enemies, (drone, target) => beamShot(drone, target, DRONE.damage, now, 'drone'));
    } else {
      drones.netUpdate(dt);
    }

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

    // デモの味方はオフラインのときだけ出す
    const showDemo = !net.online;
    for (const mate of teammates) mate.setVisible(showDemo);
    if (showDemo) {
      teammates[0].avatar.setItem(held, heldGold, heldSilencer);
      teammates[0].update(dt, { itemId: held, anim: spinAnim() ?? hurtAnim(player) ?? anim });
      teammates[1].update(dt, { itemId: null, anim: { name: 'idle', t: 0 } });
    }

    const shownAnim = spinAnim() ?? hurtAnim(player) ?? anim;
    // 自分のようすを、決まった間隔でみんなに送る
    playerTick.hz = playerHz(net.count);
    if (net.online && playerTick.ready(dt)) {
      net.send('p', {
        i: net.id,
        s: packPlayer(player, {
          itemId: held,
          gold: heldGold,
          silencer: heldSilencer,
          anim: shownAnim,
          feetY: player.position.y - EYE_HEIGHT,
        }),
      });
    }
    // 親はゾンビと建物のようすも送る
    if (net.online && net.isHost && worldTick.ready(dt)) sendWorld();

    if (player.downed) {
      playerBody.update(dt, { itemId: null, anim: { name: 'idle', t: 0 } });
      // 倒れた瞬間は自分の体、そのあと味方を観戦する
      const watchSelf = player.time - player.downedAt < 2.5;
      const mates = net.online ? [...remotes.values()] : teammates;
      const target = watchSelf ? playerBody : (mates.find((t) => !t.downed) ?? playerBody);
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
      waves: waveInfo(),
      buff: player.buffed ? { text: buffText(player.buff), left: player.buffLeft } : null,
      cooldown: ['buff', 'summon', 'dash'].includes(weapons.current?.kind) ? weapons.cooldownLeft() : 0,
      blood: game.skill?.kind === 'bloodRelease'
        ? { value: player.blood, max: BLOOD.max, speedAtMax: BLOOD.speedAtMax, releasing: player.releasing }
        : null,
      radar: radarData(player),
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
      waves: waveInfo(),
      buff: null,
      cooldown: 0,
      blood: null,
      radar: null,
    });
  } else {
    camera.position.set(0, EYE_HEIGHT, 8);
    camera.rotation.set(0, Math.sin(now * 0.12) * 0.35, 0, 'YXZ');
    teammates[0].update(dt, { itemId: 'pistol', anim: { name: 'idle', t: 0 } });
    teammates[1].update(dt, { itemId: null, anim: { name: 'idle', t: 0 } });
  }

  updateRemotes(dt);
  hud.updateNet(net);

  renderer.render(scene, camera);
}

// 親が抜けたときの引き継ぎ。ゾンビはいまの場所のまま、ウェーブの続きから動かす
function takeOverAsHost() {
  waves.wave = netWaves.wave;
  waves.left = 0;
  waves.state = 'spawning';
  waves.timer = 0;
  // 親から届いた建物は、そのまま自分が持ち主になる
  for (const s of builder.structures) structureKey = Math.max(structureKey, s.netKey ?? 0);
  hud.setToast('前の親が抜けました。あなたが親になりました', 3.2);
}

// HUDに出すウェーブの情報。子は親から届いたものを使う
function waveInfo() {
  return net.online && !net.isHost ? netWaves : waves;
}

// ゾンビの弾が当たる相手。人にドローンを足したもの
function shotTargets(players) {
  const list = [...players];
  for (const drone of drones.list) {
    if (!drone.alive) continue;
    list.push({
      id: `drone${drone.ownerId ?? ''}`,
      position: drone.root.position,
      drone,
      droneDamage: 8,
      radius: 0.7,
      drop: 0,
    });
  }
  return list;
}

// 影の軍勢がいる間だけ、敵と味方の位置が分かる。
// 自分から見た相対位置（メートル）を渡す
const RADAR_RANGE = 45;
function radarData(player) {
  const hasShadow = minions.list.some((m) => m.black && m.alive);
  if (!hasShadow) return null;
  const px = player.position.x;
  const pz = player.position.z;
  const rel = (v) => ({ x: v.x - px, z: v.z - pz });
  return {
    range: RADAR_RANGE,
    // 前を上にするための回転。カメラの向きと合わせる
    yaw: player.yaw,
    enemies: enemies.filter((e) => e.active && e.alive && e.root.visible).map((e) => rel(e.position)),
    allies: minions.list.filter((m) => m.alive).map((m) => rel(m.position)),
    mates: [...remotes.values()].filter((r) => r.placed && !r.downed).map((r) => rel(r.position)),
  };
}

// 他のプレイヤーの見た目。しばらく音沙汰がない人は消す
function updateRemotes(dt) {
  const now = performance.now() / 1000;
  for (const [id, remote] of remotes) {
    if (net.online && remote.lastSeen && now - remote.lastSeen > NET.timeout) {
      remote.dispose();
      remotes.delete(id);
      continue;
    }
    remote.update(dt);
  }
}

// いま人やゾンビを置いているシーン。待機場とバトルで入れ替わる
function currentScene() {
  return place === 'hub' ? hub.scene : scene;
}

// ドローンが回る中心。持ち主の居場所を返す
function droneAnchor(ownerId) {
  if (!ownerId || ownerId === net.id) {
    return game && !game.player.downed ? game.player.position : null;
  }
  const remote = remotes.get(ownerId);
  return remote && !remote.downed ? remote.position : null;
}

// ゾンビが狙う相手を集める。自分＋つながっている人
function collectTargets() {
  playerTargets.length = 0;
  if (game && !paused && !game.player.downed) {
    localTarget.position.copy(game.player.position);
    localTarget.downed = false;
    localTarget.id = net.id;
    playerTargets.push(localTarget);
  }
  for (const remote of remotes.values()) {
    if (remote.downed || !remote.placed) continue;
    playerTargets.push({
      id: remote.id,
      position: remote.aimPoint(),
      downed: false,
    });
  }
  // ネクロマンサーの味方も、ゾンビから見れば殴る相手
  for (const minion of minions.targets()) {
    playerTargets.push({
      id: 'minion',
      position: minion.position,
      downed: false,
      minion,
    });
  }
  return playerTargets;
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











