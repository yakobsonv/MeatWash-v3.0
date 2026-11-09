// Яндекс Метрика — только с согласия посетителя (152-ФЗ: идентификаторы cookie
// и IP-адрес — персональные данные). Номер счётчика страница получает из
// <meta name="mw-metrika"> (site.analytics.metrika в meatwash-content.json,
// вставляет npm run pages). Нет номера — нет ни баннера, ни Метрики, goal() молчит.
//
// Решение посетителя — в localStorage (mw:consent): «Принять» загружает Метрику
// сейчас и на следующих страницах, «Отказаться» — нет. «Настройки cookie» в подвале
// открывают уведомление снова; отказ после согласия удаляет cookie Метрики и
// перезагружает страницу, чтобы счётчик перестал работать сразу.
//
// Параметры init — как в коде счётчика из интерфейса Метрики, в том числе Вебвизор
// (запись действий на странице). Он упомянут в уведомлении, Политике и Согласии:
// выключая его, поправь и тексты (npm run check сверяет).
//
// Цели (Метрика → Цели → «JavaScript-событие», идентификаторы — как здесь):
//   форма «Оставить заявку» (request.js, Влад 05.11):
//     request_open {topic, from, works} — окно открыто любой кнопкой заявки;
//     request_submit_attempt {topic, ok} — нажали «Отправить заявку» (ok — поля заполнены верно);
//     request_offline {topic} — поля верны, но приём заявок не подключён: показаны телефоны
//       студий (вместо прежней записи в YCLIENTS; цель в счётчике создаёт Влад);
//     request_sent {topic, works, photos} — только при подтверждённой доставке;
//   booking_branch {branch, preset} — переход в онлайн-запись студии (мелкая строка в форме);
//   phone_click, map_open, garage_open, garage_ready, garage_book, garage_request, club_card,
//   telegram_click {from, place, to} — переход в Telegram (ui.js, поправка критика 18).
//   booking_open больше не шлётся: окна записи нет, запись — через форму заявки.
//
// Вид уведомления — css/dialogs.css (план §4.5, паттерн Porsche 3.4): карточка слоновой кости
// внизу экрана, «Принять» и «Отказаться» одного размера; страницу не блокирует.

const KEY = 'mw:consent';
const VERSION = 1;
const counter = Number(document.querySelector('meta[name="mw-metrika"]')?.content) || 0;
const SRC = `https://mc.yandex.ru/metrika/tag.js?id=${counter}`;
let loaded = false;
let banner = null;

function read() {
  try { const v = JSON.parse(localStorage.getItem(KEY)); return v && v.v === VERSION ? v : null; } catch { return null; }
}
function save(analytics) {
  try { localStorage.setItem(KEY, JSON.stringify({ v: VERSION, analytics, at: new Date().toISOString() })); } catch { /* приватный режим: спросим на следующей странице */ }
}

// Официальный код счётчика, без noscript-пикселя: он считал бы и без согласия.
function loadMetrika() {
  if (loaded || !counter) return;
  loaded = true;
  window.ym = window.ym || function () { (window.ym.a = window.ym.a || []).push(arguments); };
  window.ym.l = Date.now();
  if (![...document.scripts].some((s) => s.src === SRC)) {
    const script = document.createElement('script');
    script.async = true;
    script.src = SRC;
    document.head.append(script);
  }
  window.ym(counter, 'init', {
    ssr: true, webvisor: true, clickmap: true, ecommerce: 'dataLayer',
    referrer: document.referrer, url: location.href, accurateTrackBounce: true, trackLinks: true,
  });
}

// Цель Метрики; без согласия или без счётчика — ничего.
export function goal(name, params) {
  if (!loaded) return;
  try { window.ym(counter, 'reachGoal', name, params); } catch { /* счётчик не загрузился — сайт работает */ }
}

function forgetMetrikaCookies() {
  for (const name of document.cookie.split(';').map((c) => c.split('=')[0].trim()).filter((n) => n.startsWith('_ym'))) {
    for (const domain of ['', location.hostname, '.' + location.hostname.split('.').slice(-2).join('.')]) {
      document.cookie = `${name}=; Max-Age=0; path=/${domain ? '; domain=' + domain : ''}`;
    }
  }
}

function hide() { if (banner) banner.hidden = true; document.body.classList.remove('has-consent'); }
function decide(analytics) {
  const was = loaded;
  save(analytics);
  hide();
  if (analytics) { loadMetrika(); return; }
  forgetMetrikaCookies();
  // Счётчик уже работает на этой странице — остановить его можно только перезагрузкой.
  if (was) location.reload();
}

function showBanner(focus) {
  if (!banner) {
    banner = document.createElement('section');
    banner.className = 'consent';
    banner.setAttribute('aria-labelledby', 'consent-title');
    // Неразрывные пробелы — как typo() на страницах: короткие слова не висят в конце строки.
    banner.innerHTML = `
      <div class="consent__body">
        <h2 class="consent__title" id="consent-title">Cookie и&nbsp;Яндекс Метрика</h2>
        <p class="consent__text">Мы&nbsp;используем cookie и&nbsp;Яндекс Метрику с&nbsp;Вебвизором, чтобы считать посещения и&nbsp;улучшать сайт. Нажимая «Принять», вы&nbsp;даёте <a href="consent">согласие на&nbsp;обработку персональных данных</a>. Подробнее&nbsp;— в&nbsp;<a href="privacy">Политике</a>. Без&nbsp;согласия сайт работает полностью.</p>
      </div>
      <div class="consent__actions">
        <button class="btn btn--primary consent__accept" type="button" data-consent="1">Принять</button>
        <button class="btn btn--secondary consent__decline" type="button" data-consent="0">Отказаться</button>
      </div>`;
    banner.addEventListener('click', (e) => {
      const button = e.target.closest('[data-consent]');
      if (button) decide(button.dataset.consent === '1');
    });
    document.body.append(banner);
  }
  banner.hidden = false;
  document.body.classList.add('has-consent');
  if (focus) banner.querySelector('.consent__accept').focus({ preventScroll: true });
}

export function setupAnalytics() {
  const settings = [...document.querySelectorAll('[data-consent-open]')];
  if (!counter) return;
  for (const button of settings) {
    button.hidden = false;
    button.addEventListener('click', () => showBanner(true));
  }
  const choice = read();
  if (choice?.analytics) loadMetrika();
  else if (!choice) {
    // Уведомление — после загрузки страницы: первый экран и LCP ему не уступают.
    const later = () => (window.requestIdleCallback || ((fn) => setTimeout(fn, 400)))(() => showBanner(false), { timeout: 2000 });
    if (document.readyState === 'complete') later(); else addEventListener('load', later, { once: true });
  }
}
