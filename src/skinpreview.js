import * as THREE from 'three';
import { loadSkin, skinReady, SkinAvatar } from './skinmodel.js';
import { SKIN_BY_ID } from './data/skins.js';

// スキンショップの3Dプレビュー。
// 選んだスキンを、その場でぐるぐる回して見られるようにする。
// 指やマウスで横に引っぱると、自分で回せる。

export class SkinPreview {
  constructor() {
    this.box = document.getElementById('skin-preview');
    this.canvas = document.getElementById('skin-canvas');
    this.caption = document.getElementById('skin-caption');
    this.avatar = null;
    this.skinId = null;
    this.spin = 0.6;
    this.dragging = false;
    this.lastX = 0;
    this.running = false;
    this.renderer = null;

    // 指やマウスで回す
    const down = (x) => { this.dragging = true; this.lastX = x; };
    const move = (x) => {
      if (!this.dragging) return;
      this.spin += (x - this.lastX) * 0.012;
      this.lastX = x;
    };
    const up = () => { this.dragging = false; };
    this.canvas.addEventListener('pointerdown', (e) => { down(e.clientX); this.canvas.setPointerCapture(e.pointerId); });
    this.canvas.addEventListener('pointermove', (e) => move(e.clientX));
    this.canvas.addEventListener('pointerup', up);
    this.canvas.addEventListener('pointercancel', up);
  }

  #setup() {
    if (this.renderer) return;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xdfe6ee, 0x2a3038, 2.2));
    const key = new THREE.DirectionalLight(0xfff3dd, 2.0);
    key.position.set(2, 4, 3);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fb6ff, 1.0);
    rim.position.set(-3, 2, -2);
    this.scene.add(rim);
    this.holder = new THREE.Group();
    this.scene.add(this.holder);
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 30);
    this.camera.position.set(0, 1.05, 3.3);
    this.camera.lookAt(0, 0.9, 0);
    this.clock = new THREE.Clock();
  }

  // その場で読み込んで表示する。読み込み中は「よみこみ中」を出す
  async show(skinId) {
    this.box.classList.remove('hidden');
    this.#setup();
    if (this.skinId === skinId && this.avatar) return;
    this.skinId = skinId;

    const def = SKIN_BY_ID[skinId];
    this.caption.textContent = `${def?.name ?? skinId}　よみこみ中…`;

    if (!skinReady(skinId)) {
      await loadSkin(skinId);
      // 待っているあいだに別のスキンが選ばれていたら、こちらは捨てる
      if (this.skinId !== skinId) return;
    }
    if (def?.hat && !skinReady(def.hat)) {
      await loadSkin(def.hat);
      if (this.skinId !== skinId) return;
    }

    if (this.avatar) {
      this.holder.remove(this.avatar.root);
      this.avatar.dispose();
      this.avatar = null;
    }
    try {
      this.avatar = new SkinAvatar(skinId, { hat: def?.hat ?? null });
    } catch {
      this.caption.textContent = 'よみこめませんでした';
      return;
    }
    this.holder.add(this.avatar.root);
    this.caption.textContent = def?.name ?? skinId;
    this.#start();
  }

  hide() {
    this.box.classList.add('hidden');
    this.running = false;
  }

  #start() {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      const dt = this.clock.getDelta();
      // 引っぱっていないあいだは、ゆっくり自分で回る
      if (!this.dragging) this.spin += dt * 0.5;
      this.holder.rotation.y = this.spin;
      this.avatar?.update(dt, { anim: { name: 'idle', t: 0 }, speed: 0, pitch: 0 });

      const w = this.canvas.clientWidth || 1;
      const h = this.canvas.clientHeight || 1;
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
      }
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }
}
