import * as THREE from 'three';

const TRACER_LIFE = 0.11;
const ARC_LIFE = 0.24;
const FLASH_LIFE = 0.09;

const UP = new THREE.Vector3(0, 1, 0);

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    // 原点から +Y 方向に伸びる筒。scale.y で長さを合わせる
    this.tracerGeo = new THREE.CylinderGeometry(0.014, 0.014, 1, 6, 1, true);
    this.tracerGeo.translate(0, 0.5, 0);
    this.flashCoreGeo = new THREE.IcosahedronGeometry(0.03, 0);
    this.flashRingGeo = new THREE.RingGeometry(0.025, 0.07, 12);
    this.shared = new Set([this.tracerGeo, this.flashCoreGeo, this.flashRingGeo]);
  }

  #add(object, life, opacity, grow = 0) {
    this.scene.add(object);
    this.items.push({ object, life, maxLife: life, opacity, grow });
  }

  // 銃口の爆発。芯と、進行方向を向いた輪が一瞬だけ広がる
  muzzleFlash(position, dir) {
    const mat = (color) => new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const core = new THREE.Mesh(this.flashCoreGeo, mat(0xfff0b0));
    const ring = new THREE.Mesh(this.flashRingGeo, mat(0xff9d2b));
    ring.position.z = 0.03;
    ring.rotation.z = Math.random() * Math.PI;
    core.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    const group = new THREE.Group();
    group.position.copy(position);
    group.add(core, ring);
    group.lookAt(position.clone().add(dir));
    this.#add(group, FLASH_LIFE, 1, 1.6);
  }

  tracer(from, to) {
    const dir = to.clone().sub(from);
    const len = dir.length();
    if (len < 0.01) return;
    // 加算合成だと明るい空に溶けて白く見えるので、普通の半透明で色を保つ
    const mesh = new THREE.Mesh(this.tracerGeo, new THREE.MeshBasicMaterial({
      color: 0xffd21e,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }));
    mesh.position.copy(from);
    mesh.quaternion.setFromUnitVectors(UP, dir.divideScalar(len));
    mesh.scale.set(1, len, 1);
    this.#add(mesh, TRACER_LIFE, 1);
  }

  // 爆発。火の玉と、地面を走る輪が同時に広がる
  explosion(position, radius) {
    const mat = (color, opacity) => new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(radius * 0.3, 1), mat(0xffd08a, 1));
    const shock = new THREE.Mesh(new THREE.RingGeometry(radius * 0.5, radius * 0.62, 28), mat(0xff9d2b, 1));
    shock.rotation.x = -Math.PI / 2;
    shock.position.y = 0.06 - position.y;
    const group = new THREE.Group();
    group.position.copy(position);
    group.add(core, shock);
    this.#add(group, 0.45, 0.9, 1.6);
  }

  // ヘッドショット。当たった場所で光の粒がはじける
  headshot(position) {
    const group = new THREE.Group();
    group.position.copy(position);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffe27a, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    group.add(new THREE.Mesh(this.flashCoreGeo, mat));
    const ring = new THREE.Mesh(this.flashRingGeo, mat);
    ring.lookAt(0, 1, 0);
    group.add(ring);
    this.#add(group, 0.3, 1, 4);
  }

  // 地割れ。放射状のヒビと砂ぼこりが同時に広がる
  groundCrack(position, radius) {
    const flat = (geometry, color) => {
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }));
      mesh.rotation.x = -Math.PI / 2;
      return mesh;
    };

    const group = new THREE.Group();
    group.position.set(position.x, 0.04, position.z);

    // 内半径0の細い扇形が、中心から外へ伸びる1本のヒビになる
    const cracks = 10;
    for (let i = 0; i < cracks; i++) {
      const angle = (i / cracks) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const length = radius * (0.5 + Math.random() * 0.5);
      group.add(flat(new THREE.RingGeometry(0.12, length, 1, 1, angle, 0.1), 0x14100a));
    }
    group.add(flat(new THREE.CircleGeometry(radius * 0.3, 20), 0x2a2318));
    group.add(flat(new THREE.RingGeometry(radius * 0.72, radius * 0.92, 30), 0xbfae86));

    // 舞い上がる砂ぼこり。大きくするとヒビが隠れるので控えめに
    const dust = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 0.28, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xb8a67c, transparent: true, depthWrite: false })
    );
    group.add(dust);

    this.#add(group, 0.9, 0.95, 0.5);
  }

  swingArc(position, yaw, radius, arc) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.72, radius, 28, 1, Math.PI / 2 - arc / 2, arc),
      new THREE.MeshBasicMaterial({
        color: 0xeaf6ff,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    mesh.rotation.x = -Math.PI / 2;
    const group = new THREE.Group();
    group.position.copy(position);
    group.rotation.y = yaw;
    group.add(mesh);
    this.#add(group, ARC_LIFE, 0.6);
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      item.life -= dt;
      if (item.life <= 0) {
        this.scene.remove(item.object);
        item.object.traverse((o) => {
          if (!o.isMesh) return;
          o.material.dispose();
          if (!this.shared.has(o.geometry)) o.geometry.dispose();
        });
        this.items.splice(i, 1);
        continue;
      }
      const t = item.life / item.maxLife;
      const alpha = t * item.opacity;
      item.object.traverse((o) => { if (o.isMesh) o.material.opacity = alpha; });
      if (item.grow) item.object.scale.setScalar(1 + (1 - t) * item.grow);
    }
  }
}
