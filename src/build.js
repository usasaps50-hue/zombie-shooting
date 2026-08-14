import * as THREE from 'three';
import { BUILDS, BUILD_ORDER, MATERIALS, WALL_SIZE } from './data/builds.js';
import { createGhost, createStructure, overlaps, costText } from './structures.js';
import { floorHeight, EYE_HEIGHT } from './player.js';

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
    const x = Math.round(spot.x / GRID) * GRID;
    const z = Math.round(spot.z / GRID) * GRID;
    // 高台の上にも建てられるよう、その場所の床の高さに合わせる
    const feet = playerPosition.y - EYE_HEIGHT;
    this.ghostPos.set(x, floorHeight(this.colliders, x, z, feet + 0.4), z);
    this.ghostYaw = snapYaw(Math.atan2(-dir.x, -dir.z));

    this.ghost.position.copy(this.ghostPos);
    this.ghost.rotation.y = this.ghostYaw;
    this.ghost.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(this.ghost);
    const blocked = overlaps(box, this.colliders, this.structures);
    const tooClose = Math.hypot(this.ghostPos.x - playerPosition.x, this.ghostPos.z - playerPosition.z) < 1.2;
    this.ghostValid = !blocked && !tooClose && this.canAfford();

    const color = this.ghostValid ? 0x7fffa0 : 0xff6b6b;
    this.ghost.traverse((o) => { if (o.isMesh) o.material.color.setHex(color); });
  }

  count(typeId) {
    return this.structures.filter((s) => s.def.id === typeId).length;
  }

  // 上限まで置いてあるときは、その種類の一番古いものを撤去して場所を空ける
  enforceLimit(typeId) {
    const { limit } = BUILDS[typeId];
    if (!limit || this.count(typeId) < limit) return false;
    const oldest = this.structures.find((s) => s.def.id === typeId);
    this.remove(oldest);
    return true;
  }

  remove(structure) {
    const i = this.structures.indexOf(structure);
    if (i < 0) return;
    this.structures.splice(i, 1);
    this.scene.remove(structure.root);
    structure.dispose();
  }

  // いま建てられるか。オンラインでは、建てる前にこれだけ先に確かめる
  canPlace() {
    if (!this.canAfford()) return { ok: false, message: `${this.missingText()}が足りない` };
    if (!this.ghostValid) return { ok: false, message: 'ここには建てられない' };
    return { ok: true, message: '' };
  }

  payFor(typeId = this.typeId) {
    for (const [id, n] of Object.entries(BUILDS[typeId].cost)) this.materials[id] -= n;
  }

  place() {
    const check = this.canPlace();
    if (!check.ok) return check;

    const replaced = this.enforceLimit(this.typeId);
    const structure = createStructure(this.typeId, this.ghostPos, this.ghostYaw);
    this.scene.add(structure.root);
    structure.refreshBox();
    this.structures.push(structure);

    this.payFor();
    const suffix = replaced
      ? `（上限${this.def.limit}個 — 古いものが消えた）`
      : `（${costText(this.typeId)}）`;
    return { ok: true, structure, message: `${this.def.name}を建てた${suffix}` };
  }

  removeDead() {
    for (let i = this.structures.length - 1; i >= 0; i--) {
      const s = this.structures[i];
      if (!s.alive) this.remove(s);
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
