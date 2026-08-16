import * as THREE from 'three';

// 頭の上に出る文字。ゾンビのHPにも建造物のHPにも使う
export function makeLabel(scale = 1.4) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(scale, scale / 4, 1);

  const draw = (text, color = '#ffffff') => {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 64);
    let size = 40;
    do {
      ctx.font = `bold ${size}px system-ui, sans-serif`;
      size -= 2;
    } while (ctx.measureText(text).width > 240 && size > 12);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(0,0,0,.7)';
    ctx.strokeText(text, 128, 32);
    ctx.fillStyle = color;
    ctx.fillText(text, 128, 32);
    texture.needsUpdate = true;
  };

  const dispose = () => {
    texture.dispose();
    material.dispose();
  };

  return { sprite, draw, dispose };
}

// 頭の上に出るふきだし。チャットで話した言葉をしばらく浮かべる
const BUBBLE_W = 512;
const BUBBLE_H = 192;
const BUBBLE_LINE = 34;

export function makeBubble() {
  const canvas = document.createElement('canvas');
  canvas.width = BUBBLE_W;
  canvas.height = BUBBLE_H;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.visible = false;

  // 角の丸い四角。古い Safari は roundRect を持っていないので自分で描く
  const roundRect = (ctx, x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  // 入りきらない言葉は折り返す。最大3行で、あふれたぶんは「…」にする
  const wrap = (ctx, text, maxWidth) => {
    const lines = [];
    let line = '';
    for (const ch of text) {
      if (ctx.measureText(line + ch).width <= maxWidth) {
        line += ch;
        continue;
      }
      lines.push(line);
      line = ch;
      if (lines.length === 3) break;
    }
    if (lines.length < 3 && line) lines.push(line);
    if (lines.length === 3 && line && !lines.includes(line)) lines[2] = `${lines[2].slice(0, -1)}…`;
    return lines.slice(0, 3);
  };

  const draw = (text) => {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, BUBBLE_W, BUBBLE_H);
    ctx.font = '600 30px system-ui, sans-serif';
    const lines = wrap(ctx, text, BUBBLE_W - 80);
    const width = Math.min(BUBBLE_W - 20, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 56);
    const height = lines.length * BUBBLE_LINE + 30;
    const x = (BUBBLE_W - width) / 2;
    const y = BUBBLE_H - height - 26;

    ctx.fillStyle = 'rgba(16, 21, 28, .88)';
    ctx.strokeStyle = 'rgba(150, 175, 200, .55)';
    ctx.lineWidth = 3;
    roundRect(ctx, x, y, width, height, 18);
    ctx.fill();
    ctx.stroke();

    // 下向きのしっぽ。話している人を指す
    ctx.beginPath();
    ctx.moveTo(BUBBLE_W / 2 - 14, y + height - 1);
    ctx.lineTo(BUBBLE_W / 2, y + height + 22);
    ctx.lineTo(BUBBLE_W / 2 + 14, y + height - 1);
    ctx.closePath();
    ctx.fillStyle = 'rgba(16, 21, 28, .88)';
    ctx.fill();

    ctx.fillStyle = '#eaf0f6';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((l, i) => {
      ctx.fillText(l, BUBBLE_W / 2, y + 16 + BUBBLE_LINE * (i + 0.5));
    });
    texture.needsUpdate = true;
  };

  const dispose = () => {
    texture.dispose();
    material.dispose();
  };

  return { sprite, draw, dispose };
}

// 残りHPの割合で色を変える。半分を切ると赤くなる
export function hpColor(hp, maxHp) {
  return hp > maxHp / 2 ? '#d8f0c0' : '#ffc0c0';
}
