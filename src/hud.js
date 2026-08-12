import { ITEMS } from './data/items.js';
import { MATERIALS } from './data/builds.js';
import { IS_TOUCH } from './device.js';

const CYCLE_HINT = IS_TOUCH ? '「切替」で変更' : 'R で切替';

export class Hud {
  constructor() {
    this.el = document.getElementById('hud');
    this.hpFill = document.getElementById('hp-fill');
    this.hpText = document.getElementById('hp-text');
    this.invuln = document.getElementById('invuln');
    this.ammo = document.getElementById('ammo-text');
    this.slots = document.getElementById('slots');
    this.prompt = document.getElementById('prompt');
    this.promptText = document.getElementById('prompt-text');
    this.holdFill = document.getElementById('hold-fill');
    this.toast = document.getElementById('toast');
    this.materials = document.getElementById('materials');
    this.buildInfo = document.getElementById('build-info');
    this.touchSlots = [0, 1, 2].map((i) => document.getElementById(`btn-slot-${i}`));
    this.reloadBtn = document.getElementById('btn-reload');
    this.toastTimer = 0;
    this.slotIds = [];
  }

  show() { this.el.classList.remove('hidden'); }
  hide() { this.el.classList.add('hidden'); }

  buildSlots(itemIds) {
    this.slotIds = itemIds;
    this.slots.innerHTML = '';
    itemIds.forEach((id, i) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="key">${i + 1}</span>${ITEMS[id].icon} ${ITEMS[id].name}`;
      this.slots.appendChild(li);
    });
    // スマホは番号だけだと何を持つか分からないので、アイコンと名前を出す
    this.touchSlots.forEach((btn, i) => {
      const item = ITEMS[itemIds[i]];
      btn.classList.toggle('hidden', !item);
      if (item) btn.innerHTML = `<span class="ic">${item.icon}</span>${item.name}`;
    });
  }

  setToast(text, seconds = 1.6) {
    this.toast.textContent = text;
    this.toast.classList.remove('hidden');
    this.toastTimer = seconds;
  }

  update(dt, state) {
    const { player, weapons, promptText, holdProgress } = state;

    this.hpFill.style.width = `${(player.hp / player.maxHp) * 100}%`;
    this.hpText.textContent = player.downed ? 'ダウン' : Math.round(player.hp);
    this.invuln.classList.toggle('hidden', !player.invulnerable);

    const item = weapons.current;
    const st = weapons.currentState;
    if (item?.kind === 'gun') {
      this.ammo.textContent = `${st.ammo} / ${item.magazine}`;
    } else if (item) {
      this.ammo.textContent = item.icon;
    } else {
      this.ammo.textContent = '';
    }

    [...this.slots.children].forEach((li, i) => li.classList.toggle('on', i === weapons.index));
    this.touchSlots.forEach((btn, i) => btn.classList.toggle('on', i === weapons.index));
    this.reloadBtn.textContent = item?.kind === 'build' ? '切替' : 'R';

    this.#updateBuild(state.builder, item?.kind === 'build' && !player.downed);

    if (promptText) {
      this.prompt.classList.remove('hidden');
      this.promptText.textContent = promptText;
      this.holdFill.style.width = `${(holdProgress ?? 0) * 100}%`;
    } else {
      this.prompt.classList.add('hidden');
    }

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toast.classList.add('hidden');
    }
  }

  #updateBuild(builder, holdingHammer) {
    this.materials.classList.toggle('hidden', !builder);
    this.buildInfo.classList.toggle('hidden', !builder || !holdingHammer);
    if (!builder) return;

    this.materials.textContent = Object.values(MATERIALS)
      .map((m) => `${m.name} ${builder.materials[m.id] ?? 0}`)
      .join('　');

    if (!holdingHammer) return;
    const cost = Object.entries(builder.def.cost)
      .map(([id, n]) => `${MATERIALS[id].name}${n}`)
      .join('＋');
    this.buildInfo.textContent = `${builder.def.name}（${cost}）　${CYCLE_HINT}`;
    this.buildInfo.classList.toggle('short', !builder.canAfford());
  }
}
