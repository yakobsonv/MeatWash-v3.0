// Шапка и меню-шторка (план §1.3, §1.5, §2.8, §4.1; поправка критика 21). Владелец: WP1.
//
// Шторка — модальный <dialog class="drawer">: страница под ней inert, Esc закрывает.
// От 1000 px — две панели (корень + раздел; по умолчанию открыт раздел текущей страницы),
// ниже — одна панель с переходом вглубь («←», название раздела, «×»).
//
// Контракты:
//   - html.is-locked этот модуль не ставит: его ставит только ui.js (syncLock), а прокрутку
//     под шторкой держит CSS html:has(dialog:modal) (base.css);
//   - перед действием внутри шторки (ссылка, [data-book], [data-request], [data-membership])
//     шторка закрывается сразу, в фазе capture: делегированный обработчик ui.js на document
//     потом откроет своё окно; выход шторки анимирует CSS (overlay / display allow-discrete);
//   - после окна, открытого из шторки, фокус возвращается на «Меню» (#drawer-open).
// Раздел, открытый рядом с корнем на компьютере (05.11: панели «Привоз» нет — привоз, работы,
// статьи и каталог в «Услугах и ценах»; направления — ссылки корня, рядом с ними тоже «Услуги и цены»).
const PANEL_OF_PAGE = { services: 'care', works: 'care', import: 'care', articles: 'care', auto: 'auto', about: 'about' };

export function setupShell() {
  const drawer = document.getElementById('drawer');
  const opener = document.getElementById('drawer-open');
  if (!drawer || !opener || typeof drawer.showModal !== 'function') return;

  const wide = matchMedia('(min-width: 1000px)');
  const panels = [...drawer.querySelectorAll('section.drawer__panel[id]')];
  const items = [...drawer.querySelectorAll('.drawer__panel--root [aria-controls^="drawer-p-"]')];
  const root = drawer.querySelector('.drawer__panel--root');
  const fallback = `drawer-p-${PANEL_OF_PAGE[document.body.dataset.page] || 'care'}`;
  const byId = (id) => panels.find((p) => p.id === id) || null;
  let current = null;      // открытый раздел (id панели) или null — корень
  let restore = false;     // шторка закрыта ради окна: после него фокус — на «Меню»

  // Состояние → разметка. На компьютере корень виден всегда и рядом всегда открыт раздел.
  const render = () => {
    const shown = wide.matches ? (current || fallback) : current;
    panels.forEach((panel) => { panel.hidden = panel.id !== shown; });
    items.forEach((item) => item.setAttribute('aria-expanded', String(item.getAttribute('aria-controls') === shown)));
    drawer.dataset.depth = !wide.matches && shown ? '1' : '0';
  };
  const focus = (el) => el?.focus({ preventScroll: true });

  // Фокус с клавиатуры — на элемент (видна рамка); после мыши — на саму панель
  // (tabindex=-1, без рамки): Safari иначе рисует рамку на программном фокусе после клика.
  const openPanel = (id, viaKeyboard) => {
    current = id;
    delete drawer.dataset.moved;
    render();
    const panel = byId(id);
    // Вглубь (телефон, планшет): фокус — на «←», чтение с экрана сразу слышит раздел.
    if (!wide.matches) focus(viaKeyboard ? panel?.querySelector('[data-drawer-back]') : panel);
    else if (viaKeyboard) focus(panel?.querySelector('.drawer__body a[href], .drawer__body button'));
  };
  const back = (viaKeyboard) => {
    const from = current;
    current = null;
    drawer.dataset.moved = '';
    render();
    focus(viaKeyboard ? items.find((item) => item.getAttribute('aria-controls') === from) || items[0] : root);
  };

  const open = (viaKeyboard) => {
    if (drawer.open) return;
    current = null;
    delete drawer.dataset.moved;
    restore = false;
    render();
    drawer.showModal();
    opener.setAttribute('aria-expanded', 'true');
    // С клавиатуры — первый пункт, а не «×»: сразу идём по разделам. Мышью — корень шторки.
    focus(viaKeyboard ? items[0] : root);
    root?.scrollTo(0, 0);
  };
  const close = () => { if (drawer.open) drawer.close(); };

  opener.addEventListener('click', (e) => open(e.detail === 0));

  drawer.addEventListener('close', () => {
    opener.setAttribute('aria-expanded', 'false');
    if (restore) return;
    // Фокус после закрытия — на «Меню», если браузер не вернул его сам и ui.js не увёл
    // его к цели якоря на этой же странице.
    const active = document.activeElement;
    if (!active || active === document.body || drawer.contains(active)) focus(opener);
  });

  // Окно (запись, разговор, заявка) открыли из шторки и закрыли — фокус на «Меню».
  document.querySelectorAll('dialog.dialog').forEach((dialog) => dialog.addEventListener('close', () => {
    if (!restore || document.querySelector('dialog[open]')) return;
    restore = false;
    focus(opener);
  }));

  // Действие внутри шторки: закрыть её сразу (capture), до обработчика ui.js.
  drawer.addEventListener('click', (e) => {
    const action = e.target.closest('a[href], [data-book], [data-request], [data-membership]');
    if (!action || !drawer.contains(action)) return;
    if (action.matches('a[href]') && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) return;
    restore = !action.matches('a[href]');
    close();
  }, true);

  // Клик по затемнению: и нажатие, и отпускание — вне шторки (выделение текста не закрывает).
  const outside = (e) => {
    if (e.target !== drawer) return false;
    const r = drawer.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };
  let downOutside = false;
  drawer.addEventListener('pointerdown', (e) => { downOutside = outside(e); });
  drawer.addEventListener('click', (e) => {
    if (downOutside && outside(e)) return close();
    const item = e.target.closest('button[aria-controls^="drawer-p-"]');
    if (item) return openPanel(item.getAttribute('aria-controls'), e.detail === 0);
    if (e.target.closest('[data-drawer-back]')) return back(e.detail === 0);
    if (e.target.closest('[data-drawer-close]')) return close();
  });

  // Стрелки: в корне → раздел (компьютер), в разделе ← назад (телефон).
  drawer.addEventListener('keydown', (e) => {
    const item = e.target.closest?.('button[aria-controls^="drawer-p-"]');
    if (item && e.key === 'ArrowRight') { e.preventDefault(); openPanel(item.getAttribute('aria-controls'), true); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const list = [...drawer.querySelectorAll('.drawer__panel--root .drawer__item')];
      const i = list.indexOf(e.target);
      if (i < 0) return;
      e.preventDefault();
      focus(list[(i + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length]);
      return;
    }
    if (e.key === 'ArrowLeft' && current && !wide.matches && byId(current)?.contains(e.target)) { e.preventDefault(); back(true); }
  });

  // Повернули планшет или растянули окно: раскладка панелей пересчитывается.
  wide.addEventListener('change', () => { if (drawer.open) render(); });
}
