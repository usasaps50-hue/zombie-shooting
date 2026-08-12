import { ITEMS, SELECTABLE_ITEMS, MAX_SLOTS } from './data/items.js';
import { JOBS } from './data/jobs.js';

const WORDS = ['あかつき', 'ゾンビ', 'シャベル', 'まんげつ', 'ひまわり', 'かみなり', 'こもれび', 'てっぺき'];

export class Lobby {
  constructor(onStart) {
    this.onStart = onStart;
    this.jobId = 'soldier';
    this.selected = ['pistol', 'shovel'];
    this.el = document.getElementById('lobby');

    this.passInput = document.getElementById('passphrase');
    this.jobsEl = document.getElementById('jobs');
    this.itemsEl = document.getElementById('items');
    this.slotCountEl = document.getElementById('slot-count');
    this.membersEl = document.getElementById('members');
    this.extraEl = document.getElementById('job-extra');
    this.startBtn = document.getElementById('btn-start');

    this.passInput.value = this.#randomPass();
    document.getElementById('btn-random').addEventListener('click', () => {
      this.passInput.value = this.#randomPass();
    });
    this.passInput.addEventListener('input', () => this.#renderMembers());
    this.startBtn.addEventListener('click', () => this.#start());

    this.#renderJobs();
    this.#renderItems();
    this.#renderMembers();
  }

  show() {
    this.el.classList.remove('hidden');
  }

  hide() {
    this.el.classList.add('hidden');
  }

  #randomPass() {
    return WORDS[Math.floor(Math.random() * WORDS.length)] + Math.floor(10 + Math.random() * 90);
  }

  #renderJobs() {
    this.jobsEl.innerHTML = '';
    for (const job of Object.values(JOBS)) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'card' + (job.id === this.jobId ? ' on' : '');
      card.innerHTML = `<div class="name">${job.name}</div>
        <div class="desc">${job.desc}</div>
        <div class="stat">HP ${job.hp} ／ 移動 ${Math.round(job.speedScale * 100)}%</div>`;
      card.addEventListener('click', () => {
        this.jobId = job.id;
        this.#syncJobItems();
        this.#renderJobs();
        this.#renderItems();
        this.#renderExtra();
        this.#renderMembers();
      });
      this.jobsEl.appendChild(card);
    }
    this.#renderExtra();
  }

  // 職業専用アイテムは、その職業のときだけ持たせる
  #syncJobItems() {
    this.selected = this.selected.filter((id) => !ITEMS[id].jobOnly || ITEMS[id].jobOnly === this.jobId);
    for (const id of SELECTABLE_ITEMS) {
      const item = ITEMS[id];
      if (item.jobOnly === this.jobId && !this.selected.includes(id)) {
        if (this.selected.length >= MAX_SLOTS) this.selected.pop();
        this.selected.unshift(id);
      }
    }
  }

  #renderExtra() {
    const job = JOBS[this.jobId];
    this.extraEl.textContent = job.bandages
      ? `${ITEMS.bandage.name}は装備枠とは別に${job.bandages}つ所持（毎ウェーブ+${job.bandagesPerWave}）。自分に使うとHP+${ITEMS.bandage.heal}、倒れた味方には${ITEMS.bandage.reviveTime}秒長押しで蘇生。`
      : '';
  }

  #renderItems() {
    this.itemsEl.innerHTML = '';
    for (const id of SELECTABLE_ITEMS) {
      const item = ITEMS[id];
      if (item.jobOnly && item.jobOnly !== this.jobId) continue;
      const on = this.selected.includes(id);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'card' + (on ? ' on' : '');
      const stat = item.kind === 'gun'
        ? `火力 ${item.damage} ／ 装弾数 ${item.magazine}発`
        : item.kind === 'build'
          ? '壁とタレットを建てる（R で切替）'
          : `火力 ${item.damage} ／ ${item.cooldown}秒に1回`;
      card.innerHTML = `<div class="name"><span>${item.icon} ${item.name}</span></div><div class="stat">${stat}</div>`;
      card.addEventListener('click', () => this.#toggleItem(id));
      this.itemsEl.appendChild(card);
    }
    this.slotCountEl.textContent = `${this.selected.length} / ${MAX_SLOTS}`;
    this.startBtn.disabled = this.selected.length === 0;
  }

  #toggleItem(id) {
    const i = this.selected.indexOf(id);
    if (i >= 0) this.selected.splice(i, 1);
    else if (this.selected.length < MAX_SLOTS) this.selected.push(id);
    this.#renderItems();
  }

  #renderMembers() {
    const job = JOBS[this.jobId];
    this.membersEl.innerHTML = `<li>あなた（${job.name}）<span class="host">ホスト</span></li>`;
  }

  #start() {
    this.hide();
    this.onStart({
      passphrase: this.passInput.value.trim() || 'ひとり',
      jobId: this.jobId,
      items: [...this.selected],
    });
  }
}
