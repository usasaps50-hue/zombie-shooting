import { ITEMS } from './data/items.js';
import { MATERIALS } from './data/builds.js';
import { PLAYER } from './data/jobs.js';
import { IS_TOUCH } from './device.js';

const CYCLE_HINT = IS_TOUCH ? '「切替」で変更' : 'R で切替';
const ULT_HINT = IS_TOUCH ? '「必殺」' : 'Q';

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
    this.ultBar = document.getElementById('ult-bar');
    this.ultFill = document.getElementById('ult-fill');
    this.ultText = document.getElementById('ult-text');
    this.ultBtn = document.getElementById('btn-ult');
    this.hurt = document.getElementById('hurt');
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

    // 殴られた直後ほど濃く赤くして、そこから薄れていく
    const hurt = 1 - (player.time - player.hurtAt) / PLAYER.hurtTime;
    this.hurt.style.opacity = hurt > 0 ? Math.min(1, hurt).toFixed(3) : '0';

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

    // シャベルや包帯にはリロードも切替もないので、ボタンごと消す
    const cycles = item?.kind === 'build';
    this.reloadBtn.classList.toggle('hidden', !cycles && item?.kind !== 'gun');
    this.reloadBtn.textContent = cycles ? '切替' : 'R';

    this.#updateUlt(state.ult);
    this.#updateBuild(state.builder, cycles && !player.downed);

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

  #updateUlt(ult) {
    for (const el of [this.ultBar, this.ultText, this.ultBtn]) el.classList.toggle('hidden', !ult);
    if (!ult) return;

    const percent = Math.floor(ult.value * 100);
    this.ultFill.style.width = `${percent}%`;
    this.ultText.textContent = ult.ready
      ? `必殺 ${ult.def.name}（${ULT_HINT}）`
      : `必殺 ${ult.def.name} ${percent}%`;
    this.ultBar.classList.toggle('ready', ult.ready);
    this.ultBtn.classList.toggle('ready', ult.ready);
    this.ultBtn.style.setProperty('--charge', ult.value);
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
