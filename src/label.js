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

// 残りHPの割合で色を変える。半分を切ると赤くなる
export function hpColor(hp, maxHp) {
  return hp > maxHp / 2 ? '#d8f0c0' : '#ffc0c0';
}
