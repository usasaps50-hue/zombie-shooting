import { ITEMS, SELECTABLE_ITEMS, MAX_SLOTS } from './data/items.js';
import { JOBS } from './data/jobs.js';
import { UPGRADES, MAX_LEVEL, DAMAGE_PER_LEVEL } from './data/upgrades.js';
import { progress, levelOf, upgradeStatus, upgrade } from './progress.js';

const JOB_MARK = { soldier: '★', medic: '✚', architect: '⚒' };

// 待機場の店。店員に話しかけると開く。
// 品物は1行ずつの縦リストにして、数が増えてもスクロールで足りるようにしてある
export class Shop {
  constructor(icons, { onChange, onBattle }) {
    this.icons = icons;
    this.onChange = onChange;
    this.onBattle = onBattle;
    this.el = document.getElementById('shop');
    this.titleEl = document.getElementById('shop-title');
    this.noteEl = document.getElementById('shop-note');
    this.listEl = document.getElementById('shop-list');
    this.keeperEl = document.getElementById('shop-keeper');
    this.coinsEl = document.getElementById('shop-coins');
    this.closeBtn = document.getElementById('shop-close');
    this.kind = null;
    this.loadout = null;

    this.closeBtn.addEventListener('click', () => this.close());
  }

  get open() {
    return !this.el.classList.contains('hidden');
  }

  show(kind, loadout) {
    this.kind = kind;
    this.loadout = loadout;
    this.el.classList.remove('hidden');
    this.render();
  }

  close() {
    this.el.classList.add('hidden');
    this.kind = null;
  }

  render() {
    const render = {
      shopItem: () => this.#renderItems(),
      shopJob: () => this.#renderJobs(),
      levelUp: () => this.#renderLevelUp(),
      battle: () => this.#renderBattle(),
    };
    this.listEl.innerHTML = '';
    this.coinsEl.textContent = `🪙 ${progress.coins}`;
    // バトルゲートでは「出発する」が主役なので、閉じるボタンは控えめにする
    const gate = this.kind === 'battle';
    this.closeBtn.textContent = gate ? 'やめる' : '話を終える';
    this.closeBtn.classList.toggle('primary', !gate);
    this.closeBtn.classList.toggle('ghost', gate);
    render[this.kind]?.();
  }

  #row(on, iconHtml, name, stat, action, onClick) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'card shop-card' + (on ? ' on' : '');
    row.innerHTML = `${iconHtml}
      <div class="shop-text">
        <div class="name">${name}</div>
        <div class="stat">${stat}</div>
      </div>
      <span class="shop-action">${action}</span>`;
    row.addEventListener('click', onClick);
    this.listEl.appendChild(row);
    return row;
  }

  #icon(id) {
    const gold = levelOf(id) >= MAX_LEVEL;
    const src = this.icons[gold ? `${id}:gold` : id] ?? this.icons[id];
    // アイテムショップの一覧に合わせて、共通のふるまいにしておく
    return src
      ? `<img class="shop-icon" src="${src}" alt="">`
      : `<span class="shop-emoji">${ITEMS[id].icon}</span>`;
  }

  #renderItems() {
    this.titleEl.textContent = 'アイテムショップ';
    this.keeperEl.textContent = 'ハルさん';
    this.noteEl.textContent = `持てるのは${MAX_SLOTS}つまで。いまは全部むりょうで持っていけます。`;

    for (const id of SELECTABLE_ITEMS) {
      const item = ITEMS[id];
      const locked = item.jobOnly && item.jobOnly !== this.loadout.jobId;
      const on = this.loadout.items.includes(id);
      const level = levelOf(id);
      const stat = locked
        ? `${JOBS[item.jobOnly].name}せんよう`
        : item.kind === 'gun'
          ? `Lv${level}　火力 ${item.damage} ／ 装弾数 ${item.magazine}発`
          : item.kind === 'build'
            ? '壁とタレットを建てる'
            : `Lv${level}　火力 ${item.damage} ／ ${item.cooldown}秒に1回`;

      this.#row(on, this.#icon(id), item.name, stat, locked ? '×' : on ? 'はずす' : '持つ', () => {
        if (locked) return;
        const i = this.loadout.items.indexOf(id);
        if (i >= 0) this.loadout.items.splice(i, 1);
        else if (this.loadout.items.length < MAX_SLOTS) this.loadout.items.push(id);
        this.render();
        this.onChange();
      });
    }
  }

  #renderJobs() {
    this.titleEl.textContent = 'クラスショップ';
    this.keeperEl.textContent = 'ミナさん';
    this.noteEl.textContent = 'クラスを変えると、せんようアイテムが自動でついてきます。';

    for (const job of Object.values(JOBS)) {
      const on = job.id === this.loadout.jobId;
      this.#row(on, `<span class="shop-emoji">${JOB_MARK[job.id] ?? '★'}</span>`, job.name,
        `HP ${job.hp} ／ 移動 ${Math.round(job.speedScale * 100)}%　${job.desc}`,
        on ? 'えらび中' : 'する', () => {
          this.loadout.jobId = job.id;
          syncJobItems(this.loadout);
          this.render();
          this.onChange();
        });
    }
  }

  #renderLevelUp() {
    this.titleEl.textContent = 'レベルアップ所';
    this.keeperEl.textContent = 'ゲンさん';
    this.noteEl.textContent = 'ゾンビを倒すとコインが手に入る。武器はレベル5まで、1つ上がるごとに火力も5%増えるよ。';

    for (const id of Object.keys(UPGRADES)) {
      const level = levelOf(id);
      const status = upgradeStatus(id);
      const power = `火力+${Math.round(DAMAGE_PER_LEVEL * (level - 1) * 100)}%`;
      const next = status.max
        ? 'これ以上は上がらない（最大）'
        : UPGRADES[id].levels[level].desc;
      const stat = `Lv${level} / ${MAX_LEVEL}　${power}<br><span class="shop-next">次：${next}</span>`;
      const action = status.max ? 'MAX' : status.locked ? '🔒' : `🪙${status.cost}`;

      const row = this.#row(false, this.#icon(id), ITEMS[id].name, stat, action, () => {
        if (status.max) return;
        if (status.locked) {
          this.noteEl.textContent = `それには ${ITEMS[status.locked.id].name} を Lv${status.locked.level} にしないとね。`;
          return;
        }
        if (!upgrade(id)) {
          this.noteEl.textContent = `コインが ${status.cost - progress.coins} 枚たりないよ。`;
          return;
        }
        this.noteEl.textContent = `${ITEMS[id].name}が Lv${levelOf(id)} になった！`;
        this.render();
        this.onChange();
      });
      if (!status.max && (status.locked || !status.afford)) row.classList.add('cant');
    }

    const note = document.createElement('p');
    note.className = 'hint';
    note.textContent = 'AK47のLv3はピストルをLv5にすると開放されます。ソードはまだ制作中です。';
    this.listEl.appendChild(note);
  }

  #renderBattle() {
    this.titleEl.textContent = 'バトルゲート';
    this.keeperEl.textContent = '';
    this.noteEl.textContent = '合言葉を決めて出発します。同じ合言葉の人と同じ部屋になります（通信は次のステップ）。';
    const form = document.createElement('div');
    form.className = 'gate-form';
    form.innerHTML = `
      <label for="gate-pass">合言葉</label>
      <div class="pass-row">
        <input id="gate-pass" type="text" maxlength="16" autocomplete="off" value="${this.loadout.passphrase}">
        <button id="gate-random" class="ghost" type="button">ランダム</button>
      </div>
      <div class="gate-summary">
        <span>${JOBS[this.loadout.jobId].name}</span>
        <span>${this.loadout.items.map((id) => `${ITEMS[id].name} Lv${levelOf(id)}`).join('　')}</span>
      </div>
      <button id="gate-go" class="primary" type="button">バトルに出発する</button>`;
    this.listEl.appendChild(form);

    const input = form.querySelector('#gate-pass');
    form.querySelector('#gate-random').addEventListener('click', () => {
      input.value = randomPass();
    });
    form.querySelector('#gate-go').addEventListener('click', () => {
      this.loadout.passphrase = input.value.trim() || 'ひとり';
      this.close();
      this.onBattle();
    });
  }
}

const WORDS = ['あかつき', 'ゾンビ', 'シャベル', 'まんげつ', 'ひまわり', 'かみなり', 'こもれび', 'てっぺき'];

export function randomPass() {
  return WORDS[Math.floor(Math.random() * WORDS.length)] + Math.floor(10 + Math.random() * 90);
}

// 職業専用アイテムは、その職業のときだけ持たせる
export function syncJobItems(loadout) {
  loadout.items = loadout.items.filter((id) => !ITEMS[id].jobOnly || ITEMS[id].jobOnly === loadout.jobId);
  for (const id of SELECTABLE_ITEMS) {
    const item = ITEMS[id];
    if (item.jobOnly === loadout.jobId && !loadout.items.includes(id)) {
      if (loadout.items.length >= MAX_SLOTS) loadout.items.pop();
      loadout.items.unshift(id);
    }
  }
}
