// 「PCに送る」ボタン：記録をファイルにして共有メニュー（メールなど）を開く
(function () {
  const btn = document.getElementById('export-btn');
  const pad = (n) => String(n).padStart(2, '0');

  btn.addEventListener('click', async () => {
    const data = window.api.exportData();
    if (!data.entries.length) {
      toast('まだ記録がありません');
      return;
    }
    const d = new Date();
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
    const name = `習慣記録_iphone_${stamp}.json`;
    const file = new File([JSON.stringify(data, null, 2)], name, { type: 'application/json' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: `習慣記録 ${stamp}` });
      } catch (err) {
        if (err.name !== 'AbortError') toast('共有できませんでした');
      }
      return;
    }
    // 共有メニューが使えないときはファイルとして保存
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
})();
