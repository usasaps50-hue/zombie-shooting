import { JOBS } from './data/jobs.js';
import { progress, useAccount, clearAccount } from './progress.js';
import {
  signUp, logIn, savedSession, lastName, rememberSession, endSession,
} from './account.js';

// タイトル画面。なまえとパスワードでログインしてから、3Dの待機場に入る。
// 職業・アイテムは待機場のお店、合言葉はバトルゲートで決める
export class Lobby {
  constructor(onStart, onLogout) {
    this.onStart = onStart;
    this.onLogout = onLogout;
    this.jobId = 'soldier';
    this.busy = false;
    this.el = document.getElementById('lobby');
    this.loginView = document.getElementById('login-view');
    this.startView = document.getElementById('start-view');
    this.nameEl = document.getElementById('login-name');
    this.passEl = document.getElementById('login-pass');
    this.rememberEl = document.getElementById('login-remember');
    this.errorEl = document.getElementById('login-error');
    this.membersEl = document.getElementById('members');

    document.getElementById('btn-login').addEventListener('click', () => this.#submit(logIn));
    document.getElementById('btn-signup').addEventListener('click', () => this.#submit(signUp, true));
    document.getElementById('btn-start').addEventListener('click', () => this.#start());
    document.getElementById('btn-logout').addEventListener('click', () => this.logOut());
    // どちらの欄でも Enter でログインできるようにする
    for (const el of [this.nameEl, this.passEl]) {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.#submit(logIn);
      });
    }

    // 「つぎからパスワードを聞かない」を選んでいた人は、そのまま入れる
    const saved = savedSession();
    if (saved) {
      useAccount(saved);
      this.#showStart();
    } else {
      this.nameEl.value = lastName();
      this.#showLogin();
    }
  }

  show() {
    this.el.classList.remove('hidden');
    if (progress.name) this.#showStart();
    else this.#showLogin();
  }

  hide() {
    this.el.classList.add('hidden');
  }

  logOut() {
    endSession();
    clearAccount();
    this.passEl.value = '';
    this.#showLogin();
    this.onLogout?.();
  }

  #showLogin() {
    this.loginView.classList.remove('hidden');
    this.startView.classList.add('hidden');
    this.#setError('');
    // スマホでいきなりキーボードが出ると画面が狭くなるので、focus はしない
  }

  #showStart() {
    this.loginView.classList.add('hidden');
    this.startView.classList.remove('hidden');
    this.#renderMembers();
  }

  #setError(text) {
    this.errorEl.textContent = text;
    this.errorEl.classList.toggle('hidden', !text);
  }

  // ログインと新規登録は、うまくいったあとの流れが同じ
  async #submit(action, isNew = false) {
    if (this.busy) return;
    this.busy = true;
    this.#setError('');
    try {
      const result = await action(this.nameEl.value, this.passEl.value);
      if (!result.ok) {
        this.#setError(result.error);
        return;
      }
      // アカウントを入れる前の保存データは、一番はじめのアカウントが引き継ぐ
      useAccount(result.account, isNew && result.account.first);
      rememberSession(result.account, this.rememberEl.checked);
      this.passEl.value = '';
      this.#showStart();
    } catch (err) {
      this.#setError('うまくいきませんでした。もう一度ためしてください');
    } finally {
      this.busy = false;
    }
  }

  #renderMembers() {
    const job = JOBS[this.jobId];
    this.membersEl.textContent = '';
    const li = document.createElement('li');
    li.textContent = `${progress.name}（${job.name}）`;
    const coins = document.createElement('span');
    coins.className = 'host';
    coins.textContent = `🪙 ${progress.coins}`;
    li.appendChild(coins);
    this.membersEl.appendChild(li);
  }

  #start() {
    if (!progress.name) return;
    this.hide();
    this.onStart();
  }
}
