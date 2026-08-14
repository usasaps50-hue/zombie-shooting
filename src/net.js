import { SUPABASE_URL, SUPABASE_KEY, NET, netReady } from './data/netconfig.js';

// Supabase Realtime の「ブロードキャスト」と「プレゼンス」だけを使う。
// データベースもログインも使わないので、プロジェクトを作って
// URL とキーを貼るだけで動く。

// 合言葉をそのままチャンネル名にすると、日本語やスペースで困ることがある。
// UTF-8 のバイト列を16進にして、必ず英数字だけの名前にする
function topicOf(room) {
  const bytes = new TextEncoder().encode(room.trim().toLowerCase());
  return `zs-${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

function makeId() {
  return crypto.randomUUID?.() ?? `p${Math.random().toString(36).slice(2, 10)}`;
}

// 送受信するイベントの名前。増やすときはここに足す
const EVENTS = ['p', 'w', 'hit', 'kill', 'build', 'dmg', 'revive', 'ult', 'eshot', 'fx'];

export class Net {
  constructor() {
    this.id = makeId();
    // 'off'（設定なし）／'connecting'／'online'／'error'
    this.status = 'off';
    this.error = '';
    this.room = '';
    this.joinedAt = 0;
    this.client = null;
    this.channel = null;
    this.profile = { name: 'プレイヤー', jobId: 'soldier' };
    // id -> { id, name, jobId, joinedAt }
    this.peers = new Map();
    this.handlers = {};
    this.sent = 0;
    this.received = 0;
  }

  get configured() {
    return netReady();
  }

  get online() {
    return this.status === 'online';
  }

  get count() {
    return this.online ? this.peers.size + 1 : 1;
  }

  get full() {
    return this.count >= NET.maxPlayers;
  }

  // オフラインのときは自分ひとりなので、いつでも自分が親。
  // オンラインでは「一番早く入った人」が親になる（同時なら id の小さいほう）
  get isHost() {
    if (!this.online) return true;
    for (const peer of this.peers.values()) {
      if (peer.joinedAt < this.joinedAt) return false;
      if (peer.joinedAt === this.joinedAt && peer.id < this.id) return false;
    }
    return true;
  }

  get hostId() {
    let best = { id: this.id, joinedAt: this.joinedAt };
    for (const peer of this.peers.values()) {
      if (peer.joinedAt < best.joinedAt || (peer.joinedAt === best.joinedAt && peer.id < best.id)) {
        best = peer;
      }
    }
    return best.id;
  }

  on(event, fn) {
    (this.handlers[event] ??= []).push(fn);
    return this;
  }

  #emit(event, payload) {
    for (const fn of this.handlers[event] ?? []) fn(payload);
  }

  // 合言葉の部屋に入る。設定がなければ何もせず false を返す（オフラインで続行）
  async join(room, profile) {
    this.leave();
    if (!this.configured) {
      this.status = 'off';
      this.#emit('status');
      return false;
    }

    this.profile = { ...this.profile, ...profile };
    this.status = 'connecting';
    this.error = '';
    this.#emit('status');

    if (!this.client) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        this.client = createClient(SUPABASE_URL, SUPABASE_KEY, {
          auth: { persistSession: false },
          // supabase-js は既定で1秒10通までしか送らない。足りないので上げる
          realtime: { params: { eventsPerSecond: 60 } },
        });
      } catch (err) {
        this.status = 'error';
        this.error = 'Supabase の読み込みに失敗しました（ネット接続を確認してください）';
        this.#emit('status');
        return false;
      }
    }

    this.room = room;
    this.joinedAt = Date.now();
    const channel = this.client.channel(topicOf(room), {
      config: {
        // 自分が送ったものは自分に返ってこない
        broadcast: { self: false, ack: false },
        presence: { key: this.id },
      },
    });
    this.channel = channel;

    channel.on('presence', { event: 'sync' }, () => this.#syncPeers());
    for (const event of EVENTS) {
      channel.on('broadcast', { event }, ({ payload }) => {
        this.received++;
        this.#emit(event, payload);
      });
    }

    channel.subscribe(async (status) => {
      // 入り直しの途中で古いチャンネルから通知が来ることがあるので、今のものだけ見る
      if (this.channel !== channel) return;
      if (status === 'SUBSCRIBED') {
        this.status = 'online';
        this.error = '';
        // track はプレゼンス扱いで回数制限がきつい（30秒に5回まで）。
        // 入ったときと、名前や職業が変わったときだけ呼ぶ
        await channel.track({
          id: this.id,
          name: this.profile.name,
          jobId: this.profile.jobId,
          joinedAt: this.joinedAt,
        });
      } else if (status === 'CHANNEL_ERROR') {
        this.status = 'error';
        this.error = 'つながりませんでした。URL とキーを確認してください';
      } else if (status === 'TIMED_OUT') {
        this.status = 'error';
        this.error = '接続がタイムアウトしました';
      } else if (status === 'CLOSED') {
        this.status = 'off';
      }
      this.#emit('status');
    });
    return true;
  }

  leave() {
    if (this.channel) {
      this.channel.unsubscribe();
      this.client?.removeChannel?.(this.channel);
    }
    this.channel = null;
    this.room = '';
    this.peers.clear();
    this.status = 'off';
    this.#emit('status');
  }

  #syncPeers() {
    const state = this.channel?.presenceState() ?? {};
    const before = [...this.peers.keys()].join(',');
    this.peers.clear();
    for (const entries of Object.values(state)) {
      const meta = entries[0];
      if (!meta?.id || meta.id === this.id) continue;
      this.peers.set(meta.id, meta);
    }
    if (before !== [...this.peers.keys()].join(',')) this.#emit('peers', this.list());
    this.#emit('status');
  }

  // 自分を含めた部屋の全員。親を先頭にして並べる
  list() {
    const all = [
      { ...this.profile, id: this.id, joinedAt: this.joinedAt, self: true },
      ...this.peers.values(),
    ];
    return all
      .sort((a, b) => a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : 1))
      .map((p) => ({ ...p, host: p.id === this.hostId }));
  }

  send(event, payload) {
    if (!this.online || !this.channel) return;
    this.sent++;
    this.channel.send({ type: 'broadcast', event, payload });
  }

  // 職業を変えたときだけ呼ぶ。呼びすぎるとプレゼンスの制限に引っかかる
  async updateProfile(profile) {
    this.profile = { ...this.profile, ...profile };
    if (!this.online) return;
    await this.channel.track({
      id: this.id,
      name: this.profile.name,
      jobId: this.profile.jobId,
      joinedAt: this.joinedAt,
    });
  }
}

// 何秒に1回送るかを数えるだけの小さな時計
export class Ticker {
  constructor(hz) {
    this.interval = 1 / hz;
    this.acc = 0;
  }

  set hz(value) {
    this.interval = 1 / value;
  }

  ready(dt) {
    this.acc += dt;
    if (this.acc < this.interval) return false;
    this.acc = 0;
    return true;
  }
}
