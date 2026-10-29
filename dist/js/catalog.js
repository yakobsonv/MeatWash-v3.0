// Каталог на services.html (разметку собирает scripts/catalog.mjs, контракт §4.3 плана):
// - четыре категории — вкладки WAI-ARIA (tablist/tab/tabpanel, стрелки, Home/End,
//   roving tabindex). Без JS переключатели — ссылки, панели идут подряд: прячет их
//   только этот модуль. Якоря (#price-film, #program-2, #price-help…) открывают
//   вкладку, в которой лежит цель;
// - переключатель кузова меняет цены программ, подпись и контекст кнопок записи
//   («Трёхфазная — Кроссовер, 2 250 ₽»). Выбор кузова общий с «Гаражом услуг» (body.js);
// - работы автомойки, которых нет в онлайн-записи, помечены «на месте».
import { PROGRAMS } from './data.js';
import { getBody, setBody, bodyName } from './body.js';

const money = (n) => n.toLocaleString('ru-RU') + '\u00a0₽';   // ₽ не отрывается от числа
const byHash = (hash) => {
  try { return hash && hash.length > 1 ? document.getElementById(decodeURIComponent(hash.slice(1))) : null; } catch { return null; }
};

// Работы автомойки, которые не продаются в онлайн-записи, помечаются прямо в прайсе:
// человек видит это там же, где смотрит цену, а не после нажатия «Записаться».
// Остальные категории идут через «Узнать цену» — там YCLIENTS не участвует.
function markOnSite() {
  const rows = [...document.querySelectorAll('#price-wash [data-price-item]')];
  if (!rows.length) return;
  import('./yclients.js').then((yc) => yc.loadMap().then(() => {
    for (const row of rows) {
      const name = row.dataset.priceItem;
      // Строка без «Записаться» уже подписана при сборке («добавим при приёмке», onsite в JSON).
      if (!name || row.dataset.onsite || !row.querySelector('[data-book]')) continue;
      const online = ['myasnitskaya', 'technopark']
        .some((b) => yc.resolve(b, { programs: [], items: [name] }, 0).ids.length);
      if (online) continue;
      row.dataset.onsite = '1';
      const tag = document.createElement('span');
      tag.className = 'catalog__onsite';
      tag.textContent = 'на месте';
      tag.title = 'Приобретается на месте: мастер добавит работу при приёмке автомобиля';
      row.querySelector('.catalog__item-name')?.append(' ', tag);
    }
  })).catch(() => {});
}

// Вкладки категорий. ui.js (setupUI вызывается раньше) уже раскрывает <details>
// по якорю и прокручивает к нему в requestAnimationFrame — к этому времени панель
// здесь уже открыта. Отступ под шапку и липкий ряд вкладок — scroll-padding-top
// у html (catalog.css, v2), поэтому цель якоря не уезжает под вкладки.
function setupTabs(signal) {
  const root = document.getElementById('catalog');
  const list = root?.querySelector('[data-catalog-tabs]');
  if (!list) return;
  const tabs = [...list.querySelectorAll('a[href^="#"]')];
  const panels = tabs.map((tab) => byHash(tab.getAttribute('href')));
  if (!tabs.length || panels.some((panel) => !panel || !root.contains(panel))) return;

  list.setAttribute('role', 'tablist');
  tabs.forEach((tab, i) => {
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panels[i].id);
    // Без href вкладка — не переход по якорю: ui.js не прокручивает к панели и не
    // уводит фокус с вкладки.
    tab.removeAttribute('href');
    panels[i].setAttribute('role', 'tabpanel');
    panels[i].setAttribute('aria-labelledby', tab.id);
    // Панель не фокусируемая: в ней есть кнопки, Tab с вкладки ведёт к первой (APG
    // это допускает). С tabindex Chromium фокусировал панель при заходе по якорю
    // (#price-protection) и рисовал рамку фокуса вокруг всей панели.
  });
  root.classList.add('is-tabs');

  const select = (i, focus = false) => {
    if (!(i >= 0 && i < tabs.length)) return;
    tabs.forEach((tab, j) => {
      tab.setAttribute('aria-selected', String(j === i));
      tab.tabIndex = j === i ? 0 : -1;
      panels[j].hidden = j !== i;
    });
    if (focus) tabs[i].focus();
  };
  // Цель якоря в каталоге: открыть её вкладку и <details> программы.
  const reveal = (target) => {
    if (!target || !root.contains(target)) return false;
    const panel = target.closest('[role="tabpanel"]');
    if (panel) select(panels.indexOf(panel));
    if (target.tagName === 'DETAILS') target.open = true;
    return true;
  };

  // v2: ряд вкладок липкий — переключают и из середины длинного списка. Новая панель
  // тогда начиналась выше экрана (человек видел её конец или подвал). Если верх панели
  // ушёл под ряд вкладок, встаём к её началу: отступ под шапку и вкладки — в
  // scroll-padding-top. Фокус остаётся на вкладке.
  const choose = (i, focus = false) => {
    select(i, focus);
    const panel = panels[i];
    if (!panel || panel.hidden) return;
    if (panel.getBoundingClientRect().top < list.getBoundingClientRect().bottom - 1) {
      const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
      panel.scrollIntoView({ block: 'start', behavior: still ? 'instant' : 'smooth' });
    }
  };

  list.addEventListener('click', (event) => {
    const tab = event.target.closest('[role="tab"]');
    if (tab) choose(tabs.indexOf(tab));
  }, { signal });
  list.addEventListener('keydown', (event) => {
    const i = tabs.indexOf(event.target.closest('[role="tab"]'));
    if (i < 0 || event.altKey || event.ctrlKey || event.metaKey) return;
    const last = tabs.length - 1;
    const next = { ArrowRight: i === last ? 0 : i + 1, ArrowLeft: i === 0 ? last : i - 1, Home: 0, End: last }[event.key];
    if (next != null) { event.preventDefault(); choose(next, true); }
    // У ссылки без href Enter и пробел ничего не делают; пробел ещё и листал бы страницу.
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(i); }
  }, { signal });

  // Открыта «Автомойка», если адрес не ведёт в другую категорию. Браузер уже прокрутил
  // к цели, пока панели шли подряд, — встаём к ней ещё раз после скрытия остальных
  // и после шрифтов (они меняют высоту строк), если человек не прокрутил сам.
  select(0);
  const arrival = byHash(location.hash);
  if (reveal(arrival)) {
    let placed = -1;
    const settle = () => {
      if (placed >= 0 && Math.abs(scrollY - placed) > 2) return;
      arrival.scrollIntoView({ behavior: 'instant' });
      placed = scrollY;
    };
    requestAnimationFrame(settle);
    document.fonts?.ready.then(() => requestAnimationFrame(settle));
  }
  // Хеш сменили на открытой странице (адресная строка, «назад»).
  addEventListener('hashchange', () => {
    const target = byHash(location.hash);
    if (reveal(target)) requestAnimationFrame(() => target.scrollIntoView({ behavior: 'instant' }));
  }, { signal });
  // Ссылка на якорь этой страницы: ui.js перехватывает её и сам прокручивает к цели
  // (hashchange не будет). Перехват при всплытии, поэтому вкладку открываем раньше —
  // на погружении.
  document.addEventListener('click', (event) => {
    const link = event.target.closest?.('a[href^="#"]');
    if (link) reveal(byHash(link.getAttribute('href')));
  }, { capture: true, signal });
}

// Тип кузова: цены программ, подпись и контекст кнопок записи.
function setupBody(signal) {
  const types = document.querySelector('.body-types');
  if (!types) return;
  const label = document.getElementById('body-price-label');

  function render(i) {
    const input = types.querySelector(`input[value="${i}"]`);
    if (input) input.checked = true;
    document.querySelectorAll('[data-program-price]').forEach((price) => {
      price.textContent = money(Number(price.dataset.prices.split(',')[i]));
    });
    if (label) label.textContent = 'Цены для\u00a0типа кузова: ' + bodyName(i);   // как в разметке после typo()
    // Формат тот же, что в scripts/catalog.mjs (programContext).
    document.querySelectorAll('[data-book][data-program]').forEach((button) => {
      const program = PROGRAMS[Number(button.dataset.program)];
      if (program) button.dataset.bookContext = `${program.name} — ${bodyName(i)}, ${money(program.prices[i])}`
        + (program.studio || []).map((s) => `, ${s.label} — ${money(s.prices[i])}`).join('');
    });
  }

  types.addEventListener('change', (event) => {
    if (event.target.name === 'body-type') setBody(Number(event.target.value));
  }, { signal });
  addEventListener('mw:body', (event) => render(event.detail), { signal });
  // Кузов, выбранный раньше в этом визите (здесь или в гараже на главной).
  const saved = getBody();
  if (saved) render(saved);
}

// Сравнение программ (P04) на телефоне шире окна и листается вбок: тогда лента получает
// tabindex="0" (листать с клавиатуры). Когда таблица помещается — убираем, чтобы
// не было пустой остановки Tab (WP3, 27.10).
function setupScrollRegions(signal) {
  const regions = [...document.querySelectorAll('[data-scroll-region]')];
  if (!regions.length || !('ResizeObserver' in window)) return;
  const sync = (el) => {
    if (el.scrollWidth > el.clientWidth + 1) el.setAttribute('tabindex', '0');
    else if (document.activeElement !== el) el.removeAttribute('tabindex');
  };
  const observer = new ResizeObserver((entries) => entries.forEach((entry) => sync(entry.target)));
  regions.forEach((el) => { sync(el); observer.observe(el); });
  signal.addEventListener('abort', () => observer.disconnect());
}

// Сравнение программ (P04): строка названий программ липнет под вкладками, пока таблица на
// экране (как панель сравнения у эталона). Липкий thead внутри ленты с overflow-x не
// работает, поэтому строка — отдельная полоса над лентой: ширины колонок берутся из
// настоящего thead, сдвиг вбок повторяет прокрутку ленты. Для чтения с экрана полоса
// скрыта (aria-hidden): названия есть в thead таблицы.
function setupCompareBar(signal) {
  const scroll = document.querySelector('.compare__scroll');
  const table = scroll?.querySelector('table');
  const head = table?.tHead?.rows[0];
  if (!head || !('ResizeObserver' in window)) return;
  const bar = document.createElement('div');
  bar.className = 'compare__bar';
  bar.setAttribute('aria-hidden', 'true');
  const track = document.createElement('div');
  track.className = 'compare__bar-track';
  const cells = [...head.cells].map((th, i) => {
    const cell = document.createElement('span');
    cell.className = 'compare__bar-cell';
    if (i) cell.textContent = th.textContent.trim();
    track.append(cell);
    return cell;
  });
  const mask = document.createElement('span');
  mask.className = 'compare__bar-mask';
  bar.append(track, mask);
  scroll.before(bar);

  const layout = () => {
    const widths = [...head.cells].map((th) => th.getBoundingClientRect().width);
    widths.forEach((w, i) => { cells[i].style.width = `${w}px`; });
    track.style.width = `${table.getBoundingClientRect().width}px`;
    mask.style.width = `${widths[0]}px`;
    bar.style.width = `${scroll.clientWidth}px`;
    shift();
    toggle();
  };
  const shift = () => { track.style.transform = `translateX(${-scroll.scrollLeft}px)`; };
  let frame = 0;
  const toggle = () => {
    frame = 0;
    const top = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sticky-h')) || 0;
    const headBottom = head.getBoundingClientRect().bottom;
    const foot = table.tFoot || table.tBodies[0];
    const end = foot.getBoundingClientRect().top;
    bar.classList.toggle('is-on', headBottom < top + 1 && end > top + bar.offsetHeight);
  };
  scroll.addEventListener('scroll', shift, { passive: true, signal });
  addEventListener('scroll', () => { if (!frame) frame = requestAnimationFrame(toggle); }, { passive: true, signal });
  const observer = new ResizeObserver(layout);
  observer.observe(table);
  observer.observe(scroll);
  signal.addEventListener('abort', () => { observer.disconnect(); bar.remove(); });
  layout();
}

export function setupCatalog() {
  const abort = new AbortController();
  setupTabs(abort.signal);
  setupBody(abort.signal);
  setupScrollRegions(abort.signal);
  setupCompareBar(abort.signal);
  markOnSite();
  return () => abort.abort();
}
