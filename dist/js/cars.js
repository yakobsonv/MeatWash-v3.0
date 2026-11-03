// «Сейчас в продаже» на /auto (Паша 30.10, как модели на porsche.com): плитки вместо длинных
// карточек. Плитка открывает полную карточку машины в окне — без перезагрузки и прыжка по
// странице; адрес становится /auto#<id>: ссылкой можно поделиться, «назад» закрывает окно.
// Прямой заход по /auto#<id> открывает окно сразу. Карточки остаются в разметке (без JS
// плитка — якорь к карточке ниже); модуль их прячет и переносит нужную в окно.
// «Уже продали» (Влад 03.11): карточки проданных открывают то же окно — фото и характеристики.
// Окно — dialog.dialog: закрытие по фону, возврат фокуса и снятие блокировки прокрутки — ui.js.
// Подключает site.js, когда на странице есть [data-car-tiles] или [data-sold-tiles]. Разметка — scripts/cars.mjs.
export function setupCars() {
  const grids = [...document.querySelectorAll('[data-car-tiles], [data-sold-tiles]')];
  const lists = [...document.querySelectorAll('[data-car-cards]')];
  const dialog = document.getElementById('car-dialog');
  const slot = dialog?.querySelector('[data-car-slot]');
  if (!grids.length || !lists.length || !slot) return;
  // Карточка → свой список: закрытая карточка возвращается туда, откуда её взяли.
  const cards = new Map(), home = new Map();
  for (const list of lists) {
    list.hidden = true;
    for (const card of list.querySelectorAll('article.car-card')) { cards.set(card.id, card); home.set(card, list); }
  }

  const open = (id, push) => {
    const card = cards.get(id);
    if (!card) return;
    const shown = slot.firstElementChild;
    if (shown !== card) {
      if (shown) home.get(shown).append(shown);
      slot.append(card);
    }
    dialog.setAttribute('aria-labelledby', `car-${id}-title`);
    // Запись #<id>, которую добавила плитка, помечена { car }: при закрытии окна — шаг назад.
    // Метка в истории переживает «вперёд» и перезагрузку, флаг в памяти — нет.
    if (push && location.hash !== `#${id}`) history.pushState({ car: id }, '', `#${id}`);
    if (!dialog.open) {
      dialog.showModal();
      document.body.classList.add('dialog-open');
      document.documentElement.classList.add('is-locked');
    }
    // Каждая машина — с начала окна. До showModal() присваивание пропадает: у закрытого окна
    // нет прокрутки, и браузер вернул бы место, где окно закрыли.
    dialog.scrollTop = 0;
    card.querySelector('.strip')?.scrollTo({ left: 0, behavior: 'instant' });
    // Фокус — на название, а не на «Закрыть»: диктор начинает с машины.
    const title = card.querySelector('.car-card__title');
    title.tabIndex = -1;
    title.focus({ preventScroll: true });
  };

  for (const grid of grids) grid.addEventListener('click', (event) => {
    const tile = event.target.closest('[data-car-open]');
    if (!tile || event.button) return;
    event.stopPropagation();   // иначе ui.js прыгнул бы по якорю к спрятанной карточке
    // Ctrl/Cmd/Shift-клик — как у обычной ссылки: /auto#<id> в новой вкладке, окно там откроется по адресу.
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    open(tile.dataset.carOpen, true);
  });
  dialog.addEventListener('close', () => {
    if (history.state?.car) history.back();
    else if (cards.has(location.hash.slice(1))) history.replaceState(null, '', location.pathname + location.search);
  });
  addEventListener('popstate', () => {
    const id = location.hash.slice(1);
    if (cards.has(id)) open(id, false);
    else if (dialog.open) dialog.close();
  });

  const arrival = location.hash.slice(1);
  if (cards.has(arrival)) {
    // Под окном — раздел этой машины: «Сейчас в продаже» или «Уже продали».
    const tile = document.querySelector(`[data-car-open="${CSS.escape(arrival)}"]`);
    (tile?.closest('section') || document.getElementById('for-sale'))?.scrollIntoView({ behavior: 'instant' });
    open(arrival, false);
  }
}
