// 積み重ねの集計。画面側（ブラウザ）とテスト（Node）の両方から使う。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Stats = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function toDateStr(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function addDays(dateStr, n) {
    const d = new Date(`${dateStr}T00:00:00`);
    d.setDate(d.getDate() + n);
    return toDateStr(d);
  }

  // habit を省略すると全習慣の合計
  function dailyMinutes(entries, habit) {
    const map = new Map();
    for (const e of entries) {
      if (habit && e.habit !== habit) continue;
      map.set(e.date, (map.get(e.date) || 0) + e.minutes);
    }
    return map;
  }

  // 継続日数：やった日を数える。1日休んでもOK、2日連続で休んだらそこで途切れる。
  // 今日まだやっていないのは「休み」とみなさない。
  function streak(doneDates, today) {
    const done = doneDates instanceof Set ? doneDates : new Set(doneDates);
    if (done.size === 0) return 0;
    const earliest = [...done].sort()[0];
    let d = done.has(today) ? today : addDays(today, -1);
    let count = 0;
    let misses = 0;
    while (d >= earliest) {
      if (done.has(d)) {
        count++;
        misses = 0;
      } else if (++misses >= 2) {
        break;
      }
      d = addDays(d, -1);
    }
    return count;
  }

  function sumSince(entries, fromDate, habit) {
    return entries
      .filter((e) => e.date >= fromDate && (!habit || e.habit === habit))
      .reduce((s, e) => s + e.minutes, 0);
  }

  function weekStart(today) {
    const d = new Date(`${today}T00:00:00`);
    const diff = (d.getDay() + 6) % 7; // 月曜はじまり
    return addDays(today, -diff);
  }

  return { dailyMinutes, streak, sumSince, weekStart, addDays, toDateStr };
});
