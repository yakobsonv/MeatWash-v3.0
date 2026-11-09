// Окно-галерея проекта (Влад 07.11: оклейка Mercedes-Benz W223, Range Rover, BMW G20 на /wrap и /works).
// Разметку пишет подстановка projects (scripts/pages.mjs): плашки button[data-gallery-open=<id>] и одно
// окно dialog.dialog--gallery[data-gallery] на ряд; фото проекта лежат в <template data-gallery-project>
// и попадают в ленту только при открытии — до нажатия браузер их не запрашивает.
// Лента — горизонтальная прокрутка со snap: свайп и тачпад листают её сами, стрелки на экране,
// ←/→ (Home/End) с клавиатуры — по одному кадру; при «меньше движения» — без плавной прокрутки.
// «Оставить заявку» в нижней полосе — data-request (ui.js): окно заявки встаёт поверх галереи, после него
// человек возвращается к тому же кадру.
// Закрытие по Esc — штатное у <dialog>; блокировка прокрутки, ловушка фокуса — ui.js (dialog.dialog).
// Фокус после закрытия — на плашку, которая открыла окно (Safari не ставит фокус на кнопку по клику).
// «Назад» в браузере закрывает окно: при открытии — запись в истории { gallery }.
// Подключает site.js, когда на странице есть [data-gallery]. Вид — css/projects.css.
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function setup(dialog) {
  const track = dialog.querySelector('[data-gallery-track]');
  const title = dialog.querySelector('[data-gallery-title]');
  const lead = dialog.querySelector('[data-gallery-lead]');
  const index = dialog.querySelector('[data-gallery-index]');
  const total = dialog.querySelector('[data-gallery-total]');
  const status = dialog.querySelector('[data-gallery-status]');
  const note = dialog.querySelector('[data-gallery-note]');
  const prev = dialog.querySelector('[data-gallery-prev]');
  const next = dialog.querySelector('[data-gallery-next]');
  const tiles = [...document.querySelectorAll(`[data-gallery-open][aria-controls="${CSS.escape(dialog.id)}"]`)];
  if (!track || !tiles.length) return;

  let shown = '', current = 0, opener = null, frame = 0, settle = 0, aim = -1;
  const slides = () => [...track.children];

  // Кадры прилипают левым краем к полю ленты (scroll-padding в projects.css). Текущий — ближайший к нему.
  // На ширине от 760 лента кончается у правого края: последние кадры до левого поля не доезжают —
  // у них цель прокрутки одна, край ленты. Там текущим остаётся выбранный стрелкой, иначе — первый из них.
  const pad = () => parseFloat(getComputedStyle(track).scrollPaddingLeft) || 0;
  const end = () => Math.max(0, track.scrollWidth - track.clientWidth);
  const target = (s) => Math.min(s.offsetLeft - pad(), end());
  const nearest = () => {
    const list = slides();
    if (track.scrollLeft >= end() - 1) {
      if (list[current] && list[current].offsetLeft - pad() >= end() - 1) return current;
      const k = list.findIndex((s) => s.offsetLeft - pad() >= end() - 1);
      if (k >= 0) return k;
    }
    const edge = track.scrollLeft + pad();
    let best = 0, gap = Infinity;
    list.forEach((s, i) => { const d = Math.abs(s.offsetLeft - edge); if (d < gap) { gap = d; best = i; } });
    return best;
  };
  const caption = (i) => slides()[i]?.querySelector('figcaption')?.textContent || '';
  const mark = (i) => {
    const list = slides();
    current = i;
    index.textContent = String(i + 1);
    prev.setAttribute('aria-disabled', String(i === 0));
    next.setAttribute('aria-disabled', String(i === list.length - 1));
    list.forEach((s, k) => s.classList.toggle('is-current', k === i));
    if (note) note.textContent = caption(i);
    // Соседние кадры — заранее, чтобы следующий не догружался на глазах.
    for (const k of [i - 1, i + 1, i + 2]) { const img = list[k]?.querySelector('img'); if (img) img.loading = 'eager'; }
    clearTimeout(settle);
    settle = setTimeout(() => { status.textContent = `Фото ${i + 1} из ${list.length}: ${caption(i)}`; }, 250);
  };
  const go = (i, smooth = true) => {
    const list = slides();
    const k = Math.max(0, Math.min(list.length - 1, i));
    const s = list[k];
    if (!s) return;
    const left = target(s);
    // Пока лента едет к выбранному кадру, промежуточные кадры текущими не становятся (у края ленты
    // иначе вместо последнего кадра отметился бы первый из не доезжающих до поля).
    aim = Math.abs(track.scrollLeft - left) > 1 ? k : -1;
    track.scrollTo({ left, behavior: smooth && !reduced() ? 'smooth' : 'instant' });
    mark(k);
  };
  track.addEventListener('scroll', () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (aim >= 0) {
        const s = slides()[aim];
        if (s && Math.abs(track.scrollLeft - target(s)) > 1) return;
        aim = -1; return;
      }
      const i = nearest(); if (i !== current) mark(i);
    });
  }, { passive: true });
  // Палец или колесо во время езды — дальше ведёт человек.
  for (const type of ['pointerdown', 'wheel', 'touchstart']) track.addEventListener(type, () => { aim = -1; }, { passive: true });

  const load = (id) => {
    if (shown === id) return true;
    const template = dialog.querySelector(`template[data-gallery-project="${CSS.escape(id)}"]`);
    if (!template) return false;
    const part = template.content.cloneNode(true);
    const t = part.querySelector('[data-gallery-title]'), l = part.querySelector('[data-gallery-lead]');
    title.innerHTML = t.innerHTML; lead.innerHTML = l.innerHTML; lead.hidden = !l.textContent.trim();
    t.remove(); l.remove();
    track.replaceChildren(...part.querySelectorAll('.gallery__slide'));
    const n = track.children.length;
    total.textContent = String(n);
    track.setAttribute('aria-label', `Фотографии: ${title.textContent} (${n})`);
    shown = id;
    return true;
  };

  const open = (tile) => {
    if (!load(tile.dataset.galleryOpen)) return;
    opener = tile;
    if (!dialog.open) {
      dialog.showModal();
      history.pushState({ gallery: dialog.id }, '');
    }
    dialog.scrollTop = 0;
    current = -1;
    go(0, false);
    status.textContent = '';
    // Фокус — на название проекта: диктор начинает с него, стрелки ←/→ работают сразу.
    title.focus({ preventScroll: true });
  };

  for (const tile of tiles) tile.addEventListener('click', (event) => { event.preventDefault(); open(tile); });
  // Нажатие на соседний кадр — перейти к нему.
  track.addEventListener('click', (event) => {
    const slide = event.target.closest('.gallery__slide');
    const i = slide ? slides().indexOf(slide) : -1;
    if (i >= 0 && i !== current) go(i);
  });
  // Окно заявки поверх галереи закрыто — фокус обратно на «Оставить заявку» (ui.js кнопки внутри окон не
  // запоминает, а Safari по клику фокус на кнопку не ставит и вернул бы его на само окно галереи).
  const cta = dialog.querySelector('.gallery__cta');
  cta?.addEventListener('click', () => {
    document.getElementById('request')?.addEventListener('close', () => requestAnimationFrame(() => {
      const active = document.activeElement;
      if (dialog.open && (!active || active === document.body || active === dialog || !dialog.contains(active))) cta.focus({ preventScroll: true });
    }), { once: true });
  });
  prev.addEventListener('click', () => { if (current > 0) go(current - 1); });
  next.addEventListener('click', () => { if (current < slides().length - 1) go(current + 1); });
  dialog.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
    if (step) { event.preventDefault(); go(current + step); }
    else if (event.key === 'Home') { event.preventDefault(); go(0); }
    else if (event.key === 'End') { event.preventDefault(); go(slides().length - 1); }
  });
  // Окно меняет размер (поворот телефона, окно браузера) — текущий кадр остаётся на месте.
  new ResizeObserver(() => { if (dialog.open && current >= 0) go(current, false); }).observe(track);

  dialog.addEventListener('close', () => {
    const active = document.activeElement;
    if (opener?.isConnected && (!active || active === document.body || dialog.contains(active))) opener.focus({ preventScroll: true });
    clearTimeout(settle);
    if (history.state?.gallery === dialog.id) history.back();
  });
  addEventListener('popstate', () => { if (dialog.open && history.state?.gallery !== dialog.id) dialog.close(); });
}

export function setupGallery() {
  document.querySelectorAll('dialog[data-gallery]').forEach(setup);
}
