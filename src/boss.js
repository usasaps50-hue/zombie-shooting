import * as THREE from 'three';
import { floorHeight } from './player.js';

// ボス「タイタン」の頭の中。Enemy から呼ばれて、3つの形態を切り替える。
//
//  第1形態：装甲4枚を割られるまで、本体にはほとんどダメージが通らない。
//           踏みつけと、雑魚を掴んで投げる攻撃をしてくる。
//  第2形態：核が露出して弱点になる。跳びかかってきて、着地で衝撃波。
//  第3形態：HPが減ると咆哮して雑魚を呼ぶ。衝撃波（高い所へ登れば避けられる）と
//           音波ビーム（壁を貫通するので横に避ける）を交互に撃つ。

const RADIUS = 1.9;
const TURN_SPEED = 1.6;

export const TITAN = {
  // 装甲1枚ぶんのHP。4枚割ると核が出る
  plateHp: 380,
  // 第1形態の間、本体に通るダメージの割合
  bodyGuard: 0.15,
  // 核に当てたときの倍率
  coreBonus: 2.5,
  // HPがこの割合を下回ると第3形態
  ragePoint: 0.35,

  // 踏みつけ
  stompDamage: 34,
  stompRadius: 6.0,
  stompReach: 7.5,
  stompCooldown: 3.2,

  // 掴んで投げる（第1形態）。近くの雑魚を掴んでこちらへ投げてくる
  throwDamage: 22,
  throwGrabRange: 9,
  throwCooldown: 6.5,

  // 跳びかかり（第2形態〜）。着地で衝撃波が出る
  jumpDamage: 45,
  jumpRadius: 5.5,
  jumpRange: 30,
  jumpMin: 9,
  jumpChargeTime: 1.2,
  jumpTime: 1.1,
  jumpHeight: 9,
  jumpCooldown: 9,

  // 衝撃波。地面を走るので、高い所にいれば当たらない
  waveDamage: 30,
  waveSpeed: 16,
  waveRange: 26,
  // これより高い所に立っていれば当たらない
  waveSafeHeight: 1.2,

  // 音波ビーム。壁を貫通する。横に避けるしかない
  beamDamage: 40,
  beamMin: 6,
  beamRange: 34,
  beamHalfWidth: 1.9,
  beamCooldown: 7,

  // 第3形態に入るときの咆哮で呼ぶ雑魚の数
  summonCount: 6,
  summonCooldown: 16,

  walkSpeed: 2.6,
  rageSpeedScale: 1.25,
};

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

export class TitanBrain {
  // enemy は入れ物になっている Enemy。見た目（Titan）は enemy.zombie
  constructor(enemy) {
    this.enemy = enemy;
    this.reset();
  }

  get titan() {
    return this.enemy.zombie;
  }

  reset() {
    this.phase = 1;
    this.plateHp = [TITAN.plateHp, TITAN.plateHp, TITAN.plateHp, TITAN.plateHp];
    this.nextStompAt = 0;
    this.nextThrowAt = 3;
    this.nextJumpAt = 0;
    this.nextBeamAt = 0;
    this.nextSummonAt = 0;
    this.attacking = false;
    this.landed = false;
    this.throwing = false;
    this.thrown = false;
    this.beaming = false;
    this.beamFired = false;
    this.roaring = false;
    this.roarThen = null;
    this.jumpState = null;
    this.jumpT = 0;
    this.chargeT = 0;
    this.jumpFrom = new THREE.Vector3();
    this.jumpTo = new THREE.Vector3();
    this.grabbed = null;
  }

  // 装甲がまだ残っている間と、跳んでいる間は攻撃が通らない扱いにしたい部分がある
  get invulnerable() {
    return this.jumpState === 'charge' || this.jumpState === 'fly' || this.roaring;
  }

  get platesLeft() {
    return this.plateHp.filter((hp) => hp > 0).length;
  }

  // 見た目のスケールに合わせた、いまの高さ
  get height() {
    return this.enemy.def.height;
  }

  // ---- ダメージの受け口 ----
  // part は撃たれた場所。数字なら装甲の番号、'core' なら核、null なら本体
  hit(damage, now, part = null) {
    if (!this.enemy.alive) return false;
    if (this.invulnerable) return false;

    // 装甲を撃った。装甲のHPだけが減る
    if (typeof part === 'number') {
      if (this.plateHp[part] <= 0) return false;
      this.plateHp[part] = Math.max(0, this.plateHp[part] - damage);
      if (this.plateHp[part] === 0) {
        this.titan.breakPlate(part);
        this.onPlateBroken?.(this.enemy, part, this.platesLeft);
        // 4枚割れたら、咆哮してから核を出す
        if (this.platesLeft === 0) this.#startRoar(() => {
          this.titan.exposeCore();
          this.phase = 2;
          this.onPhase?.(this.enemy, 2);
        });
      }
      return true;
    }

    // 本体。第1形態は装甲のおかげでほとんど通らない
    let amount = damage;
    if (part === 'core') amount = Math.round(damage * TITAN.coreBonus);
    else if (this.phase === 1) amount = Math.max(1, Math.round(damage * TITAN.bodyGuard));

    this.enemy.hp = Math.max(0, this.enemy.hp - amount);
    this.enemy.refreshLabel?.();
    if (this.enemy.hp <= 0) {
      this.titan.setMode('death');
      this.enemy.state = 'dead';
      this.enemy.label.sprite.visible = false;
      return true;
    }
    // 大きい体なので、いちいちのけぞらせない（攻撃の途中なら邪魔しない）
    if (!this.attacking && !this.throwing && !this.beaming && !this.jumpState) {
      this.titan.setMode('hit');
    }
    // HPが減ったら第3形態へ
    if (this.phase === 2 && this.enemy.hp <= this.enemy.maxHp * TITAN.ragePoint) {
      this.#startRoar(() => {
        this.phase = 3;
        this.onPhase?.(this.enemy, 3);
        this.onSummon?.(this.enemy, TITAN.summonCount);
        this.nextSummonAt = 0;
      });
    }
    return true;
  }

  #startRoar(then) {
    this.roaring = true;
    this.roarThen = then;
    this.attacking = false;
    this.throwing = false;
    this.beaming = false;
    this.jumpState = null;
    this.titan.setMode('roar');
    this.onRoar?.(this.enemy);
  }

  // ---- 毎フレーム ----
  update(dt, now, world) {
    const {
      target, colliders = [], structures = [], enemies = [],
      onStomp = () => {}, onThrow = () => {}, onJumpAim = () => {}, onShockwave = () => {},
      onBeam = () => {}, onSummon = () => {},
    } = world;
    const titan = this.titan;
    const pos = this.enemy.root.position;

    if (!this.enemy.alive) {
      titan.update(dt);
      // 倒れきったら列に戻す。これをしないと、死体が残り続けて
      // 次のウェーブが「まだ敵がいる」と思い込んでしまう
      if (titan.deathFinished) this.enemy.retire();
      return;
    }

    // 咆哮中は何もしない。終わったら次の形態へ進む
    if (this.roaring) {
      if (titan.roarFinished) {
        this.roaring = false;
        const then = this.roarThen;
        this.roarThen = null;
        titan.setMode('idle');
        then?.();
      }
      titan.update(dt);
      return;
    }

    // 跳んでいる最中
    if (this.jumpState) {
      this.#updateJump(dt, colliders, onShockwave);
      titan.update(dt);
      return;
    }

    // 掴んで投げている最中
    if (this.throwing) {
      if (!this.thrown && titan.throwReleased) {
        this.thrown = true;
        onThrow(this.enemy, this.grabbed, target);
        this.grabbed = null;
      }
      if (titan.throwFinished) {
        this.throwing = false;
        titan.setMode('idle');
      }
      titan.update(dt);
      return;
    }

    // ビームを撃っている最中
    if (this.beaming) {
      if (!this.beamFired && titan.beamFired) {
        this.beamFired = true;
        onBeam(this.enemy, TITAN.beamDamage);
      }
      if (titan.beamFinished) {
        this.beaming = false;
        titan.setMode('idle');
      }
      titan.update(dt);
      return;
    }

    // 踏みつけの最中
    if (this.attacking) {
      if (!this.landed && titan.attackLanded) {
        this.landed = true;
        onStomp(this.enemy, TITAN.stompDamage, TITAN.stompRadius);
        // 第3形態の踏みつけからは、衝撃波も広がる
        if (this.phase === 3) onShockwave(this.enemy, TITAN.waveDamage);
      }
      if (titan.attackFinished) {
        this.attacking = false;
        this.nextStompAt = now + TITAN.stompCooldown;
        titan.setMode('idle');
      }
      titan.update(dt);
      return;
    }

    // ---- ここから、次に何をするか決める ----
    if (!target) {
      titan.setMode('idle');
      titan.update(dt);
      return;
    }

    tmp.copy(target.position).sub(pos).setY(0);
    const dist = tmp.length();
    this.#face(Math.atan2(-tmp.x, -tmp.z), dt);

    // 第3形態：ビームを撃ち、ときどき雑魚を呼ぶ。
    // 跳びかかりとは別の待ち時間で動くので、自然に交互になる
    if (this.phase === 3) {
      if (now >= this.nextSummonAt) {
        this.nextSummonAt = now + TITAN.summonCooldown;
        onSummon(this.enemy, Math.round(TITAN.summonCount / 2));
      }
      // 相手が正面の射程にいれば撃つ。近すぎるときは踏みつけのほうが早い
      if (now >= this.nextBeamAt && dist >= TITAN.beamMin && dist <= TITAN.beamRange) {
        this.nextBeamAt = now + TITAN.beamCooldown;
        this.beaming = true;
        this.beamFired = false;
        titan.setMode('beam');
        this.onBeamCharge?.(this.enemy);
        titan.update(dt);
        return;
      }
    }

    // 第2形態〜：離れている相手には跳びかかる
    if (this.phase >= 2 && now >= this.nextJumpAt
      && dist >= TITAN.jumpMin && dist <= TITAN.jumpRange) {
      this.nextJumpAt = now + TITAN.jumpCooldown;
      this.jumpState = 'charge';
      this.chargeT = 0;
      this.jumpTo.set(target.position.x, 0, target.position.z);
      titan.setMode('charge');
      const landing = floorHeight(colliders, this.jumpTo.x, this.jumpTo.z, TITAN.jumpHeight, RADIUS);
      onJumpAim(
        this.enemy,
        tmp2.set(this.jumpTo.x, landing, this.jumpTo.z).clone(),
        TITAN.jumpRadius,
        TITAN.jumpChargeTime + TITAN.jumpTime
      );
      titan.update(dt);
      return;
    }

    // 第1形態：近くの雑魚を掴んで投げる
    if (this.phase === 1 && now >= this.nextThrowAt) {
      const prey = this.#findPrey(enemies);
      if (prey) {
        this.nextThrowAt = now + TITAN.throwCooldown;
        this.throwing = true;
        this.thrown = false;
        this.grabbed = prey;
        titan.setMode('throw');
        this.onGrab?.(this.enemy, prey);
        titan.update(dt);
        return;
      }
      // 掴めるものが無かったら、少し待ってからまた探す
      this.nextThrowAt = now + 1.5;
    }

    // 近ければ踏みつけ、遠ければ歩いて詰める
    if (dist <= TITAN.stompReach) {
      if (now >= this.nextStompAt) {
        this.attacking = true;
        this.landed = false;
        titan.restartAttack();
      } else {
        titan.setMode('idle');
      }
    } else {
      const speed = TITAN.walkSpeed * (this.phase === 3 ? TITAN.rageSpeedScale : 1) * dt;
      tmp.divideScalar(dist || 1);
      this.#step(tmp.x * speed, tmp.z * speed, colliders, structures);
      titan.setMode('walk');
    }
    titan.update(dt);
  }

  // 投げる用の雑魚を探す。自分以外の、生きているゾンビ
  #findPrey(enemies) {
    const pos = this.enemy.root.position;
    let best = null;
    let bestDist = TITAN.throwGrabRange;
    for (const e of enemies) {
      if (e === this.enemy || !e.active || !e.alive || e.def.boss) continue;
      const d = e.position.distanceTo(pos);
      if (d < bestDist) {
        bestDist = d;
        best = e;
      }
    }
    return best;
  }

  #updateJump(dt, colliders, onShockwave) {
    const titan = this.titan;
    const pos = this.enemy.root.position;
    if (this.jumpState === 'charge') {
      this.chargeT += dt;
      if (this.chargeT < TITAN.jumpChargeTime) return;
      this.jumpT = 0;
      this.jumpFrom.copy(pos);
      this.jumpState = 'fly';
      titan.setMode('jump');
      return;
    }

    this.jumpT = Math.min(this.jumpT + dt / TITAN.jumpTime, 1);
    const p = this.jumpT;
    const landing = floorHeight(colliders, this.jumpTo.x, this.jumpTo.z, TITAN.jumpHeight, RADIUS);
    pos.lerpVectors(this.jumpFrom, this.jumpTo, p);
    // 山なりの弧。0と1で地面、真ん中で最高点
    pos.y = landing * p + Math.sin(p * Math.PI) * TITAN.jumpHeight;
    if (p < 1) return;

    pos.y = landing;
    this.jumpState = null;
    titan.setMode('idle');
    // 着地で叩きつけと衝撃波の両方が出る
    this.onJumpLand?.(this.enemy, TITAN.jumpDamage, TITAN.jumpRadius);
    onShockwave(this.enemy, TITAN.waveDamage);
  }

  #face(yaw, dt) {
    let delta = ((yaw - this.enemy.facing + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (delta < -Math.PI) delta += Math.PI * 2;
    this.enemy.facing += THREE.MathUtils.clamp(delta, -TURN_SPEED * dt, TURN_SPEED * dt);
    this.enemy.root.rotation.y = this.enemy.facing + Math.PI;
  }

  // 壁にぶつからないように1歩動く。巨体なので当たり判定も大きい
  #step(dx, dz, colliders, structures) {
    const pos = this.enemy.root.position;
    const box = new THREE.Box3();
    const blocked = (x, z) => {
      box.min.set(x - RADIUS, pos.y + 1.2, z - RADIUS);
      box.max.set(x + RADIUS, pos.y + this.height * 0.7, z + RADIUS);
      if (colliders.some((c) => c.intersectsBox(box))) return true;
      return structures.some((s) => s.alive && s.box.intersectsBox(box));
    };
    for (const [ax, az] of [[dx, 0], [0, dz]]) {
      if (!ax && !az) continue;
      if (blocked(pos.x + ax, pos.z + az)) continue;
      pos.x += ax;
      pos.z += az;
    }
    const floor = floorHeight(colliders, pos.x, pos.z, pos.y, RADIUS);
    pos.y = floor > pos.y ? floor : THREE.MathUtils.lerp(pos.y, floor, 0.35);
  }
}

// 衝撃波。地面を輪になって広がり、高い所に立っていない相手に当たる。
// 当たったかどうかは、輪がその場所を通り過ぎた瞬間に決める
export class Shockwave {
  constructor(center, damage, onHit) {
    this.center = center.clone().setY(0);
    this.damage = damage;
    this.onHit = onHit;
    this.radius = 0;
    this.done = false;
    // 一度当てた相手には二度当てない
    this.hitOnce = new Set();
  }

  update(dt, targets) {
    if (this.done) return;
    const before = this.radius;
    this.radius += TITAN.waveSpeed * dt;
    if (this.radius > TITAN.waveRange) this.done = true;

    for (const t of targets) {
      if (this.hitOnce.has(t.key)) continue;
      // 高い所（足場・車の上）にいれば、地面を走る波は当たらない
      if (t.y > TITAN.waveSafeHeight) continue;
      const d = Math.hypot(t.x - this.center.x, t.z - this.center.z);
      if (d >= before && d < this.radius) {
        this.hitOnce.add(t.key);
        this.onHit(t, this.damage);
      }
    }
  }
}
