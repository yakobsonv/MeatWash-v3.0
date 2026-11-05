// Главная Meat Wash (план §3.1): перенос v2.js (source/v2-design, 625ce74) — три поведения
// эталона, которые CSS сам не делает:
//  1) страница темнеет, пока направления на экране, и светлеет после них (ref CarRange__toDark:
//     верх секции ≤ 12 % высоты окна, низ — ниже 49 %, в обе стороны);
//  2) слова заголовка секции светлеют по мере прокрутки (redomedia.co, 22.10);
//  3) на телефоне направления — карусель с пагинатором: активная точка заполняется за 9,5 s,
//     затем следующий слайд; пауза — кнопкой, касанием, фокусом;
//  4) клуб: карта поднимается над кадром при прокрутке (параллакс, не на телефоне), наклоняется к курсору (до 8°)
//     и ловит блик (наклон — только мышь; всё — без «меньше движения»);
//  5) ряды «Наших работ» на телефоне (лента): фокус с клавиатуры прокручивает ленту к плашке;
//  6) отзывы — «тёмная сцена»: досчёт рейтинга, карусель карточек с автопрокруткой и паузой; у новой
//     активной карточки строки поднимаются из маски, номер в счётчике прокручивается.
// Своего наблюдения [data-reveal] нет: класс is-in ставит ui.js (план §3.1).
// Подключает site.js, когда на странице есть .dirs. Владелец: исполнитель главной.
export function setupHome() {
  const body = document.body;
  const dirs = document.querySelector('.dirs');
  if (!dirs) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  setupClub(reduce);
  setupWorksFocus(reduce);
  setupReviews(reduce);

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
//  а) параллакс: пока фигура на экране, --club-y (px) = −доля прохода фигуры через окно × 60 — карта
//     только поднимается над кадром (к цифрам фактов не наезжает), кадр внутри рамки — на −0,35 от
//     неё (home.css). Только чтение прокрутки в rAF и transform — прокрутку не держит; вне экрана
//     не считается;
//  б) наклон к курсору над фигурой до 8° и пятно блика (--px, --py от −1 до 1 — от центра карты,
//     --gx, --gy в процентах). Отклик сразу (переход .16 s); курсор ушёл — карта ровно ложится обратно.
// Телефон (до 759 px) — ни параллакса, ни наклона: карта стоит, ролик не играет (video.js,
// data-video-touch="off"); «меньше движения» — тоже без движения.
function setupClub(reduce) {
  const stage = document.querySelector('[data-club-tilt]');
  const card = stage?.querySelector('.home-club__card');
  if (!stage || !card) return;
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  const phone = window.matchMedia('(max-width: 759px)');
  const clamp = (v) => Math.max(-1, Math.min(1, v));

  // а) Параллакс: карта только поднимается над кадром (0 → −60 px), вниз к фактам не едет.
  // На телефоне и при «меньше движения» — выключен (карта стоит, прокрутке ничего не мешает).
  let inView = false, parQueued = false;
  const parallax = () => {
    parQueued = false;
    if (reduce.matches || phone.matches) { stage.style.removeProperty('--club-y'); return; }
    const r = stage.getBoundingClientRect(), vh = window.innerHeight;
    const p = Math.min(1, Math.max(0, (vh - r.top) / (vh + r.height)));
    stage.style.setProperty('--club-y', (-p * 60).toFixed(1));
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
  // Размеры сцены и центр карты читаются один раз — при входе мыши и после прокрутки или смены
  // размера окна (параллакс сдвигает карту), а не на каждое движение: без лишнего пересчёта раскладки.
  let box = null;
  const forget = () => { box = null; };
  stage.addEventListener('pointerenter', forget);
  window.addEventListener('scroll', forget, { passive: true });
  window.addEventListener('resize', forget);
  stage.addEventListener('pointermove', (e) => {
    if (!fine.matches || reduce.matches || e.pointerType !== 'mouse') return;
    if (!box) {
      const s = stage.getBoundingClientRect(), c = card.getBoundingClientRect();
      box = { cx: c.left + c.width / 2, cy: c.top + c.height / 2, hw: s.width / 2, hh: s.height / 2 };
    }
    px = clamp((e.clientX - box.cx) / box.hw);
    py = clamp((e.clientY - box.cy) / box.hh);
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

// 6. Отзывы — «тёмная сцена» (Влад 06.11, разметка — {{reviews:home}}, вид — home.css .rv*).
//  а) рейтинг студий: «5,0» досчитывается от 0,0 за 1,4 s, когда рейтинги вошли в экран (звёзды
//     загораются по очереди — CSS по is-in от ui.js); при «меньше движения» — сразу итог;
//  б) карусель: лента — обычная горизонтальная прокрутка (свайп на телефоне — сам браузер, вертикальную
//     прокрутку страницы не держим), мышью — перетаскивание, стрелки, клавиши ← →. Активная карточка —
//     ближайшая к центру; --d каждой карточки (0…1, расстояние до центра) — уменьшение и затухание
//     соседей (только чтение прокрутки в rAF, размеры — из кэша по смене размера окна);
//  в) автопрокрутка: 6,5 s на отзыв (полоса хода — CSS-анимация, её конец — следующий отзыв, после
//     последнего — первый). Пауза — кнопкой (дольше 5 s само движется — значит, кнопка обязательна),
//     наведением мыши на ленту и кнопки, фокусом, касанием, вне экрана, в скрытой вкладке.
//     «Меньше движения» — автопрокрутки нет, кнопки паузы нет, листание без плавности;
//  г) пятно красного света идёт за мышью над панелью (transform, rAF).
function setupReviews(reduce) {
  const rv = document.querySelector('[data-rv]');
  if (!rv) return;
  const track = rv.querySelector('.rv__track');
  const originals = track ? [...track.querySelectorAll('.rv-item')] : [];
  const ctrl = rv.querySelector('.rv__controls');
  if (!originals.length || !ctrl) return;
  const carousel = rv.querySelector('.rv__carousel');
  const segs = [...ctrl.querySelectorAll('.rv__seg')];
  const now = ctrl.querySelector('.rv__now');
  const play = ctrl.querySelector('.rv__play');
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  const n = originals.length;
  const pad = (i) => String(i + 1).padStart(2, '0');
  ctrl.hidden = false;

  // а) Досчёт рейтинга.
  const nums = [...rv.querySelectorAll('.rv-score__num[data-count]')];
  const scores = rv.querySelector('.rv__scores');
  const fmt = (v) => v.toFixed(1).replace('.', ',');
  const count = () => {
    if (reduce.matches) return;
    const t0 = performance.now(), dur = 1400;
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(2, -10 * p);
      nums.forEach((el) => { el.textContent = fmt(p >= 1 ? +el.dataset.count : Math.floor(+el.dataset.count * e * 10) / 10); });
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  if (nums.length && scores && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      count();
    }, { rootMargin: '0px 0px -6% 0px' });
    io.observe(scores);
  }

  // Слова отзывов — в маску (span.rv-w > span.rv-w__in), до копий кольца: у новой активной карточки
  // строки поднимаются одна за другой. Текст остаётся текстом; делим только по обычным пробелам —
  // неразрывный (после «и», «в»…) держит слова вместе.
  const wrapWord = (content) => {
    const w = document.createElement('span'), i = document.createElement('span');
    w.className = 'rv-w'; i.className = 'rv-w__in';
    i.append(content); w.append(i);
    return w;
  };
  track.querySelectorAll('.rv-card__text p').forEach((p) => {
    const out = document.createDocumentFragment();
    [...p.childNodes].forEach((node) => {
      if (node.nodeType !== 3) { out.append(wrapWord(node)); return; }
      node.textContent.split(/([ \t\n\r]+)/).forEach((part) => {
        if (part) out.append(/^[ \t\n\r]+$/.test(part) ? ' ' : wrapWord(document.createTextNode(part)));
      });
    });
    p.replaceChildren(out);
  });
  // Номер строки каждого слова (--l) — у карточки, которая становится активной (одна раскладка за смену).
  const lines = (li) => {
    let top = null, line = -1;
    li.querySelectorAll('.rv-w').forEach((w) => {
      const t = w.offsetTop;
      if (top === null || t > top + 4) { top = t; line += 1; }
      w.style.setProperty('--l', line);
    });
  };
  const roll = (el) => { if (!el || reduce.matches) return; el.classList.remove('is-roll'); void el.offsetWidth; el.classList.add('is-roll'); };

  // б) Карусель. Кольцо: слева и справа — копии всех карточек (aria-hidden, inert — для чтения
  // экрана и клавиатуры их нет, в собранной странице их нет): по краям сцены всегда соседи. Когда
  // лента улеглась на копии, она без движения переставляется на ту же карточку в середине.
  const loop = n > 2;
  if (loop) {
    const copy = (li) => {
      const c = li.cloneNode(true);
      c.classList.add('is-copy'); c.removeAttribute('aria-label');
      c.setAttribute('aria-hidden', 'true'); c.inert = true;
      return c;
    };
    track.prepend(...originals.map(copy));
    track.append(...originals.map(copy));
  }
  const items = [...track.querySelectorAll('.rv-item')];
  const base = loop ? n : 0;
  // Выезд по очереди — от карточки слева от центра (видимые — первыми).
  items.forEach((li, k) => li.style.setProperty('--i', Math.max(0, k - base + 1)));
  let index = -1, centers = [], step = 1, queued = false, lockUntil = 0;
  const measure = () => {
    centers = items.map((li) => li.offsetLeft + li.offsetWidth / 2);
    step = items.length > 1 ? centers[1] - centers[0] : items[0].offsetWidth;
  };
  const leftOf = (v) => centers[v] - track.clientWidth / 2;
  // rise = false — без подъёма строк: первая карточка (её выводит появление ленты) и перестановка
  // с копии на ту же карточку в середине кольца (текст уже на месте).
  let riseAt = 0;
  const setActive = (v, rise = true) => {
    if (v === index) return;
    const was = index;
    items[index]?.classList.remove('is-active', 'is-rise');
    index = v;
    if (rise && !reduce.matches) { lines(items[v]); riseAt = performance.now(); items[v].style.setProperty('--rise-off', '0ms'); }
    items[v].classList.add('is-active');
    items[v].classList.toggle('is-rise', rise);
    const k = v % n;
    segs.forEach((s, j) => { s.classList.toggle('is-past', j < k); s.classList.toggle('is-active', j === k); });
    if (now && now.textContent !== pad(k)) { now.textContent = pad(k); if (rise && was >= 0) roll(now); }
  };
  const paint = () => {
    queued = false;
    const mid = track.scrollLeft + track.clientWidth / 2;
    let best = 0, dist = Infinity;
    centers.forEach((c, i) => {
      const dd = Math.abs(c - mid);
      if (dd < dist) { dist = dd; best = i; }
      items[i].style.setProperty('--d', Math.min(1, dd / step).toFixed(3));
    });
    if (performance.now() >= lockUntil) setActive(best, !first);
  };
  let first = true;
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(paint); } };
  const go = (v) => {
    const target = loop ? Math.max(0, Math.min(items.length - 1, v)) : ((v % n) + n) % n;
    lockUntil = performance.now() + 900;
    setActive(target);
    track.scrollTo({ left: leftOf(target), behavior: reduce.matches ? 'auto' : 'smooth' });
  };
  // Лента улеглась: с копии — на ту же карточку в середине (сдвиг на целый круг, без движения).
  let settleTimer = 0;
  const settle = () => {
    clearTimeout(settleTimer);
    if (drag?.moved) return;
    lockUntil = 0;
    paint();
    if (loop && (index < n || index >= 2 * n)) {
      const shift = index < n ? n : -n;
      track.style.scrollSnapType = 'none';
      track.scrollLeft = leftOf(index + shift);
      track.style.removeProperty('scroll-snap-type');
      const rising = items[index].classList.contains('is-rise');
      setActive(index + shift, false);
      // Подъём строк, если идёт, продолжается с того же места (отрицательная задержка), а не сначала.
      if (rising && !reduce.matches) {
        lines(items[index]);
        items[index].style.setProperty('--rise-off', `${-Math.round(performance.now() - riseAt)}ms`);
        items[index].classList.add('is-rise');
      }
      paint();
    }
  };
  measure();
  track.scrollLeft = leftOf(base);
  paint();
  first = false;
  track.addEventListener('scroll', () => {
    queue();
    clearTimeout(settleTimer);
    settleTimer = setTimeout(settle, 160);
  }, { passive: true });
  track.addEventListener('scrollend', settle);
  window.addEventListener('resize', () => { measure(); track.scrollLeft = leftOf(index); queue(); });
  ctrl.querySelector('.rv__prev')?.addEventListener('click', () => go(index - 1));
  ctrl.querySelector('.rv__next')?.addEventListener('click', () => go(index + 1));
  track.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); go(index + (e.key === 'ArrowRight' ? 1 : -1)); }
  });
  // Перетаскивание мышью (на касание — родной свайп браузера).
  let drag = null;
  track.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    drag = { x: e.clientX, left: track.scrollLeft, moved: false, id: e.pointerId, from: index };
  });
  track.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) < 5) return;
    if (!drag.moved) { drag.moved = true; track.classList.add('is-dragging'); track.setPointerCapture(e.pointerId); }
    track.scrollLeft = drag.left - dx;
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const moved = drag.moved, dx = e.clientX - drag.x, from = drag.from;
    drag = null;
    if (!moved) return;
    track.classList.remove('is-dragging');
    // Докатить до ближайшей карточки; короткий рывок тоже листает на одну.
    const mid = track.scrollLeft + track.clientWidth / 2;
    let best = 0;
    centers.forEach((c, i) => { if (Math.abs(c - mid) < Math.abs(centers[best] - mid)) best = i; });
    if (best === from && Math.abs(dx) > 40) best = from + (dx < 0 ? 1 : -1);
    go(best);
  };
  track.addEventListener('pointerup', endDrag);
  track.addEventListener('pointercancel', endDrag);
  track.addEventListener('dragstart', (e) => e.preventDefault());

  // в) Автопрокрутка.
  let wantPlay = !reduce.matches, inView = false, hover = false, focused = false, touching = false;
  const sync = () => {
    rv.classList.toggle('is-auto', wantPlay);
    rv.classList.toggle('is-playing', wantPlay && inView && !hover && !focused && !touching && !document.hidden);
  };
  const setPlay = (on) => {
    wantPlay = on;
    if (play) {
      play.dataset.state = on ? 'playing' : 'paused';
      play.setAttribute('aria-label', on ? 'Остановить автопрокрутку' : 'Включить автопрокрутку');
    }
    sync();
  };
  ctrl.addEventListener('animationend', (e) => { if (e.animationName === 'rv-progress') go(index + 1); });
  play?.addEventListener('click', () => setPlay(!wantPlay));
  // Любое своё листание — полоса хода текущего отзыва начинается заново (новый is-active).
  for (const el of [carousel, ctrl]) {
    el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { hover = true; sync(); } });
    el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { hover = false; sync(); } });
  }
  // Фокус с клавиатуры (не щелчок мышью по ленте) останавливает смену до ухода фокуса из блока.
  rv.addEventListener('focusin', (e) => { if (e.target.matches(':focus-visible')) { focused = true; sync(); } });
  rv.addEventListener('focusout', (e) => { if (!rv.contains(e.relatedTarget)) { focused = false; sync(); } });
  track.addEventListener('touchstart', () => { touching = true; sync(); }, { passive: true });
  const untouch = () => { touching = false; sync(); };
  track.addEventListener('touchend', untouch, { passive: true });
  track.addEventListener('touchcancel', untouch, { passive: true });
  document.addEventListener('visibilitychange', sync);
  reduce.addEventListener?.('change', () => { if (reduce.matches) setPlay(false); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => { inView = entries[0].isIntersecting; sync(); }, { threshold: 0.4 }).observe(carousel || track);
  }
  setPlay(wantPlay);

  // г) Свет за мышью.
  let gx = 0, gy = 0, glowQueued = false, box = null;
  const glow = () => { glowQueued = false; rv.style.setProperty('--gx', `${gx.toFixed(0)}px`); rv.style.setProperty('--gy', `${gy.toFixed(0)}px`); };
  rv.addEventListener('pointerenter', () => { box = null; });
  window.addEventListener('scroll', () => { box = null; }, { passive: true });
  rv.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || !fine.matches || reduce.matches) return;
    box ??= rv.getBoundingClientRect();
    gx = e.clientX - box.left; gy = e.clientY - box.top;
    rv.classList.add('is-lit');
    if (!glowQueued) { glowQueued = true; requestAnimationFrame(glow); }
  });
  rv.addEventListener('pointerleave', () => rv.classList.remove('is-lit'));
}
