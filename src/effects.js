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

  // tick を渡すと、消えかたを自分で決められる（進み具合 0→1 が来る）
  #add(object, life, opacity, grow = 0, tick = null) {
    this.scene.add(object);
    this.items.push({ object, life, maxLife: life, opacity, grow, tick });
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

  // ミュータントが跳んでくる場所の印。中の円がふさがりきると落ちてくる
  slamMarker(position, radius, life) {
    const flat = (geometry, color, opacity) => {
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
        color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide,
      }));
      mesh.rotation.x = -Math.PI / 2;
      return mesh;
    };

    const group = new THREE.Group();
    group.position.set(position.x, position.y + 0.05, position.z);

    const rim = flat(new THREE.RingGeometry(radius * 0.92, radius, 40), 0xff4c3a, 0.9);
    const inner = flat(new THREE.RingGeometry(radius * 0.62, radius * 0.68, 32), 0xffb03a, 0.7);
    // 中心から広がって、外の輪に届いたときが着地
    const fill = flat(new THREE.CircleGeometry(radius, 36), 0xff5a3a, 0.28);
    fill.scale.setScalar(0.01);
    // 十字の照準
    for (const angle of [0, Math.PI / 2]) {
      const bar = flat(new THREE.PlaneGeometry(radius * 2.1, 0.08), 0xff8a5a, 0.75);
      bar.rotation.z = angle;
      group.add(bar);
    }
    // 落ちてくる先を空からも見えるようにする、細い光の柱
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.1, radius * 0.1, 9, 8, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xff6a4a, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    beam.position.y = 4.5;

    group.add(rim, inner, fill, beam);
    this.#add(group, life, 1, 0, (p) => {
      fill.scale.setScalar(Math.max(0.01, p));
      // 落ちる直前ほど速く点滅する
      const blink = 0.55 + 0.45 * Math.sin(p * (14 + p * 40));
      rim.material.opacity = 0.55 + blink * 0.45;
      inner.material.opacity = 0.35 + blink * 0.45;
      inner.scale.setScalar(1 + Math.sin(p * 12) * 0.05);
      beam.material.opacity = 0.12 + blink * 0.16;
    });
  }

  // 地中から出入りするときの土けむり
  dirtBurst(position, up = true) {
    const group = new THREE.Group();
    group.position.set(position.x, position.y + 0.05, position.z);

    const mound = new THREE.Mesh(
      new THREE.SphereGeometry(0.85, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x6a563c, transparent: true, depthWrite: false })
    );
    mound.scale.y = 0.45;
    group.add(mound);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 1.15, 24),
      new THREE.MeshBasicMaterial({
        color: 0x4a3b28, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);

    // はね上がる土の粒
    const clods = [];
    for (let i = 0; i < 10; i++) {
      const clod = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.1 + Math.random() * 0.12, 0),
        new THREE.MeshBasicMaterial({ color: 0x5c4a33, transparent: true, depthWrite: false })
      );
      const angle = (i / 10) * Math.PI * 2;
      clods.push({ clod, angle, speed: 1.2 + Math.random() * 1.4, hop: 1.6 + Math.random() * 1.6 });
      group.add(clod);
    }

    this.#add(group, 0.75, 0.9, 0, (p) => {
      const alpha = (1 - p) * 0.9;
      mound.scale.set(1 + p * 0.7, 0.45 + (up ? p * 0.5 : 0), 1 + p * 0.7);
      mound.material.opacity = alpha;
      ring.scale.setScalar(1 + p * 1.4);
      ring.material.opacity = alpha * 0.8;
      for (const c of clods) {
        const r = p * c.speed;
        c.clod.position.set(
          Math.sin(c.angle) * r,
          Math.max(0.05, Math.sin(p * Math.PI) * c.hop * (up ? 1 : 0.4)),
          Math.cos(c.angle) * r
        );
        c.clod.rotation.set(p * 6, p * 5, 0);
        c.clod.material.opacity = alpha;
      }
    });
  }

  // 拡声器の呼びかけ。金色の輪が広がって、届く範囲を見せる
  shout(position, radius) {
    const group = new THREE.Group();
    group.position.set(position.x, position.y + 0.06, position.z);

    const rings = [];
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(radius * 0.94, radius, 40),
        new THREE.MeshBasicMaterial({
          color: i === 1 ? 0xfff0b0 : 0xffc94a,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      ring.rotation.x = -Math.PI / 2;
      rings.push({ ring, delay: i * 0.14 });
      group.add(ring);
    }

    // 立ち上がる光の柱。かかっている人の目印になる
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 1.3, 3.2, 14, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffd76a, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    pillar.position.y = 1.6;
    group.add(pillar);

    this.#add(group, 0.95, 1, 0, (p) => {
      for (const { ring, delay } of rings) {
        const t = THREE.MathUtils.clamp((p - delay) / (1 - delay), 0, 1);
        ring.scale.setScalar(Math.max(0.05, t));
        ring.material.opacity = t <= 0 ? 0 : (1 - t) * 0.85;
      }
      pillar.scale.set(1 + p * 0.5, 1 + p * 0.6, 1 + p * 0.5);
      pillar.material.opacity = (1 - p) * 0.35;
    });
  }

  // ロッドの範囲魔法。地面に魔法陣が浮かんで、光の柱が立つ
  magicBlast(position, radius, color = 0x6bd8ff) {
    const flat = (geometry, c, opacity) => {
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
        color: c, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide,
      }));
      mesh.rotation.x = -Math.PI / 2;
      return mesh;
    };

    const group = new THREE.Group();
    group.position.set(position.x, position.y + 0.05, position.z);

    const rim = flat(new THREE.RingGeometry(radius * 0.9, radius, 32), color, 0.9);
    const inner = flat(new THREE.RingGeometry(radius * 0.45, radius * 0.52, 24), color, 0.7);
    const disc = flat(new THREE.CircleGeometry(radius, 28), color, 0.22);
    // 魔法陣らしい放射線
    const spokes = [];
    for (let i = 0; i < 6; i++) {
      const spoke = flat(new THREE.PlaneGeometry(radius * 1.9, 0.06), color, 0.6);
      spoke.rotation.z = (i / 6) * Math.PI;
      spokes.push(spoke);
      group.add(spoke);
    }
    // 立ちのぼる光の柱
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.7, radius * 0.95, 3.4, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    pillar.position.y = 1.7;
    // はじける光の粒
    const motes = [];
    for (let i = 0; i < 12; i++) {
      const mote = new THREE.Mesh(
        this.flashCoreGeo,
        new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false })
      );
      const angle = (i / 12) * Math.PI * 2;
      motes.push({ mote, angle, up: 1.4 + Math.random() * 1.8, out: radius * (0.4 + Math.random() * 0.6) });
      group.add(mote);
    }

    group.add(rim, inner, disc, pillar);
    this.#add(group, 0.7, 1, 0, (p) => {
      const fade = 1 - p;
      rim.scale.setScalar(0.3 + p * 0.75);
      rim.material.opacity = fade * 0.9;
      inner.scale.setScalar(0.2 + p * 1.1);
      inner.material.opacity = fade * 0.7;
      inner.rotation.z += 0.08;
      disc.scale.setScalar(Math.min(1, p * 2.2));
      disc.material.opacity = fade * 0.28;
      for (const spoke of spokes) {
        spoke.scale.setScalar(0.2 + p * 0.9);
        spoke.material.opacity = fade * 0.55;
      }
      pillar.scale.set(0.5 + p * 0.7, 1 + p * 0.4, 0.5 + p * 0.7);
      pillar.material.opacity = fade * 0.32;
      for (const m of motes) {
        const r = p * m.out;
        m.mote.position.set(Math.sin(m.angle) * r, Math.sin(p * Math.PI) * m.up, Math.cos(m.angle) * r);
        m.mote.material.opacity = fade;
      }
    });
  }

  // 敵が味方として起き上がるときの、魂が吸い込まれる演出
  raise(position, color = 0x6bd8ff) {
    const group = new THREE.Group();
    group.position.set(position.x, position.y, position.z);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.8, 3.0, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    beam.position.y = 1.5;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.9, 20),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    group.add(beam, ring);
    this.#add(group, 0.9, 1, 0, (p) => {
      beam.scale.set(1 - p * 0.4, 1 + p * 0.5, 1 - p * 0.4);
      beam.material.opacity = (1 - p) * 0.55;
      ring.scale.setScalar(1 + p * 1.6);
      ring.material.opacity = (1 - p) * 0.8;
    });
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
      // 消えかたを自分で決めるものは、まとめて薄くしない
      if (item.tick) {
        item.tick(1 - t);
        continue;
      }
      const alpha = t * item.opacity;
      item.object.traverse((o) => { if (o.isMesh) o.material.opacity = alpha; });
      if (item.grow) item.object.scale.setScalar(1 + (1 - t) * item.grow);
    }
  }
}
