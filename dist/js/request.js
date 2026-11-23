// Окно «Оставить заявку» (Влад 05.11: все призывы сайта — заявка). Окно — <dialog id="request">
// из src/partials/dialogs.html; модуль грузит ui.js по первому нажатию [data-request] или
// [data-book] (автомойка). Владелец: исполнитель A.
//
// Поля: направление (тема из REQUEST_TOPICS — site.requests.topics), выбранные работы (чипы:
// из кнопки или «+ Добавить работу» по теме), имя, телефон (маска +7, проверка), комментарий,
// согласие. При теме «Автомойка» под направлением — мелкая строка «или запишитесь онлайн» со
// ссылками студий в YCLIENTS: выбранные программы и работы мойки уже в корзине (js/yclients.js).
//
// Отправка — только на адрес REQUESTS.endpoint (site.requests.endpoint в JSON; можно
// относительный, например api/request.php — обработчик dist/api/request.php) и только
// на сайтах из REQUESTS.hosts (если список задан: копия на GitHub Pages PHP не выполняет):
// POST multipart/form-data, «Заявка отправлена» — только если сервер ответил 2xx
// и JSON {"ok": true}. Пока адреса нет, «Отправить заявку» проверяет поля и честно пишет, что
// заявка не отправлена (приём подключаем), с телефонами обеих студий; фото тогда не просим.
// Секретов и токенов здесь нет.
//
// Защита от спама без капчи: при открытии окна форма берёт у сервера подписанную
// метку времени (POST action=token) и отправляет не раньше, чем через `wait` секунд;
// скрытое поле-ловушка mw_extra должно остаться пустым.
//
// Ничего не теряется: тема, работы и поля — в sessionStorage (черновик на время вкладки,
// без фото), фото — в памяти страницы; ошибка проверки, загрузки или отправки
// введённое не стирает.
//
// Цели Метрики (analytics.js, только с согласия): request_open {topic, from, works},
// request_submit_attempt {topic, ok}, request_offline {topic}, request_sent {topic, works, photos};
// переход по ссылке онлайн-записи — booking_branch (ui.js); в окне показана запись YCLIENTS —
// booking_embed {branch, works} (один раз за открытие окна, Влад 23.11).

import { REQUEST_TOPICS, CATEGORY_TOPIC, PROGRAMS, REQUESTS } from './data.js';
import { goal } from './analytics.js';
import { getBody } from './body.js';
import { nb } from './ui.js';
import { getAddons, clearAddons } from './addons.js';

const KEY = 'mw:request';
const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const FIELDS = ['topic', 'name', 'phone', 'comment'];
// Предпросмотр умеют не все браузеры: HEIC показываем плашкой с именем файла.
const previewable = (file) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
const isImage = (file) => TYPES.includes(file.type) || /\.(heic|heif)$/i.test(file.name);
const mb = (bytes) => bytes < 1024 * 1024
  ? Math.max(1, Math.round(bytes / 1024)).toLocaleString('ru-RU') + ' КБ'
  : (bytes / 1024 / 1024).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' МБ';

// Темы и их работы: у мойки — программы (PROGRAMS) и позиции, у остальных — позиции и варианты.
const TOPICS = Array.isArray(REQUEST_TOPICS) ? REQUEST_TOPICS : [];
const PROGRAM_NAMES = PROGRAMS.map((p) => p.name);
const topicById = (id) => TOPICS.find((t) => t.id === id) || null;
// Название самой темы среди работ не повторяем («Клубная карта» в теме «Клубная карта»).
const worksOf = (topic) => topic ? [...(topic.programs ? PROGRAM_NAMES : []), ...(topic.items || []), ...(topic.options || [])].filter((name) => name !== topic.title) : [];
// Тема работы: та, в чьих программах, позициях или вариантах она есть; название темы — сама тема.
const topicOfWork = (name) => TOPICS.find((t) => t.title === name || worksOf(t).includes(name))?.id || '';
// Технопарк первым — где работу делают только там (оклейка, кузов: данные каталога).
const TECHNOPARK_FIRST = new Set(['wrap', 'bodywork']);
// Где студия «в/на» — для строки «„Трёхфазная“ — только в Технопарке».
const BRANCH_IN = { myasnitskaya: 'на Лубянке', technopark: 'в Технопарке' };
const quoted = (name) => /[«»]/.test(name) ? name : `«${name}»`;

// Телефон: российский номер — маской +7 (999) 123-45-67; начатый с «+» и другим кодом страны —
// как ввели (только цифры, пробелы, скобки и дефисы).
function formatPhone(raw) {
  const value = String(raw);
  if (/^\s*\+\s*$/.test(value)) return '+';
  if (/^\s*\+\s*[0-689]/.test(value)) return value.replace(/[^\d+\s()-]/g, '').slice(0, 24);
  let digits = value.replace(/\D/g, '');
  if (!digits) return '';
  if (digits[0] === '8') digits = '7' + digits.slice(1);
  else if (digits[0] !== '7') digits = '7' + digits;
  const d = digits.slice(1, 11);
  let out = '+7';
  if (d.length) out += ' (' + d.slice(0, 3);
  if (d.length >= 3) out += ')';
  if (d.length > 3) out += ' ' + d.slice(3, 6);
  if (d.length > 6) out += '-' + d.slice(6, 8);
  if (d.length > 8) out += '-' + d.slice(8, 10);
  return out;
}
// Номер полный: +7 и 10 цифр, или международный с «+» — от 10 до 15 цифр.
function phoneOk(value) {
  const digits = value.replace(/\D/g, '');
  if (/^\s*\+\s*7/.test(value) || !/^\s*\+/.test(value)) return digits.length === 11 && digits[0] === '7';
  return digits.length >= 10 && digits.length <= 15;
}

function readDraft() {
  try { const v = JSON.parse(sessionStorage.getItem(KEY) || 'null'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}

export function setupRequest(dialog, { show }) {
  const $ = (s) => dialog.querySelector(s);
  const form = $('[data-request-form]'), topicSelect = form.elements.topic, phoneInput = form.elements.phone;
  const context = $('#request-context');
  const chipsEl = $('[data-request-chips]'), addSelect = $('[data-request-add]'), addBox = $('[data-request-add-box]'), servicesBox = $('[data-request-services-box]');
  const online = $('[data-request-online]'), onlineNote = $('[data-request-online-note]');
  const branchLinks = [...online.querySelectorAll('a[data-branch]')], branchSep = online.querySelector('[data-branch-sep]');
  const photosBox = $('[data-request-photos]'), previewsEl = $('[data-request-previews]'), filesInput = $('[data-request-files]');
  const formError = $('[data-request-error]'), offline = $('[data-request-offline]'), phones = $('[data-request-phones]');
  const submitBtn = $('[data-request-submit]'), done = $('[data-request-done]');
  const errorFor = (name) => $(`[data-error-for="${name}"]`);
  const hosts = Array.isArray(REQUESTS.hosts) ? REQUESTS.hosts : [];
  const endpoint = REQUESTS.endpoint && (!hosts.length || hosts.includes(location.hostname)) ? REQUESTS.endpoint : null;

  const draft = readDraft();
  const services = Array.isArray(draft.services) ? draft.services.filter((s) => typeof s === 'string') : [];
  const photos = [];   // {file, url}
  let sending = false, opener = '';
  // Чей телефон первым в «Заявка не отправлена»: студия кнопки (data-request-studio) или
  // единственная студия, где есть выбранная программа (onlyBranch, renderOnline).
  let studioFirst = '', onlyBranch = '';
  // Подписанная метка времени от сервера (антиспам): когда получена и сколько ждать.
  let token = null, tokenAt = 0, tokenWait = 0, tokenLoading = null;

  // Направления — из данных, в порядке показа.
  for (const topic of TOPICS) {
    const option = document.createElement('option');
    option.value = topic.id; option.textContent = topic.title;
    topicSelect.append(option);
  }
  // Фото — только когда приём подключён; без него их некуда отправить.
  // Фото — только если приём их берёт (site.requests.photos; заявки в YCLIENTS фото не принимают).
  const photosOn = Boolean(endpoint) && REQUESTS.photos !== false;
  photosBox.hidden = !photosOn;
  // Обещание звонка — только когда сервер принимает заявки: ставится после метки (loadToken);
  // приём не настроен (503) — остаётся «Расскажите, что нужно машине, — или позвоните в студию».
  const promiseCall = () => { $('#request-lead').textContent = 'Администратор студии перезвонит и ответит на вопросы.'; };
  // Ссылки онлайн-записи — как в разметке, пока корзина не собрана.
  for (const link of branchLinks) link.dataset.href = link.getAttribute('href');

  const topicId = () => topicSelect.value;

  function save() {
    const data = { services };
    for (const name of FIELDS) data[name] = form.elements[name]?.value || '';
    try { sessionStorage.setItem(KEY, JSON.stringify(data)); } catch { /* приватный режим: черновик живёт до перезагрузки */ }
  }
  function restore() {
    for (const name of FIELDS) {
      if (typeof draft[name] !== 'string') continue;
      const field = form.elements[name];
      if (field) field.value = draft[name];
    }
    // Черновик со старой темой, которой больше нет, — без темы.
    if (topicSelect.value !== (draft.topic || '')) topicSelect.value = '';
  }

  // «+ Добавить работу» — работы выбранной темы; уже выбранные — недоступны.
  function renderAdd() {
    const list = worksOf(topicById(topicId()));
    addSelect.replaceChildren(addSelect.options[0]);
    for (const name of list) {
      const option = document.createElement('option');
      option.value = option.textContent = name;
      option.disabled = services.includes(name);
      addSelect.append(option);
    }
    addBox.hidden = !list.length;
    servicesBox.hidden = !list.length && !services.length;
  }
  function renderChips() {
    chipsEl.replaceChildren(...services.map((name) => {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'request__chip'; button.dataset.unrequest = name;
      button.setAttribute('aria-label', `Убрать: ${name}`);
      button.innerHTML = '<span></span><span aria-hidden="true">×</span>';
      button.firstChild.textContent = name;
      li.append(button);
      return li;
    }));
    chipsEl.hidden = !services.length;
    renderAdd();
    renderOnline();
    if (typeof renderBook === 'function') renderBook();
  }
  function addServices(list) {
    for (const name of list) if (name && !services.includes(name)) services.push(name);
    renderChips(); save();
  }

  // Онлайн-запись на автомойку: строка видна при теме «Автомойка» (или когда среди работ есть
  // мойка — гараж услуг). Ссылки студий — с выбранными программами и работами в корзине.
  let yc = null, ycJob = 0;
  const loadYc = () => yc ? Promise.resolve(yc) : import('./yclients.js').then((m) => m.loadMap().then(() => (yc = m)));
  const washTopic = topicById('wash');
  const washSpec = () => ({
    programs: services.map((name) => PROGRAM_NAMES.indexOf(name)).filter((i) => i >= 0),
    items: services.filter((name) => washTopic?.items?.includes(name)),
  });
  function renderOnline() {
    const spec = washSpec();
    const show = topicId() === 'wash' || spec.programs.length + spec.items.length > 0;
    online.hidden = !show;
    for (const link of branchLinks) { if (link.dataset.href) link.setAttribute('href', link.dataset.href); link.hidden = false; }
    if (branchSep) branchSep.hidden = false;
    onlineNote.hidden = true; onlyBranch = '';
    if (!show || !(spec.programs.length || spec.items.length)) return;
    const job = ++ycJob;
    loadYc().then(() => {
      if (job !== ycJob || !yc) return;
      const body = getBody();
      let missing = [], absent = [];
      // Программы нет в студии совсем — её ссылку прячем, вторая студия — единственная.
      for (const link of branchLinks) {
        const names = yc.unavailable?.(link.dataset.branch, spec) || [];
        link.hidden = names.length > 0 && branchLinks.some((l) => l !== link && !(yc.unavailable?.(l.dataset.branch, spec) || []).length);
        if (link.hidden) absent = names;
      }
      const shown = branchLinks.filter((link) => !link.hidden);
      if (branchSep) branchSep.hidden = shown.length < branchLinks.length;
      if (shown.length === 1 && shown.length < branchLinks.length) onlyBranch = shown[0].dataset.branch;
      for (const link of shown) {
        const result = yc.resolve(link.dataset.branch, spec, body);
        const url = yc.bookingUrl(link.dataset.branch, result.ids);
        if (url) link.href = url;
        if (result.missing.length > missing.length) missing = result.missing;
      }
      // Часть работ в онлайн-записи не продаётся: их добавит мастер при приёмке.
      const notes = [];
      if (onlyBranch) notes.push(`${absent.map(quoted).join(', ')} — только ${BRANCH_IN[onlyBranch] || onlyBranch}.`);
      if (missing.length) notes.push(`${missing.join(', ')} мастер добавит при приёмке.`);
      if (notes.length) { onlineNote.textContent = nb(notes.join(' ')); onlineNote.hidden = false; }
    }).catch(() => { /* карта не загрузилась — ссылки остаются обычным выбором услуг */ });
  }
  // Тип кузова сменили на странице — цены программ в YCLIENTS другие.
  addEventListener('mw:body', () => { if (dialog.open) { renderOnline(); renderWhen(); } });

  // ── Запись на время (Влад 19.11) ─────────────────────────────────────────
  // «Что входит» — состав выбранных программ (PROGRAMS[].includes) и допы; студия, день и время —
  // свободные окна онлайн-записи YCLIENTS через api/request.php (action=slots). Сервер без ключей
  // YCLIENTS отвечает 503 — выбор времени больше не спрашиваем, заявка уходит как раньше.
  const bookBox = $('[data-request-book]'), incBox = $('[data-request-includes]'), incList = $('[data-request-inc]');
  const whenBox = $('[data-request-when]'), datesEl = $('[data-request-dates]'), timesEl = $('[data-request-times]'), whenNote = $('[data-request-when-note]');
  const branchInputs = [...dialog.querySelectorAll('input[name="book_branch"]')];
  const embedBox = $('[data-request-embed]'), frameBox = $('[data-request-frame-box]'), branchesEl = $('[data-request-branches]');
  let frame = null;   // iframe встроенной записи — создаётся при первом показе (в разметке iframe нет)
  const frameFor = () => {
    if (!frame) {
      frame = document.createElement('iframe');
      frame.className = 'request__frame';
      frame.title = 'Онлайн-запись в YCLIENTS: день, время и контакты';
      frameBox.append(frame);
    }
    return frame;
  };
  const doneTitle = $('[data-request-done-title]'), doneText = $('[data-request-done-text]');
  let slotsOff = !endpoint, slotJob = 0, chosen = null;   // slotsOff — своего выбора времени нет, только встроенная запись   // chosen: {datetime, branch, label}
  const DAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const dayOf = (iso) => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
  const dateLabel = (iso) => { const d = dayOf(iso); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
  const branchNow = () => branchInputs.find((i) => i.checked)?.value || 'myasnitskaya';
  const setBranch = (id) => { for (const input of branchInputs) input.checked = input.value === id; };
  const isWash = () => topicId() === 'wash' && (washSpec().programs.length + washSpec().items.length > 0);
  function renderIncludes() {
    const progs = services.map((n) => PROGRAM_NAMES.indexOf(n)).filter((i) => i >= 0);
    const extras = services.filter((n) => PROGRAM_NAMES.indexOf(n) < 0);
    const block = (title, list) => {
      const li = document.createElement('li'), head = document.createElement('p'), ul = document.createElement('ul');
      head.className = 'request__inc-title'; head.textContent = title;
      ul.append(...list.map((x) => { const i = document.createElement('li'); i.textContent = x; return i; }));
      li.append(head, ul); return li;
    };
    // Состав целиком: «Всё из <предыдущей>» раскрываем — каждая следующая включает предыдущую.
    const full = (i) => PROGRAMS.slice(0, i + 1).flatMap((p, k) => (p.includes || []).slice(k ? 1 : 0));
    const rows = progs.map((i) => block(PROGRAMS[i].name, full(i)));
    if (extras.length && progs.length) rows.push(block(extras.length === 1 ? 'Доп' : 'Допы', extras));
    incList.replaceChildren(...rows);
    incBox.hidden = !(isWash() && progs.length);
    bookBox.hidden = incBox.hidden && whenBox.hidden;
  }
  async function slots(date) {
    const body = new FormData();
    body.append('action', 'slots'); body.append('services', services.join('\n'));
    body.append('branch', branchNow()); body.append('body', String(getBody()));
    if (date) body.append('date', date);
    return post(body);
  }
  const slotButton = (label, pressed, onPick) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'request__slot'; b.textContent = label; b.setAttribute('aria-pressed', String(pressed));
    b.addEventListener('click', () => { for (const x of b.parentElement.children) x.setAttribute('aria-pressed', String(x === b)); onPick(); });
    return b;
  };
  function updateSubmit() {
    if (!sending) submitBtn.textContent = chosen ? nb(`Записаться: ${chosen.label}`) : 'Отправить заявку';
  }
  function pickDate(date) {
    chosen = null; updateSubmit();
    const job = ++slotJob;
    timesEl.replaceChildren(); whenNote.textContent = 'Загружаем время…';
    slots(date).then((r) => {
      if (job !== slotJob) return;
      if (r.branch) setBranch(r.branch);
      const times = (r.times || []).filter((t) => t && t.datetime && t.time);
      whenNote.textContent = times.length ? '' : 'На этот день онлайн свободного времени нет — выберите другой.';
      timesEl.replaceChildren(...times.map((t) => slotButton(t.time, false, () => {
        chosen = { datetime: t.datetime, branch: r.branch || branchNow(), label: `${dateLabel(date)}, ${t.time}` };
        updateSubmit();
      })));
    }).catch(() => { if (job === slotJob) whenNote.textContent = 'Время не загрузилось — оставьте заявку, администратор подберёт время.'; });
  }
  // Ключа API YCLIENTS нет (сервер ответил 503): время выбирают во встроенной записи YCLIENTS с
  // корзиной заказа (yclients.js embedUrl) — студия, где есть все программы; строку «или запишитесь
  // онлайн» тогда прячем: та же запись уже в окне.
  // Пока в окне запись YCLIENTS, своя форма (имя, телефон, отправка) спрятана — она открывается
  // ссылкой «Не нашли удобное время? Оставить заявку» (form.is-embed, dialogs.css).
  const lead = $('#request-lead'), leadText = lead.textContent;
  const embedMode = (on) => {
    form.classList.toggle('is-embed', on);
    if (on) lead.textContent = 'Выберите студию, день и время — запись сразу попадёт в студию.';
    else if (lead.textContent.startsWith('Выберите студию')) lead.textContent = leadText;
  };
  $('[data-request-embed-alt]')?.addEventListener('click', () => { embedMode(false); form.querySelector('input[name=name]')?.focus(); });
  let embedGoal = false; // booking_embed — один раз за открытие окна
  function renderEmbed(job) {
    embedBox.hidden = false; whenNote.textContent = ''; branchesEl.hidden = false;
    embedMode(true);
    for (const input of branchInputs) input.disabled = false;
    loadYc().then(() => {
      if (job !== slotJob || !yc?.embedUrl) return;
      const spec = washSpec();
      const blocked = branchInputs.map((i) => i.value).filter((b) => (yc.unavailable?.(b, spec) || []).length);
      // Программы нет в онлайн-записи ни одной студии («Трёхфазная», 20.11) — запись YCLIENTS не
      // открываем (там пустая корзина): своя форма и телефон студии.
      if (blocked.length === branchInputs.length) {
        const names = yc.unavailable(blocked[0], spec);
        embedBox.hidden = true; embedMode(false); online.hidden = true; branchesEl.hidden = true;
        whenNote.textContent = nb(`${names.map(quoted).join(', ')} онлайн пока не записать — позвоните в студию или оставьте заявку, администратор подберёт время.`);
        return;
      }
      let branch = branchNow();
      if (blocked.length && blocked.length < branchInputs.length) {
        for (const input of branchInputs) input.disabled = blocked.includes(input.value);
        if (blocked.includes(branch)) { branch = branchInputs.find((i) => !blocked.includes(i.value)).value; setBranch(branch); }
        whenNote.textContent = nb(`Эти работы — только ${BRANCH_IN[branch] || ''}.`);
      }
      const { ids, missing } = yc.resolve(branch, spec, getBody());
      if (missing.length) whenNote.textContent = nb(`${whenNote.textContent} ${missing.join(', ')} мастер добавит при приёмке.`.trim());
      const url = yc.embedUrl(branch, ids);
      const f = frameFor();
      if (url && f.dataset.src !== url) { f.dataset.src = url; f.src = url; }
      if (url && !embedGoal) { embedGoal = true; goal('booking_embed', { branch, works: ids.length }); }
      online.hidden = true;
    }).catch(() => { embedBox.hidden = true; whenBox.hidden = true; embedMode(false); });
  }
  function renderWhen() {
    chosen = null; updateSubmit();
    const job = ++slotJob;
    datesEl.replaceChildren(); timesEl.replaceChildren(); whenNote.textContent = '';
    embedBox.hidden = true; branchesEl.hidden = false;
    if (typeof embedMode === 'function') embedMode(false);
    if (!isWash()) { whenBox.hidden = true; bookBox.hidden = incBox.hidden; return; }
    if (slotsOff) { whenBox.hidden = false; bookBox.hidden = false; renderEmbed(job); return; }
    whenBox.hidden = false; bookBox.hidden = false; whenNote.textContent = 'Загружаем свободное время…';
    for (const input of branchInputs) input.disabled = false;
    const asked = branchNow();
    slots('').then((r) => {
      if (job !== slotJob) return;
      // Сервер выбрал студию, где есть все работы: другая студия для этого заказа недоступна.
      const moved = Boolean(r.branch) && r.branch !== asked;
      if (r.branch) setBranch(r.branch);
      for (const input of branchInputs) input.disabled = moved && input.value !== r.branch;
      if (moved) whenNote.textContent = nb(`Эти работы — только ${BRANCH_IN[r.branch] || ''}.`);
      const dates = (r.dates || []).slice(0, 14);
      if (r.partial) { whenNote.textContent = 'Часть работ онлайн не записать — отправьте заявку, администратор подберёт время.'; return; }
      if (!dates.length) { whenNote.textContent = 'Свободного времени онлайн нет — отправьте заявку, администратор подберёт время.'; return; }
      if (moved) { datesEl.replaceChildren(...dates.map((d) => slotButton(`${DAYS[dayOf(d).getDay()]}, ${dateLabel(d)}`, false, () => pickDate(d)))); return; }
      whenNote.textContent = '';
      datesEl.replaceChildren(...dates.map((d) => slotButton(`${DAYS[dayOf(d).getDay()]}, ${dateLabel(d)}`, false, () => pickDate(d))));
    }).catch((error) => {
      if (job !== slotJob) return;
      if (error.status === 503 || !endpoint) { slotsOff = true; renderEmbed(job); return; }   // без ключей — встроенная запись
      whenBox.hidden = true; bookBox.hidden = incBox.hidden;
    });
  }
  for (const input of branchInputs) input.addEventListener('change', renderWhen);
  function renderBook() { renderIncludes(); renderWhen(); }

  function renderPhotos() {
    previewsEl.replaceChildren(...photos.map(({ file, url }, i) => {
      const li = document.createElement('li');
      li.className = 'request__photo';
      if (url) {
        const img = document.createElement('img');
        img.src = url; img.alt = ''; img.width = 96; img.height = 72; img.decoding = 'async';
        li.append(img);
      } else {
        const tile = document.createElement('span');
        tile.className = 'request__tile'; tile.textContent = (file.name.split('.').pop() || 'фото').toUpperCase();
        li.append(tile);
      }
      const meta = document.createElement('span');
      meta.className = 'request__photometa'; meta.textContent = `${file.name} · ${mb(file.size)}`;
      const remove = document.createElement('button');
      remove.type = 'button'; remove.className = 'request__remove'; remove.dataset.removePhoto = String(i);
      remove.setAttribute('aria-label', `Удалить фото ${file.name}`);
      remove.textContent = '×';
      li.append(meta, remove);
      return li;
    }));
    previewsEl.hidden = !photos.length;
    filesInput.disabled = photos.length >= MAX_FILES;
    filesInput.closest('label').classList.toggle('is-disabled', photos.length >= MAX_FILES);
  }
  function addFiles(files) {
    const problems = [];
    for (const file of files) {
      if (photos.length >= MAX_FILES) { problems.push(`не больше ${MAX_FILES} фото — «${file.name}» не добавлено`); continue; }
      if (!isImage(file)) { problems.push(`«${file.name}»: нужен JPG, PNG, WebP или HEIC`); continue; }
      if (file.size > MAX_BYTES) { problems.push(`«${file.name}»: ${mb(file.size)}, а можно до ${mb(MAX_BYTES)}`); continue; }
      if (photos.some((p) => p.file.name === file.name && p.file.size === file.size && p.file.lastModified === file.lastModified)) continue;
      photos.push({ file, url: previewable(file) ? URL.createObjectURL(file) : null });
    }
    errorFor('photos').textContent = problems.length ? 'Не добавлено: ' + problems.join('; ') + '.' : '';
    renderPhotos();
  }
  function removePhoto(i) {
    const [photo] = photos.splice(i, 1);
    if (photo?.url) URL.revokeObjectURL(photo.url);
    errorFor('photos').textContent = '';
    renderPhotos();
  }

  // Маска телефона: при наборе и вставке — формат +7 (999) 123-45-67, курсор остаётся после той же
  // цифры. При стирании формат не навязываем (иначе скобку или дефис не стереть) — он вернётся
  // при уходе с поля.
  function maskPhone(force) {
    const raw = phoneInput.value;
    const caret = phoneInput.selectionStart ?? raw.length;
    const formatted = formatPhone(raw);
    if (formatted === raw) return;
    let before = raw.slice(0, caret).replace(/\D/g, '').length;
    // Номер начали с 9: маска дописала 7 впереди — курсор на одну цифру дальше.
    if (/^\+7/.test(formatted) && !/^\s*\+?\s*[78]/.test(raw) && /\d/.test(raw)) before += 1;
    phoneInput.value = formatted;
    if (force || document.activeElement !== phoneInput) return;
    let pos = formatted.length;
    if (before) for (let i = 0, seen = 0; i < formatted.length; i++) if (/\d/.test(formatted[i]) && ++seen === before) { pos = i + 1; break; }
    try { phoneInput.setSelectionRange(pos, pos); } catch { /* поле не в фокусе */ }
  }

  // Проверка: ошибки у полей (aria-invalid, текст — через aria-describedby), фокус — на первое
  // неверное. Ничего не стирается.
  function validate() {
    const errors = [];
    const set = (name, message, field) => {
      const el = errorFor(name);
      if (el) el.textContent = message ? nb(message) : '';
      field.setAttribute('aria-invalid', String(Boolean(message)));
      if (message) errors.push(field);
    };
    set('topic', topicId() ? '' : 'Выберите направление.', topicSelect);
    set('name', form.elements.name.value.trim() ? '' : 'Как к вам обращаться?', form.elements.name);
    const phone = phoneInput.value.trim();
    set('phone', !phone ? (endpoint ? 'Укажите телефон — администратор перезвонит.' : 'Укажите телефон.') : phoneOk(phone) ? '' : 'Номер неполный: нужен +7 и 10 цифр.', phoneInput);
    set('consent', form.elements.consent.checked ? '' : 'Без согласия заявку не отправить.', form.elements.consent);
    return errors;
  }

  // Приёма нет: заявка не отправлена — так и пишем, с телефонами обеих студий. Порядок — по теме.
  function showOffline() {
    const first = onlyBranch || studioFirst || (TECHNOPARK_FIRST.has(topicId()) ? 'technopark' : 'myasnitskaya');
    const links = [...phones.querySelectorAll('[data-phone]')];
    phones.append(...links.sort((a, b) => (b.dataset.phone === first) - (a.dataset.phone === first)));
    offline.hidden = false;
    offline.focus({ preventScroll: true });
    offline.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    save();
    goal('request_offline', { topic: topicId() });
  }

  // Ответ сервера: JSON {ok, error, …}; не JSON или не 2xx — ошибка с текстом сервера.
  async function post(body, signal) {
    const response = await fetch(endpoint, { method: 'POST', body, signal, headers: { Accept: 'application/json' }, credentials: 'same-origin' });
    let result = null;
    try { result = await response.json(); } catch { /* не JSON — значит, не подтверждено */ }
    if (!response.ok || result?.ok !== true) {
      const error = new Error(result?.error || `сервер ответил ${response.status}`);
      error.result = result || {};
      error.status = response.status;
      throw error;
    }
    return result;
  }
  function loadToken(signal) {
    if (!endpoint) return Promise.resolve();
    const body = new FormData();
    body.append('action', 'token');
    tokenLoading ??= post(body, signal).then((result) => {
      token = String(result.token || ''); tokenAt = Date.now(); tokenWait = Math.min(Number(result.wait) || 0, 30);
      promiseCall();
    }).finally(() => { tokenLoading = null; });
    return tokenLoading;
  }
  // Метка старше часа — берём новую при открытии (на сервере она живёт сутки).
  const tokenFresh = () => token && Date.now() - tokenAt < 3600_000;
  const pause = (ms) => new Promise((done) => setTimeout(done, ms));

  async function submit() {
    if (sending) return;
    maskPhone(true);
    const errors = validate();
    goal('request_submit_attempt', { topic: topicId() || '—', ok: !errors.length });
    formError.hidden = true; offline.hidden = true;
    if (errors.length) { errors[0].focus(); return; }
    if (!endpoint) { showOffline(); return; }
    // Обработчик (api/request.php) ждёт поля services, name, contact, comment: тема — первой
    // строкой работ, если работ не выбрали; о чём заявка (машина, программа) — в комментарий.
    const topic = topicById(topicId());
    const body = new FormData();
    body.append('services', (services.length ? services : [topic?.title || 'Другое']).join('\n'));
    body.append('topic', topic?.title || '');
    body.append('topic_id', topic?.id || '');
    body.append('name', form.elements.name.value.trim());
    body.append('contact', phoneInput.value.trim());
    body.append('car', '');
    // Студия кнопки (карточка студии) — заявка ляжет в её лист ожидания YCLIENTS; иначе выберет сервер.
    body.append('branch', chosen?.branch || onlyBranch || studioFirst || '');
    // Выбранное время записи (action=slots): сервер записывает на него в YCLIENTS.
    if (chosen) body.append('datetime', chosen.datetime);
    // Тип кузова (0 седан … 3 микроавтобус) — услуга мойки в YCLIENTS берётся для него.
    body.append('body', String(getBody()));
    const note = context.hidden ? '' : context.textContent.replace(/ /g, ' ');
    body.append('comment', [note, form.elements.comment.value.trim()].filter(Boolean).join('\n'));
    body.append('consent', 'yes');
    body.append('consentDocument', new URL('consent-request', location.href).href);
    body.append('page', location.href);
    body.append('mw_extra', form.elements.mw_extra?.value || '');
    if (photosOn) for (const { file } of photos) body.append('photos[]', file, file.name);
    sending = true; submitBtn.disabled = true; submitBtn.textContent = 'Отправляем…';
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 180_000);
    let sent = null;
    try {
      // Метка: устарела или сервер её не принял — берём новую и отправляем ещё раз (один раз).
      for (let attempt = 0; ; attempt++) {
        if (!tokenFresh()) { token = null; await loadToken(controller.signal); }
        const left = tokenAt + tokenWait * 1000 + 300 - Date.now();
        if (left > 0) await pause(left);
        body.set('token', token);
        try { sent = await post(body, controller.signal); break; } catch (error) {
          if (attempt || error.result?.retry !== 'token') throw error;
          token = null;
        }
      }
      // Только подтверждённая доставка: очищаем черновик и показываем «отправлено».
      goal('request_sent', { topic: topicId(), works: services.length, photos: photos.length });
      services.splice(0); photos.splice(0).forEach((p) => p.url && URL.revokeObjectURL(p.url));
      form.reset(); renderChips(); renderPhotos();
      try { sessionStorage.removeItem(KEY); } catch { /* приватный режим */ }
      // Записали на время — так и пишем; иначе — заявка (лист ожидания, администратор перезвонит).
      const booked = sent?.booked;
      if (getAddons().length) clearAddons();
      doneTitle.textContent = booked ? 'Вы записаны' : 'Заявка отправлена';
      doneText.textContent = booked ? nb(`${dateLabel(booked.datetime)}, ${booked.datetime.slice(11, 16)} — ${booked.studio || ''}. Подтверждение придёт по SMS.`) : 'Администратор студии свяжется с вами по указанному телефону.';
      chosen = null;
      form.hidden = true; done.hidden = false; done.focus();
    } catch (error) {
      // Приём на сервере не настроен (503) — как без адреса приёма: не отправлено, звоните.
      if (error.status === 503) { showOffline(); return; }
      const reason = error.name === 'AbortError' ? 'нет ответа от сервера' : error.name === 'TypeError' ? 'нет связи с сервером' : error.message;
      formError.textContent = nb(`Не удалось отправить заявку: ${reason}. Всё введённое${photosOn && photos.length ? ' и фото' : ''} сохранено — попробуйте ещё раз или позвоните в студию.`);
      formError.hidden = false;
      // Сервер назвал поле — показываем ошибку и у него (контакт на сервере — телефон здесь).
      const field = error.result?.field === 'contact' ? 'phone' : error.result?.field;
      if (field && errorFor(field)) { errorFor(field).textContent = error.message.charAt(0).toUpperCase() + error.message.slice(1) + '.'; }
    } finally {
      clearTimeout(timer); sending = false; submitBtn.disabled = false; updateSubmit();
    }
  }

  form.addEventListener('input', (e) => {
    if (e.target === filesInput) return;
    if (e.target === phoneInput && !/^delete/.test(e.inputType || '')) maskPhone(false);
    if (e.target.name && FIELDS.includes(e.target.name)) save();
    if (e.target.getAttribute('aria-invalid') === 'true') validate();
  });
  phoneInput.addEventListener('blur', () => { maskPhone(true); save(); });
  form.addEventListener('change', (e) => {
    if (e.target === filesInput) { addFiles([...filesInput.files]); filesInput.value = ''; return; }
    if (e.target === addSelect) { if (addSelect.value) addServices([addSelect.value]); addSelect.value = ''; return; }
    if (e.target === topicSelect) {
      // Новая тема: работы прежней темы и строка «Вы выбрали: …» о них к ней больше не относятся.
      const allowed = worksOf(topicById(topicId()));
      let dropped = false;
      for (let i = services.length - 1; i >= 0; i--) if (!allowed.includes(services[i])) { services.splice(i, 1); dropped = true; }
      if (dropped) { context.textContent = ''; context.hidden = true; }
      renderChips(); save(); if (topicSelect.getAttribute('aria-invalid') === 'true') validate(); return; }
    if (e.target.name === 'consent' && e.target.getAttribute('aria-invalid') === 'true') validate();
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  dialog.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-unrequest]');
    if (chip) {
      const i = services.indexOf(chip.dataset.unrequest);
      if (i >= 0) services.splice(i, 1);
      renderChips(); save();
      (chipsEl.querySelector('button') || (addBox.hidden ? topicSelect : addSelect)).focus();
      return;
    }
    const remove = e.target.closest('[data-remove-photo]');
    if (remove) { removePhoto(Number(remove.dataset.removePhoto)); (previewsEl.querySelector('[data-remove-photo]') || filesInput).focus(); }
  });

  restore(); renderChips(); renderPhotos();

  // Открыть заявку. spec (собирает ui.js из кнопки):
  //   book      — кнопка data-book (автомойка): тема «Автомойка»;
  //   category  — data-request-category: тема или категория каталога (CATEGORY_TOPIC);
  //   services  — data-request-services: позиции, варианты или название темы;
  //   programs  — индексы программ мойки (data-program, data-yc-programs, data-wash-programs);
  //   items     — работы мойки (data-yc-items);
  //   replace   — data-request-replace: работы кнопки заменяют прежний выбор, даже если их нет
  //               (калькулятор оклейки: свой набор деталей — только строкой расчёта);
  //   context, contextPrefix — строка «о чём заявка» (#request-context);
  //   from      — где была кнопка (для цели).
  // Тема: у кнопки с работой — тема этой работы, иначе — из категории, иначе пусто. Работы из
  // кнопки заменяют прежний выбор; кнопка без работ оставляет только работы своей темы.
  return function open({ book = false, replace = false, category = '', services: list = [], programs = [], items = [], context: note = '', contextPrefix = '', studio = '', from = '' } = {}) {
    studioFirst = BRANCH_IN[studio] ? studio : '';
    const works = [...programs.map((i) => PROGRAM_NAMES[i]).filter(Boolean), ...items, ...list];
    // Допы к заказу (Влад 19.11, js/addons.js): при записи на мойку идут вместе с программой;
    // доп, который уже входит в выбранную программу, второй раз не добавляется.
    let addonNote = '';
    // Допы — и у записи (data-book), и у заявки с темой «Автомойка» (шапка, нижняя кнопка /wash).
    const ownTopic = list.map(topicOfWork).find(Boolean) || (topicById(category) ? category : CATEGORY_TOPIC[category] || '');
    const washOpen = book || ownTopic === 'wash';
    if (washOpen) {
      const top = programs.length ? Math.max(...programs) : -1;
      const inside = new Set(PROGRAMS.slice(0, top + 1).flatMap((p) => p.items || []));
      const extra = getAddons().filter((n) => !works.includes(n));
      const add = extra.filter((n) => !inside.has(n)), skip = extra.filter((n) => inside.has(n));
      works.push(...add);
      if (add.length) addonNote += `; допы: ${add.join(', ')}`;
      if (skip.length) addonNote += ` (${skip.join(', ')} — уже в программе)`;
    }
    const firstWork = list.map(topicOfWork).find(Boolean) || '';
    const topic = book ? 'wash' : firstWork || (topicById(category) ? category : CATEGORY_TOPIC[category] || '');
    topicSelect.value = topic;
    topicSelect.removeAttribute('aria-invalid'); errorFor('topic').textContent = '';
    const picked = works.filter((name) => !TOPICS.some((t) => t.title === name));
    if (works.length || replace) services.splice(0, services.length, ...picked);
    else { const keep = services.filter((name) => worksOf(topicById(topic)).includes(name)); services.splice(0, services.length, ...keep); }
    const fullNote = note + addonNote;
    context.textContent = fullNote ? nb(contextPrefix + fullNote.replace(/^; /, '')) : '';
    context.hidden = !fullNote;
    renderChips(); save();
    form.hidden = false; done.hidden = true; formError.hidden = true; offline.hidden = true;
    if (endpoint && !tokenFresh()) { token = null; loadToken().catch(() => { /* повторим при отправке */ }); }
    opener = from;
    show(dialog);
    $('#request-title').focus({ preventScroll: true });
    embedGoal = false;
    goal('request_open', { topic: topic || '—', from: opener || 'page', works: services.length });
  };
}
