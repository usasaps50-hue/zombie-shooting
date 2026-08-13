import { ITEMS, SELECTABLE_ITEMS, MAX_SLOTS } from './data/items.js';
import { JOBS } from './data/jobs.js';

// 待機場の店。店員に話しかけると開く
export class Shop {
  constructor(icons, onChange) {
    this.icons = icons;
    this.onChange = onChange;
    this.el = document.getElementById('shop');
    this.titleEl = document.getElementById('shop-title');
    this.noteEl = document.getElementById('shop-note');
    this.listEl = document.getElementById('shop-list');
    this.keeperEl = document.getElementById('shop-keeper');
    this.kind = null;
    this.loadout = null;

    document.getElementById('shop-close').addEventListener('click', () => this.close());
  }

  get open() {
    return !this.el.classList.contains('hidden');
  }

  show(kind, loadout) {
    this.kind = kind;
    this.loadout = loadout;
    this.el.classList.remove('hidden');
    this.#render();
  }

  close() {
    this.el.classList.add('hidden');
    this.kind = null;
  }

  #render() {
    const render = { shopItem: () => this.#renderItems(), shopJob: () => this.#renderJobs(), levelUp: () => this.#renderLevelUp() };
    this.listEl.innerHTML = '';
    render[this.kind]?.();
  }

  #card(on, iconHtml, name, stat, action, onClick) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'card shop-card' + (on ? ' on' : '');
    card.innerHTML = `${iconHtml}
      <div class="shop-text">
        <div class="name">${name}</div>
        <div class="stat">${stat}</div>
      </div>
      <span class="shop-action">${action}</span>`;
    card.addEventListener('click', onClick);
    this.listEl.appendChild(card);
  }

  #renderItems() {
    this.titleEl.textContent = 'アイテムショップ';
    this.keeperEl.textContent = 'ハルさん';
    this.noteEl.textContent = `持てるのは${MAX_SLOTS}つまで。いまは全部むりょうで持っていけます（コインは次のアップデートで実装）。`;

    for (const id of SELECTABLE_ITEMS) {
      const item = ITEMS[id];
      const locked = item.jobOnly && item.jobOnly !== this.loadout.jobId;
      const on = this.loadout.items.includes(id);
      const stat = locked
        ? `${JOBS[item.jobOnly].name}せんよう`
        : item.kind === 'gun'
          ? `火力 ${item.damage} ／ 装弾数 ${item.magazine}発`
          : item.kind === 'build'
            ? '壁とタレットを建てる'
            : `火力 ${item.damage} ／ ${item.cooldown}秒に1回`;
      const action = locked ? '×' : on ? 'はずす' : '持っていく';

      this.#card(on, this.#icon(id), item.name, stat, action, () => {
        if (locked) return;
        const i = this.loadout.items.indexOf(id);
        if (i >= 0) this.loadout.items.splice(i, 1);
        else if (this.loadout.items.length < MAX_SLOTS) this.loadout.items.push(id);
        this.#render();
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
      this.#card(on, `<span class="shop-emoji">${job.id === 'medic' ? '✚' : job.id === 'architect' ? '⚒' : '★'}</span>`,
        job.name,
        `HP ${job.hp} ／ 移動 ${Math.round(job.speedScale * 100)}%　${job.desc}`,
        on ? 'えらび中' : 'これにする',
        () => {
          this.loadout.jobId = job.id;
          syncJobItems(this.loadout);
          this.#render();
          this.onChange();
        });
    }
  }

  #renderLevelUp() {
    this.titleEl.textContent = 'レベルアップ所';
    this.keeperEl.textContent = 'ゲンさん';
    this.noteEl.textContent = 'すまないね、ここはまだ工事中なんだ。';

    const box = document.createElement('div');
    box.className = 'wip';
    box.innerHTML = `<div class="wip-title">🚧 せいさくちゅう</div>
      <p>アイテムとクラスのレベルアップは、まだ作っている途中です。</p>
      <p>ゾンビを倒すと出るコインを集めて、ここで強くできるようにする予定です。</p>`;
    this.listEl.appendChild(box);
  }

  #icon(id) {
    const src = this.icons[id];
    return src
      ? `<img class="shop-icon" src="${src}" alt="">`
      : `<span class="shop-emoji">${ITEMS[id].icon}</span>`;
  }
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
