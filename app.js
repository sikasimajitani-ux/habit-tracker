/* global Stats */
const HEATMAP_WEEKS = 53; // 約1年分
const LEVELS = [0, 1, 15, 30, 60]; // 分：この値以上で1段ずつ濃くなる
const ALL = '__all__';

let state = { habits: [], running: {}, entries: [] };
const memos = {}; // 計測中に入力したメモ（再描画で消えないように保持）

const $ = (id) => document.getElementById(id);

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    if (k === 'style') for (const [prop, val] of Object.entries(v)) node.style.setProperty(prop, val);
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  node.append(...children.flat());
  return node;
}

function today() {
  return Stats.toDateStr(new Date());
}

function fmtMin(min) {
  if (min < 60) return `${min}分`;
  return `${Math.floor(min / 60)}時間${String(min % 60).padStart(2, '0')}分`;
}

function fmtHours(min) {
  return `${(min / 60).toFixed(1)}h`;
}

function fmtElapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':');
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2500);
}

async function run(fn) {
  try {
    const next = await fn();
    if (next) {
      state = next;
      render();
    }
    return next;
  } catch (err) {
    toast(String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
  }
}

function colorOf(name) {
  return (state.habits.find((h) => h.name === name) || {}).color || '#868e96';
}

// ---------- 上部の合計 ----------
function renderSummary() {
  const t = today();
  const items = [
    ['今日', Stats.sumSince(state.entries, t)],
    ['今週', Stats.sumSince(state.entries, Stats.weekStart(t))],
    ['今月', Stats.sumSince(state.entries, t.slice(0, 8) + '01')],
    ['累計', Stats.sumSince(state.entries, '0000-00-00')],
  ];
  $('summary').replaceChildren(
    ...items.map(([label, min]) => el('div', {}, el('b', {}, fmtHours(min)), el('span', {}, label))),
  );
  const d = new Date();
  $('today').textContent = d.toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
  });
}

// ---------- 習慣カード ----------
function renderCards() {
  const t = today();
  const cards = state.habits.map((h) => {
    const daily = Stats.dailyMinutes(state.entries, h.name);
    const startIso = state.running[h.name];
    const total = [...daily.values()].reduce((a, b) => a + b, 0);

    const body = [
      el('div', { class: 'card-title' },
        el('strong', {}, h.name),
        el('span', { class: 'streak' }, '継続 ', el('b', {}, String(Stats.streak(new Set(daily.keys()), t))), ' 日'),
      ),
      el('div', { class: 'card-stats' },
        el('span', {}, '今日 ', el('b', {}, fmtMin(daily.get(t) || 0))),
        el('span', {}, '累計 ', el('b', {}, fmtHours(total))),
      ),
    ];

    if (startIso) {
      const memo = el('input', {
        placeholder: 'ひとことメモ（任意）',
        oninput: (e) => (memos[h.name] = e.target.value),
      });
      memo.value = memos[h.name] || '';
      const started = new Date(startIso);
      body.push(
        el('div', { class: 'timer', 'data-start': startIso }, fmtElapsed(Date.now() - started)),
        el('div', { class: 'muted small' }, `${started.toTimeString().slice(0, 5)} に開始`),
        memo,
        el('button', { class: 'big stop', onclick: () => stop(h.name) }, '終了'),
        el('button', {
          class: 'link',
          onclick: () => confirm(`「${h.name}」の計測を取り消しますか？（記録されません）`) &&
            run(() => window.api.cancel(h.name)),
        }, '取り消す'),
      );
    } else {
      body.push(el('button', { class: 'big', onclick: () => run(() => window.api.start(h.name)) }, '開始'));
    }

    return el('div', { class: startIso ? 'card running' : 'card', style: { '--c': h.color } }, body);
  });
  $('cards').replaceChildren(...(cards.length ? cards : [el('p', { class: 'muted' }, '下の「習慣の追加・編集」から習慣を追加してください。')]));
}

async function stop(name) {
  const next = await run(() => window.api.stop(name, memos[name] || ''));
  if (!next) return;
  delete memos[name];
  toast(next.recorded ? `「${name}」を記録しました` : '1分未満だったので記録しませんでした');
}

function tickTimers() {
  for (const node of document.querySelectorAll('.timer[data-start]')) {
    node.textContent = fmtElapsed(Date.now() - new Date(node.dataset.start));
  }
}

// ---------- 積み重ね（草） ----------
function hexToRgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function levelOf(min) {
  let lv = 0;
  LEVELS.forEach((v, i) => { if (min >= v && v > 0) lv = i; });
  return lv;
}

function cellColor(color, lv) {
  return lv === 0 ? '' : hexToRgba(color, [0, 0.3, 0.5, 0.75, 1][lv]);
}

function renderHeatmapSelect() {
  const sel = $('heatmap-habit');
  const prev = sel.value || ALL;
  sel.replaceChildren(
    el('option', { value: ALL }, 'すべての習慣'),
    ...state.habits.map((h) => el('option', { value: h.name }, h.name)),
  );
  sel.value = [...sel.options].some((o) => o.value === prev) ? prev : ALL;
}

function renderHeatmap() {
  const sel = $('heatmap-habit').value;
  const habit = sel === ALL ? null : sel;
  const color = habit ? colorOf(habit) : '#2f9e44';
  const daily = Stats.dailyMinutes(state.entries, habit);
  const t = today();
  const first = Stats.addDays(Stats.weekStart(t), -7 * (HEATMAP_WEEKS - 1));

  const nodes = [];
  // 1列目：曜日ラベル
  nodes.push(el('div', { class: 'label' }, ''));
  ['月', '', '水', '', '金', '', '日'].forEach((w) => nodes.push(el('div', { class: 'label' }, w)));

  let lastMonth = Stats.addDays(first, 6).slice(5, 7); // 左端の週は月名を出さない（隣と重なるため）
  for (let w = 0; w < HEATMAP_WEEKS; w++) {
    const weekFirst = Stats.addDays(first, w * 7);
    // 月が切り替わった週に月名を出す
    const month = Stats.addDays(weekFirst, 6).slice(5, 7);
    nodes.push(el('div', { class: 'label' }, month !== lastMonth ? `${Number(month)}月` : ''));
    lastMonth = month;
    for (let d = 0; d < 7; d++) {
      const date = Stats.addDays(weekFirst, d);
      if (date > t) {
        nodes.push(el('div', { class: 'cell future' }));
        continue;
      }
      const min = daily.get(date) || 0;
      const cell = el('div', {
        class: date === t ? 'cell today' : 'cell',
        title: `${date}：${min ? fmtMin(min) : '記録なし'}`,
      });
      const bg = cellColor(color, levelOf(min));
      if (bg) cell.style.background = bg;
      nodes.push(cell);
    }
  }
  $('heatmap').replaceChildren(...nodes);
  $('heatmap').scrollLeft = $('heatmap').scrollWidth; // 画面が狭いときは最新の週を見せる

  $('legend').replaceChildren(
    '少ない',
    ...[0, 1, 2, 3, 4].map((lv) => el('i', { style: { background: cellColor(color, lv) || 'var(--empty)' } })),
    '多い',
    el('span', { class: 'legend-note' }, '（1分〜／15分〜／30分〜／60分〜）'),
  );
}

// ---------- 最近の記録 ----------
function renderRecent() {
  const rows = [...state.entries]
    .sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start))
    .slice(0, 10);
  if (!rows.length) {
    $('recent').replaceChildren(el('tr', {}, el('td', { class: 'muted' }, 'まだ記録がありません。「開始」を押してみましょう。')));
    return;
  }
  $('recent').replaceChildren(
    el('tr', {}, ['日付', '習慣', '時間帯', '時間', 'メモ'].map((h) => el('th', {}, h))),
    ...rows.map((e) =>
      el('tr', {},
        el('td', {}, e.date),
        el('td', {}, el('span', { class: 'dot', style: { background: colorOf(e.habit) } }), e.habit),
        el('td', {}, `${e.start}〜${e.end}`),
        el('td', { class: 'num' }, fmtMin(e.minutes)),
        el('td', { class: 'muted' }, e.memo),
      ),
    ),
  );
}

// ---------- 習慣の編集 ----------
function renderHabitList() {
  $('habit-list').replaceChildren(
    ...state.habits.map((h, i) =>
      el('li', {},
        el('span', {}, el('span', { class: 'dot', style: { background: h.color } }), h.name),
        el('button', { disabled: i === 0 ? '' : null, onclick: () => run(() => window.api.moveHabit(h.name, -1)) }, '↑'),
        el('button', { disabled: i === state.habits.length - 1 ? '' : null, onclick: () => run(() => window.api.moveHabit(h.name, 1)) }, '↓'),
        el('button', { onclick: (e) => startRename(e.target.closest('li'), h.name) }, '名前変更'),
        el('button', {
          class: 'danger',
          onclick: () => confirm(`「${h.name}」を一覧から外しますか？（過去の記録は残ります）`) &&
            run(() => window.api.removeHabit(h.name)),
        }, '外す'),
      ),
    ),
  );
}

// Electronでは prompt() が使えないので、その場で入力欄に切り替える
function startRename(li, oldName) {
  const input = el('input', { value: oldName });
  const save = () => run(() => window.api.renameHabit(oldName, input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') renderHabitList();
  });
  li.replaceChildren(
    input,
    el('button', { onclick: save }, '保存'),
    el('button', { onclick: renderHabitList }, 'やめる'),
  );
  input.style.flex = '1';
  input.focus();
  input.select();
}

function render() {
  renderSummary();
  renderCards();
  renderHeatmapSelect();
  renderHeatmap();
  renderRecent();
  renderHabitList();
}

$('heatmap-habit').addEventListener('change', renderHeatmap);
$('add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('add-name').value;
  if (await run(() => window.api.addHabit(name))) $('add-name').value = '';
});

// 日付が変わったら表示を更新（アプリを開きっぱなしにしても大丈夫なように）
let shownDate = today();
setInterval(() => {
  tickTimers();
  if (today() !== shownDate) {
    shownDate = today();
    render();
  }
}, 1000);

run(() => window.api.getState());
