import * as THREE from 'three';

// canvas は sRGB なので明示しないと色が線形として扱われ、白飛びする
export function canvasTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function paint(size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return { canvas, ctx: canvas.getContext('2d'), size };
}

// 汚れたまだら模様。服や肌のベースに使う
export function grungeTexture(base, dark, spot, density = 260) {
  const { canvas, ctx, size } = paint();
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < density; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? dark : spot;
    ctx.globalAlpha = 0.08 + Math.random() * 0.18;
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, 1 + Math.random() * 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return canvasTexture(canvas);
}

// まだら模様に加えて、縦に走る筋を入れる。盛り上がった筋肉に見せるため
export function muscleTexture(base, dark, spot, density = 200) {
  const { canvas, ctx, size } = paint();
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 10; i++) {
    const x = Math.random() * size;
    ctx.strokeStyle = dark;
    ctx.globalAlpha = 0.12 + Math.random() * 0.15;
    ctx.lineWidth = 2 + Math.random() * 4;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x + 10, size * 0.3, x - 10, size * 0.6, x, size);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < density; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? dark : spot;
    ctx.globalAlpha = 0.06 + Math.random() * 0.16;
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, 1 + Math.random() * 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return canvasTexture(canvas);
}

export { paint };
