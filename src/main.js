import * as THREE from 'three';
import { createWorld } from './world.js';
import { Input } from './input.js';
import { Player, EYE_HEIGHT } from './player.js';
import { Weapons } from './weapons.js';
import { ViewModel } from './viewmodel.js';
import { Hud } from './hud.js';
import { Lobby } from './lobby.js';
import { Teammate, Enemy } from './entities.js';
import { Effects } from './effects.js';
import { Builder } from './build.js';
import { createStructure, overlaps } from './structures.js';
import { UltimateCharge, Projectiles, Drones } from './ultimates.js';
import { ITEMS } from './data/items.js';
import { JOBS, PLAYER } from './data/jobs.js';
import { TURRET, MATERIALS } from './data/builds.js';
import { ULTIMATES, HOSPITAL, DRONE, GOD_TURRET_ODDS } from './data/ultimates.js';
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
const { scene, colliders } = createWorld();
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

const enemies = [
  new Enemy(scene, new THREE.Vector3(-12, 0, -22)),
  new Enemy(scene, new THREE.Vector3(1, 0, -26)),
  new Enemy(scene, new THREE.Vector3(14, 0, -21)),
  // 青ゾンビは索敵範囲が広いので、遠くに置いても寄ってくる
  new Enemy(scene, new THREE.Vector3(-22, 0, -34), 'blue'),
  new Enemy(scene, new THREE.Vector3(20, 0, -36), 'blue'),
  new Enemy(scene, new THREE.Vector3(-6, 0, -30), 'silver'),
  new Enemy(scene, new THREE.Vector3(8, 0, -32), 'gold'),
  new Enemy(scene, new THREE.Vector3(-16, 0, -40), 'blueSilver'),
  new Enemy(scene, new THREE.Vector3(16, 0, -42), 'blueGold'),
  new Enemy(scene, new THREE.Vector3(0, 0, -44), 'mutant'),
  new Enemy(scene, new THREE.Vector3(-26, 0, -46), 'mutantSilver'),
  new Enemy(scene, new THREE.Vector3(26, 0, -48), 'mutantGold'),
];

const builder = new Builder(scene, colliders, {});
const projectiles = new Projectiles(scene, effects);
const drones = new Drones(scene);

const muzzle = new THREE.PointLight(0xffd9a0, 0, 8);
scene.add(muzzle);

const SHOVEL_KNOCKBACK = 4.0;
const WORLD_UP = new THREE.Vector3(0, 1, 0);

let game = null;
let paused = false;

const lobby = new Lobby(startGame);

function startGame(loadout) {
  const job = JOBS[loadout.jobId];
  const player = new Player(job);
  const weapons = new Weapons(loadout.items, onWeaponEvent);

  game = { player, weapons, loadout, job, hold: 0, holdAction: null, ult: new UltimateCharge(job.id) };
  input.reset();
  builder.clear();
  projectiles.clear();
  drones.clear();
  builder.materials = { ...(job.materials ?? {}) };
  for (const e of enemies) e.respawn();
  playerBody.setVisible(false);
  playerBody.setDowned(false);
  playerBody.avatar.setHat(job.id);
  hud.buildSlots(loadout.items);
  hud.show();
  viewModel.setItem(weapons.current?.id ?? null);
  hud.setToast(`合言葉「${loadout.passphrase}」の部屋を開始しました`, 2.5);
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
  projectiles.clear();
  drones.clear();
  pauseEl.classList.add('hidden');
  hud.hide();
  viewModel.setItem(null);
  builder.hideGhost();
  playerBody.setVisible(false);
  lobby.show();
}

document.getElementById('btn-resume').addEventListener('click', resume);
document.getElementById('btn-tolobby').addEventListener('click', toLobby);
document.getElementById('btn-pause').addEventListener('click', () => {
  if (game) paused ? resume() : pause();
});
canvas.addEventListener('click', () => {
  if (game && !paused) input.requestLock();
});
addEventListener('keydown', (e) => {
  if (!game) return;
  if (e.code === 'Escape') paused ? resume() : pause();
  if (e.code === 'KeyG' && !paused) applyDamage(25);
});
document.addEventListener('pointerlockchange', () => {
  if (game && !paused && !input.locked && !input.isTouch) pause();
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

function damageEnemy(enemy, amount, now) {
  const dealt = Math.min(amount, enemy.hp);
  // ジャンプ中など、当たらないこともある
  if (!enemy.hit(amount, now)) return false;
  game?.ult.add('damage', dealt);
  if (enemy.alive) return false;
  hud.setToast(`${enemy.def.name}撃破 — ${rollDrops(enemy.def)}`, 1.6);
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

function shoot(item) {
  const dir = camera.getWorldDirection(new THREE.Vector3());
  muzzle.position.copy(camera.position);
  muzzle.intensity = 12;
  raycaster.set(camera.position, dir);
  raycaster.far = item.range;
  const hitboxes = enemies.filter((e) => e.alive).map((e) => e.hitbox);
  const hit = raycaster.intersectObjects(hitboxes, false)[0];
  const end = hit ? hit.point : camera.position.clone().addScaledVector(dir, item.range);
  const from = muzzleOrigin(dir);
  effects.muzzleFlash(from, dir);
  effects.tracer(from, end);
  if (hit) {
    const enemy = enemies.find((e) => e.hitbox === hit.object);
    if (!damageEnemy(enemy, item.damage, performance.now() / 1000)) {
      hud.setToast(`ヒット -${item.damage}`, 0.8);
    }
  }
}

// タレットやドローンの射撃。銃口の爆発と弾道は他の人からも見える
function beamShot(shooter, target, damage, now) {
  const from = shooter.muzzle();
  const to = target.position.clone().setY(1.0);
  effects.muzzleFlash(from, to.clone().sub(from).normalize());
  effects.tracer(from, to);
  damageEnemy(target, damage, now);
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

  let hits = 0;
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    const to = enemy.position.clone().sub(origin);
    to.y = 0;
    const dist = to.length();
    if (dist > item.range) continue;
    if (to.normalize().dot(flat) < Math.cos(item.arc / 2)) continue;
    damageEnemy(enemy, item.damage, performance.now() / 1000);
    enemy.knockback(to, SHOVEL_KNOCKBACK);
    hits++;
  }
  if (hits) hud.setToast(`ヒット -${item.damage}`, 0.8);
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

const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.1);
  const now = performance.now() / 1000;

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
  };
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

    const slot = input.consumeSlot();
    if (slot !== null) weapons.select(slot);
    if (input.consumeReload()) weapons.reload();
    if (input.consumeUlt()) useUltimate();
    if (input.fire && !player.downed) weapons.trigger();

    viewModel.setItem(player.downed ? null : weapons.current?.id ?? null);
    const anim = weapons.animProgress();

    if (weapons.current?.kind === 'build' && !player.downed) builder.aim(camera, player.position);
    else builder.hideGhost();
    viewModel.update(dt, anim, Math.min(player.speed / 4.5, 1));

    teammates[0].update(dt, { itemId: weapons.current?.id ?? null, anim: hurtAnim(player) ?? anim });
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
    });
  } else if (game) {
    hud.update(dt, {
      player: game.player,
      weapons: game.weapons,
      promptText: '',
      holdProgress: 0,
      builder: game.job.materials ? builder : null,
      ult: game.ult,
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
