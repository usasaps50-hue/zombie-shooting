import { JOBS } from './data/jobs.js';

const WORDS = ['あかつき', 'ゾンビ', 'シャベル', 'まんげつ', 'ひまわり', 'かみなり', 'こもれび', 'てっぺき'];

// 合言葉を決めて待機場へ入るだけの画面。職業とアイテムは待機場のお店で選ぶ
export class Lobby {
  constructor(onStart) {
    this.onStart = onStart;
    this.jobId = 'soldier';
    this.selected = ['pistol', 'shovel'];
    this.el = document.getElementById('lobby');

    this.passInput = document.getElementById('passphrase');
    this.membersEl = document.getElementById('members');
    this.startBtn = document.getElementById('btn-start');

    this.passInput.value = this.#randomPass();
    document.getElementById('btn-random').addEventListener('click', () => {
      this.passInput.value = this.#randomPass();
    });
    this.startBtn.addEventListener('click', () => this.#start());

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
