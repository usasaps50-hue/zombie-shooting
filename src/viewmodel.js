import * as THREE from 'three';

const smooth = (t) => t * t * (3 - 2 * t);
const phase = (t, a, b) => THREE.MathUtils.clamp((t - a) / (b - a), 0, 1);

const GOLD = new THREE.Color(0xe0b23c);

export function createItemMesh(id, gold = false, silencer = false) {
  const g = new THREE.Group();
  const mat = (color, rough = 0.6) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.2 });

  if (id === 'ak47') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.5), mat(0x3a3f47));
    body.position.set(0, 0, -0.05);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.42), mat(0x5a6069, 0.35));
    rail.position.set(0, 0.075, -0.12);
    rail.name = 'slide';
    const wood = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.09, 0.22), mat(0x7a5433, 0.9));
    wood.position.set(0, -0.01, -0.34);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.3, 8), mat(0x22262b, 0.3));
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.045, -0.56);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.11, 0.28), mat(0x7a5433, 0.9));
    stock.position.set(0, -0.04, 0.32);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.19, 0.08), mat(0x4a3b30, 0.9));
    grip.position.set(0, -0.14, 0.06);
    grip.rotation.x = -0.25;
    // 弧を描いた特徴的なマガジン
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.24, 0.1), mat(0x5c4a2e, 0.7));
    mag.position.set(0, -0.17, -0.12);
    mag.rotation.x = 0.35;
    mag.name = 'magazine';
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.035, 0.02), mat(0x1c1f24));
    sight.position.set(0, 0.115, -0.4);
    g.add(body, rail, wood, barrel, stock, grip, mag, sight);
    if (silencer) {
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.26, 10), mat(0x2a2e34, 0.5));
      can.rotation.x = Math.PI / 2;
      can.position.set(0, 0.045, -0.79);
      g.add(can);
    }
  } else if (id === 'pistol') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.26), mat(0x2f3238));
    body.position.set(0, 0, -0.05);
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, 0.32), mat(0x5a6069, 0.35));
    slide.position.set(0, 0.07, -0.1);
    slide.name = 'slide';
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.02, 0.02), mat(0x1c1f24));
    sight.position.set(0, 0.105, -0.24);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.06, 8), mat(0x1c1f24, 0.3));
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.07, -0.28);
    const guard = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 6, 10, Math.PI), mat(0x2f3238));
    guard.rotation.set(Math.PI / 2, 0, Math.PI);
    guard.position.set(0, -0.06, -0.03);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.2, 0.09), mat(0x4a3b30, 0.9));
    grip.position.set(0, -0.14, 0.05);
    grip.rotation.x = -0.3;
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.06), mat(0x6a7078, 0.4));
    mag.position.copy(grip.position);
    mag.rotation.copy(grip.rotation);
    mag.name = 'magazine';
    g.add(body, slide, sight, barrel, guard, grip, mag);
    if (silencer) {
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.22, 10), mat(0x2a2e34, 0.5));
      can.rotation.x = Math.PI / 2;
      can.position.set(0, 0.07, -0.4);
      g.add(can);
    }
  } else if (id === 'shovel') {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.95, 8), mat(0x8b6b45, 0.9));
    handle.position.set(0, 0.15, 0);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.3, 0.03), mat(0x707880, 0.45));
    blade.position.set(0, -0.42, 0);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.1, 8), mat(0x5c6169, 0.5));
    collar.position.set(0, -0.28, 0);
    g.add(handle, blade, collar);
  } else if (id === 'hammer') {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.7, 8), mat(0x7a5233, 0.9));
    handle.position.set(0, 0.05, 0);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.34), mat(0x6d757e, 0.35));
    head.position.set(0, 0.42, 0.02);
    const claw = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.1), mat(0x565d66, 0.35));
    claw.position.set(0, 0.42, -0.18);
    claw.rotation.x = 0.5;
    g.add(handle, head, claw);
  } else if (id === 'knife') {
    // 短い両刃のナイフ。刃を前（-Z）に向けて構える
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.012, 0.34), mat(0xc9d2da, 0.25));
    blade.position.set(0, 0.02, -0.24);
    // 切っ先。四角錐を寝かせて、先を細くする
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.12, 4), mat(0xd8e0e7, 0.25));
    tip.rotation.set(-Math.PI / 2, 0, Math.PI / 4);
    tip.position.set(0, 0.02, -0.46);
    // 血が乾いた刃元
    const stain = new THREE.Mesh(new THREE.BoxGeometry(0.037, 0.014, 0.09), mat(0x7d2b2b, 0.6));
    stain.position.set(0, 0.02, -0.12);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.035), mat(0x8d949d, 0.4));
    guard.position.set(0, 0.02, -0.05);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.16, 8), mat(0x33383f, 0.85));
    grip.rotation.x = Math.PI / 2;
    grip.position.set(0, 0.02, 0.05);
    const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), mat(0x8d949d, 0.4));
    pommel.position.set(0, 0.02, 0.14);
    g.add(blade, tip, stain, guard, grip, pommel);
  } else if (id === 'megaphone') {
    // ラッパ型の拡声器。太い側が前（-Z）を向く
    const horn = new THREE.Mesh(
      new THREE.CylinderGeometry(0.19, 0.075, 0.34, 16, 1, true),
      mat(0xd8dde3, 0.35)
    );
    horn.rotation.x = -Math.PI / 2;
    horn.position.set(0, 0, -0.26);
    horn.material.side = THREE.DoubleSide;
    // ラッパのふち
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.016, 6, 18), mat(0xb9c0c8, 0.4));
    lip.position.set(0, 0, -0.43);
    // 本体
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.062, 0.2, 12), mat(0x3d444c, 0.5));
    body.rotation.x = -Math.PI / 2;
    body.position.set(0, 0, -0.02);
    // 後ろのふた
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.064, 0.05, 0.06, 12), mat(0x2c3238, 0.6));
    cap.rotation.x = -Math.PI / 2;
    cap.position.set(0, 0, 0.1);
    // 握り。下に伸ばして、引き金をつける
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.07), mat(0x2c3238, 0.7));
    grip.position.set(0, -0.13, 0.02);
    const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.02), mat(0x9aa2ab, 0.5));
    trigger.position.set(0, -0.06, -0.04);
    // 上のスピーカー金具と、光る小さなランプ
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.1), mat(0x9aa2ab, 0.45));
    band.position.set(0, 0.07, -0.02);
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff6b5a })
    );
    lamp.position.set(0.05, 0.045, 0.05);
    lamp.name = 'lamp';
    g.add(horn, lip, body, cap, grip, trigger, band, lamp);
  } else if (id === 'bandage') {
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.12, 12), mat(0xf2ece0, 0.95));
    roll.rotation.z = Math.PI / 2;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.072, 0.03, 12), mat(0xd94f4f, 0.9));
    band.rotation.z = Math.PI / 2;
    g.add(roll, band);
  }

  g.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    // 光っている部品は色を変えない（金色にすると消えて見える）
    if (o.name === 'lamp') return;
    // レベル5の金色。元の濃淡は少し残して、のっぺりしないようにする
    if (gold) {
      o.material.color.lerp(GOLD, 0.82);
      o.material.metalness = 0.6;
      o.material.roughness = Math.min(o.material.roughness, 0.4);
    }
  });
  return g;
}

export class ViewModel {
  constructor(camera) {
    this.camera = camera;
    this.root = new THREE.Group();
    camera.add(this.root);
    this.current = null;
    this.itemId = null;
    this.bob = 0;
  }

  setItem(id, gold = false, silencer = false) {
    if (this.itemId === id && this.gold === gold && this.silencer === silencer) return;
    if (this.current) this.root.remove(this.current);
    this.itemId = id;
    this.gold = gold;
    this.silencer = silencer;
    this.current = id ? createItemMesh(id, gold, silencer) : null;
    if (this.current) this.root.add(this.current);
  }

  update(dt, anim, moveAmount) {
    if (!this.current) return;
    this.bob += dt * (4 + moveAmount * 8);
    const m = this.current;
    const sway = moveAmount * 0.02;

    const longHandled = this.itemId === 'shovel' || this.itemId === 'hammer';
    const base = longHandled
      ? { pos: new THREE.Vector3(0.45, -0.5, -0.8), rot: new THREE.Euler(2.7, -0.3, 0.7) }
      : { pos: new THREE.Vector3(0.3, -0.26, -0.7), rot: new THREE.Euler(0.02, -0.28, 0.05) };

    // 縦画面は水平画角が狭いので、武器を内側・下・小さめに寄せて画面内に収める
    const narrow = THREE.MathUtils.clamp(this.camera.aspect / 1.6, 0.45, 1);
    base.pos.x *= narrow;
    m.scale.setScalar((longHandled ? 0.5 : 1) * (0.6 + narrow * 0.4));

    // 構えているときは、銃を画面の真ん中へ寄せて構え直す
    if (this.aim && !longHandled) {
      base.pos.set(0.02 * narrow, -0.13, -0.42);
      base.rot.set(0, 0, 0);
    }

    m.position.copy(base.pos);
    m.rotation.copy(base.rot);
    m.position.x += Math.sin(this.bob) * sway;
    m.position.y += Math.abs(Math.cos(this.bob)) * sway;

    const { name, t } = anim;
    if (name === 'fire') {
      const kick = t < 0.25 ? t / 0.25 : 1 - smooth((t - 0.25) / 0.75);
      m.position.z += kick * 0.09;
      m.position.y += kick * 0.02;
      m.rotation.x += kick * 0.28;
      const slide = m.getObjectByName('slide');
      if (slide) slide.position.z = -0.08 + kick * 0.07;
    } else if (name === 'reload') {
      const out = smooth(phase(t, 0, 0.22));
      const back = smooth(phase(t, 0.75, 1));
      const lower = out - back;
      m.position.y -= lower * 0.16;
      m.position.x -= lower * 0.14;
      m.rotation.z += lower * 0.9;
      m.rotation.x += lower * 0.35;
      const mag = m.getObjectByName('magazine');
      if (mag) {
        const drop = smooth(phase(t, 0.2, 0.45));
        const insert = smooth(phase(t, 0.5, 0.75));
        mag.position.y = -0.14 - drop * 0.3 + insert * 0.3;
        mag.visible = !(drop > 0.95 && insert < 0.05);
      }
    } else if (name === 'swing') {
      // 横薙ぎ：右に振りかぶってから左へ薙ぐ
      const swing = smooth(Math.min(t / 0.5, 1)) - smooth(phase(t, 0.55, 1)) * 0.85;
      m.position.x += 0.3 - swing * 1.0;
      m.position.z += 0.28 - swing * 0.5;
      m.position.y += swing * 0.16;
      m.rotation.y += -0.7 + swing * 2.0;
      m.rotation.z += 0.35 - swing * 0.5;
      m.rotation.x += -0.35 + swing * 0.5;
    } else if (name === 'shout') {
      // 拡声器：口元へ持ち上げて、声に合わせて小刻みに震わせる
      const raise = smooth(phase(t, 0, 0.25)) - smooth(phase(t, 0.7, 1));
      m.position.x -= raise * 0.18;
      m.position.y += raise * 0.16;
      m.position.z -= raise * 0.14;
      m.rotation.y += raise * 0.3;
      m.rotation.x += Math.sin(t * 60) * raise * 0.05;
      const lamp = m.getObjectByName('lamp');
      if (lamp) lamp.visible = raise < 0.5 || Math.sin(t * 40) > 0;
    } else if (name === 'swap') {
      m.position.y -= (1 - smooth(t)) * 0.5;
      m.rotation.x += (1 - smooth(t)) * 0.6;
    }
  }
}
