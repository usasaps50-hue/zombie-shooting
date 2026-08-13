import * as THREE from 'three';
import { PLAYER } from './data/jobs.js';

export const EYE_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.4;
const WALK_SPEED = 4.5;
const RUN_SPEED = 8.0;
const JUMP_SPEED = 5.0;
const GRAVITY = 20.0;
const MAX_PITCH = Math.PI / 2 - 0.05;

// これ以下の段差は、ぶつからずに上れる。階段の1段ぶんより少し高くしてある
export const STEP_HEIGHT = 0.6;

const tmpBox = new THREE.Box3();
const tmpMin = new THREE.Vector3();
const tmpMax = new THREE.Vector3();

// 当たり判定の下端を段差ぶん持ち上げる。低い段は素通りするので、階段を歩いて上れる
export function collides(colliders, x, y, z) {
  const feet = y - EYE_HEIGHT;
  tmpMin.set(x - PLAYER_RADIUS, feet + STEP_HEIGHT, z - PLAYER_RADIUS);
  tmpMax.set(x + PLAYER_RADIUS, y, z + PLAYER_RADIUS);
  tmpBox.set(tmpMin, tmpMax);
  return colliders.some((c) => c.intersectsBox(tmpBox));
}

// 足元にある一番高い床の高さ。上れないほど高い面は無視する
export function floorHeight(colliders, x, z, feet, radius = PLAYER_RADIUS) {
  let best = 0;
  for (const c of colliders) {
    if (x < c.min.x - radius || x > c.max.x + radius) continue;
    if (z < c.min.z - radius || z > c.max.z + radius) continue;
    if (c.max.y > best && c.max.y <= feet + STEP_HEIGHT) best = c.max.y;
  }
  return best;
}

export class Player {
  constructor(job) {
    this.job = job;
    this.maxHp = job.hp;
    this.hp = job.hp;
    this.bandages = job.bandages;
    this.position = new THREE.Vector3(0, EYE_HEIGHT, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.velY = 0;
    this.onGround = true;
    this.downed = false;
    this.downedAt = 0;
    this.invulnUntil = 0;
    this.speed = 0;
    this.time = 0;
    this.hurtAt = -99;
    // 持っている武器のレベルでつく移動速度ボーナス
    this.speedBonus = 0;
  }

  get invulnerable() {
    return this.time < this.invulnUntil;
  }

  look(dx, dy) {
    this.yaw += dx;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy, -MAX_PITCH, MAX_PITCH);
  }

  update(dt, input, colliders) {
    this.time += dt;
    const look = input.consumeLook();
    this.look(look.dx, look.dy);

    if (this.downed) {
      this.speed = 0;
      input.consumeJump();
      return;
    }

    const forwardX = -Math.sin(this.yaw);
    const forwardZ = -Math.cos(this.yaw);
    const rightX = -forwardZ;
    const rightZ = forwardX;

    let mx = input.move.x * rightX + input.move.y * forwardX;
    let mz = input.move.x * rightZ + input.move.y * forwardZ;
    const len = Math.hypot(mx, mz);
    if (len > 1) {
      mx /= len;
      mz /= len;
    }

    const base = input.run ? RUN_SPEED : WALK_SPEED;
    const speed = base * this.job.speedScale * (1 + this.speedBonus);
    this.speed = Math.min(len, 1) * speed;

    const p = this.position;
    const stepX = p.x + mx * speed * dt;
    if (!collides(colliders, stepX, p.y, p.z)) p.x = stepX;
    const stepZ = p.z + mz * speed * dt;
    if (!collides(colliders, p.x, p.y, stepZ)) p.z = stepZ;

    if (input.consumeJump() && this.onGround) {
      this.velY = JUMP_SPEED;
      this.onGround = false;
    }

    // 足元の床の高さ。階段や廃墟の上に乗ると、そのぶん立つ位置が上がる
    const feet = p.y - EYE_HEIGHT;
    const floor = floorHeight(colliders, p.x, p.z, feet);
    this.velY -= GRAVITY * dt;
    p.y += this.velY * dt;
    if (p.y < floor + EYE_HEIGHT) {
      p.y = floor + EYE_HEIGHT;
      this.velY = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }
  }

  applyToCamera(camera) {
    camera.position.copy(this.position);
    camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  damage(amount) {
    if (this.downed || this.invulnerable) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.invulnUntil = this.time + PLAYER.hitInvulnTime;
    this.hurtAt = this.time;
    if (this.hp === 0) {
      this.downed = true;
      this.downedAt = this.time;
      return true;
    }
    return false;
  }

  // 必殺技のチャージに使うので、実際に回復した量を返す
  heal(amount) {
    if (this.downed || this.hp >= this.maxHp) return 0;
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    return this.hp - before;
  }

  revive() {
    this.downed = false;
    this.hp = PLAYER.reviveHp;
    this.invulnUntil = this.time + PLAYER.reviveInvulnTime;
  }
}
