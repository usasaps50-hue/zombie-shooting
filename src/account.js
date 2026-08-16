// アカウント。なまえとパスワードでログインして遊ぶ。
//
// ⚠ このゲームにはサーバー（データベース）がないので、アカウントは
//   「この端末のブラウザの中」だけに保存される。ほかの端末からは入れないし、
//   端末を触れる人には中身が見えてしまう。本物のサーバー認証ではない。
//   ただしパスワードそのものは保存せず、戻せない形（SHA-256＋ソルト）にして持つ。

const ACCOUNTS_KEY = 'zombie-shooting-accounts';
const SESSION_KEY = 'zombie-shooting-session';

export const NAME_MAX = 12;
export const PASS_MIN = 4;
export const PASS_MAX = 32;

function readJSON(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // プライベートモードなどで保存できない環境。その場かぎりで遊べるようにする
    return false;
  }
}

// 保存の形： { [なまえを小文字にしたもの]: { id, name, salt, algo, hash } }
function readAccounts() {
  const raw = readJSON(ACCOUNTS_KEY, {});
  return raw && typeof raw === 'object' ? raw : {};
}

const keyOf = (name) => name.trim().toLowerCase();

function randomSalt() {
  const bytes = new Uint8Array(12);
  if (globalThis.crypto?.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const toHex = (buffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

// https（と localhost）では SHA-256 が使える。使えない場所でも遊べるよう、
// そのときは弱い計算に落とす。どちらで作ったかは algo に書いておいて、
// 確かめるときも同じ方法を使う
function weakHash(text) {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 0x01000193) >>> 0;
    b = Math.imul(b + text.charCodeAt(i) * (i + 1), 0x85ebca6b) >>> 0;
  }
  return (a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0')).repeat(4);
}

export function hashAlgo() {
  return globalThis.crypto?.subtle ? 'sha256' : 'weak';
}

async function hashOf(password, salt, algo) {
  const text = `zs1:${salt}:${password}`;
  if (algo === 'sha256' && globalThis.crypto?.subtle) {
    return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  }
  return weakHash(text);
}

export function accountCount() {
  return Object.keys(readAccounts()).length;
}

export function accountNames() {
  return Object.values(readAccounts()).map((a) => a.name);
}

// 入れてもらった文字を確かめる。だめなときは理由を返す
function checkInput(name, password) {
  const clean = name.trim();
  if (!clean) return 'なまえを入れてください';
  if (clean.length > NAME_MAX) return `なまえは${NAME_MAX}文字までです`;
  if (password.length < PASS_MIN) return `パスワードは${PASS_MIN}文字以上にしてください`;
  if (password.length > PASS_MAX) return `パスワードは${PASS_MAX}文字までです`;
  return null;
}

// 新しいアカウントを作る
export async function signUp(name, password) {
  const error = checkInput(name, password);
  if (error) return { ok: false, error };

  const accounts = readAccounts();
  const key = keyOf(name);
  if (accounts[key]) return { ok: false, error: 'そのなまえはもう使われています' };

  const salt = randomSalt();
  const algo = hashAlgo();
  const account = {
    id: `a${Date.now().toString(36)}${randomSalt().slice(0, 6)}`,
    name: name.trim(),
    salt,
    algo,
    hash: await hashOf(password, salt, algo),
    // 前からある保存データを引き継ぐのは、一番はじめのアカウントだけ
    first: Object.keys(accounts).length === 0,
  };
  accounts[key] = account;
  if (!writeJSON(ACCOUNTS_KEY, accounts)) {
    return { ok: false, error: 'このブラウザではアカウントを保存できません（プライベートモードかもしれません）' };
  }
  return { ok: true, account };
}

// ログイン
export async function logIn(name, password) {
  const clean = name.trim();
  if (!clean) return { ok: false, error: 'なまえを入れてください' };
  if (!password) return { ok: false, error: 'パスワードを入れてください' };

  const account = readAccounts()[keyOf(clean)];
  // 「なまえが違う」と「パスワードが違う」を分けて言わない
  if (!account) return { ok: false, error: 'なまえかパスワードが違います' };
  const hash = await hashOf(password, account.salt, account.algo ?? 'sha256');
  if (hash !== account.hash) return { ok: false, error: 'なまえかパスワードが違います' };
  return { ok: true, account };
}

// 最後にログインした人を覚えておく。remember が true のときだけ、
// つぎに開いたときパスワードを聞かずにそのまま入れる。
// false でも「なまえ」だけは残して、入力欄にあらかじめ書いておく
export function rememberSession(account, remember) {
  writeJSON(SESSION_KEY, { id: account.id, name: account.name, remember: !!remember });
}

// ログアウト。なまえは残すが、つぎは必ずパスワードを聞く
export function endSession() {
  const saved = readJSON(SESSION_KEY, null);
  writeJSON(SESSION_KEY, { name: saved?.name ?? '', remember: false });
}

// パスワードを聞かずに入れるアカウント。消されていたら null
export function savedSession() {
  const saved = readJSON(SESSION_KEY, null);
  if (!saved?.id || !saved.remember) return null;
  return Object.values(readAccounts()).find((a) => a.id === saved.id) ?? null;
}

// 最後に入れたなまえ（入力欄にあらかじめ書いておく用）
export function lastName() {
  return readJSON(SESSION_KEY, null)?.name ?? '';
}
