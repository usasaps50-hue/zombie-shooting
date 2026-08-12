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
