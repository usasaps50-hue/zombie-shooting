import { ITEMS, SELECTABLE_ITEMS } from './data/items.js';
import { JOBS } from './data/jobs.js';
import { UPGRADES, MAX_LEVEL, DAMAGE_PER_LEVEL } from './data/upgrades.js';
import { CLASS_LEVELS, CLASS_MAX_LEVEL, JOB_PRICE, ITEM_PRICE } from './data/classes.js';
import {
  progress, levelOf, upgradeStatus, upgrade,
  classLevelOf, classStatus, upgradeClass,
  ownsItem, ownsJob, buyItem, buyJob, maxSlots, addCoins,
  playerName, setPlayerName,
} from './progress.js';
import { netReady } from './data/netconfig.js';

// 名前や合言葉をそのまま HTML に入れると、記号で表示が崩れる
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const JOB_MARK = { soldier: '★', medic: '✚', architect: '⚒' };

// 待機場の角にある端末の合言葉と、1回に出せるコインの上限
const SECRET_PASS = 'Usasaburosuta';
const MAX_SECRET_COINS = 999999;

// 待機場の店。店員に話しかけると開く。
// 品物は1行ずつの縦リストにして、数が増えてもスクロールで足りるようにしてある
export class Shop {
  constructor(icons, { onChange, onBattle }) {
    this.icons = icons;
    this.onChange = onChange;
    this.onBattle = onBattle;
    this.el = document.getElementById('shop');
    this.titleEl = document.getElementById('shop-title');
    this.noteEl = document.getElementById('shop-note');
    this.listEl = document.getElementById('shop-list');
    this.keeperEl = document.getElementById('shop-keeper');
    this.coinsEl = document.getElementById('shop-coins');
    this.closeBtn = document.getElementById('shop-close');
    this.kind = null;
    this.loadout = null;

    this.closeBtn.addEventListener('click', () => this.close());
  }

  get open() {
    return !this.el.classList.contains('hidden');
  }

  show(kind, loadout) {
    this.kind = kind;
    this.loadout = loadout;
    this.el.classList.remove('hidden');
    this.render();
  }

  close() {
    this.el.classList.add('hidden');
    this.kind = null;
  }

  render() {
    const render = {
      shopItem: () => this.#renderItems(),
      shopJob: () => this.#renderJobs(),
      levelUp: () => this.#renderLevelUp(),
      battle: () => this.#renderBattle(),
      secret: () => this.#renderSecret(),
    };
    this.listEl.innerHTML = '';
    this.coinsEl.textContent = `🪙 ${progress.coins}`;
    // バトルゲートでは「出発する」が主役なので、閉じるボタンは控えめにする
    const gate = this.kind === 'battle';
    this.closeBtn.textContent = gate ? 'やめる' : '話を終える';
    this.closeBtn.classList.toggle('primary', !gate);
    this.closeBtn.classList.toggle('ghost', gate);
    render[this.kind]?.();
  }

  #row(on, iconHtml, name, stat, action, onClick) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'card shop-card' + (on ? ' on' : '');
    row.innerHTML = `${iconHtml}
      <div class="shop-text">
        <div class="name">${name}</div>
        <div class="stat">${stat}</div>
      </div>
      <span class="shop-action">${action}</span>`;
    row.addEventListener('click', onClick);
    this.listEl.appendChild(row);
    return row;
  }

  #icon(id) {
    const gold = levelOf(id) >= MAX_LEVEL;
    const src = this.icons[gold ? `${id}:gold` : id] ?? this.icons[id];
    return src
      ? `<img class="shop-icon" src="${src}" alt="">`
      : `<span class="shop-emoji">${ITEMS[id].icon}</span>`;
  }

  #renderItems() {
    const slots = maxSlots(this.loadout.jobId);
    this.titleEl.textContent = 'アイテムショップ';
    this.keeperEl.textContent = 'ハルさん';
    this.noteEl.textContent = `いま持っていけるのは${slots}つまで。持っていない武器はコインで買えるよ。`;

    for (const id of SELECTABLE_ITEMS) {
      const item = ITEMS[id];
      const jobLocked = item.jobOnly && item.jobOnly !== this.loadout.jobId;
      const owned = ownsItem(id);
      const on = this.loadout.items.includes(id);
      const price = ITEM_PRICE[id] ?? 0;

      const stat = jobLocked
        ? `${JOBS[item.jobOnly].name}せんよう`
        : !owned
          ? `まだ持っていない（${price}コイン）`
          : item.kind === 'gun'
            ? `Lv${levelOf(id)}　火力 ${item.damage} ／ 装弾数 ${item.magazine}発`
            : item.kind === 'build'
              ? '壁とタレットを建てる'
              : `Lv${levelOf(id)}　火力 ${item.damage} ／ ${item.cooldown}秒に1回`;

      const action = jobLocked ? '×' : !owned ? `🪙${price}` : on ? 'はずす' : '持つ';

      const row = this.#row(on, this.#icon(id), item.name, stat, action, () => {
        if (jobLocked) return;
        if (!owned) {
          if (!buyItem(id)) {
            this.noteEl.textContent = `コインが ${price - progress.coins} 枚たりないよ。`;
            return;
          }
          this.noteEl.textContent = `${item.name}を買った！`;
          this.render();
          this.onChange();
          return;
        }
        const i = this.loadout.items.indexOf(id);
        if (i >= 0) this.loadout.items.splice(i, 1);
        else if (this.loadout.items.length < slots) this.loadout.items.push(id);
        this.render();
        this.onChange();
      });
      if (jobLocked || (!owned && progress.coins < price)) row.classList.add('cant');
    }
  }

  #renderJobs() {
    this.titleEl.textContent = 'クラスショップ';
    this.keeperEl.textContent = 'ミナさん';
    this.noteEl.textContent = 'クラスを買って選べます。レベルアップはレベルアップ所へどうぞ。';

    for (const job of Object.values(JOBS)) {
      const owned = ownsJob(job.id);
      const on = job.id === this.loadout.jobId;
      const price = JOB_PRICE[job.id] ?? 0;
      const stat = owned
        ? `Lv${classLevelOf(job.id)}　HP ${job.hp} ／ 移動 ${Math.round(job.speedScale * 100)}%　${job.desc}`
        : `まだ持っていない（${price}コイン）　${job.desc}`;
      const action = !owned ? `🪙${price}` : on ? 'えらび中' : 'する';

      const row = this.#row(on, `<span class="shop-emoji">${JOB_MARK[job.id] ?? '★'}</span>`,
        job.name, stat, action, () => {
          if (!owned) {
            if (!buyJob(job.id)) {
              this.noteEl.textContent = `コインが ${price - progress.coins} 枚たりないよ。`;
              return;
            }
            this.noteEl.textContent = `${job.name}を買った！`;
            this.render();
            this.onChange();
            return;
          }
          this.loadout.jobId = job.id;
          syncJobItems(this.loadout);
          this.render();
          this.onChange();
        });
      if (!owned && progress.coins < price) row.classList.add('cant');
    }
  }

  #renderLevelUp() {
    this.titleEl.textContent = 'レベルアップ所';
    this.keeperEl.textContent = 'ゲンさん';
    this.noteEl.textContent = 'ゾンビを倒すとコインが手に入る。武器もクラスもレベル5までだよ。';

    // 持っているクラスのレベルアップ
    for (const job of Object.values(JOBS)) {
      if (!ownsJob(job.id)) continue;
      const level = classLevelOf(job.id);
      const status = classStatus(job.id);
      const next = status.max ? 'これ以上は上がらない（最大）' : CLASS_LEVELS[level].desc;
      const stat = `クラス Lv${level} / ${CLASS_MAX_LEVEL}<br><span class="shop-next">次：${next}</span>`;

      const row = this.#row(false, `<span class="shop-emoji">${JOB_MARK[job.id] ?? '★'}</span>`,
        job.name, stat, status.max ? 'MAX' : `🪙${status.cost}`, () => {
          if (status.max) return;
          if (!upgradeClass(job.id)) {
            this.noteEl.textContent = `コインが ${status.cost - progress.coins} 枚たりないよ。`;
            return;
          }
          this.noteEl.textContent = `${job.name}が Lv${classLevelOf(job.id)} になった！`;
          this.render();
          this.onChange();
        });
      if (!status.max && !status.afford) row.classList.add('cant');
    }

    // 持っている武器のレベルアップ
    for (const id of Object.keys(UPGRADES)) {
      if (!ownsItem(id)) continue;
      const level = levelOf(id);
      const status = upgradeStatus(id);
      const power = `火力+${Math.round(DAMAGE_PER_LEVEL * (level - 1) * 100)}%`;
      const next = status.max ? 'これ以上は上がらない（最大）' : UPGRADES[id].levels[level].desc;
      const stat = `Lv${level} / ${MAX_LEVEL}　${power}<br><span class="shop-next">次：${next}</span>`;
      const action = status.max ? 'MAX' : status.locked ? '🔒' : `🪙${status.cost}`;

      const row = this.#row(false, this.#icon(id), ITEMS[id].name, stat, action, () => {
        if (status.max) return;
        if (status.locked) {
          this.noteEl.textContent = `それには ${ITEMS[status.locked.id].name} を Lv${status.locked.level} にしないとね。`;
          return;
        }
        if (!upgrade(id)) {
          this.noteEl.textContent = `コインが ${status.cost - progress.coins} 枚たりないよ。`;
          return;
        }
        this.noteEl.textContent = `${ITEMS[id].name}が Lv${levelOf(id)} になった！`;
        this.render();
        this.onChange();
      });
      if (!status.max && (status.locked || !status.afford)) row.classList.add('cant');
    }

    const note = document.createElement('p');
    note.className = 'hint';
    note.textContent = '買っていない武器やクラスは、それぞれのお店で買うとここに出ます。ソードはまだ制作中です。';
    this.listEl.appendChild(note);
  }

  // 角にある端末。合言葉が合っていれば、好きな枚数のコインを取り出せる
  #renderSecret() {
    this.titleEl.textContent = 'あやしい端末';
    this.keeperEl.textContent = '';
    this.noteEl.textContent = 'ふるびた画面に「あいことば を いれよ」と出ている。';

    const form = document.createElement('div');
    form.className = 'gate-form';
    form.innerHTML = `
      <label for="secret-pass">あいことば</label>
      <input id="secret-pass" type="password" maxlength="32" autocomplete="off" placeholder="＿＿＿＿＿＿">
      <label for="secret-amount">ほしいコインの枚数</label>
      <input id="secret-amount" type="number" min="1" max="${MAX_SECRET_COINS}" step="1" value="1000">
      <button id="secret-go" class="primary" type="button">端末をうごかす</button>
      <p id="secret-result" class="hint"></p>`;
    this.listEl.appendChild(form);

    const passEl = form.querySelector('#secret-pass');
    const amountEl = form.querySelector('#secret-amount');
    const resultEl = form.querySelector('#secret-result');

    const run = () => {
      if (passEl.value.trim().toLowerCase() !== SECRET_PASS.toLowerCase()) {
        resultEl.textContent = 'ちがう合言葉だ… 画面が赤く光っている。';
        resultEl.style.color = '#e8836a';
        passEl.value = '';
        return;
      }
      const amount = Math.floor(Number(amountEl.value));
      if (!Number.isFinite(amount) || amount < 1) {
        resultEl.textContent = '枚数は1以上の数を入れてね。';
        resultEl.style.color = '#e8836a';
        return;
      }
      const given = Math.min(amount, MAX_SECRET_COINS);
      addCoins(given);
      this.coinsEl.textContent = `🪙 ${progress.coins}`;
      resultEl.textContent = given < amount
        ? `一度に出せるのは${MAX_SECRET_COINS}枚まで。🪙+${given} 手に入れた！`
        : `ガコン——🪙+${given} 手に入れた！`;
      resultEl.style.color = '#8fd6a0';
      this.onChange();
    };

    form.querySelector('#secret-go').addEventListener('click', run);
    passEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
    amountEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
  }

  #renderBattle() {
    this.titleEl.textContent = 'バトルゲート';
    this.keeperEl.textContent = '';
    this.noteEl.textContent = netReady()
      ? '同じ合言葉を入れた人どうしが、同じ部屋で一緒に戦えます。'
      : '合言葉を決めて出発します。オンラインで一緒に遊ぶには、src/data/netconfig.js に Supabase の設定が必要です。';

    const job = JOBS[this.loadout.jobId];
    const form = document.createElement('div');
    form.className = 'gate-form';
    form.innerHTML = `
      <label for="gate-name">なまえ（他の人に見えます）</label>
      <input id="gate-name" type="text" maxlength="12" autocomplete="off" value="${escapeHtml(playerName())}">
      <label for="gate-pass">合言葉</label>
      <div class="pass-row">
        <input id="gate-pass" type="text" maxlength="16" autocomplete="off" value="${escapeHtml(this.loadout.passphrase)}">
        <button id="gate-random" class="ghost" type="button">ランダム</button>
      </div>
      <div class="gate-summary">
        <span>${job.name} Lv${classLevelOf(job.id)}</span>
        <span>${this.loadout.items.map((id) => `${ITEMS[id].name} Lv${levelOf(id)}`).join('　')}</span>
        <span>${netReady() ? '🟢 オンライン' : '⚪ ひとりで遊ぶ'}</span>
      </div>
      <button id="gate-go" class="primary" type="button">バトルに出発する</button>`;
    this.listEl.appendChild(form);

    const input = form.querySelector('#gate-pass');
    const nameEl = form.querySelector('#gate-name');
    form.querySelector('#gate-random').addEventListener('click', () => {
      input.value = randomPass();
    });
    form.querySelector('#gate-go').addEventListener('click', () => {
      this.loadout.passphrase = input.value.trim() || 'ひとり';
      this.loadout.name = setPlayerName(nameEl.value) || playerName();
      this.close();
      this.onBattle();
    });
  }
}

const WORDS = ['あかつき', 'ゾンビ', 'シャベル', 'まんげつ', 'ひまわり', 'かみなり', 'こもれび', 'てっぺき'];

export function randomPass() {
  return WORDS[Math.floor(Math.random() * WORDS.length)] + Math.floor(10 + Math.random() * 90);
}

// 職業専用アイテムは、その職業のときだけ持たせる。持っていない武器も外す
export function syncJobItems(loadout) {
  const slots = maxSlots(loadout.jobId);
  loadout.items = loadout.items.filter((id) => {
    if (ITEMS[id].jobOnly) return ITEMS[id].jobOnly === loadout.jobId;
    return ownsItem(id);
  });
  for (const id of SELECTABLE_ITEMS) {
    const item = ITEMS[id];
    if (item.jobOnly === loadout.jobId && !loadout.items.includes(id)) {
      if (loadout.items.length >= slots) loadout.items.pop();
      loadout.items.unshift(id);
    }
  }
  if (!loadout.items.length) loadout.items.push('shovel');
  loadout.items = loadout.items.slice(0, slots);
}
