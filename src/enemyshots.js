import * as THREE from 'three';

// ゾンビ側の飛び道具。ガンマゾンビの弾と、スケルトンの矢
const BULLET_SPEED = 40;
const ARROW_SPEED = 24;
// これより近づいたら当たり。当たり判定は少し甘めにしてある
const HIT_RADIUS = 0.55;

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpChest = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// 線分 from→to の上で、点 p に一番近いところまでの距離
function distanceToSegment(from, to, p) {
  tmpA.subVectors(to, from);
  const lenSq = tmpA.lengthSq();
  if (lenSq < 1e-6) return from.distanceTo(p);
  const t = THREE.MathUtils.clamp(tmpB.subVectors(p, from).dot(tmpA) / lenSq, 0, 1);
  return tmpA.multiplyScalar(t).add(from).distanceTo(p);
}

export class EnemyShots {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.bulletGeo = new THREE.BoxGeometry(0.07, 0.07, 0.5);
    this.arrowShaftGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.85, 5);
    this.arrowShaftGeo.rotateX(Math.PI / 2);
    this.arrowHeadGeo = new THREE.ConeGeometry(0.07, 0.22, 4);
    this.arrowHeadGeo.rotateX(-Math.PI / 2);
    this.arrowFinGeo = new THREE.BoxGeometry(0.16, 0.02, 0.18);
    this.bulletMat = new THREE.MeshBasicMaterial({ color: 0xffe07a });
    this.arrowMats = {
      shaft: new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.9 }),
      head: new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.4, metalness: 0.4 }),
      fin: new THREE.MeshStandardMaterial({ color: 0xd8d1bc, roughness: 0.9 }),
    };
  }

  // spread は狙いのぶれ（ラジアン）。0 なら必中の軌道になる
  #aim(from, to, spread) {
    const dir = to.clone().sub(from).normalize();
    if (spread > 0) {
      const side = new THREE.Vector3().crossVectors(dir, UP).normalize();
      const up = new THREE.Vector3().crossVectors(side, dir).normalize();
      dir.addScaledVector(side, (Math.random() - 0.5) * spread * 2)
        .addScaledVector(up, (Math.random() - 0.5) * spread * 2)
        .normalize();
    }
    return dir;
  }

  // 実際に飛んでいく向きを返す。オンラインでは、この向きをそのまま
  // 相手に送って同じ弾道を描いてもらう
  bullet(from, to, damage, spread = 0.035) {
    const dir = this.#aim(from, to, spread);
    const mesh = new THREE.Mesh(this.bulletGeo, this.bulletMat);
    mesh.position.copy(from);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    this.scene.add(mesh);
    this.list.push({
      mesh, damage, kind: 'bullet',
      velocity: dir.clone().multiplyScalar(BULLET_SPEED),
      gravity: 0,
      life: 1.6,
      prev: from.clone(),
    });
    return dir;
  }

  // 向きだけ決まっているとき（受け取った弾を再現するとき）に使う
  bulletAlong(from, dir, damage) {
    return this.bullet(from, from.clone().add(dir), damage, 0);
  }

  arrowAlong(from, dir, damage) {
    const mesh = this.#buildArrow();
    mesh.position.copy(from);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    this.scene.add(mesh);
    this.list.push({
      mesh, damage, kind: 'arrow',
      velocity: dir.clone().multiplyScalar(ARROW_SPEED),
      gravity: 6,
      life: 3.0,
      prev: from.clone(),
    });
    return dir;
  }

  #buildArrow() {
    const group = new THREE.Group();
    const shaft = new THREE.Mesh(this.arrowShaftGeo, this.arrowMats.shaft);
    const head = new THREE.Mesh(this.arrowHeadGeo, this.arrowMats.head);
    head.position.z = 0.52;
    for (const s of [-1, 1]) {
      const fin = new THREE.Mesh(this.arrowFinGeo, this.arrowMats.fin);
      fin.position.set(0, 0, -0.4);
      fin.rotation.z = s * Math.PI / 2;
      group.add(fin);
    }
    group.add(shaft, head);
    return group;
  }

  arrow(from, to, damage, spread = 0.03) {
    const flat = to.clone().sub(from);
    const dist = flat.length() || 0.01;
    // 山なりに飛ばす。遠いほど上に向けて撃ち上げる
    const gravity = 6;
    const drop = 0.5 * gravity * (dist / ARROW_SPEED) ** 2;
    const dir = this.#aim(from, to.clone().setY(to.y + drop), spread);

    const group = this.#buildArrow();
    group.position.copy(from);
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    this.scene.add(group);
    this.list.push({
      mesh: group, damage, kind: 'arrow',
      velocity: dir.clone().multiplyScalar(ARROW_SPEED),
      gravity,
      life: 3.0,
      prev: from.clone(),
    });
    return dir;
  }

  #remove(index) {
    const shot = this.list[index];
    this.scene.remove(shot.mesh);
    this.list.splice(index, 1);
  }

  // targets は当たり判定をする相手の一覧（{ id, position }）。
  // 空にすると誰にも当たらない＝見た目だけの弾になる（子の画面で使う）
  update(dt, targets, colliders, onHit) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const shot = this.list[i];
      shot.prev.copy(shot.mesh.position);
      if (shot.gravity) {
        shot.velocity.y -= shot.gravity * dt;
        // 落ちはじめたら、矢先も下を向く
        shot.mesh.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 0, 1), tmpA.copy(shot.velocity).normalize()
        );
      }
      shot.mesh.position.addScaledVector(shot.velocity, dt);
      shot.life -= dt;

      let hitSomeone = false;
      for (const target of targets) {
        if (!target || target.downed) continue;
        // 胸のあたりを狙う。1フレームで通り過ぎても、線分で見れば当たる
        tmpChest.copy(target.position).setY(target.position.y - 0.35);
        if (distanceToSegment(shot.prev, shot.mesh.position, tmpChest) > HIT_RADIUS) continue;
        onHit(shot.damage, shot.mesh.position.clone(), target);
        hitSomeone = true;
        break;
      }
      if (hitSomeone) {
        this.#remove(i);
        continue;
      }

      const p = shot.mesh.position;
      const hitWall = p.y <= 0.05 || colliders.some((c) => c.containsPoint(p));
      if (hitWall || shot.life <= 0) this.#remove(i);
    }
  }

  clear() {
    for (const shot of this.list) this.scene.remove(shot.mesh);
    this.list.length = 0;
  }
}
