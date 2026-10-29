// Заявка с фото: всё, кроме автомойки (детейлинг, оклейка, стёкла и другие работы).
// Окно — <dialog id="request"> из src/partials/dialogs.html; модуль грузит ui.js
// по первому нажатию [data-request].
//
// Отправка — только на адрес REQUESTS.endpoint (site.requests.endpoint в JSON; можно
// относительный, например api/request.php — обработчик dist/api/request.php) и только
// на сайтах из REQUESTS.hosts (если список задан: копия на GitHub Pages PHP не выполняет):
// POST multipart/form-data, «Заявка отправлена» — только если сервер ответил 2xx
// и JSON {"ok": true}. Пока адреса нет, кнопки «Отправить» нет: окно честно говорит,
// что отправка не подключена, и даёт телефоны студий. Секретов и токенов здесь нет.
//
// Защита от спама без капчи: при открытии окна форма берёт у сервера подписанную
// метку времени (POST action=token) и отправляет не раньше, чем через `wait` секунд;
// скрытое поле-ловушка mw_extra должно остаться пустым.
//
// Ничего не теряется: работы и поля — в sessionStorage (черновик на время вкладки,
// без фото), фото — в памяти страницы; ошибка проверки, загрузки или отправки
// введённое не стирает.

import { CATEGORIES, REQUESTS } from './data.js';
import { goal } from './analytics.js';

const KEY = 'mw:request';
const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const FIELDS = ['name', 'contact', 'car', 'comment', 'branch'];
// Предпросмотр умеют не все браузеры: HEIC показываем плашкой с именем файла.
const previewable = (file) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
const isImage = (file) => TYPES.includes(file.type) || /\.(heic|heif)$/i.test(file.name);
const mb = (bytes) => bytes < 1024 * 1024
  ? Math.max(1, Math.round(bytes / 1024)).toLocaleString('ru-RU') + ' КБ'
  : (bytes / 1024 / 1024).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' МБ';

function readDraft() {
  try { const v = JSON.parse(sessionStorage.getItem(KEY) || 'null'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}

export function setupRequest(dialog, { show }) {
  const $ = (s) => dialog.querySelector(s);
  const form = $('[data-request-form]'), chipsEl = $('[data-request-chips]'), addSelect = $('[data-request-add]');
  const previewsEl = $('[data-request-previews]'), filesInput = $('[data-request-files]');
  const formError = $('[data-request-error]'), actions = $('[data-request-actions]'), offline = $('[data-request-offline]');
  const submitBtn = $('[data-request-submit]'), done = $('[data-request-done]');
  const washNote = $('[data-request-wash]'), washText = $('[data-request-wash-text]'), washBook = $('[data-request-wash-book]');
  const errorFor = (name) => $(`[data-error-for="${name}"]`);
  const hosts = Array.isArray(REQUESTS.hosts) ? REQUESTS.hosts : [];
  const endpoint = REQUESTS.endpoint && (!hosts.length || hosts.includes(location.hostname)) ? REQUESTS.endpoint : null;

  const draft = readDraft();
  const services = Array.isArray(draft.services) ? draft.services.filter((s) => typeof s === 'string') : [];
  const photos = [];   // {file, url}
  let sending = false;
  // Подписанная метка времени от сервера (антиспам): когда получена и сколько ждать.
  let token = null, tokenAt = 0, tokenWait = 0, tokenLoading = null;

  // «Добавить работу»: все позиции категорий с заявкой, по категориям.
  for (const category of CATEGORIES.filter((c) => c.booking === 'request')) {
    const group = document.createElement('optgroup');
    group.label = category.title;
    for (const name of [category.title + ' — подобрать с мастером', ...category.items]) {
      const option = document.createElement('option');
      option.value = option.textContent = name;
      group.append(option);
    }
    addSelect.append(group);
  }

  // Режим без адреса приёма — заранее и навсегда для этой страницы.
  actions.hidden = !endpoint;
  offline.hidden = Boolean(endpoint);

  function save() {
    const data = { services };
    for (const name of FIELDS) {
      const field = form.elements[name];
      data[name] = field instanceof RadioNodeList ? field.value : field?.value || '';
    }
    try { sessionStorage.setItem(KEY, JSON.stringify(data)); } catch { /* приватный режим: черновик живёт до перезагрузки */ }
  }
  function restore() {
    for (const name of FIELDS) {
      if (typeof draft[name] !== 'string') continue;
      const field = form.elements[name];
      if (field instanceof RadioNodeList) { for (const radio of field) radio.checked = radio.value === draft[name]; }
      else if (field) field.value = draft[name];
    }
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
    for (const option of addSelect.querySelectorAll('option[value]:not([value=""])')) option.disabled = services.includes(option.value);
  }
  function addServices(list) {
    for (const name of list) if (name && !services.includes(name)) services.push(name);
    renderChips(); save();
  }

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

  // Проверка: ошибки у полей, фокус — на первое неверное. Ничего не стирается.
  function validate() {
    const errors = [];
    const set = (name, message, field) => {
      const el = errorFor(name);
      if (el) el.textContent = message || '';
      if (field) field.setAttribute('aria-invalid', String(Boolean(message)));
      if (message) errors.push(field || addSelect);
    };
    set('services', services.length ? '' : 'Выберите хотя бы одну работу.', addSelect);
    set('name', form.elements.name.value.trim() ? '' : 'Как к вам обращаться?', form.elements.name);
    set('contact', form.elements.contact.value.trim().length >= 5 ? '' : 'Телефон или ник в Telegram — чтобы мастер мог ответить.', form.elements.contact);
    set('consent', form.elements.consent.checked ? '' : 'Без согласия заявку не отправить.', form.elements.consent);
    return errors;
  }

  // Ответ сервера: JSON {ok, error, …}; не JSON или не 2xx — ошибка с текстом сервера.
  async function post(body, signal) {
    const response = await fetch(endpoint, { method: 'POST', body, signal, headers: { Accept: 'application/json' }, credentials: 'same-origin' });
    let result = null;
    try { result = await response.json(); } catch { /* не JSON — значит, не подтверждено */ }
    if (!response.ok || result?.ok !== true) {
      const error = new Error(result?.error || `сервер ответил ${response.status}`);
      error.result = result || {};
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
    }).finally(() => { tokenLoading = null; });
    return tokenLoading;
  }
  // Метка старше часа — берём новую при открытии (на сервере она живёт сутки).
  const tokenFresh = () => token && Date.now() - tokenAt < 3600_000;
  const pause = (ms) => new Promise((done) => setTimeout(done, ms));

  async function submit() {
    if (sending || !endpoint) return;
    const errors = validate();
    formError.hidden = true;
    if (errors.length) { errors[0].focus(); return; }
    const body = new FormData();
    body.append('services', services.join('\n'));
    for (const name of FIELDS) body.append(name, (form.elements[name] instanceof RadioNodeList ? form.elements[name].value : form.elements[name].value).trim());
    body.append('consent', 'yes');
    body.append('consentDocument', new URL('consent-request', location.href).href);
    body.append('page', location.href);
    body.append('mw_extra', form.elements.mw_extra?.value || '');
    for (const { file } of photos) body.append('photos[]', file, file.name);
    sending = true; submitBtn.disabled = true; submitBtn.textContent = 'Отправляем…';
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 180_000);
    try {
      // Метка: устарела или сервер её не принял — берём новую и отправляем ещё раз (один раз).
      for (let attempt = 0; ; attempt++) {
        if (!tokenFresh()) { token = null; await loadToken(controller.signal); }
        const left = tokenAt + tokenWait * 1000 + 300 - Date.now();
        if (left > 0) await pause(left);
        body.set('token', token);
        try { await post(body, controller.signal); break; } catch (error) {
          if (attempt || error.result?.retry !== 'token') throw error;
          token = null;
        }
      }
      // Только подтверждённая доставка: очищаем черновик и показываем «отправлено».
      goal('request_sent', { works: services.length, photos: photos.length });
      services.splice(0); photos.splice(0).forEach((p) => p.url && URL.revokeObjectURL(p.url));
      form.reset(); renderChips(); renderPhotos();
      try { sessionStorage.removeItem(KEY); } catch { /* приватный режим */ }
      form.hidden = true; done.hidden = false; done.focus();
    } catch (error) {
      const reason = error.name === 'AbortError' ? 'нет ответа от сервера' : error.name === 'TypeError' ? 'нет связи с сервером' : error.message;
      formError.textContent = `Не удалось отправить заявку: ${reason}. Всё введённое и фото сохранены — попробуйте ещё раз или позвоните в студию.`;
      formError.hidden = false;
      // Сервер назвал поле — показываем ошибку и у него.
      const field = error.result?.field;
      if (field && errorFor(field)) { errorFor(field).textContent = error.message.charAt(0).toUpperCase() + error.message.slice(1) + '.'; }
    } finally {
      clearTimeout(timer); sending = false; submitBtn.disabled = false; submitBtn.textContent = 'Отправить заявку';
    }
  }

  form.addEventListener('input', (e) => {
    if (e.target === filesInput) return;
    if (e.target.name && FIELDS.includes(e.target.name)) save();
    if (e.target.getAttribute('aria-invalid') === 'true') validate();
  });
  form.addEventListener('change', (e) => {
    if (e.target === filesInput) { addFiles([...filesInput.files]); filesInput.value = ''; return; }
    if (e.target === addSelect) { if (addSelect.value) addServices([addSelect.value]); addSelect.value = ''; if (errorFor('services').textContent) validate(); return; }
    if (e.target.name === 'consent' && e.target.getAttribute('aria-invalid') === 'true') validate();
    if (e.target.name === 'branch') save();
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  dialog.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-unrequest]');
    if (chip) {
      const i = services.indexOf(chip.dataset.unrequest);
      if (i >= 0) services.splice(i, 1);
      renderChips(); save();
      (chipsEl.querySelector('button') || addSelect).focus();
      return;
    }
    const remove = e.target.closest('[data-remove-photo]');
    if (remove) { removePhoto(Number(remove.dataset.removePhoto)); (previewsEl.querySelector('[data-remove-photo]') || filesInput).focus(); }
  });

  restore(); renderChips(); renderPhotos();

  // Открыть заявку: работы из кнопки (каталог, гараж, карточка направления)
  // добавляются к уже выбранным. Если в том же выборе была автомойка — окно
  // напоминает, что её можно записать онлайн.
  return function open({ services: list = [], category = '', washContext = '', washPrograms = '' } = {}) {
    const fromCategory = CATEGORIES.find((c) => c.id === category);
    addServices(list.length ? list : fromCategory && fromCategory.booking === 'request' ? [fromCategory.title + ' — подобрать с мастером'] : []);
    washNote.hidden = !washContext;
    if (washContext) {
      washText.textContent = `Автомойку из вашего выбора можно записать онлайн: ${washContext}.`;
      washBook.dataset.bookContext = washContext;
      washBook.dataset.ycPrograms = washPrograms;
    }
    form.hidden = false; done.hidden = true; formError.hidden = true;
    if (endpoint && !tokenFresh()) { token = null; loadToken().catch(() => { /* повторим при отправке */ }); }
    show(dialog);
    $('#request-title').focus({ preventScroll: true });
    goal('request_open', { works: services.length, from: category || (list.length ? 'selection' : 'general') });
  };
}
