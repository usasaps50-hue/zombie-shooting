import * as THREE from 'three';
import { Avatar } from './avatar.js';
import { Zombie } from './zombie.js';
import { Mutant } from './mutant.js';
import { ENEMIES, JOBS } from './data/jobs.js';
import { makeLabel, hpColor } from './label.js';

export class Teammate {
  constructor(scene, { name, color, position, jobId = 'soldier' }) {
    this.name = name;
    this.maxHp = JOBS[jobId].hp;
    this.avatar = new Avatar(color);
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

const box = new THREE.Box3();

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
    this.slamT = 0;
    this.slamFrom = new THREE.Vector3();
    this.slamTo = new THREE.Vector3();

    const height = this.def.height;
    this.root = new THREE.Group();
    this.root.position.copy(position);
    this.zombie = this.def.model === 'mutant'
      ? new Mutant(this.def.armor)
      : new Zombie(this.def.skin, this.def.armor);
    this.root.add(this.zombie.root);

    // アニメーションで動く見た目とは別に、当たり判定は固定のカプセルで取る
    this.hitbox = new THREE.Mesh(
      new THREE.CapsuleGeometry(height * 0.24, height - height * 0.48),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    this.hitbox.position.y = height / 2;
    this.root.add(this.hitbox);

    this.label = makeLabel(height > 2 ? 1.9 : 1.4);
    this.label.sprite.position.y = height + 0.35;
    this.root.add(this.label.sprite);
    scene.add(this.root);
    this.#refresh();
  }

  get alive() {
    return this.hp > 0;
  }

  get position() {
    return this.root.position;
  }

  // ジャンプ中は空を飛んでいる扱いで、当たらない
  get invulnerable() {
    return this.state === 'slam';
  }

  hit(damage, now) {
    if (!this.alive || this.invulnerable) return false;
    this.hp = Math.max(0, this.hp - damage);
    this.#refresh();
    if (this.alive) {
      this.zombie.setMode('hit');
    } else {
      this.zombie.setMode('death');
      this.velocity.set(0, 0, 0);
      this.label.sprite.visible = false;
      this.respawnAt = now + 8;
      this.state = 'dead';
      this.target = null;
    }
    return true;
  }

  knockback(direction, power) {
    if (!this.alive) return;
    this.velocity.addScaledVector(direction, power);
  }

  // 足元の当たり判定を x,z に置いたときに何とぶつかるか
  #blocker(x, z, colliders, structures) {
    box.min.set(x - RADIUS, 0.1, z - RADIUS);
    box.max.set(x + RADIUS, this.def.height * 0.8, z + RADIUS);
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
    return hitStructure;
  }

  #face(yaw, dt) {
    let delta = ((yaw - this.facing + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (delta < -Math.PI) delta += Math.PI * 2;
    this.facing += THREE.MathUtils.clamp(delta, -TURN_SPEED * dt, TURN_SPEED * dt);
  }

  // 止まって腕を振り下ろし、当たる瞬間に一度だけダメージを出す
  #attack(now, onLand) {
    if (!this.attacking) {
      if (now < this.nextAttackAt) {
        this.zombie.setMode('idle');
        return;
      }
      this.zombie.restartAttack();
      this.attacking = true;
      this.landed = false;
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

  // 味方やタレットが一番固まっている場所を探して、そこへ跳ぶ
  #startSlam(spot) {
    this.slamUsed = true;
    this.slamT = 0;
    this.slamFrom.copy(this.root.position);
    this.slamTo.set(spot.x, 0, spot.z);
    this.state = 'slam';
    this.attacking = false;
    this.zombie.setMode('jump');
    this.#face(Math.atan2(-(spot.x - this.root.position.x), -(spot.z - this.root.position.z)), 1);
  }

  #flySlam(dt, onSlam) {
    this.slamT = Math.min(this.slamT + dt / this.def.slamTime, 1);
    const p = this.slamT;
    this.root.position.lerpVectors(this.slamFrom, this.slamTo, p);
    // 山なりの弧。0と1で地面、真ん中で最高点
    this.root.position.y = Math.sin(p * Math.PI) * this.def.slamHeight;
    if (p < 1) return;

    this.root.position.y = 0;
    this.state = 'chase';
    this.zombie.setMode('idle');
    onSlam(this, this.def.slamDamage, this.def.slamRadius);
  }

  update(dt, now, world = {}) {
    const {
      colliders = [], structures = [], player = null,
      onHitPlayer = () => {}, onBreak = () => {}, onSlam = () => {}, slamTargets = () => [],
    } = world;

    if (this.state === 'slam') {
      this.#flySlam(dt, onSlam);
      this.root.rotation.y = this.facing + Math.PI;
      this.zombie.update(dt);
      return;
    }

    if (this.velocity.lengthSq() > 0.0001) {
      this.root.position.addScaledVector(this.velocity, dt);
      this.velocity.multiplyScalar(Math.max(0, 1 - KNOCKBACK_DAMPING * dt));
    }

    if (this.alive && this.#wantsSlam()) {
      const spot = bestCluster(slamTargets(), this.root.position, this.def);
      if (spot) {
        this.#startSlam(spot);
        this.zombie.update(dt);
        return;
      }
    }

    if (this.alive) this.#think(dt, now, colliders, structures, player, onHitPlayer, onBreak);

    // モデルは +Z が正面。facing はカメラと同じ -Z 基準なので半回転ぶんずらす
    this.root.rotation.y = this.facing + Math.PI;
    this.zombie.update(dt);

    if (!this.alive && now >= this.respawnAt) this.respawn();
  }

  #wantsSlam() {
    return this.def.slamAt !== undefined && !this.slamUsed && this.hp <= this.maxHp * this.def.slamAt;
  }

  #think(dt, now, colliders, structures, player, onHitPlayer, onBreak) {
    const pos = this.root.position;
    const chasing = player && !player.downed &&
      pos.distanceTo(player.position) < this.def.sight;

    if (this.zombie.mode === 'hit') return;

    if (!chasing) {
      this.state = 'wander';
      this.attacking = false;
      this.#wander(dt, now, colliders, structures);
      return;
    }

    const to = player.position.clone().sub(pos).setY(0);
    const dist = to.length();
    this.#face(Math.atan2(-to.x, -to.z), dt);

    // 目の前にいるなら止まって殴る
    if (dist <= this.def.reach) {
      this.state = 'attack';
      this.#attack(now, () => onHitPlayer(this, this.def.damage));
      return;
    }

    const dir = to.divideScalar(dist || 1);
    const speed = this.def.chaseSpeed * dt;
    const wall = this.#step(dir.x * speed, dir.z * speed, colliders, structures);

    // 人工の壁は避けずに壊して進む
    if (wall) {
      this.state = 'break';
      this.#face(Math.atan2(-(wall.root.position.x - pos.x), -(wall.root.position.z - pos.z)), dt);
      this.#attack(now, () => onBreak(this, wall, this.def.structureDamage));
      return;
    }

    this.state = 'chase';
    this.attacking = false;
    this.zombie.setMode('walk');
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
    const speed = this.def.walkSpeed * dt;
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
    this.velocity.set(0, 0, 0);
    this.zombie.reset();
    this.state = 'wander';
    this.attacking = false;
    this.slamUsed = false;
    this.nextAttackAt = 0;
    this.label.sprite.visible = true;
    this.#refresh();
  }

  #refresh() {
    this.label.draw(`${this.hp} / ${this.maxHp}`, hpColor(this.hp, this.maxHp));
  }
}
