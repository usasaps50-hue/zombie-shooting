// Supabase にアカウントと進み具合を置く。こうすると、
// スマホで作ったアカウントにパソコンからも入れる。
//
// パスワードの扱いは Supabase Auth にまかせる（自分でハッシュを作らない）。
// 進み具合は profiles テーブルに1人1行で置き、RLS で
// 「自分の行しか読み書きできない」ようにする。SQL は README.md にある。
//
// Supabase の設定がない（netconfig.js が空の）ときは、この仕組みは使わず、
// これまでどおり端末の中だけのアカウント（account.js）で遊ぶ。

import { SUPABASE_URL, SUPABASE_KEY, netReady } from './data/netconfig.js';

// メールアドレスの代わりに使う置き場所。ここへ実際にメールは届かない
const MAIL_DOMAIN = 'zombie-shooting.app';
// 「つぎからパスワードを聞かない」を選んだかどうか
const REMEMBER_KEY = 'zombie-shooting-cloud-remember';
// Supabase 側の決まりで、パスワードは6文字以上
export const CLOUD_PASS_MIN = 6;
// 何秒ぶんかまとめて保存する（コインが増えるたびに送らない）
const SAVE_DELAY = 2.5;

let client = null;
let pending = null;
let timer = null;

export function cloudReady() {
  return netReady();
}

async function getClient() {
  if (client) return client;
  const { createClient } = await import('@supabase/supabase-js');
  client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      // ログインしたままにしておく。パスワードを聞くかどうかは
      // rememberFlag() で自分たちが決める
      persistSession: true,
      autoRefreshToken: true,
      storageKey: 'zombie-shooting-auth',
    },
  });
  return client;
}

// なまえをそのままメールアドレスにはできない（日本語が使えない）ので、
// なまえから決まる文字列に置きかえる。同じなまえなら必ず同じになるので、
// 「同じなまえは1人だけ」も Supabase 側の重複チェックにまかせられる
async function mailOf(name) {
  const norm = name.trim().normalize('NFKC').toLowerCase();
  const bytes = new TextEncoder().encode(`zs-account:${norm}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `u${hex.slice(0, 32)}@${MAIL_DOMAIN}`;
}

// Supabase から返る英語のメッセージを、日本語に置きかえる
function translate(error) {
  const message = String(error?.message ?? error ?? '');
  const code = error?.code ?? '';
  if (/already registered|already been registered|User already exists/i.test(message)) {
    return 'そのなまえはもう使われています';
  }
  if (/Invalid login credentials/i.test(message)) return 'なまえかパスワードが違います';
  if (/Password should be at least/i.test(message)) {
    return `パスワードは${CLOUD_PASS_MIN}文字以上にしてください`;
  }
  if (/Email logins are disabled|Signups not allowed|signup is disabled/i.test(message)) {
    return 'Supabase の設定で「メールでの登録」が切られています（README の手順を見てください）';
  }
  if (/Email not confirmed/i.test(message)) {
    return 'Supabase の設定で「Confirm email」を切ってください（README の手順を見てください）';
  }
  // テーブルをまだ作っていないとき
  if (code === '42P01' || code === 'PGRST205' || /relation .*profiles.* does not exist/i.test(message)) {
    return 'Supabase に profiles テーブルがありません（README の SQL を実行してください）';
  }
  if (/Failed to fetch|NetworkError|network/i.test(message)) {
    return 'インターネットにつながっていないようです';
  }
  if (/rate limit|too many/i.test(message)) return '試しすぎです。少し待ってからもう一度';
  return message || 'うまくいきませんでした';
}

// この端末で「パスワードを聞かない」を選んでいるか
function rememberFlag() {
  try {
    return localStorage.getItem(REMEMBER_KEY) === '1';
  } catch {
    return false;
  }
}

export function setRemember(on) {
  try {
    localStorage.setItem(REMEMBER_KEY, on ? '1' : '0');
  } catch { /* 保存できなくても遊べる */ }
}

// 自分の行を読む。まだ無ければ作る
async function loadProfile(supabase, user, name) {
  const { data, error } = await supabase
    .from('profiles')
    .select('name, data')
    .eq('id', user.id)
    .maybeSingle();
  if (error) throw error;
  if (data) return { name: data.name || name, data: data.data ?? null };
  return { name, data: null, isNew: true };
}

async function upsertProfile(supabase, user, name, data) {
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: user.id, name, data, updated_at: new Date().toISOString() });
  if (error) throw error;
}

// 新しいアカウントを作る
export async function signUp(name, password) {
  const clean = name.trim();
  if (!clean) return { ok: false, error: 'なまえを入れてください' };
  if (clean.length > 12) return { ok: false, error: 'なまえは12文字までです' };
  if (password.length < CLOUD_PASS_MIN) {
    return { ok: false, error: `パスワードは${CLOUD_PASS_MIN}文字以上にしてください` };
  }
  try {
    const supabase = await getClient();
    const { data, error } = await supabase.auth.signUp({
      email: await mailOf(clean),
      password,
      options: { data: { name: clean } },
    });
    if (error) return { ok: false, error: translate(error) };
    // 「Confirm email」が切れていないと、ここでログイン済みにならない
    if (!data.session) {
      return {
        ok: false,
        error: 'Supabase の設定で「Confirm email」を切ってください（README の手順を見てください）',
      };
    }
    await upsertProfile(supabase, data.user, clean, null);
    return { ok: true, account: { id: data.user.id, name: clean, cloud: true }, isNew: true, data: null };
  } catch (err) {
    return { ok: false, error: translate(err) };
  }
}

// ログイン
export async function logIn(name, password) {
  const clean = name.trim();
  if (!clean) return { ok: false, error: 'なまえを入れてください' };
  if (!password) return { ok: false, error: 'パスワードを入れてください' };
  try {
    const supabase = await getClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: await mailOf(clean),
      password,
    });
    if (error) return { ok: false, error: translate(error) };
    const profile = await loadProfile(supabase, data.user, clean);
    return {
      ok: true,
      account: { id: data.user.id, name: profile.name, cloud: true },
      data: profile.data,
    };
  } catch (err) {
    return { ok: false, error: translate(err) };
  }
}

// 「パスワードを聞かない」を選んでいる人を、そのまま入れる。
// 選んでいなければ、残っているログイン状態は消す
export async function resumeSession() {
  if (!cloudReady()) return null;
  try {
    const supabase = await getClient();
    const { data } = await supabase.auth.getSession();
    const user = data?.session?.user;
    if (!user) return null;
    if (!rememberFlag()) {
      await supabase.auth.signOut();
      return null;
    }
    const name = user.user_metadata?.name ?? 'プレイヤー';
    const profile = await loadProfile(supabase, user, name);
    return { account: { id: user.id, name: profile.name, cloud: true }, data: profile.data };
  } catch {
    // つながらないときは、ログイン画面から入り直してもらう
    return null;
  }
}

export async function logOut() {
  cancelPending();
  if (!client) return;
  try {
    await client.auth.signOut();
  } catch { /* 切れていても困らない */ }
}

// ---- 進み具合の保存 ----

// 呼ばれるたびに送ると通信が多すぎるので、少しまとめてから送る
export function queueSave(account, data) {
  if (!account?.cloud) return;
  pending = { account, data: JSON.parse(JSON.stringify(data)) };
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    flushSave();
  }, SAVE_DELAY * 1000);
}

function cancelPending() {
  if (timer) clearTimeout(timer);
  timer = null;
  pending = null;
}

// たまっているぶんを今すぐ送る。閉じるときにも呼ぶ
export async function flushSave() {
  if (!pending || !client) return;
  const { account, data } = pending;
  pending = null;
  try {
    const { data: session } = await client.auth.getSession();
    if (!session?.session?.user) return;
    await upsertProfile(client, session.session.user, account.name, data);
  } catch {
    // 送れなかったぶんは、次の保存でまとめて送られる
  }
}

// 閉じる・隠れるときに、まだ送っていないぶんを送る
export function watchExit() {
  const send = () => { if (pending) flushSave(); };
  addEventListener('pagehide', send);
  addEventListener('visibilitychange', () => { if (document.hidden) send(); });
}
