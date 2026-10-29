// Карты студий в карточках локаций (страница «О нас», блок «Студии и контакты»): у каждого филиала своя
// карта на месте фотографии, видна сразу, без окна.
//
// Виджет — официальный iframe Яндекс Карт без карточки организации, только
// точка студии (решение Влада 07.10): map-widget/v1/?ll=<lon,lat>&z=16&pt=<lon,lat>,pm2rdm,
// адрес лежит в meatwash-content.json (mapWidget). В нём точка, кнопки масштаба
// и атрибуция Яндекса — поверх углов iframe ничего не кладём.
//
// Модуль грузит ui.js, когда блок локаций подходит к экрану, и вызывает
// showMap(область) для каждой подошедшей карты: iframe создаётся только тогда.
// До этого, без скриптов и при ошибке в области лежит заглушка со ссылкой на
// карточку в Яндекс Картах. Размер области задан в CSS — загрузка его не меняет.
//
// Телефон и планшет (pointer: coarse): над картой прозрачный слой-кнопка. Свайп
// по нему листает страницу, нажатие отдаёт жесты карте; слой возвращается, когда
// карта ушла с экрана или нажали вне её. На компьютере слоя нет (стили).
//
// Цель Метрики map_open (branch, source) здесь — один раз на студию за просмотр
// страницы: source 'touch' — включили карту нажатием, 'map' — взялись за карту
// мышью или клавиатурой (фокус ушёл в iframe). Переход по «На карте» из подвала
// (source 'footer') считает ui.js.
import { LOCATIONS } from './data.js';
import { goal } from './analytics.js';

const LOAD_TIMEOUT_MS = 12000;
// Виджет тяжёлый (скрипты карты, стили, тайлы): на мобильной сети две карты сразу
// мешали друг другу и подолгу стояли недогруженными. Карты грузятся по очереди:
// следующая — когда предыдущая загрузилась (load) или через QUEUE_STEP_MS.
const QUEUE_STEP_MS = 8000;
let queue = Promise.resolve();
const PIN = '<svg class="location__pin" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><path d="M10 18s5.5-5.2 5.5-9.4a5.5 5.5 0 0 0-11 0C4.5 12.8 10 18 10 18z" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="10" cy="8.6" r="1.9" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';
const maps = new Map();          // область карты → её управление
const reported = new Set();      // студии, по которым цель уже ушла
let offscreen = null;

function report(id, source) {
  if (reported.has(id)) return;
  reported.add(id);
  goal('map_open', { branch: id, source });
}

// Общие слушатели — один раз, при первой карте.
function listen() {
  // Карта ушла с экрана — слой над ней возвращается.
  offscreen = new IntersectionObserver((entries) => {
    for (const entry of entries) if (!entry.isIntersecting) maps.get(entry.target)?.arm();
  });
  // Нажатие вне карты — тоже. Касания внутри iframe сюда не доходят, поэтому
  // любое нажатие на странице вне области карты значит «карту оставили».
  document.addEventListener('pointerdown', (e) => {
    for (const [box, map] of maps) if (!box.contains(e.target)) map.arm();
  }, { capture: true, passive: true });
  // Щелчок или Tab в карту на компьютере: фокус уходит в iframe, окно страницы
  // получает blur. Это единственный след взаимодействия с чужим iframe.
  addEventListener('blur', () => setTimeout(() => {
    const active = document.activeElement;
    for (const map of maps.values()) if (map.frame && map.frame === active) report(map.id, 'map');
  }));
}

function embed(box) {
  const location = LOCATIONS.find((l) => l.id === box.dataset.mapEmbed);
  if (!location) return null;
  const fallback = box.querySelector('.location__fallback');
  const status = box.querySelector('[data-map-status]');
  const retry = box.querySelector('[data-map-retry]');
  const slow = box.querySelector('[data-map-slow]');
  let frame = null, probe = null, probeTimer = 0, slowTimer = 0;

  // Слой для пальца: вся область — кнопка, подпись — плашкой под меткой организации.
  const shield = document.createElement('button');
  shield.type = 'button';
  shield.className = 'location__shield';
  shield.innerHTML = `<span class="location__hint">${PIN}Нажмите, чтобы двигать карту</span>`;
  shield.querySelector('.location__hint').append(Object.assign(document.createElement('span'), { className: 'visually-hidden', textContent: `: ${location.name}` }));
  box.append(shield);
  shield.addEventListener('click', () => {
    const focused = document.activeElement === shield;
    shield.hidden = true;
    // Фокус не теряется вместе со слоем: дальше — сама карта.
    if (focused) frame?.focus({ preventScroll: true });
    report(location.id, 'touch');
  });

  // Состояния области: idle → loading → loaded | error. Под iframe всегда лежит
  // заглушка (сетка, метка, подпись «Загружаем карту…»). Пока виджет не загрузился,
  // iframe прозрачный (стили): иначе виден его полусобранный вид — кнопки без
  // подложки карты и голая ссылка на организацию (так было на iPhone по LTE).
  // Через 12 с без load iframe показывается как есть, вместе с плашкой со ссылкой.
  // Ошибка кладёт заглушку поверх iframe.
  //
  // По load iframe успех не определить: страница ошибки браузера (виджет
  // заблокирован, связь оборвалась) тоже присылает load, а бывает, что load не
  // приходит и через 12 с при уже нарисованной карте. Поэтому:
  // - нет сети или лёгкий запрос HEAD к виджету (no-cors: важно только, дошёл
  //   ли он) отклонён — ошибка поверх iframe с «Повторить»;
  // - 12 с без load — не ошибка (карта могла уже быть на экране), а плашка поверх
  //   карты: «Карта долго грузится — откройте в Яндекс Картах». Карточка рядом
  //   при этом не меняет высоту.
  // Плашка «долго грузится» встаёт на место подписи слоя для пальца — подпись прячем.
  const showSlow = (on) => { slow.hidden = !on; box.toggleAttribute('data-slow', on); };
  const setState = (state) => {
    box.dataset.state = state;
    retry.hidden = state !== 'error';
    status.textContent = state === 'loading' ? 'Загружаем карту…' : state === 'error' ? 'Карта не загрузилась.' : '';
    // Заглушка под iframe не должна ловить Tab: доступна, только когда она сверху.
    fallback.inert = Boolean(frame) && state !== 'error';
    if (state !== 'loading') showSlow(false);
  };

  function unload() {
    clearTimeout(probeTimer);
    clearTimeout(slowTimer);
    probe?.abort();
    probe = null;
    frame?.remove();
    frame = null;
    setState('idle');
  }

  function verify(iframe) {
    probe?.abort();
    clearTimeout(probeTimer);
    const check = new AbortController();
    probe = check;
    let timedOut = false;
    probeTimer = setTimeout(() => { timedOut = true; check.abort(); }, LOAD_TIMEOUT_MS);
    return fetch(iframe.src, { method: 'HEAD', mode: 'no-cors', cache: 'no-store', credentials: 'omit', signal: check.signal })
      .then(() => 'ok', () => (timedOut ? 'timeout' : check.signal.aborted ? null : 'fail'))
      .finally(() => { if (probe === check) { clearTimeout(probeTimer); probe = null; } });
  }

  // Возвращает обещание: выполнено, когда iframe загрузился, загрузка не удалась
  // или прошло QUEUE_STEP_MS, — по нему очередь пускает следующую карту.
  function load() {
    unload();
    setState('loading');
    if (navigator.onLine === false) { setState('error'); return Promise.resolve(); }
    let release;
    const settled = new Promise((resolve) => { release = resolve; setTimeout(resolve, QUEUE_STEP_MS); });
    const iframe = document.createElement('iframe');
    iframe.src = location.mapWidget;
    // Имя на сайте — Meat Wash (в самих Картах студии пока под прежним именем, Meat Wash).
    iframe.title = `Яндекс Карты: Meat Wash — ${location.name}, ${location.address}`;
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    // Итог проверки: 'ok', 'fail' — запрос отклонён (блокировка, обрыв, нет сети),
    // 'timeout' — 12 с без ответа, null — проверку сменила новая загрузка.
    // Отказ — ошибка: load в этом случае приходит от страницы ошибки браузера.
    // Таймаут ошибкой не считается.
    let result = null, loaded = false;
    frame = iframe;
    const decide = () => {
      if (frame !== iframe) return;
      if (result === 'fail') setState('error');
      else if (loaded) setState('loaded');
    };
    iframe.addEventListener('load', () => {
      release();
      if (frame !== iframe) return;
      loaded = true;
      // Карта пришла после отказа (сеть ожила) — проверяем ещё раз, а не верим load.
      if (result === 'fail') verify(iframe).then((r) => { if (r) { result = r; decide(); } });
      else decide();
    });
    verify(iframe).then((r) => { if (r) { result = r; decide(); if (r === 'fail') release(); } });
    slowTimer = setTimeout(() => { if (frame === iframe && !loaded && box.dataset.state === 'loading') showSlow(true); }, LOAD_TIMEOUT_MS);
    // Слой для пальца — поверх iframe, поэтому iframe встаёт перед ним.
    box.insertBefore(iframe, shield);
    setState(box.dataset.state);
    shield.hidden = false;
    return settled;
  }

  retry.addEventListener('click', () => {
    load();
    // Кнопка «Повторить» скрылась — фокус остаётся в области карты.
    box.focus({ preventScroll: true });
  });

  offscreen.observe(box);
  return {
    id: location.id,
    get frame() { return frame; },
    // Встать в очередь загрузки (см. QUEUE_STEP_MS); «Повторить» идёт без очереди.
    show() {
      if (frame || box.dataset.state !== 'idle' || 'queued' in box.dataset) return;
      box.dataset.queued = '';
      queue = queue.then(() => { delete box.dataset.queued; return frame || box.dataset.state !== 'idle' ? null : load(); });
    },
    arm() { if (frame) shield.hidden = false; },
  };
}

// Карта студии в области [data-map-embed]: создаётся при первом вызове.
export function showMap(box) {
  if (!box) return;
  if (!offscreen) listen();
  let map = maps.get(box);
  if (!map) {
    map = embed(box);
    if (!map) return;
    maps.set(box, map);
  }
  map.show();
}
