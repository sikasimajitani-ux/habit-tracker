// iPhone版：PC版の window.api と同じ使い方で、記録をiPhoneの中（localStorage）に保存する。
(function () {
  const KEY = 'habit-tracker-v1';
  const COLORS = ['#2f9e44', '#1c7ed6', '#e8590c', '#ae3ec9', '#0c8599', '#e03131', '#f08c00'];
  const DEFAULT_HABITS = ['本で手法確認', '練習ソフト', '相場観察'];
  const pad = (n) => String(n).padStart(2, '0');
  const timeStr = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(KEY));
      if (data && Array.isArray(data.habits)) return data;
    } catch {}
    return {
      habits: DEFAULT_HABITS.map((name, i) => ({ name, color: COLORS[i % COLORS.length] })),
      running: {},
      entries: [],
    };
  }

  function save(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  function update(fn) {
    const data = load();
    const extra = fn(data);
    save(data);
    return { habits: data.habits, running: data.running, entries: data.entries, ...extra };
  }

  function findHabit(data, name) {
    const habit = data.habits.find((h) => h.name === name);
    if (!habit) throw new Error(`習慣「${name}」が見つかりません`);
    return habit;
  }

  const api = {
    async getState() {
      return update(() => {});
    },
    async start(name) {
      return update((d) => {
        findHabit(d, name);
        if (!d.running[name]) d.running[name] = new Date().toISOString();
      });
    },
    // 1分未満は押し間違いとみなして記録しない（PC版と同じ）
    async stop(name, memo) {
      return update((d) => {
        const startIso = d.running[name];
        if (!startIso) return { recorded: false };
        delete d.running[name];
        const start = new Date(startIso);
        const end = new Date();
        const minutes = Math.round((end - start) / 60000);
        if (minutes < 1) return { recorded: false };
        d.entries.push({
          date: Stats.toDateStr(start),
          habit: name,
          start: timeStr(start),
          end: timeStr(end),
          minutes,
          memo: String(memo || '').replace(/\r?\n/g, ' ').trim(),
        });
        return { recorded: true };
      });
    },
    async cancel(name) {
      return update((d) => {
        delete d.running[name];
      });
    },
    async addHabit(name) {
      name = String(name || '').trim();
      return update((d) => {
        if (!name) throw new Error('名前を入れてください');
        if (d.habits.some((h) => h.name === name)) throw new Error('同じ名前の習慣があります');
        d.habits.push({ name, color: COLORS[d.habits.length % COLORS.length] });
      });
    },
    async renameHabit(oldName, newName) {
      newName = String(newName || '').trim();
      return update((d) => {
        const habit = findHabit(d, oldName);
        if (!newName || newName === oldName) return;
        if (d.habits.some((h) => h.name === newName)) throw new Error('同じ名前の習慣があります');
        if (d.running[oldName]) throw new Error('計測中は名前を変えられません');
        habit.name = newName;
        for (const e of d.entries) if (e.habit === oldName) e.habit = newName;
      });
    },
    async removeHabit(name) {
      return update((d) => {
        d.habits = d.habits.filter((h) => h.name !== name);
        delete d.running[name];
      });
    },
    async moveHabit(name, dir) {
      return update((d) => {
        const i = d.habits.findIndex((h) => h.name === name);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= d.habits.length) return;
        [d.habits[i], d.habits[j]] = [d.habits[j], d.habits[i]];
      });
    },
    // PC版の「iPhoneから取り込み」で読むファイルの中身
    exportData() {
      const d = load();
      return { app: 'habit-tracker', source: 'iphone', exportedAt: new Date().toISOString(), habits: d.habits, entries: d.entries };
    },
  };

  window.api = api;
})();
