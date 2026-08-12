import * as THREE from 'three';
import { BUILDS, BUILD_ORDER, MATERIALS, WALL_SIZE } from './data/builds.js';
import { createGhost, createStructure, overlaps, costText } from './structures.js';

const PLACE_DISTANCE = 3.4;
const GRID = 1.2;

// 見ている方向を4方向に丸めて、壁が斜めに生えないようにする
function snapYaw(yaw) {
  return Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2);
}

export class Builder {
  constructor(scene, colliders, materials) {
    this.scene = scene;
    this.colliders = colliders;
    this.materials = { ...materials };
    this.structures = [];
    this.typeId = BUILD_ORDER[0];
    this.ghost = null;
    this.ghostValid = false;
    this.ghostYaw = 0;
    this.ghostPos = new THREE.Vector3();
  }

  get def() {
    return BUILDS[this.typeId];
  }

  cycleType(step = 1) {
    const i = BUILD_ORDER.indexOf(this.typeId);
    this.typeId = BUILD_ORDER[(i + step + BUILD_ORDER.length) % BUILD_ORDER.length];
    this.#clearGhost();
    return this.def;
  }

  add(materialId, amount) {
    this.materials[materialId] = (this.materials[materialId] ?? 0) + amount;
  }

  canAfford(typeId = this.typeId) {
    return Object.entries(BUILDS[typeId].cost).every(([id, n]) => (this.materials[id] ?? 0) >= n);
  }

  missingText(typeId = this.typeId) {
    return Object.entries(BUILDS[typeId].cost)
      .filter(([id, n]) => (this.materials[id] ?? 0) < n)
      .map(([id, n]) => `${MATERIALS[id].name}${n - (this.materials[id] ?? 0)}`)
      .join('・');
  }

  #clearGhost() {
    if (!this.ghost) return;
    this.scene.remove(this.ghost);
    this.ghost.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.dispose();
      o.material.dispose();
    });
    this.ghost = null;
  }

  hideGhost() {
    this.#clearGhost();
  }

  // 足元のグリッドに合わせた設置予定地を毎フレーム更新する
  aim(camera, playerPosition) {
    if (!this.ghost) {
      this.ghost = createGhost(this.typeId);
      this.scene.add(this.ghost);
    }
    const dir = camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
    const spot = playerPosition.clone().addScaledVector(dir, PLACE_DISTANCE);
    this.ghostPos.set(Math.round(spot.x / GRID) * GRID, 0, Math.round(spot.z / GRID) * GRID);
    this.ghostYaw = snapYaw(Math.atan2(-dir.x, -dir.z));

    this.ghost.position.copy(this.ghostPos);
    this.ghost.rotation.y = this.ghostYaw;
    this.ghost.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(this.ghost);
    const blocked = overlaps(box, this.colliders, this.structures);
    const tooClose = this.ghostPos.distanceTo(new THREE.Vector3(playerPosition.x, 0, playerPosition.z)) < 1.2;
    this.ghostValid = !blocked && !tooClose && this.canAfford();

    const color = this.ghostValid ? 0x7fffa0 : 0xff6b6b;
    this.ghost.traverse((o) => { if (o.isMesh) o.material.color.setHex(color); });
  }

  place() {
    if (!this.canAfford()) return { ok: false, message: `${this.missingText()}が足りない` };
    if (!this.ghostValid) return { ok: false, message: 'ここには建てられない' };

    const structure = createStructure(this.typeId, this.ghostPos, this.ghostYaw);
    this.scene.add(structure.root);
    structure.refreshBox();
    this.structures.push(structure);

    for (const [id, n] of Object.entries(this.def.cost)) this.materials[id] -= n;
    return { ok: true, message: `${this.def.name}を建てた（${costText(this.typeId)}）` };
  }

  removeDead() {
    for (let i = this.structures.length - 1; i >= 0; i--) {
      const s = this.structures[i];
      if (s.alive) continue;
      this.scene.remove(s.root);
      s.dispose();
      this.structures.splice(i, 1);
    }
  }

  clear() {
    for (const s of this.structures) {
      this.scene.remove(s.root);
      s.dispose();
    }
    this.structures.length = 0;
    this.#clearGhost();
  }
}

export { WALL_SIZE };
