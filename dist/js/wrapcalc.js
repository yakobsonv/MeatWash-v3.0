// Калькулятор оклейки на /wrap (Влад 09.11 вечер). Разметка — src/content/wrap.html (form[data-wrap-calc]),
// вид — css/wrapcalc.css. Что делает:
//   - наборы «Зоны риска» и «Весь кузов» отмечают свои детали, «Свой набор» снимает все — дальше
//     человек отмечает сам; правка деталей вручную переключает набор на «Свой набор» (или обратно,
//     если отмеченное совпало с набором). «Отдельно» (фары, лобовое) наборы не трогают;
//   - нажатие на деталь схемы (g[data-part]) переключает её флажок; наведение на флажок подсвечивает деталь;
//   - плёнка синхронна с переключателем героя (name="wrap-kind");
//   - «Ваш расчёт»: детали кузова — «после осмотра» (цен по деталям в каталоге нет), фары и лобовое —
//     ценой из каталога (data.js); итог — суммой, только если все выбранные работы с ценой;
//   - «Получить расчёт» — кнопка data-request (окно заявки ui.js): тема wrap, работы каталога
//     (data-request-services: работа набора, если детали совпали с ним, и «Отдельно») и строка расчёта
//     (data-request-context) обновляются при каждом изменении; data-request-replace — работы кнопки
//     заменяют прежний выбор в окне, даже если их нет (свой набор — только строкой расчёта).
import { PRICES } from './data.js';

const PRESETS = {
  risk: { parts: ['hood', 'bumper-f', 'fenders-f', 'mirrors', 'sills'], service: 'Оклейка зон риска' },
  full: { parts: ['hood', 'bumper-f', 'fenders-f', 'mirrors', 'sills', 'doors-f', 'doors-r', 'roof', 'fenders-r', 'trunk', 'bumper-r'], service: 'Полная оклейка' },
};
const FILM = { clear: 'прозрачная плёнка', color: 'цветная плёнка' };
const MOUNT = { no: 'без разбора', yes: 'с разбором' };
const money = (n) => n.toLocaleString('ru-RU') + ' ₽';
const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);

export function setupWrapCalc() {
  for (const form of document.querySelectorAll('[data-wrap-calc]')) setup(form);
}

function setup(form) {
  const $ = (s) => form.querySelector(s), $$ = (s) => [...form.querySelectorAll(s)];
  const partBoxes = $$('input[name="part"]'), extraBoxes = $$('input[name="extra"]');
  const box = (id) => [...partBoxes, ...extraBoxes].find((b) => b.value === id);
  const nameOf = (b) => b.closest('label').querySelector('span').textContent.split(' · ')[0].trim();
  const value = (name) => form.querySelector(`input[name="${name}"]:checked`)?.value;
  const shapes = $$('[data-part]');
  const carEl = $('[data-calc-car]'), linesEl = $('[data-calc-lines]'), partsEl = $('[data-calc-parts]'), totalEl = $('[data-calc-total]');
  const submit = $('[data-calc-submit]');
  const heroKind = [...document.querySelectorAll('input[name="wrap-kind"]')];

  const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
  const pickedParts = () => partBoxes.filter((b) => b.checked).map((b) => b.value);
  const presetOf = (parts) => Object.entries(PRESETS).find(([, p]) => sameSet(p.parts, parts))?.[0];

  function applyPreset(id) {
    const parts = PRESETS[id]?.parts || [];
    for (const b of partBoxes) b.checked = parts.includes(b.value);
  }
  function syncScope() {
    const match = presetOf(pickedParts()) || 'custom';
    const radio = form.querySelector(`input[name="scope"][value="${match}"]`);
    if (radio) radio.checked = true;
  }

  function render() {
    const parts = partBoxes.filter((b) => b.checked), extras = extraBoxes.filter((b) => b.checked);
    const on = new Set([...parts, ...extras].map((b) => b.value));
    for (const g of shapes) g.classList.toggle('is-on', on.has(g.dataset.part));

    const body = form.querySelector('input[name="body"]:checked');
    const bodyName = body ? nameOf(body) : '';
    const film = FILM[value('film')] || '', mount = MOUNT[value('mount')] || '';
    carEl.textContent = [bodyName, film, mount].filter(Boolean).join('\u00a0· ');

    const lines = [];
    if (parts.length) lines.push([`Детали кузова: ${parts.length}`, null]);
    for (const b of extras) lines.push([nameOf(b), PRICES[b.dataset.item] ?? null]);
    linesEl.replaceChildren(...lines.map(([label, price]) => {
      const li = document.createElement('li'), span = document.createElement('span'), b = document.createElement('b');
      span.textContent = label;
      b.textContent = price == null ? 'после осмотра' : 'от ' + money(price);
      b.classList.toggle('is-estimate', price == null);
      li.append(span, b);
      return li;
    }));
    if (!lines.length) {
      const li = document.createElement('li'), span = document.createElement('span');
      span.textContent = 'Отметьте детали на схеме или выберите набор';
      li.append(span); linesEl.append(li);
    }
    partsEl.textContent = parts.map((b, i) => i ? lower(nameOf(b)) : nameOf(b)).join(', ');

    const priced = lines.length && lines.every(([, p]) => p != null);
    totalEl.textContent = !lines.length ? '' : priced
      ? `Итого от ${money(lines.reduce((sum, [, p]) => sum + p, 0))}`
      : 'Итог назовём после осмотра';

    // Заявка: работы каталога и строка расчёта.
    const preset = PRESETS[presetOf(parts.map((b) => b.value))];
    const services = [];
    if (preset) services.push(preset.service);
    for (const b of extras) services.push(b.dataset.item);
    submit.dataset.requestServices = services.join('|');
    const what = [
      parts.length ? `детали кузова (${parts.length}): ${parts.map((b) => lower(nameOf(b))).join(', ')}` : '',
      extras.length ? `отдельно: ${extras.map((b) => lower(nameOf(b))).join(', ')}` : '',
    ].filter(Boolean).join('; ');
    const head = [lower(bodyName), film, mount].filter(Boolean).join(', ');
    submit.dataset.requestContext = `Расчёт оклейки: ${head}. ${what ? what.charAt(0).toUpperCase() + what.slice(1) : 'Детали не выбраны'}.`;
  }

  form.addEventListener('change', (e) => {
    const t = e.target;
    if (t.name === 'scope') applyPreset(t.value);
    if (t.name === 'part') syncScope();
    if (t.name === 'film') for (const r of heroKind) r.checked = r.value === t.value;
    render();
  });
  form.addEventListener('submit', (e) => e.preventDefault());
  for (const r of heroKind) r.addEventListener('change', () => {
    const mine = form.querySelector(`input[name="film"][value="${r.value}"]`);
    if (r.checked && mine) { mine.checked = true; render(); }
  });

  // Схема: нажатие — переключить флажок детали; наведение на флажок — подсветить деталь.
  for (const g of shapes) {
    g.addEventListener('click', () => {
      const b = box(g.dataset.part);
      if (!b) return;
      b.checked = !b.checked;
      b.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
  for (const b of [...partBoxes, ...extraBoxes]) {
    const label = b.closest('label');
    const hot = (on) => shapes.filter((g) => g.dataset.part === b.value).forEach((g) => g.classList.toggle('is-hot', on));
    label.addEventListener('pointerenter', () => hot(true));
    label.addEventListener('pointerleave', () => hot(false));
    b.addEventListener('focus', () => hot(true));
    b.addEventListener('blur', () => hot(false));
  }

  render();
}
