/* =========================================================
 * 計算・検索などの「考える」部分（画面には触らない関数だけ）
 * ========================================================= */
'use strict';

/* ---------- 文字のゆれを吸収 ----------
 * 「ショートケーキ」「しょーとけーき」「ｼｮｰﾄｹｰｷ」を同じものとして扱う */
function normalizeText(text) {
  return String(text == null ? '' : text)
    .normalize('NFKC') // 全角英数→半角、半角カナ→全角
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60)) // カタカナ→ひらがな
    .replace(/[-‐‑–—―]/g, 'ー')
    .replace(/[\s・()%]/g, '');
}

function makeSearchItem(item, words) {
  item.key = normalizeText(item.name);
  item.parts = item.name.split(/[（）()・]/).map(normalizeText).filter(Boolean);
  item.aliases = String(words || '').split(/\s+/).map(normalizeText).filter(Boolean);
  return item;
}

/* ---------- データ表 → 検索しやすい形に ---------- */
const FOODS = [];
FOOD_CATEGORIES.forEach((cat) => {
  (FOOD_TABLE[cat.id] || []).forEach(([name, kcal, unit, emoji, words]) => {
    FOODS.push(makeSearchItem({ kind: 'food', id: 'food:' + name, name, kcal, unit, emoji, cat: cat.id }, words));
  });
});

const DRINKS = DRINK_TABLE.map(([name, per100, sizeKey, emoji, words]) =>
  makeSearchItem(
    { kind: 'drink', id: 'drink:' + name, name, per100, emoji, sizes: DRINK_SIZES[sizeKey] || DEFAULT_DRINK_SIZES },
    words
  )
);

/* ---------- 検索 ---------- */
function matchScore(item, q) {
  if (!q) return 0;
  if (item.key === q) return 100; // 名前と完全一致
  if (item.aliases.includes(q)) return 90; // 別名と完全一致
  if (item.key.startsWith(q)) return 80;
  if (item.aliases.some((a) => a.startsWith(q))) return 70;
  if (item.key.includes(q)) return 60;
  if (item.aliases.some((a) => a.includes(q))) return 50;
  // 入力のほうが長いとき（例：「いちごのショートケーキ」→ ショートケーキ）
  if (q.length >= 3) {
    if (item.key.length >= 3 && q.includes(item.key)) return 45;
    if (item.parts.length > 1 && item.parts.every((p) => q.includes(p))) return 44;
    if (item.aliases.some((a) => a.length >= 3 && q.includes(a))) return 40;
  }
  return 0;
}

/* 一致度の高い順に [{ item, score }] を返す */
function searchItems(list, query, limit) {
  const q = normalizeText(query);
  if (!q) return [];
  const hits = [];
  list.forEach((item, order) => {
    const score = matchScore(item, q);
    if (score > 0) hits.push({ item, score, order });
  });
  hits.sort((a, b) => b.score - a.score || a.order - b.order);
  // はっきり一致する候補があるときは、こじつけ気味の候補（「ぎゅうどん」→ うどん 等）を出さない
  const strong = hits.length && hits[0].score >= 80 ? hits.filter((h) => h.score >= 50) : hits;
  return strong.slice(0, limit || 30);
}

/* 「これしかない」と言える候補があれば返す（カロリー自動入力に使う） */
function pickExactMatch(hits) {
  const byName = hits.filter((h) => h.score === 100);
  if (byName.length === 1) return byName[0].item;
  if (byName.length === 0) {
    const byAlias = hits.filter((h) => h.score === 90);
    if (byAlias.length === 1) return byAlias[0].item;
  }
  return null;
}

/* ---------- のみもの計算機 ---------- */
function drinkKcal(per100, ml) {
  const a = Number(per100);
  const b = Number(ml);
  if (!isFinite(a) || !isFinite(b) || a <= 0 || b <= 0) return 0;
  return Math.round((a * b) / 100);
}

/* ---------- 成長（太り具合） ---------- */
function findAnimal(id) {
  return ANIMALS.find((a) => a.id === id) || null;
}

function levelThresholdKcal(animal, index) {
  return Math.round(LEVELS[index].days * animal.dailyKcal);
}

/* その動物が kcal ぶん食べたときの状態をまとめて返す */
function growthOf(animal, kcal) {
  const total = Math.max(0, Number(kcal) || 0);
  let index = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    if (total >= levelThresholdKcal(animal, i)) index = i;
  }
  const isMax = index === LEVELS.length - 1;
  const base = levelThresholdKcal(animal, index);
  const nextKcal = isMax ? null : levelThresholdKcal(animal, index + 1);
  const progress = isMax ? 1 : (total - base) / (nextKcal - base);
  return {
    kcal: total,
    days: total / animal.dailyKcal, // ごはん何日分か
    index,
    level: index + 1,
    title: LEVELS[index].title,
    isMax,
    next: isMax ? null : LEVELS[index + 1],
    nextKcal,
    remainKcal: isMax ? 0 : nextKcal - total,
    progress, // 次のレベルまでの進み具合 0〜1
    fatness: Math.min(1, (index + (isMax ? 0 : progress)) / (LEVELS.length - 1)), // 見た目の丸さ 0〜1
  };
}

/* ---------- 表示用の整形 ---------- */
function formatKcal(value) {
  return Math.round(Number(value) || 0).toLocaleString('ja-JP');
}

function trimZeros(text) {
  return text.indexOf('.') >= 0 ? text.replace(/\.?0+$/, '') : text;
}

/* 「ごはん何日分」を読みやすく。1日に満たないときは「1日分の◯%」で表す */
function formatDays(days) {
  const d = Math.max(0, Number(days) || 0);
  if (d === 0) return { value: '0', unit: '日分', lead: '', text: '0日分' };
  if (d >= 99.95) {
    const v = Math.round(d).toLocaleString('ja-JP');
    return { value: v, unit: '日分', lead: '', text: v + '日分' };
  }
  if (d >= 1) {
    const v = trimZeros(d.toFixed(1));
    return { value: v, unit: '日分', lead: '', text: v + '日分' };
  }
  const pct = d * 100;
  let v;
  let unit = '%';
  if (pct >= 10) v = String(Math.min(99, Math.round(pct)));
  else if (pct >= 1) v = trimZeros(pct.toFixed(1));
  else if (pct >= 0.01) v = trimZeros(pct.toFixed(2));
  else {
    v = '0.01';
    unit = '%未満';
  }
  return { value: v, unit, lead: '1日分の', text: '1日分の' + v + unit };
}

function formatQty(qty) {
  return qty === 0.5 ? '半分' : '×' + qty;
}

/* ---------- 日付 ---------- */
function dayKey(time) {
  const d = new Date(time);
  const pad = (v) => String(v).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function dayLabel(key, now) {
  const today = dayKey(now);
  const yesterday = dayKey(now - 24 * 60 * 60 * 1000);
  if (key === today) return 'きょう';
  if (key === yesterday) return 'きのう';
  const [y, m, d] = key.split('-').map(Number);
  const week = '日月火水木金土'[new Date(y, m - 1, d).getDay()];
  const head = y === new Date(now).getFullYear() ? '' : y + '年';
  return head + m + '月' + d + '日（' + week + '）';
}

function timeLabel(time) {
  const d = new Date(time);
  return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
}

/* ---------- 安全に画面へ出す ---------- */
function escapeHtml(text) {
  return String(text == null ? '' : text).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
