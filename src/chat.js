// 待機場のチャット。画面の左上に出て、同じ部屋にいる人と話せる。
// 名前の色は名前から決めるので、同じ人はいつも同じ色になる。

// 1回に送れる長さ。長すぎると相手の画面を埋めてしまう
export const CHAT_MAX = 90;
// 何秒に1回まで送れるか（連打よけ。通信の数もこれで抑える）
const SEND_INTERVAL = 0.8;
// 画面に残しておく行数
const KEEP = 40;
// 最後の書き込みから、この秒数たつと薄くなる
const FADE_AFTER = 14;

// 名前ごとの色。ロブロックスのように、人によって色が変わる
const NAME_COLORS = [
  '#ff7b7b', '#7bb8ff', '#7bffa8', '#ffd76a', '#d79bff',
  '#6be2e2', '#ff9f5a', '#a8d95a', '#ff8fd0', '#9fb4ff',
];

export function nameColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return NAME_COLORS[hash % NAME_COLORS.length];
}

// 送られてきた文字をそのまま信じない。改行や長すぎるものを整える
export function cleanText(raw) {
  return String(raw ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, CHAT_MAX);
}

export class Chat {
  // onSend(text) は、送っていいときに呼ばれる
  constructor({ onSend, onOpen, onClose }) {
    this.onSend = onSend;
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.el = document.getElementById('chat');
    this.logEl = document.getElementById('chat-log');
    this.barEl = document.getElementById('chat-bar');
    this.inputEl = document.getElementById('chat-input');
    this.countEl = document.getElementById('chat-count');
    this.typing = false;
    this.lastSentAt = -99;
    this.lastMessageAt = -99;
    this.time = 0;

    this.barEl.addEventListener('click', () => this.open());
    // スマホでボタンを押しただけで視点が動かないように、ここで止める
    this.barEl.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.open();
    }, { passive: false });

    this.inputEl.addEventListener('input', () => this.#updateCount());
    this.inputEl.addEventListener('keydown', (e) => {
      // 入力中のキーは、ゲームの操作に渡さない
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        this.#submit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
    });
    // 画面のどこかを触ってピントが外れたら、そのまま閉じる
    this.inputEl.addEventListener('blur', () => {
      if (this.typing) this.close();
    });
  }

  show() {
    this.el.classList.remove('hidden');
  }

  hide() {
    this.close();
    this.el.classList.add('hidden');
  }

  // 入力欄をひらく。ひらいている間はゲームの操作を止めてもらう
  open() {
    if (this.typing || this.el.classList.contains('hidden')) return;
    this.typing = true;
    this.el.classList.add('typing');
    this.inputEl.value = '';
    this.#updateCount();
    this.onOpen?.();
    // iOS はユーザー操作と同じ流れで focus しないとキーボードが出ない
    this.inputEl.focus();
  }

  close() {
    if (!this.typing) return;
    this.typing = false;
    this.el.classList.remove('typing');
    this.inputEl.value = '';
    this.inputEl.blur();
    this.onClose?.();
  }

  #updateCount() {
    const left = CHAT_MAX - this.inputEl.value.length;
    this.countEl.textContent = left <= 20 ? String(left) : '';
  }

  #submit() {
    const text = cleanText(this.inputEl.value);
    this.inputEl.value = '';
    this.#updateCount();
    if (!text) {
      this.close();
      return;
    }
    if (this.time - this.lastSentAt < SEND_INTERVAL) {
      this.system('ちょっと待ってから送ってね');
      this.close();
      return;
    }
    this.lastSentAt = this.time;
    this.onSend?.(text);
    this.close();
  }

  // 発言を1行足す。text は必ず textContent で入れる（作った文字は表示しない）
  say(name, text, { self = false } = {}) {
    const line = document.createElement('li');
    const who = document.createElement('span');
    who.className = 'chat-name';
    who.style.color = self ? '#ffffff' : nameColor(name);
    who.textContent = `${name}: `;
    const body = document.createElement('span');
    body.className = 'chat-body';
    body.textContent = text;
    line.append(who, body);
    this.#push(line);
  }

  // ゲームからのお知らせ（入室・退室など）
  system(text) {
    const line = document.createElement('li');
    line.className = 'chat-system';
    line.textContent = text;
    this.#push(line);
  }

  #push(line) {
    this.logEl.append(line);
    while (this.logEl.children.length > KEEP) this.logEl.firstChild.remove();
    this.logEl.scrollTop = this.logEl.scrollHeight;
    this.lastMessageAt = this.time;
    this.el.classList.remove('idle');
  }

  clear() {
    this.logEl.innerHTML = '';
  }

  update(dt) {
    this.time += dt;
    // しばらく誰も話していなければ薄くして、待機場の景色を隠さないようにする
    const quiet = this.time - this.lastMessageAt > FADE_AFTER;
    this.el.classList.toggle('idle', quiet && !this.typing);
  }
}
