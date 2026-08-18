import * as THREE from 'three';
import { Zombie } from './zombie.js';
import { Mutant } from './mutant.js';
import { Skeleton } from './skeleton.js';
import { Titan } from './titan.js';
import { Mother } from './mother.js';
import { makeLabel, hpColor } from './label.js';
import { floorHeight, STEP_HEIGHT, STEP_SLACK } from './player.js';
import { ENEMIES } from './data/jobs.js';
import { isLoaded, GltfCharacter } from './gltfmodel.js';

// 通信でやり取りするときの並び。増やすときは必ず末尾に足す
const NET_IDS = Object.keys(ENEMIES);
const NET_MODES = ['idle', 'walk', 'attack', 'hit', 'death', 'charge', 'jump', 'shoot', 'emerge'];
const r2 = (n) => Math.round(n * 100) / 100;

// ネクロマンサーの味方。リボーンロッドで倒した敵が生き返ったものと、
// 必殺技で呼び出す真っ黒な影の2種類がある。どちらも動きは同じで、
// 近くに敵がいれば倒しに行き、いなければその場で待つ。
// 主人のところへ集めたいときは、チームロッドで呼ぶ。

const RADIUS = 0.42;
// チームロッドで呼ばれたとき、これくらいまで近づいたら「着いた」ことにする
const FOLLOW_RADIUS = 3.2;
const TURN_SPEED = 8;

export const MINION = {
  sight: 16,
  reach: 2.0,
  damage: 12,
  attackCooldown: 1.2,
  speed: 4.6,
  // 呼び出したときと消えるときの演出の長さ
  riseTime: 0.9,
  height: 1.8,
};

// 味方になっても、元の敵の見た目と特性はそのまま引き継ぐ。
// ただし味方は数が増えるので、索敵の広さだけは上限をつける
const MAX_SIGHT = 30;
// ミュータントの大ジャンプを、味方は何秒に1回まで使えるか
const SLAM_COOLDOWN = 9;
// 通常ゾンビを基準に、火力の比を出すための値
const BASE_DAMAGE = ENEMIES.normal.damage;
const BASE_SPEED = ENEMIES.normal.chaseSpeed;

// ボスを味方にしたときの弱体化。そのままだと味方が強すぎて
// ゲームが終わってしまうので、火力も体の大きさも落とす
export const BOSS_MINION = {
  // 元のHPのこの割合で起き上がる（ふつうの敵は半分）
  hpScale: 0.15,
  // 火力の上限。ボスの数字をそのまま持ってこない
  damageMax: 30,
  // 見た目の大きさ。7mのまま味方にすると道をふさいでしまう
  sizeScale: 0.6,
};

// 元になった敵から、この味方の強さと特性を決める。
// defId が無い（必殺技の影）ときは、これまでどおりの標準の数字
export function minionStats(defId) {
  const def = defId ? ENEMIES[defId] : null;
  if (!def) {
    return {
      def: null, model: null, sight: MINION.sight, reach: MINION.reach,
      damage: MINION.damage, attackCooldown: MINION.attackCooldown,
      speed: MINION.speed, height: MINION.height, behavior: null,
    };
  }
  // ボスは弱くしてから味方にする
  const boss = !!def.boss;
  const rawDamage = Math.max(1, Math.round(MINION.damage * (def.damage / BASE_DAMAGE)));
  return {
    def,
    boss,
    model: def.model ?? null,
    // 見た目の大きさ。ボスだけ小さくする
    sizeScale: boss ? BOSS_MINION.sizeScale : 1,
    // 索敵はいまより狭くならず、広すぎもしないところに収める
    sight: THREE.MathUtils.clamp(def.sight, MINION.sight, MAX_SIGHT),
    reach: boss ? (def.reach ?? MINION.reach) * BOSS_MINION.sizeScale : (def.reach ?? MINION.reach),
    // 元の敵どうしの強さの差を、そのまま味方の火力の差にする。
    // ボスだけは上限をかけて、味方が強くなりすぎないようにする
    damage: boss ? Math.min(rawDamage, BOSS_MINION.damageMax) : rawDamage,
    attackCooldown: def.attackCooldown ?? MINION.attackCooldown,
    // 足の速さも同じ考え方。ミュータントは重く、俊足ゾンビは速い。
    // ただし俊足ゾンビは元が2倍以上あるので、行きすぎないところで止める
    speed: MINION.speed * THREE.MathUtils.clamp(def.chaseSpeed / BASE_SPEED, 0.8, 1.35),
    height: (def.height ?? MINION.height) * (boss ? BOSS_MINION.sizeScale : 1),
    // 'gunner'（ガンマ）／'archer'（弓スケルトン）／null
    behavior: def.behavior ?? null,
  };
}

const box = new THREE.Box3();
const tmp = new THREE.Vector3();

export class Minion {
  // defId を渡すと、その敵の見た目と特性をそのまま引き継ぐ。
  // black を立てると、必殺技の真っ黒な影になる
  constructor(scene, { maxHp = 50, black = false, defId = null, ownerId = null } = {}) {
    this.scene = scene;
    this.black = black;
    // 元になったゾンビの種類と、連れている人。どちらも通信用
    this.defId = black ? null : defId;
    this.ownerId = ownerId;
    // 元の敵から受け継いだ強さと特性
    this.stats = minionStats(this.defId);
    this.maxHp = Math.max(1, Math.round(maxHp));
    this.hp = this.maxHp;
    this.state = 'rise';
    this.riseT = 0;
    this.facing = 0;
    this.attacking = false;
    this.landed = false;
    this.nextAttackAt = 0;
    this.target = null;
    // 遠くから撃つ種類（ガンマ・弓スケルトン）用
    this.shooting = false;
    this.shotFired = false;
    this.nextShotAt = 0;
    // ミュータントの大ジャンプ用
    this.slamT = 0;
    this.chargeT = 0;
    // 敵を見つけたらすぐ跳べる。待ち時間は跳んだあとから数える
    this.nextSlamAt = 0;
    this.slamFrom = new THREE.Vector3();
    this.slamTo = new THREE.Vector3();
    // 主人のまわりのどこに立つか。ぶつからないよう1体ずつずらす
    this.slot = Math.random() * Math.PI * 2;
    // チームロッドで呼ばれた集合場所。着いたら消える
    this.gatherTo = null;

    this.root = new THREE.Group();
    this.zombie = this.#buildModel();
    // ボスは元の大きさのままだと味方として大きすぎるので縮める
    if (this.stats.sizeScale !== 1) this.zombie.root.scale.multiplyScalar(this.stats.sizeScale);
    // 影の味方は服も含めて真っ黒にする。
    // 色を暗くすると、貼ってあるテクスチャごと暗くなる
    if (black) {
      // 色を暗くすると、貼ってあるテクスチャごと暗くなる。
      // 影らしく、模様が見えないくらいまで落とす
      for (const m of this.zombie.bodyMats) {
        // テクスチャのある面は模様のぶん暗くなるので、
        // 無地の面（頭の側面など）はさらに落として揃える
        if (m.map) m.color.setRGB(0.06, 0.055, 0.09);
        else m.color.setRGB(0.02, 0.018, 0.03);
      }
    }
    this.root.add(this.zombie.root);

    // 味方だと一目で分かる、頭の上に浮かぶ魂の炎
    this.soul = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.16, 0),
      new THREE.MeshBasicMaterial({
        color: black ? 0x9a6bff : 0x6bd8ff, transparent: true, opacity: 0.9, depthWrite: false,
      })
    );
    this.soul.position.y = this.stats.height + 0.42;
    this.root.add(this.soul);

    // 足元の輪。敵と見分けやすくする
    const ringScale = this.stats.height / MINION.height;
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.42 * ringScale, 0.6 * ringScale, 18),
      new THREE.MeshBasicMaterial({
        color: black ? 0x9a6bff : 0x6bd8ff,
        transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.05;
    this.root.add(this.ring);

    this.label = makeLabel(this.stats.height > 2 ? 1.7 : 1.3);
    this.label.sprite.position.y = this.stats.height + 0.9;
    this.root.add(this.label.sprite);
    this.#refresh();

    scene.add(this.root);
  }

  // 元の敵と同じ見た目を作る。ミュータントとスケルトンは別のモデル
  #buildModel() {
    if (this.black) return new Zombie('shadow', null, {});
    const def = this.stats.def;
    if (!def) return new Zombie('green', null, {});
    // 敵だったときと同じモデル・同じ色にする。
    // 味方になったとたん見た目が変わってしまわないように
    if (def.gltf && isLoaded(def.gltf)) {
      const model = new GltfCharacter(def.gltf, {
        height: this.stats.height,
        tint: def.tint ?? null,
        walkScale: def.animRate ?? 1,
      });
      if (def.stretch) model.root.scale.set(...def.stretch);
      return model;
    }
    if (def.model === 'titan') return new Titan();
    if (def.model === 'mother') return new Mother();
    if (def.model === 'mutant') return new Mutant(def.armor);
    if (def.model === 'skeleton') return new Skeleton({ weapon: def.weapon });
    return new Zombie(def.skin, def.armor, { outfit: def.outfit });
  }

  get alive() {
    return this.hp > 0;
  }

  get position() {
    return this.root.position;
  }

  spawnAt(position) {
    this.root.position.copy(position);
    this.state = 'rise';
    this.riseT = 0;
    this.zombie.setMode('emerge');
    return this;
  }

  // チームロッドで呼ばれた。敵より優先して、この場所へ向かう
  callTo(position) {
    if (!this.alive) return false;
    this.gatherTo = position.clone();
    this.target = null;
    return true;
  }

  // 回復させる（チームロッドのおまけ）
  healBy(ratio) {
    if (!this.alive || ratio <= 0) return 0;
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + this.maxHp * ratio);
    this.#refresh();
    return this.hp - before;
  }

  #refresh() {
    this.label.draw(`${Math.ceil(this.hp)} / ${this.maxHp}`, hpColor(this.hp, this.maxHp));
  }

  damage(amount) {
    if (!this.alive) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.#refresh();
    if (this.alive) {
      this.zombie.setMode('hit');
      // 振りかけていた攻撃は中断される
      this.attacking = false;
      this.landed = false;
      return false;
    }
    this.zombie.setMode('death');
    this.state = 'dead';
    this.label.sprite.visible = false;
    this.soul.visible = false;
    this.ring.visible = false;
    return true;
  }

  // 壁にぶつからないように1歩動く。ゾンビと同じ考え方
  #blocked(x, z, colliders, structures) {
    const feet = this.root.position.y;
    box.min.set(x - RADIUS, feet + STEP_HEIGHT + STEP_SLACK, z - RADIUS);
    box.max.set(x + RADIUS, feet + this.stats.height * 0.8, z + RADIUS);
    if (colliders.some((c) => c.intersectsBox(box))) return true;
    return structures.some((s) => s.alive && s.box.intersectsBox(box));
  }

  #step(dx, dz, colliders, structures) {
    const p = this.root.position;
    for (const [ax, az] of [[dx, 0], [0, dz]]) {
      if (!ax && !az) continue;
      if (this.#blocked(p.x + ax, p.z + az, colliders, structures)) continue;
      p.x += ax;
      p.z += az;
    }
    const floor = floorHeight(colliders, p.x, p.z, p.y, RADIUS);
    p.y = floor > p.y ? floor : THREE.MathUtils.lerp(p.y, floor, 0.35);
  }

  #face(yaw, dt) {
    let delta = ((yaw - this.facing + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (delta < -Math.PI) delta += Math.PI * 2;
    this.facing += THREE.MathUtils.clamp(delta, -TURN_SPEED * dt, TURN_SPEED * dt);
  }

  #moveTo(goal, dt, colliders, structures, run) {
    tmp.copy(goal).sub(this.root.position).setY(0);
    const dist = tmp.length();
    if (dist < 0.05) return dist;
    this.#face(Math.atan2(-tmp.x, -tmp.z), dt);
    const speed = this.stats.speed * (run ? 1.25 : 1) * dt;
    tmp.divideScalar(dist);
    this.#step(tmp.x * speed, tmp.z * speed, colliders, structures);
    return dist;
  }

  // 目の高さ。弾を出す高さと、見通しの判定に使う
  eyePoint(out = new THREE.Vector3()) {
    return out.copy(this.root.position).setY(this.root.position.y + this.stats.height * 0.8);
  }

  // 攻撃が通らない間（跳んでいる最中）。敵のミュータントと同じ
  get invulnerable() {
    return this.state === 'charge' || this.state === 'slam';
  }

  // ---- ガンマ・弓スケルトン：離れたまま撃つ ----
  // 撃つ動きをしたら true。できないときは false を返して、普通に殴りに行かせる
  #ranged(dt, now, colliders, structures, onShoot) {
    const def = this.stats.def;
    const pos = this.root.position;
    tmp.copy(this.target.position).sub(pos).setY(0);
    const dist = tmp.length();
    this.#face(Math.atan2(-tmp.x, -tmp.z), dt);

    if (dist > (def.shootRange ?? 0)) {
      // まだ遠い。撃てる距離まで詰める
      if (this.shooting) {
        this.shooting = false;
        this.nextShotAt = now + 0.5;
      }
      this.#setAiming(false);
      this.#moveTo(this.target.position, dt, colliders, structures, true);
      this.zombie.setMode('walk');
      return true;
    }

    const [minWait, maxWait] = def.shootCooldown ?? [1.5, 3];
    const wait = () => minWait + Math.random() * (maxWait - minWait);
    const near = dist <= (def.keepRange ?? 10);

    // 弓は引き絞る間、足を止める
    if (this.stats.behavior === 'archer') {
      if (this.shooting) {
        if (!this.shotFired && this.zombie.shotReleased) {
          this.shotFired = true;
          onShoot(this, 'arrow', this.stats.damage, this.target);
        }
        if (this.zombie.shootFinished) {
          this.shooting = false;
          this.nextShotAt = now + wait();
          this.zombie.setMode('idle');
        }
        return true;
      }
      if (!near) {
        this.#moveTo(this.target.position, dt, colliders, structures, true);
        this.zombie.setMode('walk');
        return true;
      }
      if (now >= this.nextShotAt) {
        this.shooting = true;
        this.shotFired = false;
        this.zombie.startShoot();
        return true;
      }
      this.zombie.setMode('idle');
      return true;
    }

    // 銃は歩きながらでも撃てる。近づきすぎたらその場で撃ち続ける
    this.#setAiming(true);
    if (near) {
      this.zombie.setMode('idle');
    } else {
      this.#moveTo(this.target.position, dt, colliders, structures, true);
      this.zombie.setMode('walk');
    }
    if (now >= this.nextShotAt) {
      this.nextShotAt = now + wait();
      this.zombie.fire?.();
      onShoot(this, 'bullet', this.stats.damage, this.target);
    }
    return true;
  }

  #setAiming(on) {
    if (this.zombie.aiming !== undefined) this.zombie.aiming = on;
  }

  // ---- ミュータント：溜めてから跳びかかる ----
  #tryStartSlam(now, colliders, onSlamAim) {
    const def = this.stats.def;
    if (def?.slamRange === undefined || now < this.nextSlamAt) return false;
    const dist = this.target.position.distanceTo(this.root.position);
    // 近すぎるときは普通に殴ったほうが早い
    if (dist <= this.stats.reach * 2 || dist > def.slamRange) return false;

    this.nextSlamAt = now + SLAM_COOLDOWN;
    this.state = 'charge';
    this.chargeT = 0;
    this.slamTo.set(this.target.position.x, 0, this.target.position.z);
    this.zombie.setMode('charge');
    // 落ちる場所に印を出す。敵のときは避けるため、味方のときは見て分かるように
    const landing = floorHeight(colliders, this.slamTo.x, this.slamTo.z, def.slamHeight, RADIUS);
    onSlamAim(this, tmp.set(this.slamTo.x, landing, this.slamTo.z).clone(),
      def.slamRadius, def.slamChargeTime + def.slamTime);
    return true;
  }

  #updateSlam(dt, colliders, onSlam) {
    const def = this.stats.def;
    if (this.state === 'charge') {
      this.chargeT += dt;
      if (this.chargeT < def.slamChargeTime) return;
      this.slamT = 0;
      this.slamFrom.copy(this.root.position);
      this.state = 'slam';
      this.zombie.setMode('jump');
      return;
    }

    this.slamT = Math.min(this.slamT + dt / def.slamTime, 1);
    const p = this.slamT;
    const landing = floorHeight(colliders, this.slamTo.x, this.slamTo.z, def.slamHeight, RADIUS);
    this.root.position.lerpVectors(this.slamFrom, this.slamTo, p);
    // 山なりに跳ぶ。着地の高さまでなめらかに下ろす
    this.root.position.y = landing * p + Math.sin(p * Math.PI) * def.slamHeight;
    if (p < 1) return;

    this.root.position.y = landing;
    // 壁の上に落ちてめり込むことがあるので、着地したら外へ出す
    this.#unstick(colliders);
    this.state = 'attack';
    this.zombie.setMode('idle');
    onSlam(this, def.slamDamage, def.slamRadius);
  }

  // めり込んでいたら、跳ぶ前の場所のほうへ少しずつ戻して外に出す
  #unstick(colliders) {
    const p = this.root.position;
    if (!this.#blocked(p.x, p.z, colliders, [])) return;
    tmp.copy(this.slamFrom).sub(p).setY(0);
    const len = tmp.length();
    if (len < 0.01) return;
    tmp.divideScalar(len);
    for (let i = 0; i < 8; i++) {
      p.x += tmp.x * 0.4;
      p.z += tmp.z * 0.4;
      if (!this.#blocked(p.x, p.z, colliders, [])) break;
    }
    p.y = floorHeight(colliders, p.x, p.z, p.y, RADIUS);
  }

  // 一番近い、まだ生きている敵。届く範囲にいるものだけ
  #findEnemy(enemies, from) {
    let best = null;
    let bestDist = this.stats.sight;
    for (const e of enemies) {
      if (!e.active || !e.alive || e.invulnerable) continue;
      const dist = e.position.distanceTo(from);
      if (dist < bestDist) {
        bestDist = dist;
        best = e;
      }
    }
    return best;
  }

  // 親が送る、この1体ぶんの状態
  netPack(index) {
    return [
      index,
      this.black ? -1 : NET_IDS.indexOf(this.defId),
      r2(this.root.position.x), r2(this.root.position.y), r2(this.root.position.z),
      r2(this.facing),
      Math.max(0, NET_MODES.indexOf(this.zombie.mode)),
      Math.ceil(this.hp),
      this.maxHp,
    ];
  }

  // 子が受け取った状態を取り込む。位置は目標だけ決めて、動かすのは netUpdate
  netApply(row) {
    this.netTarget ??= new THREE.Vector3();
    this.netTarget.set(row[2], row[3], row[4]);
    this.netFacing = row[5];
    if (!this.netPlaced) {
      this.netPlaced = true;
      this.root.position.copy(this.netTarget);
      this.facing = this.netFacing;
    }
    const mode = NET_MODES[row[6]];
    if (mode) this.zombie.setMode(mode);
    if (row[7] !== this.hp || row[8] !== this.maxHp) {
      this.hp = row[7];
      this.maxHp = row[8];
      this.state = this.hp > 0 ? 'follow' : 'dead';
      this.#refresh();
    }
  }

  // 子の毎フレーム。考えさせず、見た目だけ進める
  netUpdate(dt) {
    if (this.netTarget) {
      this.root.position.lerp(this.netTarget, Math.min(dt * 14, 1));
      let delta = ((this.netFacing - this.facing + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (delta < -Math.PI) delta += Math.PI * 2;
      this.facing += delta * Math.min(dt * 14, 1);
    }
    this.root.rotation.y = this.facing + Math.PI;
    this.zombie.update(dt);
    this.#spin(dt);
  }

  update(dt, now, {
    enemies = [], colliders = [], structures = [], onAttack = () => {},
    onShoot = () => {}, onSlam = () => {}, onSlamAim = () => {},
  }) {
    const p = this.root.position;

    // 跳んでいる最中は、着地するまで何もしない
    if (this.state === 'charge' || this.state === 'slam') {
      this.#updateSlam(dt, colliders, onSlam);
      this.root.rotation.y = this.facing + Math.PI;
      this.zombie.update(dt);
      this.#spin(dt);
      return;
    }

    // 呼び出された直後。地面から立ち上がるまでは動かない
    if (this.state === 'rise') {
      this.riseT += dt;
      if (this.riseT >= MINION.riseTime) {
        this.state = 'follow';
        this.zombie.setMode('idle');
      }
      this.root.rotation.y = this.facing + Math.PI;
      this.zombie.update(dt);
      this.#spin(dt);
      return;
    }

    if (!this.alive) {
      this.zombie.update(dt);
      return;
    }

    // 攻撃中は足を止めて、当たる瞬間にダメージを出す。
    // 振っている途中で殴られるとモーションが「被弾」に変わり、
    // 「振り終わり」が来なくなるので、そのときは仕切り直す
    if (this.attacking) {
      if (this.zombie.mode !== 'attack') {
        this.attacking = false;
        this.nextAttackAt = now + this.stats.attackCooldown * 0.5;
      } else {
        if (!this.landed && this.zombie.attackLanded) {
          this.landed = true;
          if (this.target?.alive) onAttack(this, this.target, this.stats.damage);
        }
        if (this.zombie.attackFinished) {
          this.attacking = false;
          this.nextAttackAt = now + this.stats.attackCooldown;
        }
        this.root.rotation.y = this.facing + Math.PI;
        this.zombie.update(dt);
        this.#spin(dt);
        return;
      }
    }

    // 呼ばれているときは、まずそこへ向かう
    if (this.gatherTo) {
      this.state = 'gather';
      const dist = this.#moveTo(this.gatherTo, dt, colliders, structures, true);
      // 着いたら解散して、いつもどおり近くの敵を探す
      if (dist <= FOLLOW_RADIUS) this.gatherTo = null;
      this.zombie.setMode(dist > 0.6 ? 'walk' : 'idle');
      this.root.rotation.y = this.facing + Math.PI;
      this.zombie.update(dt);
      this.#spin(dt);
      return;
    }

    // 敵を探す。見つからなければ、その場で待つ
    if (!this.target || !this.target.active || !this.target.alive || this.target.invulnerable
      || this.target.position.distanceTo(p) > this.stats.sight * 1.4) {
      this.target = this.#findEnemy(enemies, p);
    }

    if (this.target) {
      this.state = 'attack';
      // ミュータントは、離れた相手めがけて跳びかかる
      if (this.#tryStartSlam(now, colliders, onSlamAim)) {
        this.root.rotation.y = this.facing + Math.PI;
        this.zombie.update(dt);
        this.#spin(dt);
        return;
      }
      // ガンマと弓スケルトンは、近づかずに撃つ
      if (this.stats.behavior && this.#ranged(dt, now, colliders, structures, onShoot)) {
        this.root.rotation.y = this.facing + Math.PI;
        this.zombie.update(dt);
        this.#spin(dt);
        return;
      }
      const dist = this.#moveTo(this.target.position, dt, colliders, structures, true);
      if (dist <= this.stats.reach) {
        if (now >= this.nextAttackAt) {
          this.zombie.restartAttack();
          this.attacking = true;
          this.landed = false;
        } else {
          this.zombie.setMode('idle');
        }
      } else {
        this.zombie.setMode('walk');
      }
    } else {
      // 敵がいなければ、その場で待つ。
      // 主人のところへ集めたいときはチームロッドで呼ぶ
      this.state = 'wait';
      this.zombie.setMode('idle');
    }

    this.root.rotation.y = this.facing + Math.PI;
    this.zombie.update(dt);
    this.#spin(dt);
  }

  // 魂の炎はふわふわ回して、生きている感じを出す
  #spin(dt) {
    this.soul.rotation.y += dt * 2.4;
    this.soul.rotation.x += dt * 1.3;
    this.soul.position.y = this.stats.height + 0.42 + Math.sin(performance.now() / 400) * 0.06;
    this.ring.rotation.z += dt * 1.1;
  }

  get finished() {
    return !this.alive && this.zombie.deathFinished;
  }

  dispose() {
    this.label.dispose();
    this.scene.remove(this.root);
    this.zombie.dispose();
    for (const m of [this.soul, this.ring]) {
      m.geometry.dispose();
      m.material.dispose();
    }
  }
}

// 味方をまとめて面倒みる入れ物
export class Minions {
  // max を渡さなければ、連れて歩ける数に上限はない
  constructor(scene, max = Infinity) {
    this.scene = scene;
    this.max = max;
    this.list = [];
  }

  get count() {
    return this.list.length;
  }

  // 上限を決めているときだけ、古いものから消えていく
  add(options, position) {
    if (this.list.length >= this.max) this.list.shift().dispose();
    const minion = new Minion(this.scene, options).spawnAt(position);
    this.list.push(minion);
    return minion;
  }

  // 味方は持ち主について回らない。自分で動いて、
  // チームロッドで呼ばれたときだけ集まってくる
  update(dt, now, world) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const minion = this.list[i];
      minion.update(dt, now, world);
      if (minion.finished) {
        minion.dispose();
        this.list.splice(i, 1);
      }
    }
  }

  // チームロッドで呼ぶ。持ち主が同じで、届く距離にいる味方だけ集まる
  callTo(ownerId, position, range, heal = 0) {
    let called = 0;
    let healed = 0;
    for (const minion of this.list) {
      if (!minion.alive) continue;
      if (minion.ownerId && minion.ownerId !== ownerId) continue;
      if (minion.position.distanceTo(position) > range) continue;
      if (!minion.callTo(position)) continue;
      healed += minion.healBy(heal);
      called++;
    }
    return { called, healed };
  }

  // 親が送る一覧
  netPack() {
    return this.list.filter((m) => m.alive).map((m, i) => m.netPack(i));
  }

  // 子の側。届いた数に合わせて出したり消したりする
  netApply(rows) {
    while (this.list.length > rows.length) this.list.pop().dispose();
    while (this.list.length < rows.length) {
      const row = rows[this.list.length];
      // 種類さえ分かれば、見た目も特性も Minion 側が組み立てる
      const defId = row[1] >= 0 ? NET_IDS[row[1]] : null;
      this.list.push(new Minion(this.scene, defId
        ? { maxHp: row[8], defId }
        : { maxHp: row[8], black: true }));
    }
    rows.forEach((row, i) => this.list[i].netApply(row));
  }

  // 子の毎フレーム。撃たせず、見た目だけ動かす
  netUpdate(dt) {
    for (const minion of this.list) minion.netUpdate(dt);
  }

  // ゾンビの攻撃が当たる相手として渡すための一覧
  targets() {
    return this.list.filter((m) => m.alive && m.state !== 'rise');
  }

  positions() {
    return this.list.filter((m) => m.alive).map((m) => m.position);
  }

  clear() {
    for (const minion of this.list) minion.dispose();
    this.list.length = 0;
  }
}
