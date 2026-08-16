import * as THREE from 'three';
import { Avatar } from './avatar.js';
import { makeLabel, hpColor } from './label.js';
import { NET } from './data/netconfig.js';
import { JOBS } from './data/jobs.js';

// 他のプレイヤーの見た目。位置は受け取ったところへなめらかに寄せる
// （10回/秒しか届かないので、そのまま置くとカクカクする）

// 送る内容の並び。数字の配列にして、1回ぶんの通信を小さくする
export const STATE = {
  X: 0, Y: 1, Z: 2, YAW: 3, PITCH: 4, HP: 5, MAXHP: 6,
  FLAGS: 7, ITEM: 8, ANIM: 9, ANIM_T: 10, SPEED: 11,
};
export const FLAG = { DOWNED: 1, GOLD: 2, SILENCER: 4, BUFFED: 8 };

const round2 = (n) => Math.round(n * 100) / 100;

// 自分の状態を、送れる形にまとめる
export function packPlayer(player, { itemId, gold, silencer, anim, feetY }) {
  return [
    round2(player.position.x),
    round2(feetY),
    round2(player.position.z),
    round2(player.yaw),
    round2(player.pitch),
    Math.round(player.hp),
    player.maxHp,
    (player.downed ? FLAG.DOWNED : 0) | (gold ? FLAG.GOLD : 0)
      | (silencer ? FLAG.SILENCER : 0) | (player.buffed ? FLAG.BUFFED : 0),
    itemId ?? '',
    anim?.name ?? 'idle',
    round2(anim?.t ?? 0),
    round2(player.speed),
  ];
}

export class RemotePlayer {
  constructor(scene, { id, name, jobId }) {
    this.id = id;
    this.name = name || 'プレイヤー';
    this.jobId = jobId ?? 'soldier';
    this.lastSeen = 0;
    this.downed = false;
    this.hp = 100;
    this.maxHp = 100;
    this.speed = 0;
    this.pitch = 0;
    this.anim = { name: 'idle', t: 0 };
    this.firing = false;

    // どのシーンに置いたか覚えておく（待機場とバトルで入れ替わる）
    this.scene = scene;
    this.avatar = new Avatar(JOBS[this.jobId]?.color ?? 0x5f7f9f);
    this.avatar.setHat(this.jobId);
    this.label = makeLabel(1.8);
    this.label.sprite.position.y = 2.15;
    this.avatar.root.add(this.label.sprite);

    // 拡声器の効果がかかっている間だけ出す、足元の金の輪
    this.aura = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.8, 20),
      new THREE.MeshBasicMaterial({
        color: 0xffc94a, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    this.aura.rotation.x = -Math.PI / 2;
    this.aura.position.y = 0.05;
    this.aura.visible = false;
    this.avatar.root.add(this.aura);

    scene.add(this.avatar.root);

    // 受け取った位置。ここへ向かって毎フレーム近づける
    this.target = new THREE.Vector3();
    this.targetYaw = 0;
    this.#refreshLabel();
  }

  get position() {
    return this.avatar.root.position;
  }

  // ゾンビに狙われる位置（頭のあたり）
  aimPoint(out = new THREE.Vector3()) {
    return out.copy(this.position).setY(this.position.y + 1.5);
  }

  setProfile({ name, jobId }) {
    let changed = false;
    if (name && name !== this.name) {
      this.name = name;
      changed = true;
    }
    if (jobId && jobId !== this.jobId) {
      this.jobId = jobId;
      this.avatar.setHat(jobId);
      changed = true;
    }
    if (changed) this.#refreshLabel();
  }

  #refreshLabel() {
    const text = this.downed ? `${this.name}（ダウン）` : `${this.name}  ${Math.round(this.hp)}`;
    this.label.draw(text, this.downed ? '#ff8080' : hpColor(this.hp, this.maxHp));
  }

  // 届いた状態を取り込む。位置と向きは目標だけ更新して、実際に動かすのは update
  apply(state, now) {
    this.lastSeen = now;
    this.target.set(state[STATE.X], state[STATE.Y], state[STATE.Z]);
    this.targetYaw = state[STATE.YAW];
    this.pitch = state[STATE.PITCH];
    this.speed = state[STATE.SPEED];

    const hp = state[STATE.HP];
    const maxHp = state[STATE.MAXHP];
    const flags = state[STATE.FLAGS];
    const downed = !!(flags & FLAG.DOWNED);
    if (hp !== this.hp || maxHp !== this.maxHp || downed !== this.downed) {
      this.hp = hp;
      this.maxHp = maxHp;
      this.downed = downed;
      this.avatar.setDowned(downed);
      this.#refreshLabel();
    }

    this.avatar.setItem(
      state[STATE.ITEM] || null,
      !!(flags & FLAG.GOLD),
      !!(flags & FLAG.SILENCER)
    );
    // 拡声器の効果がかかっている人の足元に、金の輪を出す
    this.aura.visible = !!(flags & FLAG.BUFFED) && !downed;

    // 「撃った」に切り替わった瞬間を見つけて、こちらでも弾道を出す
    const anim = { name: state[STATE.ANIM], t: state[STATE.ANIM_T] };
    const shooting = anim.name === 'fire' && anim.t < 0.4;
    this.justFired = shooting && !this.firing;
    this.firing = shooting;
    this.anim = anim;

    // 初めて届いたときは補間せず、その場に置く
    if (!this.placed) {
      this.placed = true;
      this.position.copy(this.target);
      this.avatar.root.rotation.y = this.targetYaw + Math.PI;
    }
  }

  // 銃口のだいたいの位置。他の人の弾道をここから描く
  muzzle(out = new THREE.Vector3()) {
    const dir = this.direction();
    return out.copy(this.position)
      .setY(this.position.y + 1.35)
      .addScaledVector(dir, 0.6);
  }

  // 向いている方向。yaw と pitch から作る（カメラと同じ -Z 基準）
  direction(out = new THREE.Vector3()) {
    const cos = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yawNow) * cos, Math.sin(this.pitch), -Math.cos(this.yawNow) * cos).normalize();
  }

  get yawNow() {
    return this.avatar.root.rotation.y - Math.PI;
  }

  update(dt) {
    // 輪はゆっくり回して、止まって見えないようにする
    if (this.aura.visible) this.aura.rotation.z += dt * 1.5;
    const k = Math.min(dt * NET.lerpSpeed, 1);
    this.position.lerp(this.target, k);

    // 角度は -π〜π に丸めてから寄せないと、境目でぐるっと回ってしまう
    const want = this.targetYaw + Math.PI;
    let delta = ((want - this.avatar.root.rotation.y + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (delta < -Math.PI) delta += Math.PI * 2;
    this.avatar.root.rotation.y += delta * k;

    this.avatar.update(dt, { anim: this.anim, speed: this.speed, pitch: this.pitch });
  }

  dispose(scene = this.scene) {
    this.label.dispose();
    scene.remove(this.avatar.root);
    this.avatar.root.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.dispose();
      for (const m of [o.material].flat()) m.dispose();
    });
  }
}
