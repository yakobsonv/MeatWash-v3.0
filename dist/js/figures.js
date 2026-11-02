// Ключевые цифры машин на /auto (Паша 30.10, как у porsche.com): когда блок показался на
// экране, числа набегают от нуля до значения из разметки, единицы и подписи проявляются
// следом, слева направо. Один раз на блок. При «меньше движения» модуль ничего не делает —
// видны итоговые числа из разметки (их же читает экранный диктор: анимируемое скрыто).
// Подключает site.js, когда на странице есть [data-figures]. Разметка — scripts/cars.mjs.
const DURATION = 1400;
const STEP = 160;
const ease = (t) => 1 - (1 - t) ** 3;

function count(num, delay) {
  const text = num.dataset.count;
  const digits = (text.split(',')[1] || '').length;
  const target = Number(text.replace(/\s/g, '').replace(',', '.'));
  const format = (n) => n.toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  // Ширина — по итоговому числу: единица справа не ездит, пока число растёт.
  num.textContent = text;
  num.style.minWidth = `${num.getBoundingClientRect().width}px`;
  num.textContent = format(0);
  const start = performance.now() + delay;
  const tick = (now) => {
    const t = Math.min(1, Math.max(0, (now - start) / DURATION));
    num.textContent = t < 1 ? format(target * ease(t)) : text;
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function setupFigures() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // Счёт — как только блок хоть немного показался. С порогом в 60 % блока на ноутбуках
  // с невысоким экраном внизу окна машины стояли три «0» без единиц, пока окно не прокрутят.
  const observer = new IntersectionObserver((entries) => entries.forEach(({ target, isIntersecting }) => {
    if (!isIntersecting) return;
    observer.unobserve(target);
    target.classList.add('is-run');
    target.querySelectorAll('.car-figures__num').forEach((num, i) => count(num, i * STEP));
  }));
  document.querySelectorAll('[data-figures]').forEach((block) => {
    // Окно уже открыто (прямой заход по /auto#<id>, js/cars.js загрузился раньше): на экране
    // итоговые числа — не обнуляем, иначе они мигнут «итог → 0 → счёт».
    if (block.closest('dialog[open]')) return;
    block.querySelectorAll('.car-figures__item').forEach((item, i) => item.style.setProperty('--d', `${i * STEP + 250}ms`));
    block.querySelectorAll('.car-figures__num').forEach((num) => { num.textContent = '0'; });
    block.classList.add('is-armed');
    observer.observe(block);
  });
}
