/* =========================================================
 * 画面の動き（表示・入力・アニメーション）
 *
 * ざっくりした流れ：
 *   1. 「がまんした！」→ 入力シートをひらく
 *   2. たべもの or のみもの計算機 でカロリーを決める
 *   3. 「あげる」→ 記録を保存して、どうぶつが食べて太る
 * ========================================================= */
'use strict';

(() => {
  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));

  const DAY_MS = 24 * 60 * 60 * 1000;
  const CAKE_KCAL = 350; // 太る速さのたとえに使う「ショートケーキ1個」
  const ALL_ITEMS = FOODS.concat(DRINKS);
  const media = (query) => !!(window.matchMedia && window.matchMedia(query).matches);
  const reduceMotion = media('(prefers-reduced-motion: reduce)');
  const finePointer = media('(pointer: fine)'); // マウス操作（＝キーボードが画面をふさがない）

  const el = {
    views: { home: $('#view-home'), log: $('#view-log'), animals: $('#view-animals') },
    tabs: $$('.tab'),
    sheet: $('#sheet'),
    sheetBody: $('.sheet-body'),
    formFood: $('#form-food'),
    formDrink: $('#form-drink'),
    foodRecent: $('#food-recent'),
    foodName: $('#food-name'),
    foodPicked: $('#food-picked'),
    foodBrowser: $('#food-browser'),
    foodCats: $('#food-cats'),
    foodSuggest: $('#food-suggest'),
    foodKcal: $('#food-kcal'),
    foodKcalHint: $('#food-kcal-hint'),
    foodQty: $('#food-qty'),
    foodTotal: $('#food-total'),
    foodPreview: $('#food-preview'),
    foodSubmit: $('#food-submit'),
    drinkName: $('#drink-name'),
    drinkPicked: $('#drink-picked'),
    drinkSuggest: $('#drink-suggest'),
    drinkPer100: $('#drink-per100'),
    drinkMl: $('#drink-ml'),
    drinkSizes: $('#drink-sizes'),
    drinkTotal: $('#drink-total'),
    drinkFormula: $('#drink-formula'),
    drinkSubmit: $('#drink-submit'),
    dialog: $('#dialog'),
    toast: $('#toast'),
    fx: $('#fx'),
  };

  /* 画面の一時的な状態（保存はしない） */
  const ui = {
    view: 'home',
    // item: リストから選んだもの / autoItem: 名前がぴったり一致して自動で見つけたもの
    food: { item: null, autoItem: null, autoKcal: false, qty: 1, cat: FOOD_CATEGORIES[0].id },
    drink: { item: null, autoItem: null, autoPer100: false },
    recent: [],
    bubble: null, // 次にホームを描くときのセリフ（nullなら状況から選ぶ）
    feeding: false,
    toastTimer: 0,
    undoEntry: null,
  };

  /* ---------- 小さな道具 ---------- */
  const activeAnimal = () => findAnimal(Store.active);
  const growthFor = (animal) => growthOf(animal, Store.kcalOf(animal.id));
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  function startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function petSvg(animal, growth, options) {
    return AnimalArt.render(
      animal.id,
      growth.fatness,
      Object.assign(
        { crown: growth.isMax, label: escapeHtml(Store.nameOf(animal.id) + '（' + animal.name + '・' + growth.title + '）') },
        options
      )
    );
  }

  /* 体脂肪に換算（1kg ≒ 7,200kcal） */
  function formatFat(kcal) {
    const grams = (kcal / KCAL_PER_KG_FAT) * 1000;
    if (grams >= 1000) return trimZeros((grams / 1000).toFixed(2)) + 'kg';
    return Math.round(grams) + 'g';
  }

  /* ---------- 画面の切りかえ ---------- */
  function showView(name) {
    ui.view = name;
    Object.keys(el.views).forEach((key) => {
      el.views[key].hidden = key !== name;
    });
    el.tabs.forEach((tab) => {
      const on = tab.dataset.to === name;
      tab.classList.toggle('is-active', on);
      if (on) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    });
    render();
    window.scrollTo(0, 0);
  }

  function render() {
    if (ui.view === 'log') renderLog();
    else if (ui.view === 'animals') renderAnimals();
    else renderHome();
  }

  /* =======================================================
   * ホーム
   * ===================================================== */
  function chooseLine(animal, growth) {
    if (growth.kcal === 0) return animal.voice.hungry[0];
    if (growth.fatness >= 0.7) return pick(animal.voice.full);
    const fedToday = Store.entries.some((e) => e.animal === animal.id && e.time >= startOfToday());
    return pick(fedToday ? animal.voice.fed : animal.voice.hungry);
  }

  function levelHtml(g) {
    const percent = Math.round(g.progress * 100);
    const foot = g.isMax
      ? 'さいこうレベル！ ここまでがまんできたあなたが、いちばんすごい。'
      : `あと <b>${formatKcal(g.remainKcal)}</b> kcal で「${g.next.title}」<span class="goal">（${g.next.goal}）</span>`;
    return `
      <section class="card level" aria-label="太り具合">
        <div class="level-row">
          <span class="lv">Lv.${g.level}</span>
          <span class="lv-title">${g.title}</span>
        </div>
        <div class="meter" role="progressbar" aria-label="次のレベルまで" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}">
          <div class="meter-fill" id="meter-fill" style="width:${(g.progress * 100).toFixed(1)}%"></div>
        </div>
        <p class="level-foot">${foot}</p>
      </section>`;
  }

  function renderHome() {
    const view = el.views.home;
    const animal = activeAnimal();
    if (!animal) {
      view.innerHTML = `
        <div class="welcome">
          <p class="welcome-emoji" aria-hidden="true">🍰 → 🐷</p>
          <h2>いっしょにがんばる相棒をえらぼう</h2>
          <p>がまんした食べ物のカロリーが、この子のごはんになるよ。<br>小さい子ほどすぐ太って、大きい子はじっくり育つ。</p>
        </div>
        <ul class="animal-list">${ANIMALS.map((a) => animalCardHtml(a, true)).join('')}</ul>`;
      return;
    }

    const g = growthFor(animal);
    const days = formatDays(g.days);
    const todayKcal = Store.kcalBetween(startOfToday(), Infinity);
    const top = AnimalArt.layout(animal.id, g.fatness, { crown: g.isMax }).top;
    const line = ui.bubble || chooseLine(animal, g);
    ui.bubble = null;

    view.innerHTML = `
      <div class="stage" style="--tint:${animal.tint}">
        <div class="stage-top">
          <button class="name-btn" type="button" data-action="rename" aria-label="名前を変える">
            <span class="pet-name">${escapeHtml(Store.nameOf(animal.id))}</span>
            <span class="pet-species">${animal.name}</span>
            <span class="pencil" aria-hidden="true">✎</span>
          </button>
          <p class="today"><span class="today-label">きょうのがまん</span><b>${formatKcal(todayKcal)}</b> kcal</p>
        </div>
        <div class="pet-wrap" id="pet-wrap" style="--top:${top.toFixed(3)}">
          <p class="bubble" id="bubble">${escapeHtml(line)}</p>
          <div class="pet" id="pet">${petSvg(animal, g)}</div>
        </div>
      </div>
      ${levelHtml(g)}
      <section class="tiles" aria-label="これまでの合計">
        <div class="tile">
          <span class="tile-label">あげたカロリー</span>
          <span class="tile-value"><span id="stat-kcal">${formatKcal(g.kcal)}</span><small>kcal</small></span>
        </div>
        <div class="tile">
          <span class="tile-label">${animal.name}のごはん</span>
          <span class="tile-value">${days.lead ? `<span class="lead-in">${days.lead}</span>` : ''}${days.value}<small>${days.unit}</small></span>
        </div>
      </section>
      ${Store.canSave ? '' : '<p class="warn">このブラウザでは記録を保存できない設定になっています。ページを閉じると記録が消えます。</p>'}
      <div class="cta-wrap">
        <button class="btn-primary" type="button" data-action="open-sheet">＋ がまんした！</button>
      </div>`;
  }

  /* =======================================================
   * どうぶつ一覧
   * ===================================================== */
  function animalCardHtml(animal, firstTime) {
    const g = growthFor(animal);
    const isActive = Store.active === animal.id;
    const cake = formatDays(CAKE_KCAL / animal.dailyKcal);
    const state = g.kcal > 0 ? `Lv.${g.level} ${g.title}・${formatKcal(g.kcal)} kcal` : 'まだ なにも食べていないよ';
    const button = isActive ? 'いっしょにいるよ' : firstTime ? 'この子にする' : 'この子にあげる';
    return `
      <li class="animal-card${isActive ? ' is-active' : ''}" style="--tint:${animal.tint}">
        <div class="animal-art">${petSvg(animal, g, { fit: true, label: '' })}</div>
        <div class="animal-info">
          <div class="animal-head">
            <span class="animal-name">${escapeHtml(Store.nameOf(animal.id))}</span>
            <span class="animal-species">${animal.name}</span>
            <span class="pace">${animal.pace}</span>
          </div>
          <p class="animal-facts">1日に必要 <b>約${formatKcal(animal.dailyKcal)} kcal</b><br>🍰 ケーキ1個で ごはん<b>${cake.text}</b></p>
        </div>
        <div class="animal-foot">
          <span class="animal-state">${state}</span>
          <button class="btn-small${isActive ? ' is-on' : ''}" type="button" data-action="choose-animal" data-id="${animal.id}">${button}</button>
        </div>
      </li>`;
  }

  function renderAnimals() {
    el.views.animals.innerHTML = `
      <h2 class="view-title">どうぶつ</h2>
      <p class="lead">太る速さは「おとなのその動物が1日に必要なカロリー」が基準。必要な量が少ない子ほど早く太るよ。交代はいつでもOK（あげたごはんは、その子のもの）。</p>
      <ul class="animal-list">${ANIMALS.map((a) => animalCardHtml(a, false)).join('')}</ul>
      <details class="basis">
        <summary>必要カロリーの計算のしかた</summary>
        <p>体重を保つのに必要なエネルギー（維持量）の目安です。個体や飼育環境で変わるので、あくまでゲーム用の基準として使っています。</p>
        <ul>
          ${ANIMALS.map(
            (a) => `
            <li><b>${a.name}：約${formatKcal(a.dailyKcal)} kcal/日</b><br>
              ${a.model}<br>${a.formula}<br>
              出典：<a href="${a.sourceUrl}" target="_blank" rel="noopener noreferrer">${a.source}</a></li>`
          ).join('')}
        </ul>
      </details>`;
  }

  /* =======================================================
   * きろく
   * ===================================================== */
  function logRowHtml(entry) {
    const animal = findAnimal(entry.animal);
    const sub = [entry.note, animal.emoji + ' ' + Store.nameOf(animal.id) + 'へ', timeLabel(entry.time)]
      .filter(Boolean)
      .join('・');
    return `
      <li class="log-row">
        <span class="log-emoji" aria-hidden="true">${escapeHtml(entry.emoji)}</span>
        <div class="log-main">
          <span class="log-name">${escapeHtml(entry.name)}</span>
          <span class="log-sub">${escapeHtml(sub)}</span>
        </div>
        <span class="log-kcal">${formatKcal(entry.kcal)}<small>kcal</small></span>
        <button class="log-del" type="button" data-action="delete-entry" data-id="${escapeHtml(entry.id)}" aria-label="${escapeHtml(entry.name)}の記録を消す">✕</button>
      </li>`;
  }

  function renderLog() {
    const view = el.views.log;
    const entries = Store.entries.slice().sort((a, b) => b.time - a.time);
    if (!entries.length) {
      view.innerHTML = `
        <h2 class="view-title">がまんのきろく</h2>
        <div class="empty">
          <p class="empty-emoji" aria-hidden="true">📒</p>
          <p>まだ記録がないよ。<br>なにかがまんできたら、ホームの「がまんした！」から記録しよう。</p>
        </div>`;
      return;
    }

    const now = Date.now();
    const today = startOfToday();
    const total = Store.totalKcal();

    // 日ごとにまとめる（新しい日が上）
    const days = [];
    entries.forEach((entry) => {
      const key = dayKey(entry.time);
      let day = days[days.length - 1];
      if (!day || day.key !== key) {
        day = { key, sum: 0, rows: [] };
        days.push(day);
      }
      day.sum += entry.kcal;
      day.rows.push(entry);
    });

    view.innerHTML = `
      <h2 class="view-title">がまんのきろく</h2>
      <section class="card hero">
        <p class="hero-label">これまでにがまんしたカロリー</p>
        <p class="hero-value">${formatKcal(total)}<small>kcal</small></p>
        <p class="hero-note">体脂肪にすると 約<b>${formatFat(total)}</b>ぶん<br><small>（体脂肪1kg ≒ ${formatKcal(KCAL_PER_KG_FAT)}kcal で計算）</small></p>
      </section>
      <section class="tiles" aria-label="最近の合計">
        <div class="tile">
          <span class="tile-label">きょう</span>
          <span class="tile-value">${formatKcal(Store.kcalBetween(today, Infinity))}<small>kcal</small></span>
        </div>
        <div class="tile">
          <span class="tile-label">この7日間</span>
          <span class="tile-value">${formatKcal(Store.kcalBetween(today - 6 * DAY_MS, Infinity))}<small>kcal</small></span>
        </div>
      </section>
      ${days
        .map(
          (day) => `
        <section class="day">
          <h3 class="day-head"><span>${dayLabel(day.key, now)}</span><span>計 ${formatKcal(day.sum)} kcal</span></h3>
          <ul class="log-card">${day.rows.map(logRowHtml).join('')}</ul>
        </section>`
        )
        .join('')}`;
  }

  /* =======================================================
   * 入力シート
   * ===================================================== */
  function openSheet() {
    if (!activeAnimal() || ui.feeding) return;
    resetFoodForm();
    resetDrinkForm();
    setSheetTab('food');
    el.sheet.hidden = false;
    document.body.classList.add('is-locked');
    if (finePointer) el.foodName.focus();
  }

  function closeSheet() {
    el.sheet.hidden = true;
    document.body.classList.remove('is-locked');
  }

  function setSheetTab(tab) {
    el.formFood.hidden = tab !== 'food';
    el.formDrink.hidden = tab !== 'drink';
    $$('.seg-btn', el.sheet).forEach((button) => {
      const on = button.dataset.tab === tab;
      button.classList.toggle('is-active', on);
      button.setAttribute('aria-selected', String(on));
    });
    el.sheetBody.scrollTop = 0;
  }

  function submitLabel() {
    const animal = activeAnimal();
    return animal ? animal.emoji + ' ' + Store.nameOf(animal.id) + 'に あげる' : 'あげる';
  }

  /* 「これをあげるとどうなるか」の予告 */
  function previewHtml(kcal) {
    const animal = activeAnimal();
    const now = growthFor(animal);
    const after = growthOf(animal, now.kcal + kcal);
    const text = escapeHtml(Store.nameOf(animal.id)) + 'のごはん ' + formatDays(kcal / animal.dailyKcal).text + ' になるよ';
    return after.index > now.index ? text + '<br><span class="up">★ レベルアップ！「' + after.title + '」に</span>' : text;
  }

  function pickedHtml(emoji, name, sub, undoAction) {
    return `
      <span class="picked-emoji" aria-hidden="true">${escapeHtml(emoji)}</span>
      <span class="picked-main">
        <span class="picked-name">${escapeHtml(name)}</span>
        <span class="picked-sub">${escapeHtml(sub)}</span>
      </span>
      <button class="link-btn" type="button" data-action="${undoAction}">えらびなおす</button>`;
  }

  function suggestRowHtml(item) {
    if (item.kind === 'drink') {
      return `
        <li><button type="button" data-action="pick-drink" data-id="${escapeHtml(item.id)}">
          <span class="sg-emoji" aria-hidden="true">${item.emoji}</span>
          <span class="sg-name">${escapeHtml(item.name)}<span class="sg-unit">のみもの計算機でひらく</span></span>
          <span class="sg-kcal">${item.per100}<small>kcal/100ml</small></span>
        </button></li>`;
    }
    return `
      <li><button type="button" data-action="pick-food" data-id="${escapeHtml(item.id)}">
        <span class="sg-emoji" aria-hidden="true">${item.emoji}</span>
        <span class="sg-name">${escapeHtml(item.name)}<span class="sg-unit">${escapeHtml(item.unit)}</span></span>
        <span class="sg-kcal">${formatKcal(item.kcal)}<small>kcal</small></span>
      </button></li>`;
  }

  /* ---------- たべもの ---------- */
  function resetFoodForm() {
    Object.assign(ui.food, { item: null, autoItem: null, autoKcal: false, qty: 1 });
    el.foodName.value = '';
    el.foodKcal.value = '';
    renderRecent();
    renderFoodList();
    renderFoodTotal();
  }

  /* 最近の記録から、同じものをワンタップで入れられるボタン */
  function renderRecent() {
    const seen = new Set();
    const list = [];
    for (let i = Store.entries.length - 1; i >= 0 && list.length < 5; i--) {
      const entry = Store.entries[i];
      const key = entry.name + '|' + entry.kcal;
      if (!seen.has(key)) {
        seen.add(key);
        list.push(entry);
      }
    }
    ui.recent = list;
    el.foodRecent.hidden = list.length === 0;
    el.foodRecent.innerHTML = list.length
      ? `<p class="recent-title">さいきんのがまん（タップで同じものを入力）</p>
         <div class="chips">${list
           .map(
             (entry, i) =>
               `<button class="chip" type="button" data-action="pick-recent" data-index="${i}">${escapeHtml(entry.emoji)} ${escapeHtml(entry.name)}<small>${formatKcal(entry.kcal)}kcal</small></button>`
           )
           .join('')}</div>`
      : '';
  }

  function renderFoodList() {
    const f = ui.food;
    if (f.item) {
      el.foodBrowser.hidden = true;
      el.foodPicked.hidden = false;
      const sub = f.item.isRecent
        ? '前回の記録とおなじ（' + formatKcal(f.item.kcal) + ' kcal）'
        : f.item.unit + 'あたり ' + formatKcal(f.item.kcal) + ' kcal（目安）';
      el.foodPicked.innerHTML = pickedHtml(f.item.emoji, f.item.name, sub, 'unpick-food');
      return;
    }
    el.foodPicked.hidden = true;
    el.foodBrowser.hidden = false;

    const query = el.foodName.value.trim();
    el.foodCats.hidden = !!query;
    if (!query) {
      // 入力がないときはジャンルから選べる
      el.foodCats.innerHTML = FOOD_CATEGORIES.map(
        (c) =>
          `<button class="chip${c.id === f.cat ? ' is-on' : ''}" type="button" data-action="pick-cat" data-cat="${c.id}" aria-pressed="${c.id === f.cat}">${c.emoji} ${c.label}</button>`
      ).join('');
      el.foodSuggest.innerHTML = FOODS.filter((item) => item.cat === f.cat).map(suggestRowHtml).join('');
      return;
    }
    const hits = searchItems(ALL_ITEMS, query, 30);
    el.foodSuggest.innerHTML = hits.length
      ? hits.map((hit) => suggestRowHtml(hit.item)).join('')
      : `<li class="suggest-empty">「${escapeHtml(query)}」は一覧にないみたい。<br>下の「カロリー」に数字を入れれば、そのまま記録できるよ。</li>`;
  }

  function foodTotal() {
    const per = Number(el.foodKcal.value);
    if (!(per > 0)) return { total: 0, error: '' };
    if (per > 9999) return { total: 0, error: 'カロリーは 9,999 kcal までで入力してね' };
    return { total: Math.round(per * ui.food.qty), error: '' };
  }

  function renderFoodTotal() {
    const f = ui.food;
    const { total, error } = foodTotal();
    const item = f.item || f.autoItem;
    el.foodQty.textContent = f.qty === 0.5 ? '半分' : String(f.qty);
    el.foodKcalHint.textContent = item && !item.isRecent ? '（' + item.unit + 'あたり）' : '（1つあたり）';
    el.foodTotal.textContent = formatKcal(total);
    el.foodSubmit.disabled = total <= 0;
    el.foodSubmit.textContent = submitLabel();
    if (error) el.foodPreview.innerHTML = '<span class="bad">' + error + '</span>';
    else if (total > 0) {
      const auto = f.autoItem && f.autoKcal ? '「' + escapeHtml(f.autoItem.name) + '」のカロリーを自動で入れたよ<br>' : '';
      el.foodPreview.innerHTML = auto + previewHtml(total);
    } else el.foodPreview.textContent = '名前をえらぶか、カロリーを入力してね';
  }

  function selectFood(item) {
    Object.assign(ui.food, { item, autoItem: null, autoKcal: true, qty: 1 });
    el.foodName.value = item.name;
    el.foodKcal.value = item.kcal;
    el.foodName.blur(); // スマホのキーボードをしまう
    renderFoodList();
    renderFoodTotal();
  }

  function onFoodNameInput() {
    const f = ui.food;
    f.item = null;
    f.autoItem = null;
    if (f.autoKcal) {
      // 前に自動で入れた数字は、名前が変わったら消す（別の食べ物の数字が残らないように）
      el.foodKcal.value = '';
      f.autoKcal = false;
    }
    // 名前がぴったり一致したら、カロリーを自動で入れる
    const exact = pickExactMatch(searchItems(FOODS, el.foodName.value, 30));
    if (exact) {
      f.autoItem = exact;
      if (!el.foodKcal.value) {
        // 自分で数字を入れていないときだけ、目安のカロリーを入れる
        f.autoKcal = true;
        el.foodKcal.value = exact.kcal;
      }
    }
    renderFoodList();
    renderFoodTotal();
  }

  function stepQty(step) {
    const qty = ui.food.qty;
    if (step > 0) ui.food.qty = qty < 1 ? 1 : Math.min(20, qty + 1);
    else ui.food.qty = qty <= 1 ? 0.5 : qty - 1;
    renderFoodTotal();
  }

  function submitFood() {
    const f = ui.food;
    const { total } = foodTotal();
    if (total <= 0) return;
    const item = f.item || f.autoItem;
    const qtyNote = f.qty === 1 ? '' : formatQty(f.qty);
    const baseNote = item ? (item.isRecent ? item.note : item.unit) : '';
    feed({
      name: item ? item.name : el.foodName.value.trim() || 'がまんしたもの',
      kcal: total,
      kind: item ? item.kind : 'food',
      emoji: item ? item.emoji : '🍽️',
      note: [baseNote, qtyNote].filter(Boolean).join(' '),
    });
  }

  /* ---------- のみもの計算機 ---------- */
  function resetDrinkForm() {
    Object.assign(ui.drink, { item: null, autoItem: null, autoPer100: false });
    el.drinkName.value = '';
    el.drinkPer100.value = '';
    el.drinkMl.value = '';
    renderDrinkList();
    renderDrinkSizes();
    renderDrinkTotal();
  }

  function renderDrinkList() {
    const d = ui.drink;
    if (d.item) {
      el.drinkSuggest.hidden = true;
      el.drinkPicked.hidden = false;
      el.drinkPicked.innerHTML = pickedHtml(d.item.emoji, d.item.name, '100mlあたり ' + d.item.per100 + ' kcal（目安）', 'unpick-drink');
      return;
    }
    el.drinkPicked.hidden = true;
    el.drinkSuggest.hidden = false;
    const query = el.drinkName.value.trim();
    const items = query ? searchItems(DRINKS, query, 30).map((hit) => hit.item) : DRINKS;
    el.drinkSuggest.innerHTML = items.length
      ? items
          .map(
            (item) => `
        <li><button type="button" data-action="pick-drink" data-id="${escapeHtml(item.id)}">
          <span class="sg-emoji" aria-hidden="true">${item.emoji}</span>
          <span class="sg-name">${escapeHtml(item.name)}</span>
          <span class="sg-kcal">${item.per100}<small>kcal/100ml</small></span>
        </button></li>`
          )
          .join('')
      : `<li class="suggest-empty">「${escapeHtml(query)}」は一覧にないみたい。<br>ラベルの「100mlあたり」の数字を下に入れれば計算できるよ。</li>`;
  }

  function renderDrinkSizes() {
    const item = ui.drink.item || ui.drink.autoItem;
    const sizes = item ? item.sizes : DEFAULT_DRINK_SIZES;
    const current = Number(el.drinkMl.value);
    el.drinkSizes.innerHTML = sizes
      .map(
        ([label, ml]) =>
          `<button class="chip${current === ml ? ' is-on' : ''}" type="button" data-action="drink-size" data-ml="${ml}" aria-pressed="${current === ml}">${label}<small>${ml}ml</small></button>`
      )
      .join('');
  }

  function drinkTotal() {
    const per = Number(el.drinkPer100.value);
    const ml = Number(el.drinkMl.value);
    if (per > 900) return { per, ml, total: 0, error: '100mlあたりは 900 kcal までで入力してね' };
    if (ml > 9999) return { per, ml, total: 0, error: '量は 9,999 ml までで入力してね' };
    return { per, ml, total: drinkKcal(per, ml), error: '' };
  }

  function renderDrinkTotal() {
    const { per, ml, total, error } = drinkTotal();
    el.drinkTotal.textContent = formatKcal(total);
    el.drinkSubmit.disabled = total <= 0;
    el.drinkSubmit.textContent = submitLabel();
    if (error) el.drinkFormula.innerHTML = '<span class="bad">' + error + '</span>';
    else if (total > 0) {
      el.drinkFormula.innerHTML =
        per + ' kcal × ' + formatKcal(ml) + ' ml ÷ 100 ＝ ' + formatKcal(total) + ' kcal<br>' + previewHtml(total);
    } else el.drinkFormula.textContent = '「100mlあたり」と「飲む量」を入れると計算するよ';
  }

  function selectDrink(item) {
    setSheetTab('drink');
    Object.assign(ui.drink, { item, autoItem: null, autoPer100: true });
    el.drinkName.value = item.name;
    el.drinkPer100.value = item.per100;
    el.drinkName.blur();
    renderDrinkList();
    renderDrinkSizes();
    renderDrinkTotal();
  }

  function onDrinkNameInput() {
    const d = ui.drink;
    d.item = null;
    d.autoItem = null;
    if (d.autoPer100) {
      el.drinkPer100.value = '';
      d.autoPer100 = false;
    }
    const exact = pickExactMatch(searchItems(DRINKS, el.drinkName.value, 30));
    if (exact) {
      d.autoItem = exact;
      if (!el.drinkPer100.value) {
        d.autoPer100 = true;
        el.drinkPer100.value = exact.per100;
      }
    }
    renderDrinkList();
    renderDrinkSizes();
    renderDrinkTotal();
  }

  function submitDrink() {
    const { per, ml, total } = drinkTotal();
    if (total <= 0) return;
    const item = ui.drink.item || ui.drink.autoItem;
    feed({
      name: item ? item.name : el.drinkName.value.trim() || 'のみもの',
      kcal: total,
      kind: 'drink',
      emoji: item ? item.emoji : '🥤',
      note: formatKcal(ml) + 'ml（' + per + 'kcal/100ml）',
    });
  }

  /* =======================================================
   * あげる（記録 → 食べる → 太る）
   * ===================================================== */
  function feed(data) {
    const animal = activeAnimal();
    if (!animal || ui.feeding) return;
    const before = growthFor(animal);
    const entry = Store.addEntry(Object.assign({ animal: animal.id }, data));
    const after = growthFor(animal);
    closeSheet();

    const finish = () => {
      ui.feeding = false;
      ui.bubble = pick(animal.voice.fed);
      if (ui.view === 'home') renderHome();
      if (after.index > before.index) showLevelUp(animal, before, after);
      else {
        showToast(
          entry.emoji + ' +' + formatKcal(entry.kcal) + ' kcal ＝ ' + animal.name + 'のごはん' + formatDays(entry.kcal / animal.dailyKcal).text
        );
      }
    };

    const pet = $('#pet');
    if (reduceMotion || document.hidden || ui.view !== 'home' || !pet || !pet.animate) {
      finish();
      return;
    }

    // 演出：食べ物が飛ぶ → もぐもぐ → じわっと太る
    ui.feeding = true;
    window.scrollTo(0, 0);
    const wrap = $('#pet-wrap');
    const bubble = $('#bubble');
    if (bubble) bubble.textContent = 'あーん';
    flyFood(entry.emoji, pet, AnimalArt.layout(animal.id, before.fatness).mouth)
      .then(() => {
        pet.classList.add('is-eating');
        if (bubble) bubble.textContent = 'もぐもぐ…';
        const meter = $('#meter-fill');
        if (meter) meter.style.width = (after.index > before.index ? 100 : after.progress * 100) + '%';
        const stat = $('#stat-kcal');
        return tween(950, (t) => {
          const fatness = before.fatness + (after.fatness - before.fatness) * easeOut(t);
          pet.innerHTML = AnimalArt.render(animal.id, fatness, { crown: after.isMax && t === 1 });
          wrap.style.setProperty('--top', AnimalArt.layout(animal.id, fatness).top.toFixed(3));
          if (stat) stat.textContent = formatKcal(before.kcal + (after.kcal - before.kcal) * easeOut(t));
        });
      })
      .then(() => setTimeout(finish, 200));
  }

  /* 食べ物の絵文字を、画面の下から口元まで飛ばす */
  function flyFood(emoji, pet, mouth) {
    return new Promise((resolve) => {
      const rect = pet.getBoundingClientRect();
      const size = 40;
      const toX = rect.left + rect.width * mouth.x - size / 2;
      const toY = rect.top + rect.height * mouth.y - size / 2;
      const fromX = window.innerWidth / 2 - size / 2;
      const fromY = Math.min(window.innerHeight - 90, toY + 300);
      const node = document.createElement('span');
      node.className = 'fx-item';
      node.textContent = emoji;
      el.fx.appendChild(node);
      const done = () => {
        node.remove();
        resolve();
      };
      const animation = node.animate(
        [
          { transform: `translate(${fromX}px, ${fromY}px) scale(1.1) rotate(-14deg)`, opacity: 0 },
          { transform: `translate(${fromX + (toX - fromX) * 0.3}px, ${toY - 70}px) scale(1.3) rotate(8deg)`, opacity: 1, offset: 0.55 },
          { transform: `translate(${toX}px, ${toY}px) scale(0.3) rotate(0deg)`, opacity: 0.9 },
        ],
        { duration: 720, easing: 'cubic-bezier(.3, .6, .4, 1)' }
      );
      animation.onfinish = done;
      setTimeout(done, 1200); // 念のため（タブが裏にあるときなど）
    });
  }

  /* duration ミリ秒かけて、onFrame(0→1) を毎コマ呼ぶ */
  function tween(duration, onFrame) {
    return new Promise((resolve) => {
      const start = performance.now();
      let finished = false;
      const end = () => {
        if (finished) return;
        finished = true;
        onFrame(1);
        resolve();
      };
      const frame = (now) => {
        if (finished) return;
        const t = Math.min(1, Math.max(0, (now - start) / duration));
        if (t >= 1) {
          end();
          return;
        }
        onFrame(t);
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
      setTimeout(end, duration + 600); // 画面が裏にあってコマ送りが止まっても、必ず終わらせる
    });
  }

  /* =======================================================
   * 小窓（ダイアログ）・お知らせ
   * ===================================================== */
  function openDialog(html) {
    el.dialog.innerHTML = html;
    if (typeof el.dialog.showModal === 'function') {
      if (el.dialog.open) el.dialog.close();
      el.dialog.showModal();
    } else el.dialog.setAttribute('open', '');
  }

  function closeDialog() {
    if (typeof el.dialog.close === 'function') {
      if (el.dialog.open) el.dialog.close();
    } else el.dialog.removeAttribute('open');
  }

  function showLevelUp(animal, before, after) {
    openDialog(`
      <div class="dialog-body levelup">
        <p class="levelup-kicker">LEVEL UP!</p>
        <div class="levelup-art">${petSvg(animal, after, { fit: true, label: '' })}</div>
        <h2>${escapeHtml(Store.nameOf(animal.id))}が<br>「${after.title}」になった！</h2>
        <p class="levelup-lv">Lv.${before.level} → <b>Lv.${after.level}</b></p>
        <p>${LEVELS[after.index].goal}を食べたよ。<br>そのぶん、あなたはがまんできた！</p>
        <div class="dialog-actions">
          <button class="btn-primary" type="button" data-action="close-dialog">やったね！</button>
        </div>
      </div>`);
    confetti($('.dialog-body', el.dialog));
  }

  function confetti(host) {
    if (reduceMotion || !host || !host.animate) return;
    const layer = document.createElement('div');
    layer.className = 'confetti';
    host.appendChild(layer);
    const colors = ['#FF8A5B', '#FFD24D', '#7CC6FE', '#FF9AA5', '#9BD77E'];
    const count = 24;
    for (let i = 0; i < count; i++) {
      const piece = document.createElement('i');
      piece.style.background = colors[i % colors.length];
      layer.appendChild(piece);
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const distance = 80 + Math.random() * 100;
      const dx = Math.cos(angle) * distance;
      const dy = Math.sin(angle) * distance - 40;
      piece.animate(
        [
          { transform: 'translate(0, 0) rotate(0deg) scale(.6)', opacity: 1 },
          { transform: `translate(${dx}px, ${dy}px) rotate(${Math.random() * 360}deg) scale(1)`, opacity: 1, offset: 0.55 },
          { transform: `translate(${dx * 1.15}px, ${dy + 110}px) rotate(${Math.random() * 720}deg) scale(.9)`, opacity: 0 },
        ],
        { duration: 1300 + Math.random() * 500, easing: 'cubic-bezier(.2, .7, .3, 1)', fill: 'forwards' }
      );
    }
    setTimeout(() => layer.remove(), 2200);
  }

  function openRename() {
    const animal = activeAnimal();
    if (!animal) return;
    openDialog(`
      <form class="dialog-body" id="rename-form" autocomplete="off">
        <h2>名前をつけよう</h2>
        <label class="field">
          <span class="field-label">${animal.name}の名前（12文字まで）</span>
          <input class="input" id="rename-input" type="text" maxlength="12" value="${escapeHtml(Store.nameOf(animal.id))}">
        </label>
        <div class="dialog-actions">
          <button class="btn-ghost" type="button" data-action="close-dialog">やめる</button>
          <button class="btn-primary" type="submit">きめた！</button>
        </div>
      </form>`);
    const input = $('#rename-input');
    input.focus();
    input.select();
  }

  function openHelp() {
    openDialog(`
      <div class="dialog-body help">
        <h2>がまんペットのあそびかた</h2>
        <ol class="steps">
          <li><b>がまんできたら記録</b>食べたかったけど がまんしたものを「がまんした！」から入力。</li>
          <li><b>カロリーがごはんになる</b>がまんした分のカロリーを、かわりに相棒が食べるよ。</li>
          <li><b>食べた分だけ太る</b>その動物が1日に必要なカロリーを基準に、少しずつ丸くなる。</li>
        </ol>
        <h3>しっておいてね</h3>
        <ul class="notes">
          <li>カロリーは目安です（お店・商品・量で変わります）。入力画面で数字を直せます。</li>
          <li>食事を抜くためのアプリではなく、「食べすぎ・間食をひとつ がまんできた」を数えるアプリです。無理な食事制限はしないでね。</li>
          <li>記録はこのブラウザの中だけに保存されます（どこにも送信しません）。</li>
        </ul>
        <div class="dialog-actions">
          <button class="btn-primary" type="button" data-action="close-dialog">OK</button>
        </div>
        <button class="link-btn" type="button" data-action="reset-data">記録をぜんぶ消して はじめから</button>
      </div>`);
  }

  function showToast(text, action) {
    clearTimeout(ui.toastTimer);
    el.toast.innerHTML =
      '<span>' + escapeHtml(text) + '</span>' +
      (action ? `<button type="button" data-action="${action.name}">${action.label}</button>` : '');
    el.toast.classList.add('is-show');
    ui.toastTimer = setTimeout(() => el.toast.classList.remove('is-show'), action ? 6000 : 3400);
  }

  /* =======================================================
   * ボタンなどの操作（data-action="…" で呼び分ける）
   * ===================================================== */
  const actions = {
    nav: (target) => showView(target.dataset.to),
    'open-sheet': openSheet,
    'close-sheet': closeSheet,
    'sheet-tab': (target) => setSheetTab(target.dataset.tab),
    'open-help': openHelp,
    'close-dialog': closeDialog,
    rename: openRename,

    'choose-animal'(target) {
      const firstTime = !Store.active;
      const changed = Store.active !== target.dataset.id;
      Store.setActive(target.dataset.id);
      const animal = activeAnimal();
      if (firstTime) ui.bubble = 'よろしくね！';
      showView('home');
      if (!firstTime && changed) showToast(animal.emoji + ' ' + Store.nameOf(animal.id) + 'と いっしょにがんばろう');
    },

    'pick-cat'(target) {
      ui.food.cat = target.dataset.cat;
      renderFoodList();
      el.foodSuggest.scrollTop = 0;
    },

    'pick-food'(target) {
      const item = FOODS.find((x) => x.id === target.dataset.id);
      if (item) selectFood(item);
    },

    'pick-recent'(target) {
      const entry = ui.recent[Number(target.dataset.index)];
      if (!entry) return;
      selectFood({ kind: entry.kind, name: entry.name, kcal: entry.kcal, emoji: entry.emoji, note: entry.note, isRecent: true });
    },

    'unpick-food'() {
      resetFoodForm();
      if (finePointer) el.foodName.focus();
    },

    qty: (target) => stepQty(Number(target.dataset.step)),

    'pick-drink'(target) {
      const item = DRINKS.find((x) => x.id === target.dataset.id);
      if (item) selectDrink(item);
    },

    'unpick-drink'() {
      const ml = el.drinkMl.value;
      resetDrinkForm();
      el.drinkMl.value = ml; // 量はそのまま残す
      renderDrinkSizes();
      if (finePointer) el.drinkName.focus();
    },

    'drink-size'(target) {
      el.drinkMl.value = target.dataset.ml;
      renderDrinkSizes();
      renderDrinkTotal();
    },

    'delete-entry'(target) {
      const removed = Store.removeEntry(target.dataset.id);
      if (!removed) return;
      ui.undoEntry = removed;
      render();
      showToast('「' + removed.name + '」を消したよ', { name: 'undo-delete', label: '元に戻す' });
    },

    'undo-delete'() {
      if (!ui.undoEntry) return;
      Store.restoreEntry(ui.undoEntry);
      ui.undoEntry = null;
      render();
      showToast('元に戻したよ');
    },

    'reset-data'(target) {
      // まちがえて消さないように、2回押してはじめて消す
      if (target.dataset.armed !== '1') {
        target.dataset.armed = '1';
        target.textContent = 'ほんとうに消す？ もう一度おすと ぜんぶ消えます';
        return;
      }
      Store.reset();
      closeDialog();
      showView('home');
      showToast('はじめからにしたよ');
    },
  };

  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const run = actions[target.dataset.action];
    if (run) run(target, event);
  });

  // シートの外側（暗いところ）を押したら閉じる
  el.sheet.addEventListener('click', (event) => {
    if (event.target === el.sheet) closeSheet();
  });
  el.dialog.addEventListener('click', (event) => {
    if (event.target === el.dialog) closeDialog();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !el.sheet.hidden && !el.dialog.open) closeSheet();
  });

  // 入力欄
  el.foodName.addEventListener('input', onFoodNameInput);
  el.foodKcal.addEventListener('input', () => {
    ui.food.autoKcal = false; // 自分で直した数字は、名前を変えても消さない
    renderFoodTotal();
  });
  el.drinkName.addEventListener('input', onDrinkNameInput);
  el.drinkPer100.addEventListener('input', () => {
    ui.drink.autoPer100 = false;
    renderDrinkTotal();
  });
  el.drinkMl.addEventListener('input', () => {
    renderDrinkSizes();
    renderDrinkTotal();
  });

  // Enterキーでは送信せず、キーボードを閉じるだけ（日本語変換の確定とまちがえないように）
  [el.formFood, el.formDrink].forEach((form) => {
    form.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && event.target.tagName === 'INPUT') {
        event.preventDefault();
        if (!event.isComposing) event.target.blur();
      }
    });
  });
  el.formFood.addEventListener('submit', (event) => {
    event.preventDefault();
    submitFood();
  });
  el.formDrink.addEventListener('submit', (event) => {
    event.preventDefault();
    submitDrink();
  });

  el.dialog.addEventListener('submit', (event) => {
    if (event.target.id !== 'rename-form') return;
    event.preventDefault();
    const animal = activeAnimal();
    if (animal) Store.setName(animal.id, $('#rename-input').value);
    closeDialog();
    render();
  });

  // 別のタブで記録が変わったら、この画面も描きなおす
  Store.watch(() => {
    if (!ui.feeding) render();
  });

  showView('home');
})();
