// «Гараж услуг» — 3D-сценарий страницы «Автомойка и детейлинг» (/services, блок #garage-3d;
// решение Влада 27.10: гараж остаётся, но не на главной). Модуль грузит js/site.js по
// первому нажатию [data-garage-open].
//
// Кнопки [data-garage-open] открывают одно модальное окно (<dialog id="garage">).
// Оболочка — название, закрытие, состояние загрузки — появляется сразу; движок и
// модель (porsche3d.bundle.js) запрашиваются только после нажатия и только
// import() строкой: npm run check падает на любой другой ссылке на 3D.
//
// Состояния окна (data-state): loading → ready, либо error (сеть, тайм-аут,
// шейдеры, потеря контекста — с «Повторить») или nogl (нет WebGL 2 — без повтора).
// Панель услуг видна только в ready: фотография 3D-гаражом не притворяется.
//
// Закрытие — крестик, Esc, фон окна (на компьютере) — работает в любом
// состоянии: загрузка отменяется (AbortSignal), сцена освобождает видеопамять
// (dispose), прокрутка и фокус возвращаются. Поздно закончившаяся загрузка
// видит, что её отменили, и закрывает свою сцену — окно сама не открывает.
// Выбор работ живёт в sessionStorage отдельно от сцены: повторное открытие его
// не сбрасывает, для этого есть «Сбросить выбор».
//
// Панель услуг — только необходимое: четыре категории каталога, короткий список
// работ выбранной категории (название и цена), строка «Выбрано: N» с итогом и
// действие. Подробности — по запросу: состав программы — по кнопке «Состав»,
// список выбранного (убрать работу, сбросить выбор) — по нажатию на «Выбрано».

import { ZONES, ZONE_GROUPS, EXCLUSIVE, zonePrice, garageSum, garageOpen, includedIn, isWash } from './config.js';
import { BODY_TYPES, PROGRAMS } from './data.js';
import { getBody, setBody, bodyName } from './body.js';
import { goal } from './analytics.js';

const money = (n) => n.toLocaleString('ru-RU') + ' ₽';
const works = (n) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'работа' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'работы' : 'работ'}`;
const byId = (id) => ZONES.find((z) => z.id === id);
const PICKED_KEY = 'mw:garage';
const WEBGL_KEY = 'mw:webgl2';
const GUARD_MS = 400;   // второй щелчок двойного клика по кнопке входа не закрывает окно
// Гараж живёт на /services: «Открыть услуги» — якорь каталога этой же страницы.
const CATALOG = '#price-list';
const LATER = 'после оценки';   // цена работы, которую назовёт мастер (null в каталоге)
// Вкладки — четыре категории каталога; готовых «наборов» нет: пакеты автомойки —
// настоящие позиции каталога, они во вкладке «Автомойка».
const TABS = ZONE_GROUPS;

// Выбор на время визита: только известные работы, одна программа автомойки,
// без работ, уже входящих в выбранную программу.
function readPicked() {
  let ids = [];
  try { ids = JSON.parse(sessionStorage.getItem(PICKED_KEY) || '[]'); } catch { /* приватный режим */ }
  const out = [];
  for (const id of Array.isArray(ids) ? ids : []) {
    if (!byId(id) || out.includes(id)) continue;
    for (const group of EXCLUSIVE) if (group.includes(id)) for (let i = out.length - 1; i >= 0; i--) if (group.includes(out[i])) out.splice(i, 1);
    out.push(id);
  }
  return out.filter((id) => !includedIn(byId(id), out));
}
function savePicked(ids) {
  try { sessionStorage.setItem(PICKED_KEY, JSON.stringify(ids)); } catch { /* приватный режим: выбор живёт до перезагрузки */ }
}

// Настоящая проба WebGL 2 — по нажатию, до загрузки бандла: API может быть, а
// контекст не создаться (видеокарта в чёрном списке). Результат — на визит.
function probeWebGL2() {
  try { const known = sessionStorage.getItem(WEBGL_KEY); if (known) return known === '1'; } catch { /* приватный режим */ }
  let ok = false;
  if ('WebGL2RenderingContext' in window) {
    try {
      const gl = document.createElement('canvas').getContext('webgl2');
      ok = Boolean(gl);
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch { ok = false; }
  }
  try { sessionStorage.setItem(WEBGL_KEY, ok ? '1' : '0'); } catch { /* приватный режим */ }
  return ok;
}

const icon = {
  close: '<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false"><path d="M5 5l10 10M15 5 5 15" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  reset: '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false"><path d="M10 2.2 16.8 6v8L10 17.8 3.2 14V6z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M3.2 6 10 9.8 16.8 6M10 9.8v8" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>',
  fold: '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false"><path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  more: '<svg class="garage__chev" viewBox="0 0 20 20" width="14" height="14" aria-hidden="true" focusable="false"><path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  remove: '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false"><path d="M6 6l8 8M14 6l-8 8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
};
const esc = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// Короткие предлоги и союзы не висят в конце строки (как typo() при сборке страниц):
// «Детейлинг-мойка от реагентов» переносится целиком «от реагентов». Только для видимого текста.
const nb = (text) => String(text).replace(/(^|[\s(«—])([а-яё]{1,2}|для|без|под|над|при) /gi, '$1$2\u00a0');

// Строка работы: флажок с названием и ценой; у программ и пакетов автомойки —
// кнопка «Состав», сам состав раскрывается по нажатию.
function zoneRow(z) {
  const program = z.price.program != null ? PROGRAMS[z.price.program] : null;
  return `
              <li class="garage__row" data-row="${z.id}">
                <label class="garage__item" data-zone="${z.id}">
                  <input type="checkbox" value="${z.id}">
                  <span class="garage__box" aria-hidden="true"></span>
                  <span class="garage__name">${esc(nb(z.title))}</span>
                  <span class="garage__price" data-zone-price></span>
                </label>${program ? `
                <button class="garage__morebtn" type="button" data-zone-more="${z.id}" aria-expanded="false" aria-controls="garage-more-${z.id}">Состав<span class="visually-hidden">: ${esc(z.title)}</span>${icon.more}</button>
                <div class="garage__more" id="garage-more-${z.id}" data-zone-details hidden>
                  <p>${esc(program.time)} · ${esc(z.caption)}</p>
                  <ul>${program.includes.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>
                </div>` : ''}
              </li>`;
}

export function setupGarage() {
  const abort = new AbortController(), options = { signal: abort.signal };
  const coarse = () => matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const forceStatic = new URLSearchParams(location.search).get('motion') === 'reduce';
  const reduced = () => motion.matches || forceStatic;

  const dialog = document.createElement('dialog');
  dialog.className = 'garage';
  dialog.id = 'garage';
  dialog.setAttribute('aria-labelledby', 'garage-title');
  dialog.dataset.state = 'idle';
  dialog.innerHTML = `
    <header class="garage__bar">
      <h2 class="garage__title" id="garage-title" tabindex="-1">Гараж услуг</h2>
      <button class="garage__fold" type="button" data-garage-fold aria-expanded="true" aria-controls="garage-tabs garage-list">${icon.fold}<span><span data-fold-text>Свернуть</span><span class="garage__foldmore"> услуги</span></span></button>
      <button class="garage__close" type="button" data-garage-close aria-label="Закрыть гараж услуг">${icon.close}</button>
    </header>
    <p class="visually-hidden" role="status" aria-live="polite" aria-atomic="true" data-garage-live></p>
    <div class="garage__main">
      <div class="garage__view" data-garage-view role="group" aria-label="3D-модель автомобиля" aria-describedby="garage-keys" tabindex="-1">
        <div class="garage__stage" data-garage-stage></div>
        <div class="garage__loader" data-garage-loader>
          <p class="garage__loadtext"><span data-garage-loadtext>Загружаем 3D-гараж</span><span class="garage__pct" data-garage-pct></span></p>
          <div class="garage__progress" data-garage-progress aria-hidden="true"><i></i></div>
          <p class="garage__loadnote">Закрыть можно в любой момент — выбор услуг сохранится.</p>
        </div>
        <div class="garage__fail" data-garage-fail>
          <p class="garage__failtitle" data-garage-failtitle></p>
          <p class="garage__failtext" data-garage-failtext></p>
          <div class="garage__failact">
            <button class="btn btn--primary" type="button" data-garage-retry>Повторить</button>
            <a class="btn btn--ghost" href="${CATALOG}" data-garage-catalog>Открыть услуги</a>
            <button class="btn btn--ghost" type="button" data-garage-close>Закрыть</button>
          </div>
        </div>
        <div class="garage__tools">
          <button class="garage__tool" type="button" data-garage-reset>${icon.reset}<span>Общий вид</span></button>
          <div class="garage__zoom" role="group" aria-label="Приближение">
            <button class="garage__tool garage__tool--icon" type="button" data-garage-zoom="in" aria-label="Приблизить">+</button>
            <button class="garage__tool garage__tool--icon" type="button" data-garage-zoom="out" aria-label="Отдалить">−</button>
          </div>
        </div>
        <p class="garage__hint" data-garage-hint></p>
        <p class="visually-hidden" id="garage-keys">Стрелки — поворот, плюс и минус — приближение, Home — общий вид.</p>
        <p class="garage__caption" data-garage-caption><b></b><span></span></p>
      </div>
      <section class="garage__panel" aria-label="Выбор услуг">
        <div class="garage__tabs" id="garage-tabs" role="tablist" aria-label="Категории услуг">
          ${TABS.map((tab, i) => `<button class="garage__tab" type="button" role="tab" id="garage-tab-${tab.id}" aria-controls="garage-group-${tab.id}" aria-selected="${i ? 'false' : 'true'}" tabindex="${i ? -1 : 0}" data-tab="${tab.id}"><span class="garage__tabname">${esc(tab.title)}</span><span class="visually-hidden" data-tab-picked></span></button>`).join('')}
        </div>
        <div class="garage__list" id="garage-list">
          ${ZONE_GROUPS.map((group, i) => `
          <div class="garage__group" role="tabpanel" id="garage-group-${group.id}" aria-labelledby="garage-tab-${group.id}" data-group="${group.id}"${i ? ' hidden' : ''}>
            ${group.booking === 'yclients' ? `<label class="garage__bodytype"><span>Тип кузова</span><select data-garage-body>${BODY_TYPES.map((type, b) => `<option value="${b}">${esc(type)}</option>`).join('')}</select></label>` : ''}
            <ul class="garage__items">${ZONES.filter((z) => z.group === group.id).map(zoneRow).join('')}
            </ul>
          </div>`).join('')}
        </div>
        <div class="garage__foot">
          <div class="garage__sum">
            <button class="garage__summary" type="button" data-garage-summary aria-expanded="false" aria-controls="garage-picked" hidden><span data-garage-count></span>${icon.more}</button>
            <p class="garage__total" data-garage-total></p>
          </div>
          <div class="garage__picked" id="garage-picked" data-garage-picked role="group" aria-label="Выбранные услуги" hidden>
            <div class="garage__picks" data-garage-picks></div>
            <p class="garage__note" data-garage-note></p>
            <button class="garage__clear" type="button" data-garage-clear>Сбросить выбор</button>
          </div>
          <div class="garage__act">
            <button class="btn btn--primary garage__book" type="button" data-book data-garage-book>Записаться</button>
            <button class="btn btn--ghost garage__request" type="button" data-request data-garage-request hidden>Узнать цену</button>
          </div>
          <p class="garage__split" data-garage-split hidden>Автомойка&nbsp;— онлайн-запись в&nbsp;студию, цену остальных работ назовёт администратор.</p>
          <!-- Лицензия модели CC BY 4.0 требует указать автора и что модель изменена — рядом с ней. -->
          <p class="garage__credit">3D-модель: <a href="https://sketchfab.com/3d-models/free-1975-porsche-911-930-turbo-8568d9d14a994b9cae59499f0dbed21e" target="_blank" rel="noopener noreferrer">Karol Miklas</a>, <a href="https://creativecommons.org/licenses/by/4.0/deed.ru" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>, изменена</p>
        </div>
      </section>
    </div>`;
  document.body.append(dialog);

  const $ = (s) => dialog.querySelector(s);
  const stageEl = $('[data-garage-stage]'), viewEl = $('[data-garage-view]'), live = $('[data-garage-live]');
  const loadText = $('[data-garage-loadtext]'), pctEl = $('[data-garage-pct]'), progressEl = $('[data-garage-progress]');
  const failTitle = $('[data-garage-failtitle]'), failText = $('[data-garage-failtext]'), retryBtn = $('[data-garage-retry]');
  const hint = $('[data-garage-hint]'), caption = $('[data-garage-caption]');
  const totalEl = $('[data-garage-total]'), pickedEl = $('[data-garage-picked]'), picksEl = $('[data-garage-picks]'), noteEl = $('[data-garage-note]');
  const summaryBtn = $('[data-garage-summary]'), countEl = $('[data-garage-count]');
  const bookBtn = $('[data-garage-book]'), requestBtn = $('[data-garage-request]'), splitEl = $('[data-garage-split]');
  const bodySelect = $('[data-garage-body]'), foldBtn = $('[data-garage-fold]'), title = $('#garage-title');
  const tabs = [...dialog.querySelectorAll('[role="tab"]')];
  const rows = [...dialog.querySelectorAll('.garage__row')];

  let active = false;       // окно открыто (и ещё не закрыто нами)
  let opener = null;        // кнопка, открывшая гараж: на неё возвращается фокус
  let savedY = 0;           // место главной страницы
  let openedAt = 0;
  let job = null;           // {controller} — идёт загрузка
  let scene = null;         // сцена из mount(), когда первый кадр нарисован
  let importFailures = 0;
  let hinted = false;
  const picked = readPicked();
  let lastTouched = picked.at(-1) ?? null;

  const say = (text) => { live.textContent = ''; requestAnimationFrame(() => { live.textContent = text; }); };

  // ── Состояния ─────────────────────────────────────────────────────────────
  function setState(next) {
    dialog.dataset.state = next;
    dialog.toggleAttribute('aria-busy', next === 'loading');
  }
  // ratio — доля скачанной модели, только если известна точно (размер из
  // манифеста сборки); null — индикатор без процента.
  function setProgress(ratio, phase) {
    const known = ratio != null && phase === 'download';
    loadText.textContent = phase === 'prepare' ? 'Готовим 3D-гараж' : 'Загружаем 3D-гараж';
    pctEl.textContent = known ? ` · модель ${Math.round(ratio * 100)} %` : '';
    progressEl.classList.toggle('is-indeterminate', !known);
    progressEl.style.setProperty('--p', known ? ratio.toFixed(3) : '0');
  }
  function fail(error) {
    job = null;
    if (scene) { scene.dispose(); scene = null; }
    const noWebgl = error?.code === 'webgl';
    if (noWebgl) { try { sessionStorage.setItem(WEBGL_KEY, '0'); } catch { /* приватный режим */ } }
    else console.warn('3D-гараж не открылся.', error);
    if (!active) return;
    setState(noWebgl ? 'nogl' : 'error');
    retryBtn.hidden = noWebgl;
    failTitle.textContent = noWebgl ? '3D-гараж недоступен на этом устройстве' : 'Не удалось открыть 3D-гараж';
    failText.textContent = noWebgl
      ? 'Браузер не поддерживает WebGL 2, без него 3D-модель не показать. Услуги и цены — в каталоге.'
      : error?.code === 'context-lost'
        ? '3D-сцена остановилась. Вы можете повторить попытку или выбрать услуги в каталоге.'
        : 'Вы можете повторить попытку или выбрать услуги в каталоге.';
    say(failTitle.textContent + '. ' + failText.textContent);
    // Фокус был на заголовке или внутри исчезнувшей панели — ставим на первое действие.
    if (!dialog.contains(document.activeElement) || document.activeElement === title || document.activeElement === document.body) (noWebgl ? $('[data-garage-catalog]') : retryBtn).focus({ preventScroll: true });
  }

  // ── Загрузка ──────────────────────────────────────────────────────────────
  // Адрес — строкой: так его видит npm run check, а stamp-assets ставит ?v=.
  // Неудачный import() браузер запоминает, поэтому повтор после сбоя идёт по
  // адресу с ?retry=N (и той же версией ?v=).
  async function importBundle() {
    try {
      if (!importFailures) return await import('./porsche3d.bundle.js');
      const url = new URL('./porsche3d.bundle.js', import.meta.url);
      const v = new URL(import.meta.url).searchParams.get('v');
      if (v) url.searchParams.set('v', v);
      url.searchParams.set('retry', String(importFailures));
      return await import(url.href);
    } catch (error) {
      importFailures++;
      throw Object.assign(error, { code: error.code || 'load' });
    }
  }
  async function load() {
    if (job || scene) return;
    const controller = new AbortController();
    const mine = job = { controller };
    setState('loading');
    setProgress(null, 'bundle');
    say('Загружаем 3D-гараж.');
    // Кадр на отрисовку оболочки: проба WebGL может занять до полсекунды.
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
    if (job !== mine) return;
    if (!probeWebGL2()) { fail({ code: 'webgl' }); return; }
    try {
      const { mount } = await importBundle();
      if (job !== mine) return;
      const handle = await mount({
        container: stageEl,
        signal: controller.signal,
        reducedMotion: reduced(),
        startView: 'overview',
        onProgress: ({ ratio }) => { if (job === mine) setProgress(ratio, 'download'); },
        onPhase: (phase) => { if (job === mine && phase === 'prepare') setProgress(null, 'prepare'); },
        onInteract: () => hideHint(),
        onError: (error) => { if (scene === handle) { scene = null; fail(error); } },
      });
      // Окно закрыли или начали загрузку заново — эта сцена не нужна.
      if (job !== mine || controller.signal.aborted || !active) { handle.dispose(); return; }
      job = null;
      scene = handle;
      setState('ready');
      // Выбор сохранился с прошлого открытия — камера сразу на ракурсе работы, подсказка не нужна.
      if (!picked.length) showHint();
      renderSelection();
      target(null);
      frameSafe();
      say('3D-гараж готов. Выберите услуги — камера покажет деталь автомобиля.');
      goal('garage_ready', { quality: handle.quality });
    } catch (error) {
      if (job !== mine) return;
      job = null;
      if (error?.name === 'AbortError') return;
      fail(error);
    }
  }

  // ── Камера и подписи ──────────────────────────────────────────────────────
  // Какая работа на экране: тронутая последней, иначе последняя выбранная.
  function current(id) {
    const key = id || lastTouched;
    if (key && picked.includes(key)) return key;
    return ZONES.slice().reverse().find((z) => picked.includes(z.id))?.id ?? null;
  }
  function target(id) {
    const key = current(id);
    const zone = key ? byId(key) : null;
    caption.querySelector('b').textContent = zone ? zone.title : 'Общий вид';
    caption.querySelector('span').textContent = zone ? zone.caption : 'Выберите работу — камера покажет нужную деталь.';
    if (!scene) return;
    if (zone) scene.showService(zone.id); else scene.showBase();
  }
  // Кнопки сверху и подпись снизу лежат поверх области 3D: камера кадрирует
  // машину в свободной части между ними — они не закрывают колёса и крышу.
  const toolsEl = $('.garage__tools');
  function frameSafe() {
    if (!scene) return;
    const view = viewEl.getBoundingClientRect(), tools = toolsEl.getBoundingClientRect(), cap = caption.getBoundingClientRect();
    scene.setSafeArea({
      top: tools.height ? Math.max(0, Math.round(tools.bottom - view.top)) : 0,
      bottom: cap.height ? Math.max(0, Math.round(view.bottom - cap.top)) : 0,
    });
  }
  const resizeWatch = new ResizeObserver(() => frameSafe());
  resizeWatch.observe(viewEl);
  resizeWatch.observe(caption);
  function showHint() {
    if (hinted) return;
    hint.textContent = coarse() ? 'Проведите пальцем — повернуть, два пальца — приблизить' : 'Потяните мышью — повернуть, колесо — приблизить';
    hint.hidden = false;
  }
  function hideHint() { hinted = true; hint.hidden = true; }

  // ── Выбор услуг ───────────────────────────────────────────────────────────
  // Цена в строке и в списке выбранного: «от …», «после оценки» или «входит в пакет».
  function priceText(zone, body, inside) {
    if (inside) return inside.package ? 'входит в пакет' : 'входит в программу';
    const price = zonePrice(zone, body);
    return price == null ? LATER : 'от ' + money(price);
  }
  // Итог: сумма «от» без работ с ценой после оценки — они названы отдельно.
  function renderTotal(body) {
    const sum = garageSum(picked, body), open = garageOpen(picked);
    totalEl.classList.toggle('is-empty', !picked.length);
    if (!picked.length) { totalEl.textContent = 'Выберите работы'; return; }
    const value = document.createElement('b');
    value.textContent = sum ? 'от ' + money(sum) : LATER;
    totalEl.replaceChildren(value);
    // Одна такая работа — по названию, несколько — числом (названия — в «Выбрано»).
    if (sum && open.length) {
      const more = document.createElement('small');
      more.textContent = `+ ${LATER}: ${open.length > 1 ? works(open.length) : open[0].title}`;
      totalEl.append(' ', more);
    }
  }
  // Список выбранного (раскрывается по «Выбрано: N»): автомойка и работы «Узнать цену» —
  // отдельными группами, если выбраны вместе: в YCLIENTS уходит только автомойка.
  function renderPicked(body, wash, other) {
    const list = (ids) => {
      const ul = document.createElement('ul');
      for (const id of ids) {
        const zone = byId(id), li = document.createElement('li');
        li.className = 'garage__pick';
        li.innerHTML = `<span class="garage__pickname"></span><span class="garage__pickprice"></span><button class="garage__unpick" type="button" data-unpick="${id}">${icon.remove}</button>`;
        li.children[0].textContent = zone.title;
        li.children[1].textContent = priceText(zone, body, null);
        li.children[2].setAttribute('aria-label', `Убрать: ${zone.title}`);
        ul.append(li);
      }
      return ul;
    };
    const head = (text) => { const p = document.createElement('p'); p.className = 'garage__pickhead'; p.textContent = text; return p; };
    picksEl.replaceChildren(...(wash.length && other.length
      ? [head('Автомойка\u00a0— онлайн-запись'), list(wash), head('Цену назовёт администратор'), list(other)]
      : [list(picked)]));
    noteEl.textContent = `Минимальные цены каталога${wash.length ? `, автомойка — для кузова «${bodyName(body)}»` : ''}. Точную стоимость назовёт мастер.`;
  }
  function setSummary(on) {
    const show = on && picked.length > 0;
    pickedEl.hidden = !show;
    summaryBtn.setAttribute('aria-expanded', String(show));
    dialog.classList.toggle('is-summary', show);
  }
  function renderSelection() {
    // Сцена держит по выбору вид фар: прозрачные после полировки, тонированные плёнкой.
    scene?.setWorks?.(picked);
    const body = getBody();
    bodySelect.value = String(body);
    for (const row of rows) {
      const zone = byId(row.dataset.row), input = row.querySelector('input');
      const inside = includedIn(zone, picked);
      input.checked = picked.includes(zone.id) || Boolean(inside);
      input.disabled = Boolean(inside);
      row.classList.toggle('is-on', input.checked);
      row.classList.toggle('is-included', Boolean(inside));
      row.querySelector('[data-zone-price]').textContent = priceText(zone, body, inside);
      row.querySelector('.garage__item').title = inside ? `Входит в «${inside.title}»` : '';
    }
    // Выбор сохраняется между вкладками: у категории с выбранными работами — метка.
    for (const tab of tabs) {
      const n = picked.filter((id) => byId(id).group === tab.dataset.tab).length;
      tab.classList.toggle('has-picked', n > 0);
      tab.querySelector('[data-tab-picked]').textContent = n ? `, выбрано: ${n}` : '';
    }
    renderTotal(body);
    countEl.textContent = `Выбрано: ${picked.length}`;
    summaryBtn.hidden = !picked.length;
    if (!picked.length) setSummary(false);
    // Два сценария: автомойка — запись в YCLIENTS с выбором филиала, остальные
    // работы — «Узнать цену» (v2, план юзабилити 08.10: одна подпись у всех входов;
    // пока заявки с сайта не принимаются, ui.js откроет телефоны студий).
    // Смешанный выбор не уходит в YCLIENTS целиком:
    // видны обе кнопки, и каждое окно напоминает о второй части.
    const wash = picked.filter((id) => isWash(byId(id))), other = picked.filter((id) => !isWash(byId(id)));
    renderPicked(body, wash, other);
    const titles = (ids) => ids.map((id) => byId(id).title);
    bookBtn.hidden = Boolean(other.length && !wash.length);
    bookBtn.textContent = wash.length ? 'Записаться на автомойку' : 'Записаться';
    // Состав автомойки — в «Вы выбрали: …» окна записи, с кузовом (цена от него зависит).
    if (wash.length) bookBtn.dataset.bookContext = titles(wash).join(', ') + ' · ' + bodyName(body) + ' · предварительно от ' + money(garageSum(wash, body));
    else delete bookBtn.dataset.bookContext;
    // Для онлайн-записи — индексы программ; ui.js переведёт их в услуги YCLIENTS филиала.
    bookBtn.dataset.ycPrograms = wash.map((id) => byId(id).price.program).join(',');
    bookBtn.dataset.ycItems = '';
    bookBtn.dataset.requestServices = titles(other).join('|');
    requestBtn.hidden = !other.length;
    requestBtn.dataset.requestServices = titles(other).join('|');
    if (wash.length) { requestBtn.dataset.washContext = bookBtn.dataset.bookContext; requestBtn.dataset.washPrograms = bookBtn.dataset.ycPrograms; }
    else { delete requestBtn.dataset.washContext; delete requestBtn.dataset.washPrograms; }
    splitEl.hidden = !(wash.length && other.length);
  }
  // Часть работ в онлайн-записи не продаётся: их добавляет мастер при приёмке.
  // Помечаем это сразу в списке («на месте» у названия, пояснение — в «Составе»),
  // чтобы человек видел до нажатия «Записаться», а не удивлялся, что в запись
  // ушла половина выбранного.
  function markOffline() {
    import('./yclients.js').then((yc) => yc.loadMap().then(() => {
      let offline = 0;
      // Только автомойка: остальные работы — «Узнать цену», YCLIENTS там не участвует.
      for (const row of rows) {
        const zone = byId(row.dataset.row);
        if (!zone || !isWash(zone)) continue;
        const spec = zone.price.program != null
          ? { programs: [zone.price.program], items: [] }
          : { programs: [], items: [zone.price.item] };
        // Работа доступна онлайн, если её удалось сопоставить хотя бы в одном филиале.
        const ok = ['myasnitskaya', 'technopark'].some((b) => yc.resolve(b, spec, 0).ids.length);
        row.classList.toggle('is-offline', !ok);
        if (!ok) {
          offline += 1;
          const details = row.querySelector('[data-zone-details]');
          if (details && !details.querySelector('.garage__offline')) {
            const note = document.createElement('p');
            note.className = 'garage__offline';
            note.textContent = 'Приобретается на месте — мастер добавит при приёмке.';
            details.prepend(note);
          }
        }
      }
      if (offline) say(`${works(offline)} — на месте, мастер добавит при приёмке.`);
    })).catch(() => {});
  }

  function setPicked(ids, touched) {
    picked.splice(0, picked.length, ...ids);
    lastTouched = touched ?? null;
    savePicked(picked);
    renderSelection();
    target(touched);
  }
  const totalPhrase = () => (picked.length ? `Выбрано работ: ${picked.length}, ${totalEl.textContent}` : 'Ничего не выбрано');
  function toggle(id, on) {
    let next = picked.filter((x) => x !== id);
    if (on) {
      // Вторая программа автомойки заменяет первую (они вложены друг в друга).
      for (const group of EXCLUSIVE) if (group.includes(id)) next = next.filter((x) => !group.includes(x));
      next.push(id);
      // Работы, которые теперь входят в выбранную программу, отдельно не считаются.
      next = next.filter((x) => !includedIn(byId(x), next));
    }
    setPicked(next, on ? id : null);
    // Работа выбрана — подсказка про жесты своё отработала и на ракурсе работы только
    // закрывает сцену (на телефоне — знак на стене).
    if (on) hideHint();
    const zone = byId(id);
    say(`${zone.title}: ${on ? 'выбрано' : 'убрано'}. ${totalPhrase()}.`);
  }
  // Состав программы — по кнопке «Состав»; открыт один за раз, чтобы список
  // оставался коротким.
  function setMore(id) {
    let opened = null;
    for (const btn of dialog.querySelectorAll('[data-zone-more]')) {
      const on = btn.dataset.zoneMore === id && btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(on));
      btn.closest('.garage__row').classList.toggle('is-open', on);
      document.getElementById(btn.getAttribute('aria-controls')).hidden = !on;
      if (on) opened = btn.closest('.garage__row');
    }
    // Раскрытый состав ниже края списка — докручиваем список (только его, не страницу).
    if (!opened) return;
    const list = $('.garage__list'), row = opened.getBoundingClientRect(), box = list.getBoundingClientRect();
    if (row.bottom > box.bottom) list.scrollTop += Math.min(row.bottom - box.bottom + 8, row.top - box.top);
  }
  function selectTab(id, focus) {
    for (const tab of tabs) {
      const on = tab.dataset.tab === id;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      if (on && focus) tab.focus();
    }
    for (const group of dialog.querySelectorAll('.garage__group')) group.hidden = group.dataset.group !== id;
    // Другая категория — список выбранного сворачивается: на телефоне он занимает
    // место списка работ.
    setSummary(false);
    setMore(null);
    $('.garage__list').scrollTop = 0;
  }
  function setFolded(on) {
    dialog.classList.toggle('is-folded', on);
    foldBtn.setAttribute('aria-expanded', String(!on));
    // На узком экране видно «Свернуть» / «Показать», «услуги» — для чтения с экрана.
    foldBtn.querySelector('[data-fold-text]').textContent = on ? 'Показать' : 'Свернуть';
  }

  // ── Открытие и закрытие ───────────────────────────────────────────────────
  // Прокрутка страницы за окном выключена тем же способом, что у остальных окон
  // (ui.js syncLock): класс на <html>, iOS не считается с overflow одного body. Считаем
  // по всем открытым dialog, как ui.js, поэтому гонки с его syncLock нет: кто бы ни
  // пересчитал последним, результат один (поправка 21).
  function lock(on) {
    const other = [...document.querySelectorAll('dialog[open]')].some((d) => d !== dialog);
    const menu = document.getElementById('mobile-menu');
    document.documentElement.classList.toggle('is-locked', on || other || Boolean(menu && !menu.hidden));
    document.body.classList.toggle('dialog-open', on || other);
  }
  function open(button) {
    if (active) return;
    active = true;
    opener = button || null;
    savedY = scrollY;
    openedAt = performance.now();
    setFolded(false);
    hinted = false; hint.hidden = true;
    picked.splice(0, picked.length, ...readPicked());
    renderSelection();
    markOffline();
    // Открываем на категории последней выбранной работы.
    const last = byId(current(null));
    selectTab(last ? last.group : ZONE_GROUPS[0].id, false);
    target(null);
    dialog.showModal();
    lock(true);
    title.focus({ preventScroll: true });
    goal('garage_open', { from: button?.closest('#garage-3d, #garage-promo') ? 'promo' : button?.closest('.hero') ? 'hero' : 'link' });
    load();
  }
  function teardown() {
    job?.controller.abort();
    job = null;
    if (scene) { scene.dispose(); scene = null; }
    setState('idle');
    lock(false);
    // Страница не должна была сдвинуться, но iOS иногда прокручивает её под
    // окном: ставим точно на прежнее место.
    // Без behavior: у html scroll-behavior: auto (cinematic.css), а 'instant' старый Safari не знает.
    if (Math.abs(scrollY - savedY) > 1) scrollTo(0, savedY);
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  }
  // Сначала закрываем окно, потом teardown: dialog.close() сам возвращает фокус
  // туда, где он был до showModal (после ./#garage — на body), и перебил бы наш.
  function close() {
    if (!active) return;
    active = false;
    if (dialog.open) dialog.close();
    teardown();
  }

  // ── События ───────────────────────────────────────────────────────────────
  // Esc: своё закрытие вместо встроенного — с отменой загрузки и возвратом фокуса.
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); }, options);
  // Окно закрыли не через close() (браузер, второй Esc) — всё равно убираем сцену.
  dialog.addEventListener('close', () => { if (active) { active = false; teardown(); } }, options);
  let downOutside = false;
  const outside = (e) => { const r = dialog.getBoundingClientRect(); return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom; };
  dialog.addEventListener('pointerdown', (e) => { downOutside = e.target === dialog && outside(e); }, options);

  dialog.addEventListener('click', (e) => {
    const settling = e.detail > 1 || performance.now() - openedAt < GUARD_MS;
    // Фон окна (компьютер): закрываем, только если и нажатие, и отпускание были вне окна.
    if (e.target === dialog) { if (!settling && downOutside && outside(e)) close(); return; }
    const control = e.target.closest('button, a[href]');
    if (!control) return;
    if (control.matches('[data-garage-close]')) { if (!settling) close(); return; }
    if (control.matches('[data-garage-retry]')) { setState('loading'); title.focus({ preventScroll: true }); load(); return; }
    // «Открыть услуги» — каталог этой же страницы: закрываем окно и сцену, переход по якорю
    // делает браузер (или ui.js). С модификатором (новая вкладка) окно остаётся.
    if (control.matches('[data-garage-catalog]')) { if (!(e.ctrlKey || e.metaKey || e.shiftKey || e.button)) close(); return; }
    if (control.matches('[data-garage-reset]')) { scene?.reset(); return; }
    if (control.matches('[data-garage-zoom]')) { scene?.zoomBy(control.dataset.garageZoom === 'in' ? 0.87 : 1.15); hideHint(); return; }
    if (control.matches('[data-garage-fold]')) { setFolded(!dialog.classList.contains('is-folded')); return; }
    if (control.matches('[role="tab"]')) { selectTab(control.dataset.tab, false); return; }
    if (control.matches('[data-zone-more]')) { setMore(control.dataset.zoneMore); return; }
    if (control.matches('[data-garage-summary]')) { setSummary(pickedEl.hidden); return; }
    if (control.matches('[data-garage-clear]')) {
      setPicked([], null);
      say('Выбор сброшен.');
      tabs.find((tab) => tab.tabIndex === 0)?.focus({ preventScroll: true });
      return;
    }
    if (control.matches('[data-unpick]')) {
      // Фокус — на соседнюю «Убрать», иначе на «Выбрано: N», иначе на главное действие.
      const id = control.dataset.unpick;
      const all = [...pickedEl.querySelectorAll('[data-unpick]')].map((b) => b.dataset.unpick), at = all.indexOf(id);
      const near = all[at + 1] ?? all[at - 1];
      toggle(id, false);
      const nextBtn = pickedEl.hidden ? null : pickedEl.querySelector(`[data-unpick="${near}"]`);
      (nextBtn || (summaryBtn.hidden ? bookBtn : summaryBtn)).focus({ preventScroll: true });
      return;
    }
    // «Записаться на автомойку» и «Узнать цену»: гараж закрывается, затем общий
    // обработчик ui.js (data-book / data-request) открывает своё окно — окна не
    // накладываются, выбор остаётся в sessionStorage.
    if (control.matches('[data-garage-book]')) { goal('garage_book', { works: picked.filter((id) => isWash(byId(id))).length, sum: garageSum(picked.filter((id) => isWash(byId(id))), getBody()) }); close(); }
    if (control.matches('[data-garage-request]')) { goal('garage_request', { works: picked.filter((id) => !isWash(byId(id))).length }); close(); }
  }, options);

  dialog.addEventListener('change', (e) => {
    if (e.target === bodySelect) { setBody(Number(bodySelect.value)); return; }
    if (e.target.matches('.garage__item input')) toggle(e.target.value, e.target.checked);
  }, options);

  // Вкладки: стрелки, Home и End — по ARIA-шаблону tablist.
  $('.garage__tabs').addEventListener('keydown', (e) => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (to == null) return;
    e.preventDefault();
    selectTab(tabs[(to + tabs.length) % tabs.length].dataset.tab, true);
  }, options);

  // Клавиатура в области 3D: поворот, приближение, общий вид.
  viewEl.addEventListener('keydown', (e) => {
    if (!scene || e.target !== viewEl) return;
    const step = {
      ArrowLeft: () => scene.rotateBy(-12, 0), ArrowRight: () => scene.rotateBy(12, 0),
      ArrowUp: () => scene.rotateBy(0, -6), ArrowDown: () => scene.rotateBy(0, 6),
      '+': () => scene.zoomBy(0.87), '=': () => scene.zoomBy(0.87), '-': () => scene.zoomBy(1.15),
      Home: () => scene.reset(), 0: () => scene.reset(),
    }[e.key];
    if (!step) return;
    e.preventDefault(); step(); hideHint();
  }, options);
  // Область 3D в порядке Tab — только когда модель готова.
  const observer = new MutationObserver(() => { viewEl.tabIndex = dialog.dataset.state === 'ready' ? 0 : -1; });
  observer.observe(dialog, { attributes: true, attributeFilter: ['data-state'] });

  addEventListener('mw:body', renderSelection, options);
  motion.addEventListener('change', () => scene?.setReducedMotion(reduced()), options);
  // Вкладку скрыли — сцена стоит сама (visibilitychange внутри модуля).

  return {
    open,
    close,
    get isOpen() { return active; },
    get state() { return dialog.dataset.state; },
    destroy() { close(); observer.disconnect(); resizeWatch.disconnect(); abort.abort(); dialog.remove(); },
  };
}
