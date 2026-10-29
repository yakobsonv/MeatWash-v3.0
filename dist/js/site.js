// Вход всех страниц Meat Wash (план §4.1). Подключается в <head> каждой страницы
// (<script type="module" src="js/site.js">, его пишет scripts/content.mjs).
// Порядок важен: шторка (shell.js) закрывается до того, как ui.js откроет окно записи
// по [data-book] внутри неё. Модули страниц — import() по признаку в разметке.
// Владелец: WP0, после сдачи — WP7. Новые модули страниц подключаются здесь же, строкой import().
import { setupShell } from './shell.js';
import { setupComponents } from './components.js';
import { setupUI } from './ui.js';

setupShell();
setupComponents();
setupUI();

const warn = (what) => (error) => console.warn(`${what}: модуль не подключился.`, error);
if (document.getElementById('catalog')) import('./catalog.js').then((m) => m.setupCatalog()).catch(warn('Каталог'));
if (document.querySelector('[data-ba]')) import('./proof.js').then((m) => m.setupProof()).catch(warn('Шторки «до/после»'));
if (document.querySelector('.dirs')) import('./home.js').then((m) => m.setupHome()).catch(warn('Главная'));
if (document.querySelector('[data-video]')) import('./video.js').then((m) => m.setupVideo()).catch(warn('Видео'));

// 3D-гараж (решение Влада 27.10): блок #garage на /services. Скрипт окна (garage.js)
// загружается по первому нажатию [data-garage-open], сцена (porsche3d.bundle.js) — внутри
// него и тоже только по нажатию, как раньше.
const garageButtons = document.querySelectorAll('[data-garage-open]');
if (garageButtons.length) {
  let garage = null;
  const load = () => (garage ??= import('./garage.js').then((m) => m.setupGarage()));
  garageButtons.forEach((button) => button.setAttribute('aria-haspopup', 'dialog'));
  document.addEventListener('click', (e) => {
    const button = e.target.closest('[data-garage-open]');
    if (!button) return;
    e.preventDefault();
    load().then((g) => g.open(button)).catch(warn('3D-гараж'));
  });
}
