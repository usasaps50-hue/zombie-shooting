import { JOBS } from './data/jobs.js';
import {
  progress, useAccount, clearAccount, setRemoteSaver, savedProgressOf, consumeOldSave,
} from './progress.js';
import * as local from './account.js';
import * as cloud from './cloud.js';

// タイトル画面。なまえとパスワードでログインしてから、3Dの待機場に入る。
// 職業・アイテムは待機場のお店、合言葉はバトルゲートで決める。
//
// Supabase の設定があるときは、アカウントも進み具合も Supabase に置く
// （＝ほかの端末からも同じアカウントで入れる）。設定がないときは、
// これまでどおりこの端末の中だけのアカウントになる。
export class Lobby {
  constructor(onStart, onLogout) {
    this.onStart = onStart;
    this.onLogout = onLogout;
    this.jobId = 'soldier';
    this.busy = false;
    // 引き継ぎができたときに、1回だけ画面に出す知らせ
    this.carriedNote = '';
    this.online = cloud.cloudReady();
    this.el = document.getElementById('lobby');
    this.loginView = document.getElementById('login-view');
    this.startView = document.getElementById('start-view');
    this.nameEl = document.getElementById('login-name');
    this.passEl = document.getElementById('login-pass');
    this.rememberEl = document.getElementById('login-remember');
    this.errorEl = document.getElementById('login-error');
    this.whereEl = document.getElementById('login-where');
    this.loginBtn = document.getElementById('btn-login');
    this.signupBtn = document.getElementById('btn-signup');
    this.membersEl = document.getElementById('members');

    this.loginBtn.addEventListener('click', () => this.#submit(false));
    this.signupBtn.addEventListener('click', () => this.#submit(true));
    document.getElementById('btn-start').addEventListener('click', () => this.#start());
    document.getElementById('btn-logout').addEventListener('click', () => this.logOut());
    // どちらの欄でも Enter でログインできるようにする
    for (const el of [this.nameEl, this.passEl]) {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.#submit(false);
      });
    }

    if (this.online) {
      // 保存したぶんを Supabase にも送るようにする
      setRemoteSaver((account, data) => cloud.queueSave(account, data));
      cloud.watchExit();
      this.passEl.minLength = cloud.CLOUD_PASS_MIN;
      this.passEl.placeholder = `${cloud.CLOUD_PASS_MIN}文字以上`;
    }
    this.#describeWhere();
    this.#restore();
  }

  // 「つぎからパスワードを聞かない」を選んでいた人は、そのまま入れる
  async #restore() {
    this.nameEl.value = local.lastName();
    this.#showLogin();
    if (this.online) {
      this.#busy(true, 'さがしています…');
      const resumed = await cloud.resumeSession();
      this.#busy(false);
      if (resumed) {
        useAccount(resumed.account, { cloudData: resumed.data });
        this.#showStart();
        return;
      }
      return;
    }
    const saved = local.savedSession();
    if (saved) {
      useAccount(saved);
      this.#showStart();
    }
  }

  #describeWhere() {
    this.whereEl.textContent = this.online
      ? 'アカウントはインターネット上（Supabase）に保存されます。ほかの端末やスマホからでも、同じなまえとパスワードで入れます。'
      : 'このゲームにはまだ保存サーバーの設定がないので、アカウントはこの端末の中だけに保存されます（ほかの端末からは入れません）。';
    this.whereEl.classList.toggle('warn', !this.online);
  }

  show() {
    this.el.classList.remove('hidden');
    if (progress.name) this.#showStart();
    else this.#showLogin();
  }

  hide() {
    this.el.classList.add('hidden');
  }

  async logOut() {
    if (this.online) await cloud.logOut();
    else local.endSession();
    cloud.setRemember(false);
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

  // 通信の間はボタンを押せなくして、待っていると分かるようにする
  #busy(on, label = '') {
    this.busy = on;
    this.loginBtn.disabled = on;
    this.signupBtn.disabled = on;
    this.loginBtn.textContent = on && label ? label : 'ログイン';
  }

  // ログインと新規登録は、うまくいったあとの流れが同じ
  async #submit(isNew) {
    if (this.busy) return;
    this.#busy(true, isNew ? 'つくっています…' : 'ログイン中…');
    this.#setError('');
    const name = this.nameEl.value;
    const password = this.passEl.value;
    try {
      const api = this.online ? cloud : local;
      const result = isNew ? await api.signUp(name, password) : await api.logIn(name, password);
      if (!result.ok) {
        this.#setError(result.error);
        return;
      }

      if (this.online) {
        // 新しく作ったアカウントで、この端末に同じなまえの
        // （前のやり方の）進み具合が残っていれば、それを引き継ぐ
        const carried = result.isNew ? await takeOverLocal(name, password) : null;
        useAccount(result.account, { cloudData: result.data ?? carried });
        cloud.setRemember(this.rememberEl.checked);
        if (carried) this.carriedNote = 'この端末に残っていた進み具合を引き継ぎました';
      } else {
        useAccount(result.account, { takeOldSave: isNew && result.account.first });
        local.rememberSession(result.account, this.rememberEl.checked);
      }
      this.passEl.value = '';
      this.#showStart();
    } catch (err) {
      this.#setError('うまくいきませんでした。もう一度ためしてください');
    } finally {
      this.#busy(false);
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
    if (this.carriedNote) {
      const note = document.createElement('li');
      note.textContent = `📦 ${this.carriedNote}`;
      this.membersEl.appendChild(note);
      this.carriedNote = '';
    }
  }

  #start() {
    if (!progress.name) return;
    this.hide();
    this.onStart();
  }
}

// Supabase を使う前に、この端末だけで遊んでいた人の進み具合を拾う
async function takeOverLocal(name, password) {
  // 1. 同じなまえ＆同じパスワードの、端末だけのアカウントがあればそれ
  //    （パスワードが合ったときだけなので、他人のぶんは取れない）
  const found = await local.logIn(name, password);
  if (found.ok) {
    const saved = savedProgressOf(found.account.id);
    if (saved) return saved;
  }
  // 2. アカウントの仕組みを入れる前から遊んでいた人のぶん。
  //    この端末で一番はじめにログインした人が引き継ぐ
  return consumeOldSave();
}
