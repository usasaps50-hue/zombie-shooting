// 効果音。音源ファイルは持たず、その場で波形を合成して鳴らす。
// （ビルド工程のない構成なので、mp3 などを増やさずに済ませたい）
//
// ブラウザは「ユーザーが操作するまで音を出せない」決まりなので、
// 最初のクリックやキー入力で unlock() を呼んでから使う。

const MAX_DISTANCE = 46;
// 同時にたくさん鳴らすと割れるので、名前ごとに最短の間隔をあける
const THROTTLE = 0.045;

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.noiseBuffer = null;
    this.lastAt = new Map();
    // 聞いている人の位置と向き（毎フレーム setListener で更新する）
    this.lp = { x: 0, y: 0, z: 0 };
    this.right = { x: 1, y: 0, z: 0 };
  }

  get ready() {
    if (!this.ctx) return false;
    // ブラウザの都合で止められることがある。気づいたら起こす
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
      return false;
    }
    return this.ctx.state === 'running';
  }

  // 最初のユーザー操作で呼ぶ。2回目以降は何もしない
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(this.ctx.destination);
    this.#buildNoise();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.8;
    return this.muted;
  }

  // ざらざらした音のもと。銃声や爆発の芯になる
  #buildNoise() {
    const length = this.ctx.sampleRate * 1.2;
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buffer;
  }

  setListener(camera) {
    if (!camera) return;
    const p = camera.position;
    this.lp.x = p.x;
    this.lp.y = p.y;
    this.lp.z = p.z;
    // カメラの右方向。行列の1列目がそのまま右ベクトルになっている
    const e = camera.matrixWorld.elements;
    this.right.x = e[0];
    this.right.y = e[1];
    this.right.z = e[2];
  }

  // ---- 部品 ----

  #out(volume, pan) {
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    if (pan && this.ctx.createStereoPanner) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = clamp(pan, -1, 1);
      gain.connect(panner);
      panner.connect(this.master);
    } else {
      gain.connect(this.master);
    }
    gain.userVolume = volume;
    return gain;
  }

  // 立ち上がってから減衰するだけの、いちばん基本的な音量の動き
  #env(gain, at, attack, decay, peak) {
    const g = gain.gain;
    g.setValueAtTime(0.0001, at);
    g.exponentialRampToValueAtTime(Math.max(0.0001, peak), at + attack);
    g.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  }

  #tone(type, from, to, at, duration, gain) {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, at);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), at + duration);
    osc.connect(gain);
    osc.start(at);
    osc.stop(at + duration + 0.02);
    return osc;
  }

  #noiseSource(at, duration, gain, filter) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    let node = src;
    if (filter) {
      const biquad = this.ctx.createBiquadFilter();
      biquad.type = filter.type ?? 'lowpass';
      biquad.frequency.setValueAtTime(filter.from, at);
      if (filter.to) biquad.frequency.exponentialRampToValueAtTime(Math.max(20, filter.to), at + duration);
      biquad.Q.value = filter.q ?? 1;
      src.connect(biquad);
      node = biquad;
    }
    node.connect(gain);
    src.start(at, Math.random() * 0.5);
    src.stop(at + duration + 0.02);
    return src;
  }

  // ---- 音の中身 ----

  #render(name, gain, at, volume) {
    const v = volume;
    switch (name) {
      // 銃
      case 'pistol':
        this.#env(gain, at, 0.002, 0.16, 0.9 * v);
        this.#noiseSource(at, 0.16, gain, { type: 'lowpass', from: 5200, to: 500 });
        this.#tone('triangle', 320, 70, at, 0.1, gain);
        break;
      case 'ak47':
        this.#env(gain, at, 0.002, 0.2, 1.0 * v);
        this.#noiseSource(at, 0.2, gain, { type: 'lowpass', from: 6500, to: 380 });
        this.#tone('sawtooth', 240, 55, at, 0.13, gain);
        break;
      case 'silenced':
        this.#env(gain, at, 0.003, 0.1, 0.42 * v);
        this.#noiseSource(at, 0.1, gain, { type: 'bandpass', from: 1400, to: 500, q: 1.4 });
        this.#tone('sine', 180, 80, at, 0.07, gain);
        break;
      case 'empty':
        this.#env(gain, at, 0.001, 0.05, 0.5 * v);
        this.#noiseSource(at, 0.05, gain, { type: 'highpass', from: 2600 });
        break;
      case 'reload':
        this.#env(gain, at, 0.002, 0.07, 0.5 * v);
        this.#noiseSource(at, 0.07, gain, { type: 'bandpass', from: 1800, q: 2 });
        this.#env(gain, at + 0.13, 0.002, 0.09, 0.5 * v);
        this.#noiseSource(at + 0.13, 0.09, gain, { type: 'bandpass', from: 1200, q: 2 });
        break;

      // 近接
      case 'swing':
        this.#env(gain, at, 0.02, 0.16, 0.5 * v);
        this.#noiseSource(at, 0.18, gain, { type: 'bandpass', from: 700, to: 2600, q: 0.8 });
        break;
      case 'hit':
        this.#env(gain, at, 0.003, 0.12, 0.75 * v);
        this.#noiseSource(at, 0.12, gain, { type: 'lowpass', from: 1300, to: 260 });
        this.#tone('sine', 150, 60, at, 0.1, gain);
        break;
      case 'headshot':
        this.#env(gain, at, 0.002, 0.28, 0.7 * v);
        this.#tone('square', 1500, 700, at, 0.1, gain);
        this.#tone('sine', 2400, 1200, at, 0.24, gain);
        break;

      // タレットとドローン
      case 'turret':
        this.#env(gain, at, 0.002, 0.09, 0.5 * v);
        this.#tone('square', 900, 300, at, 0.07, gain);
        this.#noiseSource(at, 0.07, gain, { type: 'highpass', from: 2000 });
        break;
      case 'drone':
        this.#env(gain, at, 0.002, 0.1, 0.45 * v);
        this.#tone('sawtooth', 1300, 500, at, 0.09, gain);
        break;

      // ゾンビ
      case 'growl': {
        this.#env(gain, at, 0.06, 0.5, 0.5 * v);
        const osc = this.#tone('sawtooth', 90, 62, at, 0.5, gain);
        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();
        lfo.frequency.value = 11;
        lfoGain.gain.value = 14;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        lfo.start(at);
        lfo.stop(at + 0.52);
        this.#noiseSource(at, 0.5, gain, { type: 'bandpass', from: 380, to: 200, q: 1.2 });
        break;
      }
      // ゾンビが腕を振りかぶる音。当たる前に気づけるようにする
      case 'zswing':
        this.#env(gain, at, 0.02, 0.22, 0.55 * v);
        this.#noiseSource(at, 0.24, gain, { type: 'bandpass', from: 400, to: 1500, q: 0.9 });
        this.#tone('sawtooth', 120, 70, at, 0.2, gain);
        break;
      case 'die':
        this.#env(gain, at, 0.03, 0.75, 0.6 * v);
        this.#tone('sawtooth', 150, 40, at, 0.7, gain);
        this.#noiseSource(at, 0.7, gain, { type: 'lowpass', from: 900, to: 150 });
        break;
      case 'bow':
        this.#env(gain, at, 0.004, 0.22, 0.55 * v);
        this.#tone('triangle', 620, 180, at, 0.2, gain);
        this.#noiseSource(at, 0.1, gain, { type: 'highpass', from: 2200 });
        break;
      case 'dig':
        this.#env(gain, at, 0.01, 0.45, 0.6 * v);
        this.#noiseSource(at, 0.45, gain, { type: 'lowpass', from: 900, to: 220 });
        break;

      // 爆発・着地
      case 'explode':
        this.#env(gain, at, 0.005, 0.85, 1.0 * v);
        this.#noiseSource(at, 0.85, gain, { type: 'lowpass', from: 2400, to: 90 });
        this.#tone('sine', 120, 30, at, 0.6, gain);
        break;
      case 'slam':
        this.#env(gain, at, 0.004, 0.6, 1.0 * v);
        this.#noiseSource(at, 0.6, gain, { type: 'lowpass', from: 1400, to: 70 });
        this.#tone('sine', 90, 28, at, 0.5, gain);
        break;

      // プレイヤー
      case 'hurt':
        this.#env(gain, at, 0.004, 0.3, 0.8 * v);
        this.#tone('sawtooth', 200, 70, at, 0.28, gain);
        this.#noiseSource(at, 0.16, gain, { type: 'lowpass', from: 1000, to: 260 });
        break;
      case 'down':
        this.#env(gain, at, 0.02, 1.0, 0.85 * v);
        this.#tone('sawtooth', 260, 50, at, 0.95, gain);
        break;
      case 'revive':
        for (let i = 0; i < 3; i++) {
          const t = at + i * 0.1;
          this.#env(gain, t, 0.01, 0.3, 0.4 * v);
          this.#tone('sine', 440 * (1 + i * 0.25), 660 * (1 + i * 0.25), t, 0.28, gain);
        }
        break;
      case 'heal':
        this.#env(gain, at, 0.02, 0.4, 0.4 * v);
        this.#tone('sine', 520, 780, at, 0.38, gain);
        break;

      // 拡声器
      case 'megaphone': {
        // 「ピーッ」というハウリングのあと、力の湧くファンファーレが鳴る。
        // 使ったことが必ず分かるよう、長めで大きめにしてある
        this.#env(gain, at, 0.008, 0.3, 1.0 * v);
        this.#tone('square', 2100, 1100, at, 0.28, gain);
        this.#noiseSource(at, 0.12, gain, { type: 'bandpass', from: 2600, q: 3 });
        const chord = [392, 523, 659, 784, 1047];
        chord.forEach((f, i) => {
          const t = at + 0.24 + i * 0.07;
          this.#env(gain, t, 0.012, 0.75, 0.62 * v);
          this.#tone('square', f, f, t, 0.7, gain);
          this.#tone('triangle', f * 2, f * 2, t, 0.5, gain);
        });
        break;
      }
      case 'buffed':
        for (let i = 0; i < 5; i++) {
          const t = at + i * 0.07;
          this.#env(gain, t, 0.01, 0.45, 0.55 * v);
          this.#tone('triangle', 520 + i * 190, 780 + i * 190, t, 0.42, gain);
        }
        break;

      // 建てる・買う・画面
      case 'build':
        this.#env(gain, at, 0.002, 0.1, 0.6 * v);
        this.#noiseSource(at, 0.1, gain, { type: 'bandpass', from: 900, q: 1.5 });
        this.#env(gain, at + 0.11, 0.002, 0.13, 0.6 * v);
        this.#tone('square', 300, 160, at + 0.11, 0.12, gain);
        break;
      case 'break':
        this.#env(gain, at, 0.004, 0.4, 0.8 * v);
        this.#noiseSource(at, 0.4, gain, { type: 'lowpass', from: 2600, to: 300 });
        break;
      case 'coin':
        this.#env(gain, at, 0.005, 0.18, 0.4 * v);
        this.#tone('square', 1050, 1050, at, 0.06, gain);
        this.#env(gain, at + 0.07, 0.005, 0.24, 0.4 * v);
        this.#tone('square', 1570, 1570, at + 0.07, 0.2, gain);
        break;
      case 'ui':
        this.#env(gain, at, 0.003, 0.08, 0.35 * v);
        this.#tone('square', 720, 900, at, 0.07, gain);
        break;
      case 'wave':
        [330, 440, 550].forEach((f, i) => {
          const t = at + i * 0.14;
          this.#env(gain, t, 0.02, 0.42, 0.42 * v);
          this.#tone('sawtooth', f, f, t, 0.4, gain);
        });
        break;
      case 'ultimate':
        this.#env(gain, at, 0.02, 0.7, 0.65 * v);
        this.#tone('sawtooth', 160, 900, at, 0.5, gain);
        this.#noiseSource(at, 0.5, gain, { type: 'bandpass', from: 400, to: 3000, q: 1.2 });
        break;
      default:
        return false;
    }
    return true;
  }

  // 自分の操作の音。左右にふらない
  play(name, { volume = 1, pan = 0, delay = 0 } = {}) {
    if (!this.ready || this.muted || volume < 0.02) return;
    const now = this.ctx.currentTime;
    const last = this.lastAt.get(name) ?? -1;
    if (now - last < THROTTLE) return;
    this.lastAt.set(name, now);

    const gain = this.#out(volume, pan);
    if (!this.#render(name, gain, now + delay, volume)) return;
    // 鳴り終わったら片づける
    setTimeout(() => gain.disconnect(), 2500);
  }

  // 世界のどこかで鳴る音。遠いほど小さく、左右にふる
  playAt(name, position, { volume = 1 } = {}) {
    if (!this.ready || this.muted || !position) return;
    const dx = position.x - this.lp.x;
    const dy = position.y - this.lp.y;
    const dz = position.z - this.lp.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > MAX_DISTANCE) return;
    // 近すぎるところで急に大きくならないよう、なだらかに落とす
    const falloff = 1 / (1 + (dist * dist) / 70);
    const inv = dist || 1;
    const pan = clamp((dx * this.right.x + dy * this.right.y + dz * this.right.z) / inv, -1, 1) * 0.85;
    this.play(name, { volume: volume * falloff, pan });
  }
}

export const sfx = new Sfx();
