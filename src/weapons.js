export class Weapons {
  // items はレベルを反映済みのアイテム（data/upgrades.js の upgradedItem）
  constructor(items, onEvent) {
    this.slots = items.filter(Boolean);
    this.onEvent = onEvent;
    this.index = 0;
    this.time = 0;
    this.anim = { name: 'idle', start: 0, duration: 0 };
    this.state = new Map();
    for (const item of this.slots) {
      this.state.set(item.id, { ammo: item.magazine ?? 0, readyAt: 0 });
    }
  }

  get current() {
    return this.slots[this.index] ?? null;
  }

  get currentState() {
    return this.current ? this.state.get(this.current.id) : null;
  }

  get busy() {
    return this.anim.name !== 'idle' && this.time < this.anim.start + this.anim.duration;
  }

  animProgress() {
    if (this.anim.name === 'idle') return { name: 'idle', t: 0 };
    const t = (this.time - this.anim.start) / this.anim.duration;
    if (t >= 1) return { name: 'idle', t: 0 };
    return { name: this.anim.name, t };
  }

  select(index) {
    if (index === this.index || !this.slots[index]) return;
    if (this.anim.name === 'reload') this.#play('idle', 0);
    this.index = index;
    this.#play('swap', 0.25);
  }

  update(dt) {
    this.time += dt;
    if (this.anim.name !== 'idle' && this.time >= this.anim.start + this.anim.duration) {
      if (this.anim.name === 'reload') {
        const item = this.current;
        this.state.get(item.id).ammo = item.magazine;
        this.onEvent({ type: 'reloaded', item });
      }
      this.#play('idle', 0);
    }
  }

  trigger() {
    const item = this.current;
    if (!item || this.busy) return;
    const st = this.state.get(item.id);
    if (this.time < st.readyAt) return;

    if (item.kind === 'gun') {
      if (st.ammo <= 0) {
        this.onEvent({ type: 'empty', item });
        return;
      }
      st.ammo--;
      st.readyAt = this.time + item.fireInterval;
      this.#play('fire', Math.min(item.fireInterval, 0.18));
      this.onEvent({ type: 'shoot', item });
    } else if (item.kind === 'melee') {
      st.readyAt = this.time + item.cooldown;
      this.#play('swing', item.swingTime);
      this.onEvent({ type: 'swing', item });
    } else if (item.kind === 'build') {
      // 建てられなかったら硬直させない
      if (this.onEvent({ type: 'build', item }) === false) return;
      st.readyAt = this.time + item.cooldown;
      this.#play('swing', item.swingTime);
    } else if (item.kind === 'magic') {
      // ロッドの範囲魔法。撃てなかったときは待ち時間を入れない
      if (this.onEvent({ type: 'cast', item }) === false) return;
      st.readyAt = this.time + item.cooldown;
      this.#play('cast', item.swingTime);
    } else if (item.kind === 'summon') {
      // チームロッド。呼べる味方がいなければ、待ち時間を入れない
      if (this.onEvent({ type: 'summon', item }) === false) return;
      st.readyAt = this.time + item.cooldown;
      this.#play('rally', item.swingTime);
    } else if (item.kind === 'buff') {
      // 拡声器。効果がかからなかったときは、待ち時間を入れない
      if (this.onEvent({ type: 'buff', item }) === false) return;
      st.readyAt = this.time + item.cooldown;
      this.#play('shout', item.swingTime);
    }
  }

  // いまの武器があと何秒で使えるようになるか（0 なら使える）
  cooldownLeft() {
    const st = this.currentState;
    return st ? Math.max(0, st.readyAt - this.time) : 0;
  }

  reload() {
    const item = this.current;
    // ハンマーのときは R で建てるものを切り替える
    if (item?.kind === 'build') {
      this.onEvent({ type: 'cycleBuild', item });
      return;
    }
    if (!item || item.kind !== 'gun' || this.busy) return;
    const st = this.state.get(item.id);
    if (st.ammo >= item.magazine) return;
    this.#play('reload', item.reloadTime);
  }

  // スキルなど、外からモーションを出したいとき用
  play(name, duration) {
    this.#play(name, duration);
  }

  #play(name, duration) {
    this.anim = { name, start: this.time, duration };
  }
}
