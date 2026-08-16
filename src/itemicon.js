import * as THREE from 'three';
import { createItemMesh } from './viewmodel.js';

// アイコンとして一番それらしく見える角度。銃は横向き、柄物は斜めに立てる
const POSE = {
  pistol: [0.18, -Math.PI / 2 - 0.35, 0],
  ak47: [0.16, -Math.PI / 2 - 0.3, 0],
  shovel: [0.1, 0.5, 0.7],
  hammer: [0.1, 0.5, 0.7],
  bandage: [0.5, 0.4, 0],
  megaphone: [0.18, -Math.PI / 2 - 0.5, 0],
  team: [0.1, 0.5, 0.6],
  knife: [0.15, -Math.PI / 2 - 0.4, 0.5],
  reborn: [0.1, 0.4, 0.6],
  death: [0.1, 0.4, 0.6],
};

// 絵文字の代わりに、実際の3Dモデルを小さく描いて画像にする。
// ゲーム中に持つ武器とHUDの絵が必ず一致する
export function makeItemIcons(ids, size = 96) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    // toDataURL で読むので、描いた内容を残しておく必要がある
    preserveDrawingBuffer: true,
  });
  renderer.setSize(size, size);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xf0f6ff, 0x404858, 2.2));
  const key = new THREE.DirectionalLight(0xfff4e2, 2.6);
  key.position.set(3, 5, 6);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x9fc4ff, 1.0);
  fill.position.set(-4, 1, -3);
  scene.add(fill);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 30);
  const icons = {};

  // "pistol:gold" のように書くと、レベル5の金色版を描く
  for (const key of ids) {
    const [id, variant] = key.split(':');
    const mesh = createItemMesh(id, variant === 'gold', variant === 'silencer' || variant === 'gold');
    mesh.rotation.set(...(POSE[id] ?? [0.2, 0.6, 0]));
    scene.add(mesh);
    mesh.updateMatrixWorld(true);

    // モデルの大きさに合わせて枠を決めるので、どのアイテムも同じ余白で収まる
    const sphere = new THREE.Box3().setFromObject(mesh).getBoundingSphere(new THREE.Sphere());
    const r = sphere.radius * 1.1;
    camera.left = -r;
    camera.right = r;
    camera.top = r;
    camera.bottom = -r;
    camera.position.copy(sphere.center).add(new THREE.Vector3(0, 0, 8));
    camera.lookAt(sphere.center);
    camera.updateProjectionMatrix();

    renderer.render(scene, camera);
    icons[key] = renderer.domElement.toDataURL('image/png');

    scene.remove(mesh);
    mesh.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.dispose();
      o.material.dispose();
    });
  }

  renderer.dispose();
  return icons;
}
