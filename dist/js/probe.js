// Временный замер (Влад 19.11, iPhone): смена фона главной при прокрутке пальцем. Включается
// только адресом с ?probe — посетители его не видят. Пишет каждый кадр (время, прокрутка,
// цвет фона, палец на экране) и события; через 14 с после первого касания показывает итог
// поверх страницы. Удалить, когда причина найдена.
export function setupProbe() {
  const t0 = performance.now(), F = [], E = [];
  const now = () => Math.round(performance.now() - t0);
  let touching = false, first = 0, shown = false;
  const ev = (m) => E.push([now(), m + (touching ? ' [палец]' : '')]);
  addEventListener('touchstart', () => { touching = true; if (!first) { first = now(); setTimeout(show, 14000); } }, { passive: true, capture: true });
  addEventListener('touchend', () => { touching = false; ev('палец убран'); }, { passive: true, capture: true });
  addEventListener('scrollend', () => ev('прокрутка остановилась'));
  new MutationObserver(() => ev(document.body.classList.contains('is-dark') ? 'ТЁМНЫЙ' : 'СВЕТЛЫЙ')).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  document.querySelectorAll('video').forEach((v) => ['loadstart', 'playing'].forEach((e) => v.addEventListener(e, () => ev(e + ' ' + v.className.split(' ')[0]))));
  const red = () => +getComputedStyle(document.body).backgroundColor.match(/\d+/)[0];
  const tick = (t) => { if (!shown) { F.push([Math.round(t - t0), Math.round(scrollY), red(), touching ? 1 : 0]); requestAnimationFrame(tick); } };
  requestAnimationFrame(tick);
  function show() {
    shown = true;
    const lines = [`старт касаний ${first} мс, кадров ${F.length}, окно ${innerWidth}×${innerHeight}`];
    for (const [t, m] of E) {
      if (!/ТЁМНЫЙ|СВЕТЛЫЙ/.test(m)) continue;
      const win = F.filter((f) => f[0] >= t && f[0] <= t + 1400);
      let gap = 0; for (let i = 1; i < win.length; i++) gap = Math.max(gap, win[i][0] - win[i - 1][0]);
      const at = (d) => { const f = F.find((x) => x[0] >= t + d); return f ? f[2] : '-'; };
      lines.push(`${t} мс ${m}: кадров за 1,4 с ${win.length}, макс. пауза ${gap} мс, палец ${win.filter((f) => f[3]).length}/${win.length}; цвет +0 ${at(0)} +300 ${at(300)} +600 ${at(600)} +900 ${at(900)} +1300 ${at(1300)}`);
    }
    let big = 0; for (let i = 1; i < F.length; i++) if (F[i][0] - F[i - 1][0] > 60) big++;
    lines.push(`пауз между кадрами >60 мс за всё время: ${big}`);
    lines.push('события: ' + E.map(([t, m]) => `${t} ${m}`).join('; '));
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;inset:auto 8px 90px 8px;max-height:60vh;overflow:auto;z-index:99999;background:#fff;color:#000;font:12px/1.35 -apple-system,sans-serif;padding:10px;border:2px solid #e2231a;border-radius:12px;white-space:pre-wrap;user-select:text;-webkit-user-select:text';
    box.textContent = 'ЗАМЕР (сделайте снимок экрана или «Скопировать»)\n' + lines.join('\n');
    const copy = document.createElement('button');
    copy.textContent = 'Скопировать'; copy.style.cssText = 'display:block;margin-top:8px;padding:8px 14px;font:600 14px -apple-system,sans-serif';
    copy.onclick = () => navigator.clipboard?.writeText(lines.join('\n')).then(() => { copy.textContent = 'Скопировано'; });
    box.append(copy); document.body.append(box);
  }
}
