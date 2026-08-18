import * as THREE from 'three';
import { makeAvatar } from './avatar.js';
import { Zombie } from './zombie.js';
import { Mutant } from './mutant.js';
import { Skeleton } from './skeleton.js';
import { Titan } from './titan.js';
import { Mother } from './mother.js';
import { TitanBrain, MotherBrain } from './boss.js';
import { isLoaded, GltfCharacter } from './gltfmodel.js';
import { ENEMIES, JOBS, BUILD_LURE } from './data/jobs.js';
import { floorHeight, STEP_HEIGHT, STEP_SLACK, EYE_HEIGHT } from './player.js';
import { makeLabel, hpColor } from './label.js';

export class Teammate {
  constructor(scene, { name, color, position, jobId = 'soldier', skin = null }) {
    this.name = name;
    this.maxHp = JOBS[jobId].hp;
    this.scene = scene;
    this.jobId = jobId;
    this.color = color;
    this.avatar = makeAvatar(color, 'human', { skin });
    this.avatar.setHat(jobId);
    this.avatar.root.position.copy(position);
    this.downed = false;
    this.reviveProgress = 0;
    this.label = makeLabel();
    this.label.sprite.position.y = 2.1;
    this.avatar.root.add(this.label.sprite);
    scene.add(this.avatar.root);
    this.#refreshLabel();
  }

  get position() {
    return this.avatar.root.position;
  }

  setDowned(downed) {
    this.downed = downed;
    this.reviveProgress = 0;
    this.avatar.setDowned(downed);
    this.#refreshLabel();
  }

  setVisible(visible) {
    this.avatar.root.visible = visible;
  }

  #refreshLabel() {
    this.label.draw(this.downed ? `${this.name}（ダウン）` : this.name, this.downed ? '#ff8080' : '#ffffff');
  }

  // スキンを着がえる。見た目を作り直して、いまの場所と向きをそのまま渡す
  setSkin(skin) {
    if (this.skinId === skin) return;
    this.skinId = skin;
    const at = this.avatar.root.position.clone();
    const yaw = this.avatar.root.rotation.y;
    const visible = this.avatar.root.visible;
    this.avatar.root.remove(this.label.sprite);
    this.scene.remove(this.avatar.root);
    this.avatar.dispose?.();
    this.avatar = makeAvatar(this.color, 'human', { skin });
    this.avatar.setHat(this.jobId);
    this.avatar.setDowned(this.downed);
    this.avatar.root.position.copy(at);
    this.avatar.root.rotation.y = yaw;
    this.avatar.root.visible = visible;
    this.avatar.root.add(this.label.sprite);
    this.scene.add(this.avatar.root);
  }

  update(dt, mirror) {
    this.avatar.setItem(mirror.itemId);
    this.avatar.update(dt, { anim: mirror.anim, speed: 0, pitch: 0 });
    this.label.sprite.position.y = this.downed ? 1.0 : 2.1;
  }
}

const KNOCKBACK_DAMPING = 7;
const RADIUS = 0.45;
const WANDER_RANGE = 14;
const TURN_SPEED = 7;
// これより遠いゾンビは、3フレームに1回だけ考える（そのぶん歩幅を3倍にする）
const FAR_THINK = 34;
// 天井ゾンビが壁に張りつくとき、壁からどれだけ離れて取りつくか
const CLING_GAP = 0.7;
// 張りついたまま横へ這う速さ（登る速さの何倍か）。
// 歩いている相手についていける速さにしないと、いつまでも真上に来られない
const CLING_SLIDE = 1.0;

// 相手を見つけていないゾンビが集まる場所（広場の真ん中）と、
// そこまで来たら止まる距離
const CENTER = new THREE.Vector3(0, 0, 0);
const CENTER_RADIUS = 10;

const box = new THREE.Box3();
const ray = new THREE.Ray();
const tmpVec = new THREE.Vector3();
const tmpHit = new THREE.Vector3();

// 通信で種類とモーションを1文字ぶんの数字にするための並び。
// 途中に足すと相手と食い違うので、増やすときは必ず末尾に足す
export const NET_ENEMY_IDS = Object.keys(ENEMIES);
export const NET_MODES = [
  'idle', 'walk', 'attack', 'hit', 'death', 'jump',
  'charge', 'burrow', 'emerge', 'shoot', 'revive', 'crawl',
];
const NET_VISIBLE = 1;
const NET_LABEL = 2;

const r2 = (n) => Math.round(n * 100) / 100;

// 一番近くにいる、まだ倒れていない相手を選ぶ。
// オンラインでは複数人いるので、ゾンビは近いほうを狙う
function nearestPlayer(players, from) {
  let best = null;
  let bestDist = Infinity;
  for (const p of players) {
    if (!p || p.downed) continue;
    const dist = p.position.distanceToSquared(from);
    if (dist < bestDist) {
      bestDist = dist;
      best = p;
    }
  }
  return best;
}

// 自分に一番近い、まだ壊れていない建物。
// タレットは撃ち返してくるので、少し近くにあるものとして優先する
function nearestStructure(structures, from) {
  let best = null;
  let bestDist = BUILD_LURE;
  for (const s of structures) {
    if (!s.alive) continue;
    const shooty = s.def.kind === 'turret' || s.def.kind === 'godturret';
    const dist = s.root.position.distanceTo(from) - (shooty ? 3 : 0);
    if (dist < bestDist) {
      bestDist = dist;
      best = s;
    }
  }
  return best;
}

// from から to まで、壁にさえぎられずに見通せるか。撃つ前に確かめる
function canSee(from, to, colliders) {
  tmpVec.subVectors(to, from);
  const dist = tmpVec.length();
  if (dist < 0.01) return true;
  ray.set(from, tmpVec.divideScalar(dist));
  for (const c of colliders) {
    // 低い段差は撃ち越せるので、腰より低い当たり判定は無視する
    if (c.max.y < from.y - 0.9) continue;
    if (ray.intersectBox(c, tmpHit) && tmpHit.distanceTo(from) < dist - 0.4) return false;
  }
  return true;
}

// 候補それぞれについて「着地半径に何個入るか」を数え、一番多い場所を選ぶ。
// 同数なら自分に近いほうを狙う
function bestCluster(targets, from, def) {
  let best = null;
  let bestScore = 0;
  let bestDist = Infinity;
  for (const spot of targets) {
    const dist = spot.distanceTo(from);
    if (dist > def.slamRange) continue;
    const score = targets.filter((o) => o.distanceTo(spot) <= def.slamRadius).length;
    if (score > bestScore || (score === bestScore && dist < bestDist)) {
      best = spot;
      bestScore = score;
      bestDist = dist;
    }
  }
  return best;
}

export class Enemy {
  constructor(scene, position, typeId = 'normal') {
    this.scene = scene;
    // 使い回すので、倒されて消えた個体は active=false になって列に戻る
    this.active = false;
    this.def = ENEMIES[typeId];
    this.maxHp = this.def.hp;
    this.hp = this.maxHp;
    this.respawnAt = 0;
    this.home = position.clone();
    this.velocity = new THREE.Vector3();
    this.state = 'wander';
    this.facing = Math.random() * Math.PI * 2;
    this.wanderYaw = this.facing;
    this.wanderUntil = 0;
    this.target = null;
    this.attacking = false;
    this.landed = false;
    this.nextAttackAt = 0;
    // ミュータントの大ジャンプ。1回の生存につき1度だけ
    this.slamUsed = false;
    this.hasteUntil = 0;
    this.hasted = false;
    this.nextShriekAt = 0;
    this.slamT = 0;
    this.chargeT = 0;
    this.thinkSkip = 0;
    // 銃声を聞いた場所と、そこへ向かうのをやめる時刻
    this.alertUntil = 0;
    this.alertSpot = new THREE.Vector3();
    this.slamFrom = new THREE.Vector3();
    this.slamTo = new THREE.Vector3();
    // 天井ゾンビ：壁を登っているときの状態
    //  null（地上）／'toWall'（壁へ向かう）／'up'（這い上がる）
    //  ／'cling'（壁で待つ）／'down'（這い下りる）／'drop'（落下）
    this.climbState = null;
    this.climbTop = 0;
    this.climbFace = new THREE.Vector3();
    // 張りついているビルの四角と、その外周のどこにいるか
    this.climbWall = new THREE.Box3();
    this.clingS = 0;
    // 張りついてから、相手にいちばん近づけた距離と、その時刻
    this.clingBest = Infinity;
    this.clingStuckAt = 0;
    // 壁にいるあいだに撃たれたか
    this.clingHurt = false;
    // 壁に張りついて待つ高さ
    this.clingY = 0;
    // 壁のほうを向く向き
    this.climbInX = 0;
    this.climbInZ = 0;
    this.climbUntil = 0;
    this.nextClimbAt = 0;
    // いま壁ばりの姿勢になっているか
    this.wallPose = false;
    // 叫びゾンビの声で足が速くなっている間の、終わる時刻
    this.hasteUntil = 0;
    this.hasted = false;
    // 叫びゾンビ：つぎに叫べる時刻
    this.nextShriekAt = 0;
    // ガンマゾンビ：一度見つけた相手は見失わない
    this.locked = false;
    this.shareAt = 0;
    this.nextShotAt = 0;
    this.shooting = false;
    this.shotFired = false;
    // 紫ゾンビ：潜って出てくるまでの管理
    this.burrowUsed = false;
    this.emergeAt = 0;
    // スケルトン：復活を1回だけ使う
    this.revived = false;
    this.willRevive = false;

    this.root = new THREE.Group();
    this.root.position.copy(position);
    this.root.visible = false;
    this.hitbox = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.4, 1),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    this.root.add(this.hitbox);
    this.label = makeLabel();
    this.root.add(this.label.sprite);
    scene.add(this.root);
    this.#buildModel();
  }

  // 見た目と当たり判定を、いまの種類に合わせて作り直す
  #buildModel() {
    if (this.zombie) {
      this.root.remove(this.zombie.root);
      this.zombie.dispose?.();
    }
    // 外から持ってきたモデルが読めていれば、そちらを使う。
    // 読めていなければ、これまでどおり手作りのモデルで動く
    const gltfId = this.def.gltf;
    if (gltfId && isLoaded(gltfId)) {
      this.zombie = new GltfCharacter(gltfId, {
        height: this.def.height,
        tint: this.def.tint ?? null,
        walkScale: this.def.animRate ?? 1,
      });
    } else if (this.def.model === 'titan') {
      this.zombie = new Titan();
    } else if (this.def.model === 'mother') {
      this.zombie = new Mother();
    } else if (this.def.model === 'mutant') {
      this.zombie = new Mutant(this.def.armor);
    } else if (this.def.model === 'skeleton') {
      this.zombie = new Skeleton({ weapon: this.def.weapon });
    } else {
      this.zombie = new Zombie(this.def.skin, this.def.armor, { outfit: this.def.outfit });
    }
    this.zombie.walkRate = this.def.animRate ?? 1;
    // 作り直したモデルはまっすぐ立っているので、壁ばりの姿勢も解けている
    this.wallPose = false;
    // 同じモデルでも、縦横を変えるだけで体つきの違いが出せる
    if (this.def.stretch) this.zombie.root.scale.set(...this.def.stretch);
    this.root.add(this.zombie.root);

    // アニメーションで動く見た目とは別に、当たり判定は固定のカプセルで取る
    const height = this.def.height;
    this.hitbox.geometry.dispose();
    this.hitbox.geometry = new THREE.CapsuleGeometry(height * 0.24, height - height * 0.48);
    this.hitbox.position.y = height / 2;
    this.label.sprite.scale.set(height > 2 ? 1.9 : 1.4, (height > 2 ? 1.9 : 1.4) / 4, 1);
    this.label.sprite.position.y = height + 0.35;
  }

  // 列から取り出して、指定の種類として湧かせる。
  // hpScale はウェーブが進むほど大きくなる硬さの倍率
  spawnAs(typeId, position, hpScale = 1) {
    if (this.def.id !== typeId) {
      this.def = ENEMIES[typeId];
      this.#buildModel();
    }
    // ボスは種類ごとに専用の頭を持つ。ふつうの敵に戻ったら外す
    if (this.def.boss) {
      const Brain = this.def.bossKind === 'mother' ? MotherBrain : TitanBrain;
      if (!(this.boss instanceof Brain)) this.boss = new Brain(this);
      this.boss.reset();
    } else {
      this.boss = null;
    }
    this.maxHp = Math.round(this.def.hp * hpScale);
    this.home.copy(position);
    this.root.position.copy(position);
    this.root.visible = true;
    this.active = true;
    this.respawn();
  }

  // 倒されて消えたあと。モデルは残したまま隠して、次の湧きで使い回す
  retire() {
    this.active = false;
    this.hp = 0;
    this.root.visible = false;
    this.state = 'dead';
    this.target = null;
    this.willRevive = false;
    this.shooting = false;
    this.climbing = null;
    this.#setAiming(false);
    this.velocity.set(0, 0, 0);
  }

  get alive() {
    return this.hp > 0;
  }

  get position() {
    return this.root.position;
  }

  // 溜め中・ジャンプ中・地中・復活中は攻撃が通らない
  get invulnerable() {
    if (this.boss) return this.boss.invulnerable;
    return this.state === 'slam' || this.state === 'charge'
      || this.state === 'burrow' || this.state === 'under' || this.state === 'emerge'
      || this.state === 'reviving';
  }

  // part は撃たれた場所。ボスのときだけ意味がある（装甲の番号か 'core'）
  hit(damage, now, part = null) {
    if (this.boss) return this.boss.hit(damage, now, part);
    if (!this.alive || this.invulnerable) return false;
    this.hp = Math.max(0, this.hp - damage);
    this.#refresh();
    if (this.alive) {
      this.zombie.setMode('hit');
      // 壁に張りついている天井ゾンビは、撃たれたらじっとしていない。
      // そのまま待っていると、ただの的になってしまう
      if (this.climbState === 'cling' || this.climbState === 'up') this.clingHurt = true;
      this.shooting = false;
      // 振りかけていた攻撃は中断される
      this.attacking = false;
      this.landed = false;
    } else {
      // スケルトンは、1回だけ骨を組み直して起き上がることがある
      this.willRevive = !this.revived
        && this.def.reviveChance > 0
        && Math.random() < this.def.reviveChance;
      this.zombie.setMode('death');
      this.velocity.set(0, 0, 0);
      // 壁の途中や屋上で倒したときは、宙に浮いたままにならないよう地面へ落とす
      if (this.climbState) {
        this.climbState = null;
        this.#setWallPose(false);
        this.root.position.y = 0;
      }
      this.label.sprite.visible = false;
      this.state = 'dead';
      this.target = null;
      this.shooting = false;
      if (this.zombie.aiming !== undefined) this.zombie.aiming = false;
    }
    return true;
  }

  // 叫びゾンビの声を浴びた。しばらく足が速くなる
  haste(now, seconds, scale) {
    this.hasteUntil = Math.max(this.hasteUntil, now + seconds);
    this.hasteScale = scale;
  }

  // いまの走る速さ。叫びを浴びている間だけ速い
  get chaseSpeedNow() {
    return this.def.chaseSpeed * (this.hasted ? (this.hasteScale ?? 1.5) : 1);
  }

  // 銃声を聞いた。しばらくその場所へ向かう。
  // 拡声器のように遠くから呼ぶときは、長めの時間を渡す
  alert(spot, now, seconds = 8) {
    if (!this.active || !this.alive) return;
    this.alertSpot.copy(spot);
    this.alertUntil = Math.max(this.alertUntil, now + seconds);
  }

  knockback(direction, power) {
    if (!this.alive) return;
    this.velocity.addScaledVector(direction, power);
  }

  // 足元の当たり判定を x,z に置いたときに何とぶつかるか。
  // 下端を段差ぶん上げてあるので、階段のような低い段は素通りして上れる
  #blocker(x, z, colliders, structures, feet = this.root.position.y) {
    box.min.set(x - RADIUS, feet + STEP_HEIGHT + STEP_SLACK, z - RADIUS);
    box.max.set(x + RADIUS, feet + this.def.height * 0.8, z + RADIUS);
    if (colliders.some((c) => c.intersectsBox(box))) return 'nature';
    return structures.find((s) => s.alive && s.box.intersectsBox(box)) ?? null;
  }

  // 軸ごとに動かすと、天然壁には引っかからず滑って回り込める
  #step(dx, dz, colliders, structures) {
    const p = this.root.position;
    let hitStructure = null;
    for (const [ax, az] of [[dx, 0], [0, dz]]) {
      if (!ax && !az) continue;
      const blocker = this.#blocker(p.x + ax, p.z + az, colliders, structures);
      if (!blocker) {
        p.x += ax;
        p.z += az;
      } else if (blocker !== 'nature') {
        hitStructure = blocker;
      }
    }
    // 段差を上り、床がなくなったら落ちる
    const floor = floorHeight(colliders, p.x, p.z, p.y, RADIUS);
    p.y = floor > p.y ? floor : THREE.MathUtils.lerp(p.y, floor, 0.35);
    return hitStructure;
  }

  // 壁の中に入ってしまったときの保険。いちばん近い外へ押し出す。
  // 吹き飛ばしとミュータントの着地で、まれに壁とかさなることがある
  #unstick(colliders, structures) {
    const p = this.root.position;
    if (!this.#blocker(p.x, p.z, colliders, structures)) return;
    for (let radius = 0.3; radius <= 2.4; radius += 0.3) {
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const x = p.x + Math.sin(angle) * radius;
        const z = p.z + Math.cos(angle) * radius;
        if (this.#blocker(x, z, colliders, structures)) continue;
        p.x = x;
        p.z = z;
        return;
      }
    }
  }

  #face(yaw, dt) {
    let delta = ((yaw - this.facing + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (delta < -Math.PI) delta += Math.PI * 2;
    this.facing += THREE.MathUtils.clamp(delta, -TURN_SPEED * dt, TURN_SPEED * dt);
  }

  // 止まって腕を振り下ろし、当たる瞬間に一度だけダメージを出す
  #attack(now, onLand, onSwing) {
    // 振っている途中で撃たれると、モーションが「被弾」に切り替わって
    // 「振り終わり」が来なくなる。中断されたら仕切り直す
    if (this.attacking && this.zombie.mode !== 'attack') {
      this.attacking = false;
      this.landed = false;
      this.nextAttackAt = Math.max(this.nextAttackAt, now + 0.3);
    }
    if (!this.attacking) {
      if (now < this.nextAttackAt) {
        this.zombie.setMode('idle');
        return;
      }
      this.zombie.restartAttack();
      this.attacking = true;
      this.landed = false;
      // 振りかぶった音。当たる前に鳴らして、よけられるようにする
      onSwing?.(this);
    }
    if (!this.landed && this.zombie.attackLanded) {
      this.landed = true;
      onLand();
    }
    if (this.zombie.attackFinished) {
      this.attacking = false;
      this.nextAttackAt = now + this.def.attackCooldown;
    }
  }

  // 味方やタレットが一番固まっている場所を探して、そこへ跳ぶ。
  // まずは身をかがめて溜める。この間、落ちる場所に印が出る
  #startCharge(spot, onSlamAim, colliders) {
    this.slamUsed = true;
    this.chargeT = 0;
    this.slamTo.set(spot.x, 0, spot.z);
    this.state = 'charge';
    this.attacking = false;
    this.zombie.setMode('charge');
    this.#face(Math.atan2(-(spot.x - this.root.position.x), -(spot.z - this.root.position.z)), 1);
    // 印は実際に落ちてくる床の高さに出す（高台の上に跳ぶこともある）
    const landing = floorHeight(colliders, spot.x, spot.z, this.def.slamHeight, RADIUS);
    onSlamAim(
      this,
      new THREE.Vector3(spot.x, landing, spot.z),
      this.def.slamRadius,
      this.def.slamChargeTime + this.def.slamTime
    );
  }

  #charge(dt) {
    this.chargeT += dt;
    // 溜めきったら跳ぶ。狙いは溜めはじめに決めた場所のまま動かさない
    if (this.chargeT < this.def.slamChargeTime) return;
    this.slamT = 0;
    this.slamFrom.copy(this.root.position);
    this.state = 'slam';
    this.zombie.setMode('jump');
  }

  #flySlam(dt, onSlam, colliders, structures) {
    this.slamT = Math.min(this.slamT + dt / this.def.slamTime, 1);
    const p = this.slamT;
    const landing = floorHeight(colliders, this.slamTo.x, this.slamTo.z, this.def.slamHeight, RADIUS);
    this.root.position.lerpVectors(this.slamFrom, this.slamTo, p);
    // 山なりの弧。0と1で地面、真ん中で最高点
    this.root.position.y = landing * p + Math.sin(p * Math.PI) * this.def.slamHeight;
    if (p < 1) return;

    this.root.position.y = landing;
    // 壁の上に落ちてめり込むことがあるので、着地したら外へ出す
    this.#unstick(colliders, structures);
    this.state = 'chase';
    this.zombie.setMode('idle');
    onSlam(this, this.def.slamDamage, this.def.slamRadius);
  }

  update(dt, now, world = {}) {
    if (!this.active) return;
    const {
      colliders = [], structures = [], players = [],
      onHitPlayer = () => {}, onBreak = () => {}, onSlam = () => {}, slamTargets = () => [],
      onSlamAim = () => {}, onShoot = () => {}, onBurrow = () => {}, onSpot = () => {},
      onSwing = () => {}, stairPoints = [], onShriek = () => {},
    } = world;
    // 叫びを浴びている間だけ足が速くなる
    this.hasted = now < this.hasteUntil;

    // オンラインでは何人もいる。そのつど一番近い相手を狙う
    const player = nearestPlayer(players, this.root.position);

    // ボスは考えかたがまったく違うので、専用の頭にまかせる
    if (this.boss) {
      this.boss.update(dt, now, { ...world, target: player });
      return;
    }

    if (this.state === 'charge') {
      this.#charge(dt);
      this.root.rotation.y = this.facing + Math.PI;
      this.zombie.update(dt);
      return;
    }

    if (this.state === 'slam') {
      this.#flySlam(dt, onSlam, colliders, structures);
      this.root.rotation.y = this.facing + Math.PI;
      this.zombie.update(dt);
      return;
    }

    // 地中に潜っている間。時間が来たら相手の近くに顔を出す
    if (this.state === 'burrow' || this.state === 'under' || this.state === 'emerge') {
      this.#underground(dt, now, player, colliders, onBurrow);
      this.root.rotation.y = this.facing + Math.PI;
      this.zombie.update(dt);
      return;
    }

    // 骨を組み直している間。立ち上がりきったら普通に動きだす
    if (this.state === 'reviving') {
      if (this.zombie.reviveFinished) {
        this.state = 'wander';
        this.zombie.setMode('idle');
        this.nextAttackAt = now + 0.6;
      }
      this.root.rotation.y = this.facing + Math.PI;
      this.zombie.update(dt);
      return;
    }

    // 吹き飛ばしも壁の判定を通す。そのまま座標を足すと壁にめり込む
    if (this.velocity.lengthSq() > 0.0001) {
      this.#step(this.velocity.x * dt, this.velocity.z * dt, colliders, structures);
      this.velocity.multiplyScalar(Math.max(0, 1 - KNOCKBACK_DAMPING * dt));
      this.#unstick(colliders, structures);
    }

    if (this.alive && this.#wantsSlam()) {
      const spot = bestCluster(slamTargets(), this.root.position, this.def);
      if (spot) {
        this.#startCharge(spot, onSlamAim, colliders);
        this.zombie.update(dt);
        return;
      }
    }

    if (this.alive && this.#wantsBurrow(player)) {
      this.#startBurrow(now, onBurrow);
      this.zombie.update(dt);
      return;
    }

    // 遠くてまだ気づいていない個体は、毎フレーム考えなくても見た目が変わらない。
    // ただし撃ってくる相手は狙いがぶれるので、いつもどおり考えさせる
    const ranged = this.def.behavior === 'gunner' || this.def.behavior === 'archer';
    const far = !ranged && (player
      ? this.root.position.distanceToSquared(player.position) > FAR_THINK * FAR_THINK
      : true);
    this.thinkSkip = far ? (this.thinkSkip + 1) % 3 : 0;

    if (this.alive && !this.thinkSkip) {
      this.#think(dt * (far ? 3 : 1), now, {
        colliders, structures, player, onHitPlayer, onBreak, onShoot, onSpot, onSwing,
        stairPoints, onShriek, onSlam, onSlamAim,
      });
    }

    // モデルは +Z が正面。facing はカメラと同じ -Z 基準なので半回転ぶんずらす
    this.root.rotation.y = this.facing + Math.PI;
    this.zombie.update(dt);

    if (this.alive) return;
    // 骨が散らばっているうちに引き当てたら、半分のHPで起き上がる
    if (this.willRevive && this.zombie.reviveWindow) this.#startRevive();
    // 倒れきったら列に戻す。次の湧きでこの個体が使い回される
    else if (this.zombie.deathFinished) this.retire();
  }

  #startRevive() {
    this.willRevive = false;
    this.revived = true;
    this.hp = Math.max(1, Math.round(this.maxHp / 2));
    this.state = 'reviving';
    this.attacking = false;
    this.shooting = false;
    this.zombie.setMode('revive');
    this.label.sprite.visible = true;
    this.#refresh();
  }

  // 瀕死になった瞬間に1回だけ抽選する。外れた個体はもう跳ばない
  #wantsSlam() {
    if (this.def.slamAt === undefined || this.slamUsed) return false;
    if (this.hp > this.maxHp * this.def.slamAt) return false;
    this.slamUsed = true;
    return Math.random() < this.def.slamChance;
  }

  // 半分まで削られた瞬間に1回だけ抽選する。相手がいないと潜っても意味がない
  #wantsBurrow(player) {
    if (this.def.burrowAt === undefined || this.burrowUsed) return false;
    if (this.hp > this.maxHp * this.def.burrowAt) return false;
    this.burrowUsed = true;
    if (!player || player.downed) return false;
    return Math.random() < this.def.burrowChance;
  }

  #startBurrow(now, onBurrow) {
    this.state = 'burrow';
    this.attacking = false;
    this.velocity.set(0, 0, 0);
    this.zombie.setMode('burrow');
    this.label.sprite.visible = false;
    onBurrow(this, 'in');
  }

  // 潜る→地中で待つ→相手のそばから出てくる、の3段階
  #underground(dt, now, player, colliders, onBurrow) {
    if (this.state === 'burrow') {
      if (!this.zombie.burrowFinished) return;
      this.state = 'under';
      this.root.visible = false;
      this.emergeAt = now + this.def.burrowTime;
      return;
    }

    if (this.state === 'under') {
      if (now < this.emergeAt) return;
      // 相手のまわりをぐるりと見て、床のある場所から出る
      const [min, max] = this.def.emergeRange;
      const base = player && !player.downed ? player.position : this.home;
      const start = Math.random() * Math.PI * 2;
      let spot = null;
      for (let i = 0; i < 8 && !spot; i++) {
        const angle = start + (i / 8) * Math.PI * 2;
        const dist = min + Math.random() * (max - min);
        const x = base.x + Math.sin(angle) * dist;
        const z = base.z + Math.cos(angle) * dist;
        const feet = player ? player.position.y - EYE_HEIGHT : 0;
        const floor = floorHeight(colliders, x, z, feet + STEP_HEIGHT, RADIUS);
        // 相手と同じ高さの床でないと、壁の中から出てしまう
        if (Math.abs(floor - feet) > 1.2) continue;
        if (this.#blocker(x, z, colliders, [], floor)) continue;
        spot = new THREE.Vector3(x, floor, z);
      }
      this.root.position.copy(spot ?? this.root.position);
      this.root.visible = true;
      this.state = 'emerge';
      this.zombie.setMode('emerge');
      this.label.sprite.visible = true;
      if (base) this.#face(Math.atan2(-(base.x - this.root.position.x), -(base.z - this.root.position.z)), 1);
      onBurrow(this, 'out');
      return;
    }

    // 出てきてから身構えるまで。この間はまだ襲ってこない
    if (this.zombie.emergeFinished) {
      this.state = 'chase';
      this.zombie.setMode('idle');
      this.nextAttackAt = now;
    }
  }

  // 相手が自分より高いところにいるとき、上れる階段の下を探す
  #stairTo(playerFeet, stairPoints) {
    const pos = this.root.position;
    // いま上っている途中の階段があれば、上りきるまで乗り換えない。
    // 途中で別の階段に向かうと、いまの階段の横へ落ちてしまう
    if (this.climbing) {
      if (pos.y < this.climbing.top.y - 0.25) return this.climbing;
      this.climbing = null;
    }
    let best = null;
    let bestDist = Infinity;
    for (const stair of stairPoints) {
      // 上り口と同じ高さにいるか、いま上っている最中の階段だけ使える。
      // 2階から始まる階段は1階からは使えず、
      // 途中まで上った階段は見失わない
      if (pos.y < stair.bottom.y - 1.2 || pos.y > stair.top.y + 1.2) continue;
      // 自分より低い階段や、行き過ぎる階段は使わない
      if (stair.top.y < pos.y + 0.6 || stair.top.y > playerFeet + 1.6) continue;
      // 上り口までの距離は、平面で見る（高さの差はもう確かめてある）
      const dist = Math.hypot(stair.bottom.x - pos.x, stair.bottom.z - pos.z);
      if (dist < bestDist) {
        bestDist = dist;
        best = stair;
      }
    }
    this.climbing = best;
    return best;
  }

  // 銃を構えているかどうか。構えられない種類には何もしない
  #setAiming(on) {
    if (this.zombie.aiming !== undefined) this.zombie.aiming = on;
  }

  // 目の高さ。見通しの判定と、弾を出す高さに使う
  eyePoint(out = new THREE.Vector3()) {
    return out.copy(this.root.position).setY(this.root.position.y + this.def.height * 0.78);
  }

  // 登れそうなビルを1つ選ぶ。相手の近くにある、ほどよい高さのものを探す
  #pickWall(colliders, goal) {
    const def = this.def;
    const pos = this.root.position;
    let best = null;
    let bestScore = Infinity;
    for (const c of colliders) {
      const top = c.max.y;
      if (top < def.climbMinTop || top > def.climbMaxTop) continue;
      // 細長い壁（外周の塀など）ではなく、屋上を歩ける大きさのものだけ
      if (c.max.x - c.min.x < 4 || c.max.z - c.min.z < 4) continue;
      const cx = (c.min.x + c.max.x) / 2;
      const cz = (c.min.z + c.max.z) / 2;
      if (Math.hypot(cx - pos.x, cz - pos.z) > def.climbRange) continue;
      // 相手のそばのビルでないと、登っても8m以内に来てくれない
      const toGoal = Math.hypot(cx - goal.x, cz - goal.z);
      if (toGoal > def.climbNear) continue;
      // 相手に近いビルほど良い。自分から遠すぎるものは選ばない
      const score = toGoal + Math.hypot(cx - pos.x, cz - pos.z) * 0.15;
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best;
  }

  // 選んだビルの、相手のいる側の側面に取りつく場所を決める。
  // 自分に近い面を選ぶと、建物の裏側で待ちぼうけになってしまう
  #setClimbTarget(wall, goal) {
    this.climbWall.copy(wall);
    this.climbTop = wall.max.y;
    // 屋上までは登らず、そのすこし下で張りついて待つ。
    // 低いビルでも、飛び降りる高さが出るところまでは登る
    this.clingY = Math.max(3.5, wall.max.y - 1.2);
    // 相手のいる側の面に取りつく。自分に近い面を選ぶと、建物の裏で待ちぼうけになる
    const from = goal ?? this.root.position;
    this.clingS = this.#wallSpotOf(from.x, from.z);
    this.#applyClingSpot();
  }

  // ---- ビルの外周を「1本の線」として扱う ----
  // 角をまたいで這って回れるように、外周ぜんぶを 0 からの長さ（s）で表す。
  // 面ごとに分けて持つと、角で止まってしまって相手を追えない

  // 外周の四角（壁から CLING_GAP だけ外側）
  #wallRect() {
    const w = this.climbWall;
    return {
      x0: w.min.x - CLING_GAP, x1: w.max.x + CLING_GAP,
      z0: w.min.z - CLING_GAP, z1: w.max.z + CLING_GAP,
    };
  }

  // その場所の真横にあたる、外周上の長さ（s）
  #wallSpotOf(px, pz) {
    const r = this.#wallRect();
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    const cx = THREE.MathUtils.clamp(px, r.x0, r.x1);
    const cz = THREE.MathUtils.clamp(pz, r.z0, r.z1);
    // 4つの面のうち、いちばん近いものを選ぶ
    const toZ0 = Math.abs(pz - r.z0);
    const toZ1 = Math.abs(pz - r.z1);
    const toX0 = Math.abs(px - r.x0);
    const toX1 = Math.abs(px - r.x1);
    const near = Math.min(toZ0, toZ1, toX0, toX1);
    if (near === toZ0) return cx - r.x0;
    if (near === toX1) return w + (cz - r.z0);
    if (near === toZ1) return w + d + (r.x1 - cx);
    return w * 2 + d + (r.z1 - cz);
  }

  // いまの s から、立ち位置と「壁を向く向き」を決める
  #applyClingSpot() {
    const r = this.#wallRect();
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    const total = (w + d) * 2;
    const s = ((this.clingS % total) + total) % total;
    this.clingS = s;
    if (s < w) {
      this.climbFace.set(r.x0 + s, 0, r.z0);
      this.climbInX = 0;
      this.climbInZ = 1;
    } else if (s < w + d) {
      this.climbFace.set(r.x1, 0, r.z0 + (s - w));
      this.climbInX = -1;
      this.climbInZ = 0;
    } else if (s < w * 2 + d) {
      this.climbFace.set(r.x1 - (s - w - d), 0, r.z1);
      this.climbInX = 0;
      this.climbInZ = -1;
    } else {
      this.climbFace.set(r.x0, 0, r.z1 - (s - w * 2 - d));
      this.climbInX = 1;
      this.climbInZ = 0;
    }
  }

  // 壁に張りついたまま、相手のいるほうへ外周を這って回りこむ。
  // これがないと、相手が8m以内に来ないまま待ちぼうけになる
  #slideCling(player, dt) {
    if (!player) return;
    const r = this.#wallRect();
    const total = ((r.x1 - r.x0) + (r.z1 - r.z0)) * 2;
    const want = this.#wallSpotOf(player.position.x, player.position.z);
    // 外周は輪なので、近いほうの回り方を選ぶ
    let diff = (((want - this.clingS) % total) + total) % total;
    if (diff > total / 2) diff -= total;
    const step = this.def.climbSpeed * CLING_SLIDE * dt;
    this.clingS += THREE.MathUtils.clamp(diff, -step, step);
    this.#applyClingSpot();
  }

  #giveUpClimb(now) {
    this.climbState = null;
    this.nextClimbAt = now + 4;
  }

  // 壁に張りついている間の姿勢。
  // 這うモーションは「頭が前（+Z）・お腹が下」の腹ばいなので、
  // 前後をひっくり返してから起こすと、頭が上・お腹が壁のほうを向く
  #setWallPose(on) {
    if (this.wallPose === on) return;
    this.wallPose = on;
    if (on) this.zombie.root.rotation.set(-Math.PI / 2, 0, Math.PI);
    else this.zombie.root.rotation.set(0, 0, 0);
    // 壁にぴったり寄せる
    this.zombie.root.position.z = on ? -0.4 : 0;
  }

  // 天井ゾンビ。壁を這い上がって、相手が近づくまで壁で待つ。
  // 自分で動きを決めたときは true を返す（false なら普通の追いかけに戻す）
  #climberThink(dt, now, pos, player, sees, colliders, structures, onSlam, onSlamAim, onHitPlayer) {
    const def = this.def;

    // 飛び降りている最中
    if (this.climbState === 'drop') {
      this.slamT = Math.min(this.slamT + dt / def.dropTime, 1);
      const p = this.slamT;
      pos.lerpVectors(this.slamFrom, this.slamTo, p);
      // 弧を描いて落ちる。飛び出してから落下する形
      pos.y = THREE.MathUtils.lerp(this.slamFrom.y, this.slamTo.y, p * p)
        + Math.sin(p * Math.PI) * def.dropHeight;
      this.#setWallPose(false);
      this.zombie.setMode('walk');
      if (p < 1) return true;
      pos.y = this.slamTo.y;
      this.climbState = null;
      this.nextClimbAt = now + def.climbCooldown;
      this.#unstick(colliders, structures);
      onSlam(this, def.dropDamage, def.dropRadius);
      this.state = 'chase';
      return true;
    }

    // 壁を這い下りている最中。相手がビルから離れたときに使う
    if (this.climbState === 'down') {
      pos.x = this.climbFace.x;
      pos.z = this.climbFace.z;
      pos.y -= def.climbSpeed * dt;
      this.#face(Math.atan2(this.climbInX, this.climbInZ), dt * 6);
      this.#setWallPose(true);
      this.zombie.setMode('crawl');
      if (pos.y <= 0) {
        pos.y = 0;
        this.#setWallPose(false);
        this.climbState = null;
        // 相手を追いかけて、近くのビルですぐ登り直せるように待ちは短く
        this.nextClimbAt = now + 2;
        this.#unstick(colliders, structures);
      }
      return true;
    }

    // 壁を這い上がっている最中
    if (this.climbState === 'up') {
      pos.x = this.climbFace.x;
      pos.z = this.climbFace.z;
      pos.y += def.climbSpeed * dt;
      // 壁のほうを向いて、四つんばいで這う
      this.#face(Math.atan2(this.climbInX, this.climbInZ), dt * 6);
      this.#setWallPose(true);
      this.zombie.setMode('crawl');
      // 登っている途中で撃たれたら、待たずにその場から飛びかかる
      if (this.clingHurt && pos.y > 2.5) {
        this.clingHurt = false;
        this.#dropAtPlayer(player, now, onSlamAim, colliders);
        return true;
      }
      if (pos.y >= this.clingY) {
        // 登りきった。ここから相手が来るまで張りついて待つ
        pos.y = this.clingY;
        this.climbState = 'cling';
        this.climbUntil = now + def.clingTime;
        this.clingBest = Infinity;
        this.clingStuckAt = now;
      } else if (now > this.climbUntil) {
        // 何かおかしくて登りきれない。あきらめて地面へ戻る
        pos.y = 0;
        this.#giveUpClimb(now);
      }
      return true;
    }

    // 壁に張りついたまま、相手が真下へ来るのを待つ
    if (this.climbState === 'cling') {
      this.#slideCling(player, dt);
      pos.x = this.climbFace.x;
      pos.z = this.climbFace.z;
      pos.y = this.clingY;
      this.#face(Math.atan2(this.climbInX, this.climbInZ), dt * 6);
      this.#setWallPose(true);
      // その場で少しだけ這って、じっとしていないように見せる
      this.zombie.setMode('crawl');
      this.zombie.walkRate = 0.35;
      this.state = 'chase';

      // 撃たれたら、待たずに飛びかかる
      if (this.clingHurt) {
        this.clingHurt = false;
        this.zombie.walkRate = def.animRate ?? 1;
        this.#dropAtPlayer(player, now, onSlamAim, colliders);
        return true;
      }

      // 相手がこの距離まで来たら、頭上から落ちてくる
      const flat = player
        ? Math.hypot(player.position.x - pos.x, player.position.z - pos.z)
        : Infinity;
      if (flat <= def.dropRange) {
        this.zombie.walkRate = def.animRate ?? 1;
        this.#dropTo(player.position.x, player.position.z, now, onSlamAim, colliders);
        return true;
      }
      // 這って回っても近づけないときは、待たずに這い下りて、
      // 相手のいるほうのビルで登り直す
      if (flat < this.clingBest - 0.3) {
        this.clingBest = flat;
        this.clingStuckAt = now;
      }
      const stuck = now - this.clingStuckAt > 3;
      if (flat > def.clingGiveUp || stuck || now > this.climbUntil) {
        this.zombie.walkRate = def.animRate ?? 1;
        this.climbState = 'down';
      }
      return true;
    }

    // ---- ここからは地上 ----
    this.#setWallPose(false);
    if (this.climbState === 'toWall') {
      const to = this.climbFace.clone().sub(pos).setY(0);
      const flat = to.length();
      if (flat < 1.1) {
        this.climbState = 'up';
        this.climbUntil = now + 12;
        return true;
      }
      if (now > this.climbUntil) {
        this.#giveUpClimb(now);
        return false;
      }
      this.#face(Math.atan2(-to.x, -to.z), dt);
      to.divideScalar(flat || 1);
      this.zombie.setMode('walk');
      this.state = 'chase';
      this.#advance(to.x, to.z, this.chaseSpeedNow * dt, colliders, structures);
      return true;
    }

    // 登りはじめるか決める。相手が見えていて、待ち時間が明けていれば登る
    if (sees && now >= this.nextClimbAt) {
      const wall = this.#pickWall(colliders, player.position);
      if (wall) {
        this.#setClimbTarget(wall, player.position);
        this.clingHurt = false;
        this.climbState = 'toWall';
        this.climbUntil = now + 12;
        return true;
      }
      // 登れる建物が近くにない。しばらく普通に追いかける
      this.nextClimbAt = now + 3;
    }
    return false;
  }

  // 相手めがけて飛び降りる。遠すぎるときは、跳べる範囲までにとどめる
  #dropAtPlayer(player, now, onSlamAim, colliders) {
    const pos = this.root.position;
    if (!player) return this.#dropTo(pos.x, pos.z, now, onSlamAim, colliders);
    const to = player.position.clone().sub(pos).setY(0);
    const flat = to.length();
    const reach = Math.min(flat, this.def.dropRange * 1.6);
    to.divideScalar(flat || 1).multiplyScalar(reach);
    return this.#dropTo(pos.x + to.x, pos.z + to.z, now, onSlamAim, colliders);
  }

  // 飛び降りる。落ちる先に印を出す
  #dropTo(x, z, now, onSlamAim = null, colliders = null) {
    const def = this.def;
    const pos = this.root.position;
    const landing = colliders ? floorHeight(colliders, x, z, 0, RADIUS) : 0;
    this.slamFrom.copy(pos);
    this.slamTo.set(x, landing, z);
    this.slamT = 0;
    this.climbState = 'drop';
    this.state = 'chase';
    onSlamAim?.(this, this.slamTo.clone(), def.dropRadius, def.dropTime);
  }

  // 叫びゾンビ。攻撃せず、距離を保ちながら、ときどき叫んで仲間の足を速くする
  #shriekThink(dt, now, pos, player, sees, colliders, structures, onShriek) {
    // 相手がいてもいなくても、時間が来たら叫ぶ
    if (now >= this.nextShriekAt) {
      this.nextShriekAt = now + this.def.shriekCooldown;
      this.state = 'attack';
      this.zombie.setMode('attack');
      onShriek(this, this.def.shriekRadius, this.def.hasteTime, this.def.hasteScale);
      return;
    }

    if (!sees) {
      // 誰も見えないときは、ふらふらと歩き回る
      this.state = 'wander';
      this.#wander(dt, now, colliders, structures);
      return;
    }

    const to = player.position.clone().sub(pos).setY(0);
    const dist = to.length();
    // こちらを向いてはいるが、近づかれたら逃げる
    this.#face(Math.atan2(-to.x, -to.z), dt);
    const dir = to.divideScalar(dist || 1);

    if (dist < this.def.keepRange) {
      // 逃げる。壁にぶつかったら左右へ回り込む
      this.state = 'chase';
      this.zombie.setMode('walk');
      this.#advance(-dir.x, -dir.z, this.chaseSpeedNow * dt, colliders, structures);
      return;
    }
    if (dist > this.def.keepRange * 1.6) {
      // 離れすぎたら、声が届く位置まで戻る
      this.state = 'chase';
      this.zombie.setMode('walk');
      this.#advance(dir.x, dir.z, this.def.walkSpeed * dt, colliders, structures);
      return;
    }
    this.state = 'idle';
    this.zombie.setMode('idle');
  }

  // 遠くから撃つ種類の動き。撃てたら true、撃てないときは false を返して
  // 普通に近づく処理へ渡す
  #ranged(dt, now, player, colliders, structures, onShoot, onBreak, onSwing) {
    const pos = this.root.position;
    const to = player.position.clone().sub(pos).setY(0);
    const dist = to.length();
    this.#face(Math.atan2(-to.x, -to.z), dt);

    const clear = dist <= this.def.shootRange
      && canSee(this.eyePoint(), player.position, colliders);
    if (!clear) {
      this.#setAiming(false);
      // 弓を引いている途中で見失ったら、いったんやめる
      if (this.shooting) {
        this.shooting = false;
        this.nextShotAt = now + 0.5;
      }
      return false;
    }

    const [minWait, maxWait] = this.def.shootCooldown;
    const wait = () => minWait + Math.random() * (maxWait - minWait);
    const dir = to.divideScalar(dist || 1);
    const near = dist <= this.def.keepRange;

    // 弓は引き絞る間、足を止める
    if (this.def.behavior === 'archer') {
      if (this.shooting) {
        this.state = 'attack';
        if (!this.shotFired && this.zombie.shotReleased) {
          this.shotFired = true;
          onShoot(this, 'arrow', this.def.damage, player);
        }
        if (this.zombie.shootFinished) {
          this.shooting = false;
          this.nextShotAt = now + wait();
          this.zombie.setMode('idle');
        }
        return true;
      }
      if (near && now >= this.nextShotAt) {
        this.shooting = true;
        this.shotFired = false;
        this.zombie.startShoot();
        this.state = 'attack';
        return true;
      }
      if (near) {
        this.state = 'attack';
        this.zombie.setMode('idle');
        return true;
      }
      // まだ遠い。撃てる距離まで詰める
      if (!this.#approach(dt, dir, colliders, structures, onBreak, now, onSwing)) {
        this.state = 'chase';
        this.zombie.setMode('walk');
      }
      return true;
    }

    // 銃は歩きながらでも撃てる。近づきすぎても下がらず、その場で撃ち続ける
    this.#setAiming(true);
    if (near) {
      this.state = 'attack';
      this.zombie.setMode('idle');
    } else if (!this.#approach(dt, dir, colliders, structures, onBreak, now, onSwing)) {
      this.state = 'chase';
      this.zombie.setMode('walk');
    }

    if (now >= this.nextShotAt) {
      this.nextShotAt = now + wait();
      this.zombie.fire?.();
      onShoot(this, 'bullet', this.def.damage, player);
    }
    return true;
  }

  // 相手のほうへ1歩進む。人工の壁にぶつかったら壊しにかかる（true を返す）
  #approach(dt, dir, colliders, structures, onBreak, now, onSwing) {
    const speed = this.chaseSpeedNow * dt;
    const wall = this.#advance(dir.x, dir.z, speed, colliders, structures);
    if (!wall) return false;
    this.state = 'break';
    const pos = this.root.position;
    this.#face(Math.atan2(-(wall.root.position.x - pos.x), -(wall.root.position.z - pos.z)), dt);
    this.#attack(now, () => onBreak(this, wall, this.def.structureDamage), onSwing);
    return true;
  }

  // 壁を避けて進む。まっすぐ行けなかったら、左右に開いた向きを順に試す
  #advance(dirX, dirZ, speed, colliders, structures) {
    const pos = this.root.position;
    const fromX = pos.x;
    const fromZ = pos.z;
    const moved = () => Math.hypot(pos.x - fromX, pos.z - fromZ) > speed * 0.5;

    const wall = this.#step(dirX * speed, dirZ * speed, colliders, structures);
    if (wall || !this.def.avoidsWalls || moved()) return wall;

    // 天然の壁で足が止まっている。回り込める向きを探す
    for (const angle of [0.9, -0.9, 1.7, -1.7]) {
      const s = Math.sin(angle);
      const c = Math.cos(angle);
      const hit = this.#step(
        (dirX * c - dirZ * s) * speed,
        (dirX * s + dirZ * c) * speed,
        colliders, structures
      );
      if (hit) return hit;
      if (moved()) return null;
    }
    return null;
  }

  #think(dt, now, ctx) {
    const {
      colliders, structures, player, onHitPlayer, onBreak, onShoot, onSpot, onSwing,
      stairPoints, onShriek = () => {},
    } = ctx;
    // のけぞっている間は動かない。ただし壁にいるときだけは、
    // 固まっていると撃たれ放題になるので、そのまま考えさせる
    if (this.zombie.mode === 'hit' && !this.climbState) return;
    const pos = this.root.position;

    const chaseable = player && !player.downed;
    let sees = chaseable && pos.distanceTo(player.position) < this.def.sight;

    // ガンマゾンビは一度見つけた相手を見失わない。仲間にも居場所を知らせる
    if (this.def.lockOn) {
      if (sees) this.locked = true;
      if (!chaseable) this.locked = false;
      if (this.locked) {
        sees = true;
        if (this.def.shares && now >= this.shareAt) {
          const first = this.shareAt === 0;
          this.shareAt = now + 2.0;
          onSpot(this, player.position, first);
        }
      }
    }

    const hears = now < this.alertUntil;

    // 天井ゾンビ。壁を這って登り、張りついたまま相手を待つ。
    // 相手を見失っても壁から降ろされないよう、ここで先に片づける。
    // 登れないときは false が返るので、そのまま普通の動きに進む
    if (this.def.behavior === 'climber'
      && this.#climberThink(dt, now, pos, player, sees, colliders, structures,
        ctx.onSlam ?? (() => {}), ctx.onSlamAim ?? (() => {}), onHitPlayer)) return;

    if (!sees && !hears) {
      this.attacking = false;
      this.shooting = false;
      this.#setAiming(false);
      // 近くに壊せるものがあればそちらへ、なければ広場の真ん中へ集まる
      const build = nearestStructure(structures, pos);
      if (build) {
        this.#goBreak(build, dt, now, colliders, structures, onBreak, onSwing);
        return;
      }
      if (this.#headToCenter(dt, colliders, structures, onBreak, now, onSwing)) return;
      this.state = 'wander';
      this.#wander(dt, now, colliders, structures);
      return;
    }

    // 叫びゾンビ。殴らず、距離を取りながら仲間を鼓舞する
    if (this.def.behavior === 'shrieker') {
      this.#shriekThink(dt, now, pos, player, sees, colliders, structures, onShriek);
      return;
    }

    // 撃ってくる種類は、まず遠くから撃てないか試す
    if (sees && (this.def.behavior === 'gunner' || this.def.behavior === 'archer')) {
      this.attacking = false;
      if (this.#ranged(dt, now, player, colliders, structures, onShoot, onBreak, onSwing)) return;
    } else {
      this.#setAiming(false);
    }

    // 人より近くに建物があれば、そちらを先に壊す。
    // タレットに背を向けて走り抜けると、ずっと撃たれ続けてしまうため
    const build = nearestStructure(structures, pos);
    if (build) {
      const buildDist = build.root.position.distanceTo(pos);
      const playerDist = sees ? pos.distanceTo(player.position) : Infinity;
      if (buildDist < playerDist) {
        this.#goBreak(build, dt, now, colliders, structures, onBreak, onSwing);
        return;
      }
    }

    // 見えていれば本人、聞こえただけなら音のした場所を目指す
    let goal = sees ? player.position : this.alertSpot;
    let canAttack = sees;
    if (!sees && pos.distanceTo(this.alertSpot) < 2.5) this.alertUntil = 0;

    // 高いところにいる相手には、まず階段の下、次に上を目指す
    if (sees) {
      const playerFeet = player.position.y - EYE_HEIGHT;
      // 同じ高さまで来たら、上っていた階段のことは忘れる
      if (playerFeet - pos.y <= 1.2) this.climbing = null;
      if (playerFeet - pos.y > 1.2) {
        const stair = this.#stairTo(playerFeet, stairPoints);
        if (stair) {
          // すでに上りはじめていたら、迷わず上を目指す。
          // 3Dの距離で切り替えると、上り口と出口を行き来して固まってしまう
          const climbing = pos.y > stair.bottom.y + 0.3;
          const toBottom = Math.hypot(stair.bottom.x - pos.x, stair.bottom.z - pos.z);
          goal = !climbing && toBottom > 2.0 ? stair.bottom : stair.top;
          canAttack = false;
          this.state = 'climb';
        }
      }
    }

    const to = goal.clone().sub(pos).setY(0);
    const dist = to.length();
    this.#face(Math.atan2(-to.x, -to.z), dt);

    // 目の前にいるなら止まって殴る
    if (canAttack && dist <= this.def.reach) {
      this.state = 'attack';
      this.#attack(now, () => onHitPlayer(this, this.def.damage, player), onSwing);
      return;
    }

    const dir = to.divideScalar(dist || 1);
    // 人工の壁は避けずに壊して進む。階段へ向かう途中でも同じ
    if (this.#approach(dt, dir, colliders, structures, onBreak, now, onSwing)) return;

    if (this.state !== 'climb') this.state = sees ? 'chase' : 'alert';
    this.attacking = false;
    this.zombie.setMode('walk');
  }

  // 建物のところまで行って壊す
  #goBreak(build, dt, now, colliders, structures, onBreak, onSwing) {
    const pos = this.root.position;
    const to = build.root.position.clone().sub(pos).setY(0);
    const dist = to.length();
    this.state = 'break';
    this.#face(Math.atan2(-to.x, -to.z), dt);
    if (dist <= this.def.reach + 1.0) {
      this.#attack(now, () => onBreak(this, build, this.def.structureDamage), onSwing);
      return;
    }
    this.attacking = false;
    this.zombie.setMode('walk');
    const dir = to.divideScalar(dist || 1);
    this.#approach(dt, dir, colliders, structures, onBreak, now, onSwing);
  }

  // 相手が見つかっていないときは、広場（真ん中）を目指して歩く。
  // 建物が近くにあるときは、そちらを壊しに行くほうが先
  #headToCenter(dt, colliders, structures, onBreak, now, onSwing) {
    const pos = this.root.position;
    const to = CENTER.clone().sub(pos).setY(0);
    const dist = to.length();
    // 真ん中まで来たら、そのあたりをうろつく
    if (dist < CENTER_RADIUS) return false;
    this.state = 'march';
    this.#face(Math.atan2(-to.x, -to.z), dt);
    this.attacking = false;
    const dir = to.divideScalar(dist || 1);
    if (!this.#approach(dt, dir, colliders, structures, onBreak, now, onSwing)) {
      this.zombie.setMode('walk');
    }
    return true;
  }

  #wander(dt, now, colliders, structures) {
    if (now >= this.wanderUntil) {
      this.wanderUntil = now + 2 + Math.random() * 3;
      const home = this.root.position.distanceTo(this.home);
      // 遠くまで行き過ぎたら家の方へ向き直す
      this.wanderYaw = home > WANDER_RANGE
        ? Math.atan2(-(this.home.x - this.root.position.x), -(this.home.z - this.root.position.z))
        : Math.random() * Math.PI * 2;
    }
    this.#face(this.wanderYaw, dt);
    const speed = this.def.walkSpeed * (this.hasted ? (this.hasteScale ?? 1.5) : 1) * dt;
    const dx = -Math.sin(this.facing) * speed;
    const dz = -Math.cos(this.facing) * speed;
    const before = this.root.position.x + this.root.position.z;
    this.#step(dx, dz, colliders, structures);
    // 壁にはまって進めないときは行き先を変える
    if (Math.abs(this.root.position.x + this.root.position.z - before) < speed * 0.2) this.wanderUntil = 0;
    this.zombie.setMode('walk');
  }

  respawn() {
    this.hp = this.maxHp;
    this.root.position.copy(this.home);
    this.root.visible = true;
    this.velocity.set(0, 0, 0);
    this.zombie.reset();
    this.state = 'wander';
    this.attacking = false;
    this.slamUsed = false;
    this.hasteUntil = 0;
    this.hasted = false;
    this.nextShriekAt = 0;
    this.climbState = null;
    this.nextClimbAt = 0;
    this.clingHurt = false;
    // 壁ばりの姿勢のまま使い回さないよう、立ち姿に戻しておく
    this.#setWallPose(false);
    this.burrowUsed = false;
    this.climbing = null;
    this.revived = false;
    this.willRevive = false;
    this.locked = false;
    this.shooting = false;
    this.shotFired = false;
    this.shareAt = 0;
    this.nextShotAt = 0;
    this.nextAttackAt = 0;
    this.label.sprite.visible = true;
    this.#refresh();
  }

  #refresh() {
    this.label.draw(`${this.hp} / ${this.maxHp}`, hpColor(this.hp, this.maxHp));
  }

  // ボスから呼ぶ用（#refresh は外から呼べないため）
  refreshLabel() {
    this.#refresh();
  }

  // 弾を当てられる部分。ふつうの敵は体ひとつ、ボスは装甲と核
  hitTargets() {
    if (this.boss) return [this.hitbox, ...this.zombie.hitTargets()];
    return [this.hitbox];
  }

  // 撃たれた物が自分のどこかを返す。自分のものでなければ undefined
  partOf(object) {
    if (object === this.hitbox) return null;
    if (this.boss) return this.zombie.partOf(object);
    return undefined;
  }

  owns(object) {
    return object === this.hitbox || (this.boss && this.zombie.partOf(object) !== null);
  }

  // ---- ここから下はオンライン用 ----

  // 親が送る、この1体ぶんの状態。数字の配列にして通信を小さくする
  netPack(slot) {
    return [
      slot,
      NET_ENEMY_IDS.indexOf(this.def.id),
      r2(this.root.position.x), r2(this.root.position.y), r2(this.root.position.z),
      r2(this.facing),
      NET_MODES.indexOf(this.zombie.mode),
      Math.round(this.hp),
      this.maxHp,
      (this.root.visible ? NET_VISIBLE : 0) | (this.label.sprite.visible ? NET_LABEL : 0),
    ];
  }

  // 子が受け取った状態を反映する。位置と向きは目標だけ決めて、
  // 実際に動かすのは netUpdate（10回/秒しか届かないので、間を補う）
  netApply(row) {
    const typeId = NET_ENEMY_IDS[row[1]];
    if (typeId && this.def.id !== typeId) {
      this.def = ENEMIES[typeId];
      this.#buildModel();
      this.netTarget = null;
    }
    this.active = true;

    this.netTarget ??= new THREE.Vector3();
    this.netTarget.set(row[2], row[3], row[4]);
    this.netFacing = row[5];
    // 初めて届いた個体は、補間せずその場に置く
    if (!this.netPlaced) {
      this.netPlaced = true;
      this.root.position.copy(this.netTarget);
      this.facing = this.netFacing;
    }

    const mode = NET_MODES[row[6]];
    if (mode) {
      // 這っているのは壁を登っているときだけ。子の画面でも壁ばりの姿勢にする
      this.#setWallPose(mode === 'crawl');
      this.zombie.setMode(mode);
    }

    const hp = row[7];
    const maxHp = row[8];
    if (hp !== this.hp || maxHp !== this.maxHp) {
      this.hp = hp;
      this.maxHp = maxHp;
      this.#refresh();
    }
    this.state = hp > 0 ? 'chase' : 'dead';
    this.root.visible = !!(row[9] & NET_VISIBLE);
    this.label.sprite.visible = !!(row[9] & NET_LABEL);
  }

  // 子の側の毎フレーム処理。AIは動かさず、見た目だけ進める
  netUpdate(dt) {
    if (!this.active) return;
    if (this.netTarget) {
      this.root.position.lerp(this.netTarget, Math.min(dt * 14, 1));
      let delta = ((this.netFacing - this.facing + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (delta < -Math.PI) delta += Math.PI * 2;
      this.facing += delta * Math.min(dt * 14, 1);
    }
    this.root.rotation.y = this.facing + Math.PI;
    this.zombie.update(dt);
  }

  // 親が送ってこなかった＝もう居ない個体。次に届くまで隠しておく
  netRetire() {
    if (!this.active) return;
    this.active = false;
    this.hp = 0;
    this.root.visible = false;
    this.netPlaced = false;
    this.state = 'dead';
  }
}
