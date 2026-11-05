// Главная Meat Wash (план §3.1): перенос v2.js (source/v2-design, 625ce74) — три поведения
// эталона, которые CSS сам не делает:
//  1) страница темнеет, пока направления на экране, и светлеет после них (ref CarRange__toDark:
//     верх секции ≤ 12 % высоты окна, низ — ниже 49 %, в обе стороны);
//  2) слова заголовка секции светлеют по мере прокрутки (redomedia.co, 22.10);
//  3) на телефоне направления — карусель с пагинатором: активная точка заполняется за 9,5 s,
//     затем следующий слайд; пауза — кнопкой, касанием, фокусом;
//  4) клуб: карта и кадр расходятся при прокрутке (параллакс), карта наклоняется к курсору (до 8°)
//     и ловит блик (наклон — только мышь; всё — без «меньше движения»);
//  5) ряды «Наших работ» на телефоне (лента): фокус с клавиатуры прокручивает ленту к плашке.
// Своего наблюдения [data-reveal] нет: класс is-in ставит ui.js (план §3.1).
// Подключает site.js, когда на странице есть .dirs. Владелец: исполнитель главной.
export function setupHome() {
  const body = document.body;
  const dirs = document.querySelector('.dirs');
  if (!dirs) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  setupClub(reduce);
  setupWorksFocus(reduce);

  // 1. Цвет страницы.
  let queued = false;
  const paint = () => {
    queued = false;
    const r = dirs.getBoundingClientRect(), vh = window.innerHeight;
    body.classList.toggle('is-dark', r.top <= vh * 0.12 && r.bottom > vh * 0.49);
  };
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(paint); } };
  // Первое состояние — без перехода 1,2 s (перезагрузка посреди страницы).
  body.classList.add('no-tr');
  paint();
  requestAnimationFrame(() => requestAnimationFrame(() => body.classList.remove('no-tr')));
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue);

  // 2. Заливка слов заголовка: от тусклых к полным, пока верх заголовка идёт с 92 % до 40 %
  // высоты окна, слово за словом. Только чтение прокрутки; при «меньше движения» — выключено.
  const head = dirs.querySelector('.dirs__heading');
  const words = head ? [...head.querySelectorAll('.wd')] : [];
  if (words.length && !reduce.matches) {
    let fillQueued = false;
    const fill = () => {
      fillQueued = false;
      const vh = window.innerHeight, top = head.getBoundingClientRect().top;
      const p = Math.min(1, Math.max(0, (vh * 0.92 - top) / (vh * 0.52)));
      words.forEach((w, i) => w.style.setProperty('--k', Math.min(1, Math.max(0, p * words.length - i * 0.7)).toFixed(3)));
    };
    const queueFill = () => { if (!fillQueued) { fillQueued = true; requestAnimationFrame(fill); } };
    fill();
    window.addEventListener('scroll', queueFill, { passive: true });
    window.addEventListener('resize', queueFill);
  }

  // 3. Карусель на телефоне.
  const track = dirs.querySelector('.dirs__grid');
  const ctrl = dirs.querySelector('.dirs__controls');
  if (!track || !ctrl) return;
  const slides = [...track.querySelectorAll('.dir')];
  const dots = [...ctrl.querySelectorAll('.dirs__dot')];
  const play = ctrl.querySelector('.dirs__play');
  const phone = window.matchMedia('(max-width: 759px)');
  let index = 0, wantPlay = !reduce.matches;
  let inView = false, touching = false, focused = false, lockUntil = 0;

  const leftOf = (i) => {
    const s = slides[i].getBoundingClientRect(), t = track.getBoundingClientRect();
    return track.scrollLeft + (s.left - t.left) - (track.clientWidth - s.width) / 2;
  };
  const setActive = (i) => {
    dots[index]?.removeAttribute('aria-current');
    index = i;
    const d = dots[i];
    d.setAttribute('aria-current', 'true');
    // Заполнение 9,5 s — заново на новой точке.
    d.classList.add('is-restart');
    void d.offsetWidth;
    d.classList.remove('is-restart');
  };
  const go = (i) => {
    lockUntil = performance.now() + 1500;
    setActive(i);
    track.scrollTo({ left: leftOf(i), behavior: reduce.matches ? 'auto' : 'smooth' });
  };
  const sync = () => {
    const run = wantPlay && inView && !touching && !focused && phone.matches && !document.hidden;
    ctrl.classList.toggle('is-playing', run);
  };
  const setPlay = (on) => {
    wantPlay = on;
    if (!play) return;
    play.dataset.state = on ? 'playing' : 'paused';
    play.setAttribute('aria-label', on ? 'Остановить автопрокрутку' : 'Включить автопрокрутку');
  };

  dots.forEach((d, i) => d.addEventListener('click', () => go(i)));
  ctrl.addEventListener('animationend', (e) => {
    if (e.animationName === 'dot-progress' && phone.matches) go((index + 1) % slides.length);
  });
  play?.addEventListener('click', () => { setPlay(!wantPlay); sync(); });
  setPlay(wantPlay);
  reduce.addEventListener?.('change', () => { if (reduce.matches) { setPlay(false); sync(); } });

  // Активный слайд — ближайший к центру (свайп, фокус с клавиатуры).
  const pick = () => {
    if (!phone.matches) return;
    const mid = track.getBoundingClientRect().left + track.clientWidth / 2;
    let best = 0, dist = Infinity;
    slides.forEach((s, i) => {
      const r = s.getBoundingClientRect(), dd = Math.abs(r.left + r.width / 2 - mid);
      if (dd < dist) { dist = dd; best = i; }
    });
    if (best !== index) setActive(best);
  };
  let ticking = false;
  track.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; if (performance.now() >= lockUntil) pick(); });
  }, { passive: true });
  // Прокрутка улеглась (или плавную прокрутку точки прервали) — верим положению.
  track.addEventListener('scrollend', () => { lockUntil = 0; pick(); });
  track.addEventListener('touchstart', () => { touching = true; sync(); }, { passive: true });
  track.addEventListener('touchend', () => { touching = false; sync(); }, { passive: true });
  track.addEventListener('touchcancel', () => { touching = false; sync(); }, { passive: true });
  // Фокус с клавиатуры где угодно в карусели (слайды, точки, пауза) останавливает смену.
  dirs.addEventListener('focusin', () => { focused = true; sync(); });
  dirs.addEventListener('focusout', (e) => { if (!dirs.contains(e.relatedTarget)) { focused = false; sync(); } });
  document.addEventListener('visibilitychange', sync);
  phone.addEventListener?.('change', sync);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => { inView = entries[0].isIntersecting; sync(); }, { threshold: 0.5 }).observe(track);
  }
  sync();
}

// 4. Клуб — «журнальный разворот» (Влад 05.11). Две вещи, обе без инерции:
//  а) параллакс: пока фигура на экране, --club-y (px) = (0,5 − доля прохода фигуры через окно) × размах;
//     карта едет на --club-y, кадр внутри рамки — на −0,35 от него (home.css). Только чтение прокрутки
//     в rAF и transform — прокрутку не держит; вне экрана не считается;
//  б) наклон к курсору над фигурой до 8° и пятно блика (--px, --py от −1 до 1 — от центра карты,
//     --gx, --gy в процентах). Отклик сразу (переход .16 s); курсор ушёл — карта ровно ложится обратно.
// Сенсорные экраны — только параллакс; «меньше движения» — ни того, ни другого.
function setupClub(reduce) {
  const stage = document.querySelector('[data-club-tilt]');
  const card = stage?.querySelector('.home-club__card');
  if (!stage || !card) return;
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  const phone = window.matchMedia('(max-width: 759px)');
  const clamp = (v) => Math.max(-1, Math.min(1, v));

  // а) Параллакс.
  let inView = false, parQueued = false;
  const parallax = () => {
    parQueued = false;
    if (reduce.matches) { stage.style.removeProperty('--club-y'); return; }
    const r = stage.getBoundingClientRect(), vh = window.innerHeight;
    const p = Math.min(1, Math.max(0, (vh - r.top) / (vh + r.height)));
    const amp = phone.matches ? 56 : 120;
    stage.style.setProperty('--club-y', ((0.5 - p) * amp).toFixed(1));
  };
  const queuePar = () => { if (inView && !parQueued) { parQueued = true; requestAnimationFrame(parallax); } };
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => { inView = entries[0].isIntersecting; queuePar(); }, { rootMargin: '120px 0px' }).observe(stage);
  } else inView = true;
  window.addEventListener('scroll', queuePar, { passive: true });
  window.addEventListener('resize', queuePar);
  reduce.addEventListener?.('change', () => { inView = true; queuePar(); });
  parallax();

  // б) Наклон.
  let px = 0, py = 0, queued = false;
  const apply = () => {
    queued = false;
    card.style.setProperty('--px', px.toFixed(3));
    card.style.setProperty('--py', py.toFixed(3));
    card.style.setProperty('--gx', `${(50 + px * 45).toFixed(1)}%`);
    card.style.setProperty('--gy', `${(50 + py * 45).toFixed(1)}%`);
  };
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(apply); } };
  stage.addEventListener('pointermove', (e) => {
    if (!fine.matches || reduce.matches || e.pointerType !== 'mouse') return;
    const s = stage.getBoundingClientRect(), c = card.getBoundingClientRect();
    px = clamp((e.clientX - (c.left + c.width / 2)) / (s.width / 2));
    py = clamp((e.clientY - (c.top + c.height / 2)) / (s.height / 2));
    card.classList.add('is-tilting');
    queue();
  });
  stage.addEventListener('pointerleave', () => {
    px = 0; py = 0;
    card.classList.remove('is-tilting');
    queue();
  });
}

// 5. Ряды «Наших работ» ниже 1000 px — горизонтальные ленты (tiles.css): браузер не всегда
// докручивает ленту до плашки, получившей фокус с клавиатуры (вторая плашка оставалась за краем).
// Только фокус с клавиатуры (:focus-visible) и только когда лента правда прокручивается.
function setupWorksFocus(reduce) {
  document.querySelectorAll('.home-works .work-tiles').forEach((row) => {
    row.addEventListener('focusin', (e) => {
      if (row.scrollWidth <= row.clientWidth + 1) return;
      const item = e.target.closest('.work-tiles__item');
      if (!item || !e.target.matches(':focus-visible')) return;
      item.scrollIntoView({ inline: 'start', block: 'nearest', behavior: reduce.matches ? 'auto' : 'smooth' });
    });
  });
}
