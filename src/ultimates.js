import * as THREE from 'three';
import { ULTIMATES, BOMB, GOD_TURRET, DRONE } from './data/ultimates.js';

export class UltimateCharge {
  constructor(jobId) {
    this.def = ULTIMATES[jobId];
    this.value = this.def.startCharge;
  }

  get ready() {
    return this.value >= 1;
  }

  // kind が自分の貯め方と一致したときだけ増える
  add(kind, amount) {
    if (kind !== this.def.charge || this.ready || !(amount > 0)) return;
    this.value = Math.min(1, this.value + amount / this.def.need);
  }

  tick(dt) {
    this.add('time', dt);
  }

  consume() {
    this.value = 0;
  }
}

export class Projectiles {
  constructor(scene, effects) {
    this.scene = scene;
    this.effects = effects;
    this.list = [];
    this.geometry = new THREE.IcosahedronGeometry(0.17, 0);
  }

  // 山なりに投げて、狙った相手の位置に落ちるようにする
  bomb(from, targetPosition) {
    const to = targetPosition.clone().setY(1.0).sub(from);
    const flat = new THREE.Vector3(to.x, 0, to.z);
    const dist = flat.length() || 0.01;
    const flight = Math.max(0.3, dist / BOMB.speed);
    const velocity = flat.divideScalar(dist).multiplyScalar(dist / flight);
    velocity.y = to.y / flight + 0.5 * BOMB.gravity * flight;
    this.#spawn(from, velocity, {
      gravity: BOMB.gravity,
      damage: BOMB.damage,
      radius: BOMB.radius,
      life: flight + 1.5,
      color: 0x2f3540,
    });
  }

  rocket(from, targetPosition) {
    const to = targetPosition.clone().setY(1.0).sub(from);
    const dist = to.length() || 0.01;
    this.#spawn(from, to.divideScalar(dist).multiplyScalar(GOD_TURRET.speed), {
      gravity: 0,
      damage: GOD_TURRET.damage,
      radius: GOD_TURRET.radius,
      life: dist / GOD_TURRET.speed,
      color: 0xd07a3a,
    });
  }

  #spawn(from, velocity, opts) {
    const mesh = new THREE.Mesh(this.geometry, new THREE.MeshStandardMaterial({ color: opts.color, roughness: 0.6 }));
    mesh.position.copy(from);
    mesh.castShadow = true;
    this.scene.add(mesh);
    this.list.push({ mesh, velocity, ...opts });
  }

  update(dt, enemies, onExplode) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.velocity.y -= p.gravity * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.mesh.rotation.x += dt * 6;
      p.life -= dt;

      const grazed = enemies.some((e) => e.alive && e.position.distanceTo(p.mesh.position) < 0.9);
      if (!grazed && p.life > 0 && p.mesh.position.y > 0.15) continue;

      this.effects.explosion(p.mesh.position.clone(), p.radius);
      onExplode(p.mesh.position.clone(), p.radius, p.damage);
      this.scene.remove(p.mesh);
      p.mesh.material.dispose();
      this.list.splice(i, 1);
    }
  }

  clear() {
    for (const p of this.list) {
      this.scene.remove(p.mesh);
      p.mesh.material.dispose();
    }
    this.list.length = 0;
  }
}

class Drone {
  constructor(scene, index) {
    this.hp = DRONE.hp;
    // 1回ぶんの3機で円を三等分し、次に呼んだ3機はその隙間に入る
    const batch = Math.floor(index / DRONE.count);
    const slot = index % DRONE.count;
    this.phase = (slot * 2 + batch) * (Math.PI / DRONE.count);
    this.time = 0;
    // 同時に撃たないよう、撃ち始めをずらす
    this.readyAt = (index % DRONE.count) * (DRONE.interval / DRONE.count);

    this.root = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.16, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x39424e, roughness: 0.5, metalness: 0.5 })
    );
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd21e })
    );
    eye.position.set(0, -0.02, -0.26);
    this.rotors = [];
    for (const [x, z] of [[-0.26, -0.24], [0.26, -0.24], [-0.26, 0.24], [0.26, 0.24]]) {
      const arm = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.05, 0.16),
        new THREE.MeshStandardMaterial({ color: 0x5b6672, roughness: 0.7 })
      );
      arm.position.set(x, 0, z);
      const rotor = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.02, 0.05),
        new THREE.MeshStandardMaterial({ color: 0xaab4bf, roughness: 0.6 })
      );
      rotor.position.set(x, 0.08, z);
      this.rotors.push(rotor);
      this.root.add(arm, rotor);
    }
    this.root.add(body, eye);
    this.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(this.root);
  }

  get alive() {
    return this.hp > 0;
  }

  muzzle(out = new THREE.Vector3()) {
    return this.root.localToWorld(out.set(0, -0.06, -0.3));
  }

  update(dt, anchor, target, onShoot) {
    this.time += dt;
    this.phase += dt * DRONE.orbitSpeed;
    for (const r of this.rotors) r.rotation.y += dt * 40;

    const wanted = new THREE.Vector3(
      anchor.x + Math.cos(this.phase) * DRONE.orbitRadius,
      DRONE.height,
      anchor.z + Math.sin(this.phase) * DRONE.orbitRadius
    );
    this.root.position.lerp(wanted, Math.min(dt * 3, 1));

    if (!target) return;
    const to = target.position.clone().sub(this.root.position);
    this.root.rotation.y = Math.atan2(-to.x, -to.z);
    if (this.time < this.readyAt) return;
    this.readyAt = this.time + DRONE.interval;
    onShoot(this, target);
  }

  dispose(scene) {
    scene.remove(this.root);
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.dispose();
      o.material.dispose();
    });
  }
}

export class Drones {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.spawned = 0;
  }

  get count() {
    return this.list.length;
  }

  // 呼ぶたびに増える。上限を超えたぶんは、古い機から順に消える
  spawn(position) {
    for (let i = 0; i < DRONE.count; i++) {
      if (this.list.length >= DRONE.max) this.list.shift().dispose(this.scene);
      const drone = new Drone(this.scene, this.spawned++);
      drone.root.position.set(position.x, DRONE.height, position.z);
      this.list.push(drone);
    }
  }

  update(dt, anchor, enemies, onShoot) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const drone = this.list[i];
      if (!drone.alive) {
        drone.dispose(this.scene);
        this.list.splice(i, 1);
        continue;
      }
      let target = null;
      let best = DRONE.range;
      for (const e of enemies) {
        if (!e.alive) continue;
        const dist = e.position.distanceTo(drone.root.position);
        if (dist < best) {
          best = dist;
          target = e;
        }
      }
      drone.update(dt, anchor, target, onShoot);
    }
  }

  clear() {
    for (const drone of this.list) drone.dispose(this.scene);
    this.list.length = 0;
    this.spawned = 0;
  }
}
