/* =========================================================
 * データの保存（ブラウザの localStorage に入る。サーバーには送らない）
 *
 * 保存する形：
 *   active  … いま一緒にいる動物のid
 *   names   … つけた名前 { pig: 'ぶーちゃん' }
 *   entries … がまんの記録
 *     { id, time, name, kcal, animal, kind: 'food'|'drink', emoji, note }
 * ========================================================= */
'use strict';

const Store = (() => {
  const KEY = 'gaman-pet:v1';
  const MAX_KCAL = 99999;

  function blank() {
    return { version: 1, active: null, names: {}, entries: [] };
  }

  /* 壊れたデータが入っていても動くように、読みこむときに形を整える */
  function sanitize(data) {
    const clean = blank();
    if (!data || typeof data !== 'object') return clean;
    if (findAnimal(data.active)) clean.active = data.active;
    if (data.names && typeof data.names === 'object') {
      ANIMALS.forEach((a) => {
        const name = data.names[a.id];
        if (typeof name === 'string' && name.trim()) clean.names[a.id] = name.trim().slice(0, 12);
      });
    }
    if (Array.isArray(data.entries)) {
      data.entries.forEach((e) => {
        if (!e || typeof e !== 'object') return;
        const kcal = Math.round(Number(e.kcal));
        const time = Number(e.time);
        if (!(kcal > 0) || kcal > MAX_KCAL || !isFinite(time) || !findAnimal(e.animal)) return;
        clean.entries.push({
          id: String(e.id || makeId()),
          time,
          name: String(e.name || 'がまんしたもの').slice(0, 60),
          kcal,
          animal: e.animal,
          kind: e.kind === 'drink' ? 'drink' : 'food',
          emoji: String(e.emoji || '🍽️').slice(0, 8),
          note: String(e.note || '').slice(0, 60),
        });
      });
    }
    return clean;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? sanitize(JSON.parse(raw)) : blank();
    } catch (err) {
      return blank();
    }
  }

  function makeId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  let state = load();
  let canSave = true;
  let externalListener = null;

  // 別のタブで記録が変わったら読みなおす（古い内容で上書きして記録を消さないように）
  window.addEventListener('storage', (event) => {
    if (event.key !== KEY && event.key !== null) return;
    state = load();
    if (externalListener) externalListener();
  });

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      canSave = true;
    } catch (err) {
      canSave = false; // プライベートブラウズなど。画面は動くが、閉じると消える
    }
    return canSave;
  }

  return {
    get active() {
      return state.active;
    },
    get entries() {
      return state.entries;
    },
    get canSave() {
      return canSave;
    },

    setActive(id) {
      if (!findAnimal(id)) return;
      state.active = id;
      save();
    },

    nameOf(id) {
      const animal = findAnimal(id);
      return state.names[id] || (animal ? animal.defaultName : '');
    },

    setName(id, name) {
      const text = String(name || '').trim().slice(0, 12);
      if (text) state.names[id] = text;
      else delete state.names[id];
      save();
    },

    /* 記録を追加して、その記録を返す */
    addEntry({ name, kcal, animal, kind, emoji, note }) {
      const entry = {
        id: makeId(),
        time: Date.now(),
        name: String(name || 'がまんしたもの').slice(0, 60),
        kcal: Math.min(MAX_KCAL, Math.max(1, Math.round(Number(kcal) || 0))),
        animal,
        kind: kind === 'drink' ? 'drink' : 'food',
        emoji: emoji || '🍽️',
        note: note || '',
      };
      state.entries.push(entry);
      save();
      return entry;
    },

    removeEntry(id) {
      const index = state.entries.findIndex((e) => e.id === id);
      if (index < 0) return null;
      const [removed] = state.entries.splice(index, 1);
      save();
      return removed;
    },

    /* 「元に戻す」用：消した記録をもとの時刻の位置に戻す */
    restoreEntry(entry) {
      if (!entry || state.entries.some((e) => e.id === entry.id)) return;
      state.entries.push(entry);
      state.entries.sort((a, b) => a.time - b.time);
      save();
    },

    /* その動物にあげた合計カロリー */
    kcalOf(animalId) {
      return state.entries.reduce((sum, e) => (e.animal === animalId ? sum + e.kcal : sum), 0);
    },

    totalKcal() {
      return state.entries.reduce((sum, e) => sum + e.kcal, 0);
    },

    /* from以上 to未満 の時刻に記録した合計カロリー */
    kcalBetween(from, to) {
      return state.entries.reduce((sum, e) => (e.time >= from && e.time < to ? sum + e.kcal : sum), 0);
    },

    reset() {
      state = blank();
      save();
    },

    /* 別のタブで記録が変わったときに呼ぶ関数を登録する */
    watch(listener) {
      externalListener = listener;
    },
  };
})();
