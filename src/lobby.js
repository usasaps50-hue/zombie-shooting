import { JOBS } from './data/jobs.js';
import { progress } from './progress.js';

// タイトル画面。ここから3Dの待機場に入る。
// 職業・アイテムは待機場のお店、合言葉はバトルゲートで決める
export class Lobby {
  constructor(onStart) {
    this.onStart = onStart;
    this.jobId = 'soldier';
    this.selected = ['pistol', 'shovel'];
    this.el = document.getElementById('lobby');
    this.membersEl = document.getElementById('members');
    this.startBtn = document.getElementById('btn-start');

    this.startBtn.addEventListener('click', () => this.#start());
    this.#renderMembers();
  }

  show() {
    this.el.classList.remove('hidden');
    this.#renderMembers();
  }

  hide() {
    this.el.classList.add('hidden');
  }

  #renderMembers() {
    const job = JOBS[this.jobId];
    this.membersEl.innerHTML = `<li>あなた（${job.name}）<span class="host">🪙 ${progress.coins}</span></li>`;
  }

  #start() {
    this.hide();
    this.onStart();
  }
}
