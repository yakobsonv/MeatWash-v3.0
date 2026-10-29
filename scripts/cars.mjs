// Машины: данные — src/data/cars.json (перенос один к одному из прежнего auto.html,
// поправка критика 29: файл нужен только сборке), вывод — подстановки страниц:
//   {{cars:sale}}  карточки «Сейчас в продаже» (P18/P19, §4.6 плана): article.car-card#<id>
//   {{cars:sold}}  «Уже продали»: li.sold-card × N (обёртку ul.sold-grid пишет страница)
//   {{cars:date}}  дата цен: «22 сентября 2026 года»
//   {{count:sale}}, {{count:sold}}, {{count:sold:машина}} — считает scripts/pages.mjs по этим данным.
//
// Карточка машины (вид — dist/css/auto.css):
//   ul.strip            лента фото на всю ширину колонки; кадры 3:2, у tall — 4:5 (BMW);
//                       прокрутка с прилипанием, без JS; первые кадры первой машины — eager
//   .car-card__head     название и год, факты через «·»
//   .car-card__offer    цена (+ с НДС, если задана), «Спросить о машине» (Telegram) и «Позвонить»
//                       (Мясницкая) — на компьютере колонка справа, на телефоне сразу после фактов
//   .car-card__about    абзац, характеристики, «Подготовили в Meat Wash: …» (если задано)
// Названия проданных машин: слова с дефисом не рвутся (S-класс), номер модели не отрывается
// от соседнего слова (BMW 740d, GLS 450 d) — как было в прежней разметке.
// Владелец: WP4.
import {readFile} from 'node:fs/promises';
import {content, escape, money} from './catalog.mjs';
import {icon} from './pages.mjs';

const root = new URL('../', import.meta.url);
export const cars = JSON.parse(await readFile(new URL('src/data/cars.json', root), 'utf8'));

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const longDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y} года`; };
const studio = () => content.locations.find((l) => l.id === 'myasnitskaya');

// Неразрывность в названиях моделей, как в прежней разметке: «S-класс» целиком (слово с дефисом),
// номер модели не отрывается от предыдущего слова («BMW 740d», «GLE 450», «Cruiser 200»),
// число — от следующего («7 серии», «450 d»), короткое обозначение — от марки («BMW XM», «M4 CS»).
// Скобки «(G30)» переносятся отдельно: иначе длинное имя не помещается в колонку на 320 px.
const NB = '&nbsp;';
export function modelName(title) {
  const words = title.split(' ');
  const glued = (prev, word) => !word.startsWith('(') && (/\d/.test(word) || word.length <= 2) || /^\d+$/.test(prev);
  return words.map((w, i) => {
    const html = /[A-Za-zА-Яа-яЁё]-[A-Za-zА-Яа-яЁё]/.test(w) ? `<span class="nw">${escape(w)}</span>` : escape(w);
    return i === 0 ? html : (glued(words[i - 1], w) ? NB : ' ') + html;
  }).join('');
}

// Текст из JSON: экранировать, слова через дефис и диапазоны («800-вольтовая», «0–100») не рвать.
const text = (value) => escape(value).replace(/[\p{L}\d]+(?:[-–][\p{L}\d]+)+/gu, (w) => `<span class="nw">${w}</span>`);

const photo = (p, eager) => `<li><img src="${escape(p.src)}" width="${p.w}" height="${p.h}" alt="${escape(p.alt)}" loading="${eager ? 'eager' : 'lazy'}" decoding="async"></li>`;

function card(car, index) {
  const id = escape(car.id);
  // Первая машина стоит сразу под шапкой страницы: её первые два кадра — без ленивой загрузки.
  const strip = car.photos.map((p, i) => photo(p, index === 0 && i < 2)).join('\n        ');
  return `<article class="car-card" id="${id}" aria-labelledby="car-${id}-title">
    <div class="car-card__gallery">
      <ul class="strip${car.tall ? ' strip--tall' : ''}" tabindex="0" aria-label="Фотографии ${escape(car.title)} (${car.photos.length})">
        ${strip}
      </ul>
      <span class="chip chip--photo car-card__count" aria-hidden="true">${car.photos.length} фото</span>
    </div>
    <div class="car-card__body">
      <div class="car-card__head">
        <h3 class="car-card__title" id="car-${id}-title">${escape(car.title)}<span class="car-card__year">, ${car.year}</span></h3>
        <p class="car-card__facts">${car.facts.map((f) => `<span>${text(f)}</span>`).join('<span class="car-card__dot"> · </span>')}</p>
      </div>
      <div class="car-card__offer">
        <p class="car-card__price">${money(car.price)}${car.priceVat ? ` <span>с НДС — ${money(car.priceVat)}</span>` : ''}</p>
        <div class="car-card__actions">
          <a class="btn btn--primary btn--block" href="${escape(cars.contact)}" target="_blank" rel="noopener">Спросить о машине${icon('arrow-up-right')}<span class="sr"> ${escape(car.title)} в Telegram (откроется в новой вкладке)</span></a>
          <a class="btn btn--secondary btn--block" href="tel:${escape(studio().tel)}">${icon('phone')}Позвонить<span class="sr"> в студию на Мясницкой, ${escape(studio().phone)}</span></a>
        </div>
      </div>
      <div class="car-card__about">
        <p class="car-card__lead">${text(car.lead)}</p>
        <ul class="car-card__specs">
          ${car.specs.map((s) => `<li>${text(s)}</li>`).join('\n          ')}
        </ul>
${car.prepared ? `        <p class="car-card__prep"><b>Подготовили в Meat Wash:</b> ${text(car.prepared)}.</p>\n` : ''}      </div>
    </div>
  </article>`;
}

export const renderSale = () => cars.forSale.map(card).join('\n');

export function renderSold() {
  return cars.sold.map((car) => `<li class="sold-card"><img src="${escape(car.src)}" width="${car.w}" height="${car.h}" alt="${escape(car.alt)}" loading="lazy" decoding="async"><h3 class="sold-card__name">${modelName(car.title)}</h3><span class="chip chip--photo">Продан</span></li>`).join('\n');
}

export const renderCarsDate = () => longDate(cars.pricesDate);
