// Допы к заказу на /wash (Влад 19.11): кнопки «Добавить к заказу» в подборках «Топ-5 услуг» и
// «Допы для салона» (button[data-addon], разметка — scripts/catalog.mjs) копят работы в
// sessionStorage (на время вкладки), строка заказа [data-addons-bar] показывает, что в заказе.
// Допы уходят в окно записи вместе с программой: request.js при data-book добавляет их к
// работам (те, что уже входят в выбранную программу, — не добавляет, пишет «уже в программе»).
const KEY = 'mw:addons';
export const getAddons = () => {
  try { const list = JSON.parse(sessionStorage.getItem(KEY) || '[]'); return Array.isArray(list) ? list.filter((x) => typeof x === 'string') : []; }
  catch { return []; }
};
const setAddons = (list) => {
  try { sessionStorage.setItem(KEY, JSON.stringify(list)); } catch { /* приватный режим — живёт до перезагрузки */ }
  memory = list;
};
let memory = null;
const current = () => memory ?? getAddons();

export function setupAddons() {
  const buttons = [...document.querySelectorAll('button[data-addon]')];
  if (!buttons.length) return;
  const known = new Set(buttons.map((b) => b.dataset.addon));
  const bar = document.querySelector('[data-addons-bar]');
  const text = bar?.querySelector('[data-addons-text]');
  const render = () => {
    const list = current().filter((n) => known.has(n));
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(list.includes(b.dataset.addon))));
    if (!bar) return;
    bar.hidden = !list.length;
    text.textContent = list.length ? `В заказе ${list.length === 1 ? 'доп' : 'допы'}: ${list.join(', ')}. Выберите программу — ${list.length === 1 ? 'он уйдёт' : 'они уйдут'} в запись вместе с ней.` : '';
  };
  buttons.forEach((b) => b.addEventListener('click', () => {
    const list = current().slice(), name = b.dataset.addon, i = list.indexOf(name);
    if (i >= 0) list.splice(i, 1); else list.push(name);
    setAddons(list); render();
  }));
  render();
}
