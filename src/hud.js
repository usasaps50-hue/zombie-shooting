import { ITEMS } from './data/items.js';
import { MATERIALS } from './data/builds.js';
import { PLAYER } from './data/jobs.js';
import { MAX_LEVEL } from './data/upgrades.js';
import { levelOf } from './progress.js';
import { IS_TOUCH } from './device.js';

const CYCLE_HINT = IS_TOUCH ? '「切替」で変更' : 'R で切替';
const ULT_READY = IS_TOUCH ? '準備OK' : 'Q で発動';
const SKILL_READY = IS_TOUCH ? '準備OK' : 'F で発動';

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
    this.touchSlots = [0, 1, 2, 3].map((i) => document.getElementById(`btn-slot-${i}`));
    this.reloadBtn = document.getElementById('btn-reload');
    this.ultBar = document.getElementById('ult-bar');
    this.ultFill = document.getElementById('ult-fill');
    this.ultText = document.getElementById('ult-text');
    this.ultBtn = document.getElementById('btn-ult');
    this.skillText = document.getElementById('skill-text');
    this.skillBtn = document.getElementById('btn-skill');
    this.coinText = document.getElementById('coin-text');
    this.aimBtn = document.getElementById('btn-aim');
    this.waveNum = document.getElementById('wave-num');
    this.waveLeft = document.getElementById('wave-left');
    this.hurt = document.getElementById('hurt');
    this.toastTimer = 0;
    this.slotIds = [];
    this.icons = {};
  }

  // 絵文字ではなく、実際の武器モデルを描いた画像を使う
  setIcons(icons) {
    this.icons = icons;
  }

  #iconHtml(id, cls) {
    // レベル5まで育てた武器は金色の絵になる
    const src = this.icons[levelOf(id) >= MAX_LEVEL ? `${id}:gold` : id] ?? this.icons[id];
    return src
      ? `<img class="${cls}" src="${src}" alt="">`
      : `<span class="${cls}">${ITEMS[id].icon}</span>`;
  }

  // 待機場では体力や弾ではなく、話しかけられる相手だけ出す
  updateHub(dt, promptText) {
    this.prompt.classList.toggle('hidden', !promptText);
    if (promptText) {
      this.promptText.textContent = promptText;
      this.holdFill.style.width = '100%';
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toast.classList.add('hidden');
    }
  }

  show() { this.el.classList.remove('hidden'); }
  hide() { this.el.classList.add('hidden'); }

  // 構えるボタンは、銃を持っているときだけ出す
  setAiming(canAim, aiming) {
    this.aimBtn.classList.toggle('hidden', !canAim);
    this.aimBtn.classList.toggle('on', !!aiming);
  }

  buildSlots(itemIds, slots = 3) {
    this.slotIds = itemIds;
    this.slotCount = slots;
    this.slots.innerHTML = '';
    itemIds.forEach((id, i) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="key">${i + 1}</span>${this.#iconHtml(id, 'slot-icon')}<span class="slot-name">${ITEMS[id].name}</span>`;
      this.slots.appendChild(li);
    });
    // スマホは番号だけだと何を持つか分からないので、アイコンと名前を出す
    this.touchSlots.forEach((btn, i) => {
      const id = itemIds[i];
      btn.classList.toggle('hidden', !id);
      if (id) btn.innerHTML = `${this.#iconHtml(id, 'slot-icon')}${ITEMS[id].name}`;
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
    // 弾数は銃のときだけ。それ以外は下のアイテム欄を見れば分かる
    this.ammo.textContent = item?.kind === 'gun' ? `${st.ammo} / ${item.magazine}` : '';

    [...this.slots.children].forEach((li, i) => li.classList.toggle('on', i === weapons.index));
    this.touchSlots.forEach((btn, i) => btn.classList.toggle('on', i === weapons.index));

    // シャベルや包帯にはリロードも切替もないので、ボタンごと消す
    const cycles = item?.kind === 'build';
    this.reloadBtn.classList.toggle('hidden', !cycles && item?.kind !== 'gun');
    this.reloadBtn.textContent = cycles ? '切替' : 'R';

    this.#updateWave(state.waves);
    this.#updateUlt(state.ult);
    this.#updateSkill(state.skill);
    this.coinText.textContent = `🪙 ${state.coins ?? 0}`;
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

    const percent = Math.floor(ult.progress * 100);
    this.ultFill.style.width = `${percent}%`;
    // 2回ためられるクラスでは、たまっている回数も出す
    const stock = ult.stock > 1 ? `×${ult.charges} ` : '';
    this.ultText.textContent = ult.ready
      ? `${ult.def.name}　${stock}${ULT_READY}`
      : `${ult.def.name}　${percent}%`;
    this.ultBar.classList.toggle('ready', ult.ready);
    this.ultBtn.classList.toggle('ready', ult.ready);
    this.ultBtn.style.setProperty('--charge', ult.progress);
  }

  #updateWave(waves) {
    if (!waves) return;
    // ウェーブとウェーブの間は、次が始まるまでの秒数を出す
    if (waves.state === 'break') {
      this.waveNum.textContent = waves.wave ? `ウェーブ ${waves.wave} クリア` : '準備';
      this.waveLeft.textContent = `次まで ${Math.ceil(Math.max(0, waves.timer))}秒`;
      return;
    }
    this.waveNum.textContent = `ウェーブ ${waves.wave}`;
    this.waveLeft.textContent = `残り ${waves.remaining} / ${waves.total}`;
  }

  // シャベルLv3以上のときだけ出る、攻撃を当てて貯めるスキル
  #updateSkill(skill) {
    this.skillText.classList.toggle('hidden', !skill);
    this.skillBtn.classList.toggle('hidden', !skill);
    if (!skill) return;

    const ratio = Math.min(1, skill.charge / skill.need);
    this.skillText.textContent = skill.ready
      ? `${skill.name}　${SKILL_READY}`
      : `${skill.name}　${skill.charge}/${skill.need}`;
    this.skillBtn.classList.toggle('ready', skill.ready);
    this.skillBtn.style.setProperty('--charge', ratio);
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
    // 上限まで置いてあると、次に建てたとき古いものが消えることを示す
    const placed = builder.count(builder.def.id);
    const limit = builder.def.limit ? `　${placed}/${builder.def.limit}` : '';
    this.buildInfo.textContent = `${builder.def.name}（${cost}）${limit}　${CYCLE_HINT}`;
    this.buildInfo.classList.toggle('short', !builder.canAfford());
  }
}
