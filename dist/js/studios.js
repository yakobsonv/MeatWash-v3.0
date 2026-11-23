// Окно «Выбрать точку» (Влад 23.11): кнопка «Записаться онлайн» в шапке главной (button[data-studios]).
// Студии — разметка src/partials/dialogs.html (#studio-pick); плашка «Открыто/Закрыто» у часов считается
// здесь по московскому времени из строк часов студии («Пн–Пт 08:00–22:00») и обновляется раз в минуту.
// «Выбрать» — запись YCLIENTS этой студии в этом же окне (yclients.js embedUrl, выбор услуг),
// «← Выбрать точку» возвращает к списку. iframe создаётся скриптом (в разметке его нет).
// Цели Метрики (analytics.js, только с согласия): studios_open — окно открыто,
// studio_choose {branch} — выбрана студия, показана её запись YCLIENTS.
import { loadMap, embedUrl } from './yclients.js';
import { goal } from './analytics.js';
import { REQUESTS } from './data.js';

const DAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
// Сейчас в Москве: день недели 0 (пн) … 6 (вс) и минуты от полуночи.
function moscowNow() {
  const parts = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  const day = DAYS.indexOf(get('weekday').toLowerCase().replace('.', '').slice(0, 2));
  return { day, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}
// «Пн–Пт 08:00–22:00» → {from: 0, to: 4, open: 480, close: 1320}; «Ежедневно …» — все дни.
function parseLine(line) {
  const m = line.replace(/ /g, ' ').match(/^\s*(?:(Пн|Вт|Ср|Чт|Пт|Сб|Вс)(?:\s*[–—-]\s*(Пн|Вт|Ср|Чт|Пт|Сб|Вс))?|Ежедневно)\s*(\d{1,2}):(\d{2})\s*[–—-]\s*(\d{1,2}):(\d{2})/i);
  if (!m) return null;
  const from = m[1] ? DAYS.indexOf(m[1].toLowerCase()) : 0;
  const to = m[1] ? DAYS.indexOf((m[2] || m[1]).toLowerCase()) : 6;
  return { from, to, open: Number(m[3]) * 60 + Number(m[4]), close: Number(m[5]) * 60 + Number(m[6]) };
}
function isOpen(lines, now) {
  return lines.some((r) => {
    const inDays = r.from <= r.to ? now.day >= r.from && now.day <= r.to : now.day >= r.from || now.day <= r.to;
    return inDays && now.minutes >= r.open && now.minutes < r.close;
  });
}

export function setupStudios(dialog, { show }) {
  const list = dialog.querySelector('[data-studios-list]'), book = dialog.querySelector('[data-studios-book]');
  const frameBox = dialog.querySelector('[data-studios-frame]'), bookTitle = dialog.querySelector('[data-studios-book-title]');
  const cards = [...dialog.querySelectorAll('[data-studio]')].map((card) => ({
    card,
    state: card.querySelector('[data-studio-state]'),
    // Строки часов — по <br> (у закрытого окна innerText переносов не даёт).
    lines: (card.querySelector('[data-studio-hours]')?.innerHTML || '').split(/<br\s*\/?>/i)
      .map((s) => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')).map(parseLine).filter(Boolean),
  }));
  const paint = () => {
    const now = moscowNow();
    for (const { state, lines } of cards) {
      if (!state || !lines.length || now.day < 0) continue;
      const open = isOpen(lines, now);
      state.textContent = open ? 'Открыто' : 'Закрыто';
      state.classList.toggle('is-open', open);
      state.classList.toggle('is-closed', !open);
      state.hidden = false;
    }
  };
  // Загруженность сегодня (api/request.php action=load, по свободным окнам YCLIENTS). Без ключа API
  // сервер отвечает 503 — полоска остаётся скрытой, цифр не придумываем.
  const hosts = Array.isArray(REQUESTS.hosts) ? REQUESTS.hosts : [];
  const endpoint = REQUESTS.endpoint && (!hosts.length || hosts.includes(location.hostname)) ? REQUESTS.endpoint : null;
  let loadAt = 0;
  const loadBusy = () => {
    if (!endpoint || Date.now() - loadAt < 5 * 60_000) return;
    loadAt = Date.now();
    const body = new FormData(); body.append('action', 'load');
    fetch(endpoint, { method: 'POST', body, headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : null)).then((data) => {
        if (!data?.ok || !data.branches) return;
        for (const { card } of cards) {
          const info = data.branches[card.dataset.studio];
          const box = card.querySelector('[data-studio-load]');
          if (!box || !info || typeof info.load !== 'number') continue;
          const load = Math.max(0, Math.min(1, info.load));
          const word = load < 0.45 ? 'Свободно' : load < 0.8 ? 'Средняя загрузка' : 'Почти всё занято';
          box.style.setProperty('--load', load < 0.45 ? '#0f7a3d' : load < 0.8 ? '#c98a00' : '#c0271d');
          box.querySelector('[data-studio-load-fill]').style.width = `${Math.round(Math.max(load, 0.06) * 100)}%`;
          box.querySelector('[data-studio-load-text]').textContent = info.next ? `${word} · ближайшее время ${info.next}` : `${word} сегодня`;
          box.hidden = false;
        }
      }).catch(() => {});
  };
  let timer = 0;
  dialog.addEventListener('close', () => { clearInterval(timer); timer = 0; dialog.classList.remove('is-booking'); });

  const toList = () => {
    book.hidden = true; list.hidden = false; dialog.classList.remove('is-booking');
    dialog.querySelector('#studio-pick-title')?.focus({ preventScroll: true });
  };
  dialog.addEventListener('click', (e) => {
    const choose = e.target.closest('[data-studio-choose]');
    if (choose) {
      const branch = choose.dataset.studioChoose;
      const name = dialog.querySelector(`#studio-pick-${branch}`)?.textContent.trim() || '';
      loadMap().then(() => {
        const url = embedUrl(branch, []);
        if (!url) return;
        let frame = frameBox.querySelector('iframe');
        if (!frame) {
          frame = document.createElement('iframe');
          frame.className = 'studios__iframe';
          frameBox.append(frame);
        }
        frame.title = `Онлайн-запись в YCLIENTS — ${name}`;
        if (frame.dataset.src !== url) { frame.dataset.src = url; frame.src = url; }
        bookTitle.textContent = name ? `Запись — ${name}` : 'Запись';
        list.hidden = true; book.hidden = false; dialog.scrollTop = 0; dialog.classList.add('is-booking');
        bookTitle.focus({ preventScroll: true });
        goal('studio_choose', { branch });
      });
      return;
    }
    if (e.target.closest('[data-studios-back]')) toList();
  });

  return function open() {
    book.hidden = true; list.hidden = false; dialog.classList.remove('is-booking');
    paint(); clearInterval(timer); timer = setInterval(paint, 60_000); loadBusy();
    show(dialog);
    dialog.querySelector('#studio-pick-title')?.focus({ preventScroll: true });
    goal('studios_open');
  };
}
