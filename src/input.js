import { IS_TOUCH } from './device.js';

const LOOK_SENSITIVITY = 0.0022;
const TOUCH_SENSITIVITY = 0.005;
const STICK_RADIUS = 55;

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.move = { x: 0, y: 0 };
    this.look = { dx: 0, dy: 0 };
    this.fire = false;
    this.run = false;
    this.use = false;
    this.jumpQueued = false;
    this.reloadQueued = false;
    this.slotQueued = null;
    this.locked = false;
    this.isTouch = IS_TOUCH;

    this.#bindKeyboard();
    this.#bindMouse();
    if (this.isTouch) this.#bindTouch();
  }

  requestLock() {
    if (this.isTouch) return;
    // iframe内などロックが拒否される環境でも遊べるよう、失敗は無視する
    this.canvas.requestPointerLock?.()?.catch?.(() => {});
  }

  releaseLock() {
    if (!this.isTouch) document.exitPointerLock?.();
  }

  consumeLook() {
    const out = { dx: this.look.dx, dy: this.look.dy };
    this.look.dx = 0;
    this.look.dy = 0;
    return out;
  }

  consumeJump() {
    const v = this.jumpQueued;
    this.jumpQueued = false;
    return v;
  }

  consumeReload() {
    const v = this.reloadQueued;
    this.reloadQueued = false;
    return v;
  }

  consumeSlot() {
    const v = this.slotQueued;
    this.slotQueued = null;
    return v;
  }

  reset() {
    this.move.x = 0;
    this.move.y = 0;
    this.fire = false;
    this.run = false;
    this.use = false;
    this.jumpQueued = false;
    this.reloadQueued = false;
    this.slotQueued = null;
  }

  #bindKeyboard() {
    const keys = new Set();
    const sync = () => {
      this.move.y = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
      this.move.x = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
      this.run = keys.has('ShiftLeft') || keys.has('ShiftRight');
      this.use = keys.has('KeyE');
    };
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      keys.add(e.code);
      if (e.code === 'Space') this.jumpQueued = true;
      if (e.code === 'KeyR') this.reloadQueued = true;
      if (e.code === 'Digit1') this.slotQueued = 0;
      if (e.code === 'Digit2') this.slotQueued = 1;
      if (e.code === 'Digit3') this.slotQueued = 2;
      sync();
    });
    addEventListener('keyup', (e) => {
      keys.delete(e.code);
      sync();
    });
    addEventListener('blur', () => {
      keys.clear();
      this.reset();
    });
  }

  #bindMouse() {
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) this.reset();
    });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.look.dx -= e.movementX * LOOK_SENSITIVITY;
      this.look.dy -= e.movementY * LOOK_SENSITIVITY;
    });
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.fire = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.fire = false;
    });
  }

  #bindTouch() {
    document.body.classList.add('touch');

    const stick = document.getElementById('stick');
    const knob = document.getElementById('stick-knob');
    let stickId = null;
    let lookId = null;
    let lastX = 0;
    let lastY = 0;

    stick.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      stickId = t.identifier;
      e.preventDefault();
    }, { passive: false });

    // 古い Android の TouchList は for...of が使えないので添字で回す
    addEventListener('touchmove', (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === stickId) {
          const r = stick.getBoundingClientRect();
          let dx = t.clientX - (r.left + r.width / 2);
          let dy = t.clientY - (r.top + r.height / 2);
          const len = Math.hypot(dx, dy) || 1;
          const clamped = Math.min(len, STICK_RADIUS);
          dx = (dx / len) * clamped;
          dy = (dy / len) * clamped;
          knob.style.transform = `translate(${dx}px, ${dy}px)`;
          this.move.x = dx / STICK_RADIUS;
          this.move.y = -dy / STICK_RADIUS;
          this.run = clamped > STICK_RADIUS * 0.85;
        } else if (t.identifier === lookId) {
          this.look.dx -= (t.clientX - lastX) * TOUCH_SENSITIVITY;
          this.look.dy -= (t.clientY - lastY) * TOUCH_SENSITIVITY;
          lastX = t.clientX;
          lastY = t.clientY;
        }
      }
    }, { passive: false });

    const endTouch = (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === stickId) {
          stickId = null;
          knob.style.transform = '';
          this.move.x = 0;
          this.move.y = 0;
          this.run = false;
        }
        if (t.identifier === lookId) lookId = null;
      }
    };
    addEventListener('touchend', endTouch);
    addEventListener('touchcancel', endTouch);

    this.canvas.addEventListener('touchstart', (e) => {
      if (lookId !== null) return;
      const t = e.changedTouches[0];
      lookId = t.identifier;
      lastX = t.clientX;
      lastY = t.clientY;
    });

    const hold = (id, on, off) => {
      const el = document.getElementById(id);
      el.addEventListener('touchstart', (e) => { e.preventDefault(); on(); }, { passive: false });
      el.addEventListener('touchend', (e) => { e.preventDefault(); off?.(); }, { passive: false });
      el.addEventListener('touchcancel', () => off?.());
    };

    hold('btn-fire', () => { this.fire = true; }, () => { this.fire = false; });
    hold('btn-use', () => { this.use = true; }, () => { this.use = false; });
    hold('btn-jump', () => { this.jumpQueued = true; });
    hold('btn-reload', () => { this.reloadQueued = true; });
    for (let i = 0; i < 3; i++) hold(`btn-slot-${i}`, () => { this.slotQueued = i; });
  }
}
