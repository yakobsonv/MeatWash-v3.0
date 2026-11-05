// Подстановки и общие части страниц Meat Wash.
//
// Общие части (шапка со шторкой, подвал, окна записи и заявки, нижняя кнопка, карточки
// студий с картами, блок записи, клубный блок, аналитика в <head>) живут в src/partials/*.html
// и вставляются между маркерами <!-- SHARED:<имя>:START --> и <!-- SHARED:<имя>:END -->.
// Какая часть на какой странице — поле shared в реестре src/content/pages.mjs.
// Руками внутри маркеров не править: npm run pages перезапишет.
//
// Подстановки — одни и те же в частях и в телах страниц (src/content/*.html). Аргументы —
// любые символы, кроме { и } (кириллица, пробелы, «+»): {{price:Полировка кузова + 2 слоя керамики}}.
// Неизвестная подстановка, неизвестный аргумент и любые оставшиеся «{{» или «}}» — ошибка
// сборки (поправка критика 7). Подстановка, которая выдаёт разметку, внутри атрибута — ошибка.
//
// Страница:
//   {{to:<id>}}            ссылка на страницу для перехода к якорю: '' на ней самой, иначе её адрес:
//                          href="{{to:about}}#team" → "#team" на «О нас», "about#team" на других
//   {{current:<id>}}       aria-current="page" на своей странице
//   {{top}}                логотип: '#top' на главной, './' на остальных
//   {{home}}               '' на главной, './' на остальных
//   {{locations}}          '' на странице с блоком студий («О нас»), 'about' на остальных
//   {{header-variant}}     over | solid (поле header реестра) → site-header--{{header-variant}}
//   {{mobile-cta}}         нижняя кнопка на телефоне (поле cta, MOBILE_CTA ниже)
//   {{topic}}              тема заявки страницы (поле topic реестра: wash, detailing, wrap,
//                          bodywork, auto, import…) или пусто — значение data-request-category
//   {{analytics:webmaster|metrika}}  мета-теги Вебмастера и номер счётчика из site.analytics
// Данные (meatwash-content.json, src/data/cars.json):
//   {{loc:<id>:<поле>}}    name type address hours floor phone tel booking map route card
//   {{price:<позиция>}}    «от 1 000 ₽» или «стоимость после оценки»
//   {{program:<i>}}        «Трёхфазная» (в кавычках; Пакет «Премиум» — как есть); {{program:<i>:name|time|price}} — имя,
//                          «30 минут», «от 2 150 ₽»; {{program-from:<i>}}, {{program-includes:<i>}}
//   {{min:<раздел>}}       «2 150 ₽» — минимальная цена раздела каталога (у автомойки — программ)
//   {{count:sale|sold|studios}}  число; {{count:sold:машина}} → «16 машин» (склонение)
//   {{cars:sale|sold|date}}      разметка машин и дата цен (scripts/cars.mjs, WP4)
//   {{catalog}}, {{compare}}     каталог и сравнение программ (scripts/catalog.mjs, WP3)
//   {{prices:<id,id,…>}}   цены подразделов каталога в разметке каталога /services, кнопки
//                          «Оставьте заявку»: {{prices:price-interior,price-leather}};
//                          programs — карточки программ мойки со сравнением (catalog.mjs)
//   {{min-section:<id>}}   «5 000 ₽» — минимальная цена подраздела: от {{min-section:price-bodywork}}
//   {{reviews}}            блок отзывов с Яндекс Карт из JSON (reviews), {{reviews:<тема>}} —
//                          только отзывы этой темы (wash, detailing, wrap, bodywork); классы — ниже
//   {{works:<направление>}}  ряд плашек «наших работ» из JSON (works): wash, detailing, wrap,
//                          bodywork, sales, about; классы — ниже
//   {{related:<id,id,…>}}  плашки направлений из JSON (directions): {{related:detailing,wrap}}
//   {{brand:name|descriptor|legacy|since}}  Meat Wash · Car Care Club · Meat Wash · 2021
//   {{op:<поле>}}, {{site:url|date}}        реквизиты оператора и документы
//   {{todo:<что нужно>}}   заметная пометка «[нужно от клиента: …]» (span.todo);
//                          npm run check перечисляет, check:release — падает
// Ресурсы:
//   {{asset:<путь>}}       путь с версией по содержимому файла: assets/brand/sprite.svg?v=1a2b3c4d
//   {{icon:<имя>}}         <svg class="icon"><use href="assets/brand/sprite.svg?v=…#i-<имя>"/></svg>;
//                          bull и ccc — бык и надпись «Car Care Club» с их пропорциями
//
// Адреса страниц — без .html (решение 19.10): services, about#map-…, главная — ./ .
import {readFile, writeFile} from 'node:fs/promises';
import {readFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {content, escape, money, minFor, renderCatalog, renderCompare, renderSections, sectionMin, setPageHref, REQUEST_LABEL, requestTopics} from './catalog.mjs';
import {cars, renderSale, renderSold, renderSoldCards, renderCarsDate} from './cars.mjs';
import {typo} from './typo.mjs';
import {REGISTRY} from '../src/content/pages.mjs';

const root = new URL('../', import.meta.url);
const d = content;
export const SITE = 'https://meatwash.ru/';

// Файл страницы → её адрес: 'services.html' → 'services', 'index.html' → '' (корень сайта).
export const pageSlug = (file) => file === 'index.html' ? '' : file.replace(/\.html$/, '');
// Относительная ссылка на страницу: 'services', главная — './'.
export const pageUrl = (file) => pageSlug(file) || './';

export const PAGES = Object.fromEntries(REGISTRY.map((page) => [page.file, page]));
export const BY_ID = Object.fromEntries(REGISTRY.map((page) => [page.id, page]));
if (Object.keys(BY_ID).length !== REGISTRY.length) throw new Error('src/content/pages.mjs: id страниц повторяются');
// Ссылки подразделов каталога на страницы направлений (catalog.mjs, SECTION_LINKS).
setPageHref((pid) => { if (!BY_ID[pid]) throw new Error(`SECTION_LINKS: нет страницы ${pid}`); return pageUrl(BY_ID[pid].file); });

// ── Версия ресурса по содержимому: одна и та же строка в preload и в @font-face,
// в <use href> спрайта и т. п. (поправки 27, 28). Файл не найден — ошибка сборки.
const hashes = new Map();
export function assetUrl(path) {
  if (!hashes.has(path)) {
    const file = new URL(`dist/${path}`, root);
    if (!existsSync(file)) throw new Error(`{{asset}}: нет файла dist/${path}`);
    hashes.set(path, createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 8));
  }
  return `${path}?v=${hashes.get(path)}`;
}
export const SPRITE = 'assets/brand/sprite.svg';
const ICON_BOX = {bull: '0 0 1097 800', ccc: '0 0 1231 198', mw: '0 0 1552 242', mwccc: '0 0 1320 349'};
export function icon(name, cls) {
  const box = ICON_BOX[name];
  const klass = cls || (box ? name : 'icon');
  return box
    ? `<svg class="${klass}" viewBox="${box}" fill="currentColor" aria-hidden="true" focusable="false"><use href="${assetUrl(SPRITE)}#i-${name}"/></svg>`
    : `<svg class="${klass}" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="${assetUrl(SPRITE)}#i-${name}"/></svg>`;
}

// ── Склонение: 1 машина, 2 машины, 5 машин.
const NOUNS = {
  машина: ['машина', 'машины', 'машин'], студия: ['студия', 'студии', 'студий'],
  оценка: ['оценка', 'оценки', 'оценок'], отзыв: ['отзыв', 'отзыва', 'отзывов'],
  работа: ['работа', 'работы', 'работ'], позиция: ['позиция', 'позиции', 'позиций'],
  программа: ['программа', 'программы', 'программ'], фото: ['фото', 'фото', 'фото'],
};
export function plural(n, noun) {
  const forms = NOUNS[noun];
  if (!forms) throw new Error(`plural(): нет форм слова «${noun}» — добавьте в NOUNS (scripts/pages.mjs)`);
  const a = n % 10, b = n % 100;
  return `${n} ${a === 1 && b !== 11 ? forms[0] : a >= 2 && a <= 4 && (b < 12 || b > 14) ? forms[1] : forms[2]}`;
}

// ── Данные как текст (без разметки): общие для страниц и мета-тегов (title, description).
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const humanDate = (iso) => { const [y, m, day] = iso.split('-').map(Number); return `${day} ${MONTHS[m - 1]} ${y} г.`; };
const itemPrice = Object.fromEntries(d.groups.flatMap((g) => g.items));
const COUNTS = {sale: () => cars.forSale.length, sold: () => cars.sold.length, studios: () => d.locations.length};
const BRAND = ['name', 'descriptor', 'legacy', 'since'];

function textValue(kind, args, token) {
  switch (kind) {
    case 'price': {
      const name = args.join(':');
      if (!(name in itemPrice)) throw new Error(`Нет работы в каталоге: ${token}`);
      return itemPrice[name] == null ? 'стоимость после оценки' : 'от ' + money(itemPrice[name]);
    }
    case 'program': {
      const program = d.programs[Number(args[0])];
      if (!program || args[0] === '') throw new Error(`Нет программы: ${token}`);
      const i = Number(args[0]);
      switch (args[1] ?? '') {
        // Название с кавычками внутри (Пакет «Премиум») — без вторых кавычек.
        case '': return /[«»]/.test(program[0]) ? program[0] : `«${program[0]}»`;
        case 'name': return program[0];
        case 'time': return program[2];
        case 'price': return 'от ' + money(Math.min(...d.programPrices[i]));
        default: throw new Error(`Нет поля программы: ${token}`);
      }
    }
    case 'program-from': {
      const i = Number(args[0]);
      if (!d.programs[i]) throw new Error(`Нет программы: ${token}`);
      return 'от ' + money(Math.min(...d.programPrices[i]));
    }
    case 'min': return money(minFor(args[0]));
    case 'min-section': return money(sectionMin(args[0]));
    case 'count': {
      if (!COUNTS[args[0]]) throw new Error(`Нет счётчика: ${token}`);
      const n = COUNTS[args[0]]();
      return args[1] ? plural(n, args[1]) : String(n);
    }
    case 'brand': {
      if (!BRAND.includes(args[0])) throw new Error(`Нет поля бренда: ${token}`);
      const value = d.brand?.[args[0]];
      if (value == null) throw new Error(`brand.${args[0]} не задан в meatwash-content.json: ${token}`);
      return String(value);
    }
    default: return undefined;
  }
}
// Мета-теги: только текстовые подстановки; результат экранирует сам layout().
export function metaText(text) {
  return text.replace(/\{\{([a-z][a-z-]*)(?::([^{}]*))?\}\}/g, (token, kind, rest = '') => {
    const value = textValue(kind, rest.split(':'), token);
    if (value === undefined) throw new Error(`В мета-тегах можно только текстовые подстановки: ${token}`);
    return value;
  });
}

// ── Реквизиты оператора (152-ФЗ): пока не заданы — заметная пометка, check предупреждает.
const OPERATOR_HINT = {name: 'полное наименование оператора — ООО или ИП', inn: 'ИНН', ogrn: 'ОГРН или ОГРНИП', address: 'юридический или почтовый адрес', email: 'адрес электронной почты для обращений'};
export const missingOperator = () => Object.keys(OPERATOR_HINT).filter((key) => !d.site?.operator?.[key]);

// Код Вебмастера — латиница и цифры, счётчик Метрики — только цифры: иначе в разметку не пишем.
const analytics = d.site?.analytics || {};
const ANALYTICS = {
  webmaster: () => analytics.webmaster ? (/^[\w-]+$/.test(analytics.webmaster) ? `<meta name="yandex-verification" content="${escape(analytics.webmaster)}">` : fail('site.analytics.webmaster')) : '',
  metrika: () => analytics.metrika ? (/^\d+$/.test(String(analytics.metrika)) ? `<meta name="mw-metrika" content="${escape(analytics.metrika)}">` : fail('site.analytics.metrika')) : '',
};
function fail(field) { throw new Error(`Неверное значение ${field} в meatwash-content.json`); }

// Нижняя кнопка на телефоне (.mobile-cta, src/partials/dialogs.html) — «Оставьте заявку» на всех
// страницах (Влад 05.11) с темой страницы (поле topic реестра). ui.js делает её inert под окнами,
// CSS прячет при открытом окне.
const loc = (id) => d.locations.find((l) => l.id === id);
const TOPIC_IDS = new Set(requestTopics().map((t) => t.id));
const MOBILE_CTA = {
  none: () => '',
  request: (entry) => `<button class="btn btn--primary mobile-cta" type="button" data-request data-request-category="${escape(entry.topic || '')}">${REQUEST_LABEL}</button>`,
};

// ── Плашки работ и направлений, отзывы (решение Влада 05.11, референс — плашки porsche.com).
// Классы — контракт с CSS главной и страниц направлений (docs/meat-auto/CONTRACTS.md):
//   ul.work-tiles[data-works="<направление>"] | ul.work-tiles.work-tiles--related[data-related]
//     > li.work-tiles__item > a.work-tile[href]
//         > img.work-tile__img (srcset 800/1240, object-fit: cover — кадр обрезает CSS)
//         > span.work-tile__title (заголовок, 1–2 строки, белый поверх затемнения снизу)
//         > span.work-tile__go (круглая кнопка-стрелка, aria-hidden)
//     плашка без фото — a.work-tile.work-tile--text: без img, span.work-tile__price («от N ₽»)
//     плашка машины (car) — ещё span.work-tile__badge «В продаже» или --sold «Продано» (по cars.json)
//   section.reviews#reviews[aria-labelledby=reviews-title]
//     > header.reviews__head > h2.reviews__title#reviews-title
//         + ul.reviews__studios > li.reviews__studio > p.reviews__studio-name, p.reviews__rating
//           (b.reviews__score «5,0» + span.review__stars), p.reviews__count («211 оценок»),
//           a.reviews__link («Все отзывы на Яндекс Картах», новая вкладка)
//         + p.reviews__asof («Рейтинг и отзывы — с Яндекс Карт на 5 ноября 2026 г.»)
//     > ul.reviews__list > li.reviews__item > figure.review
//         > span.review__stars[role=img] (svg.review__star, погашенная — review__star--off)
//         + blockquote.review__text > p + figcaption.review__meta > span.review__author,
//           span.review__studio, time.review__date[datetime]
//   Разметки Review/AggregateRating нет намеренно (отзывы с чужой площадки).
const IMG_WIDTHS = [800, 1240];
const TILE_SIZES = '(max-width: 759px) 85vw, (max-width: 1099px) 46vw, 31vw';
const distPath = (path) => new URL(`dist/${path}`, root);
// Размер кадра для width/height — по файлу первой ширины (читается при загрузке модуля);
// файла ещё нет — 4:3 (ссылка на несуществующий файл всё равно уронит npm run check).
const tileImages = [...Object.values(d.works || {}).filter(Array.isArray).flat(), ...(d.directions?.items || [])]
  .filter((x) => x.img).map((x) => `${x.img}-${(x.widths || IMG_WIDTHS)[0]}.webp`);
const DIMS = Object.fromEntries(await Promise.all(tileImages.map(async (path) => {
  if (!existsSync(distPath(path))) return [path, null];
  const {width, height} = await sharp(readFileSync(distPath(path))).metadata();
  return [path, {width, height}];
})));
const catalogPrice = Object.fromEntries(d.groups.flatMap((g) => g.items));
// Ссылка плашки: страница реестра и якорь; на самой странице — только якорь.
function tileHref(item, entry, token) {
  const target = BY_ID[item.page];
  if (!target) throw new Error(`${token}: нет страницы «${item.page}» в реестре`);
  const hash = item.hash ? `#${item.hash}` : '';
  return target.id === entry.id ? (hash || '#top') : pageUrl(target.file) + hash;
}
function tileImg(item) {
  const widths = item.widths || IMG_WIDTHS, first = `${item.img}-${widths[0]}.webp`;
  const size = DIMS[first] || {width: 800, height: 600};
  return `<img class="work-tile__img" src="${escape(first)}" srcset="${widths.map((w) => `${escape(`${item.img}-${w}.webp`)} ${w}w`).join(', ')}" sizes="${TILE_SIZES}" width="${size.width}" height="${size.height}" alt="${escape(item.alt || '')}" loading="lazy" decoding="async">`;
}
const tileGo = () => `<span class="work-tile__go" aria-hidden="true">${icon('arrow-right')}</span>`;
function workTile(item, entry, token) {
  const href = escape(tileHref(item, entry, token));
  if (item.car) {
    const sold = cars.sold.find((c) => c.id === item.car), car = sold || cars.forSale.find((c) => c.id === item.car);
    if (!car) throw new Error(`${token}: нет машины «${item.car}» в src/data/cars.json`);
    const photo = car.photos[0], src = car.src || photo.src, w = car.w || photo.w, h = car.h || photo.h;
    // Метка — по списку cars.json: проданная машина не выдаётся за продающуюся.
    const badge = `<span class="work-tile__badge${sold ? ' work-tile__badge--sold' : ''}">${sold ? 'Продано' : 'В продаже'}</span>`;
    return `<a class="work-tile" href="${href}"><img class="work-tile__img" src="${escape(src)}" sizes="${TILE_SIZES}" width="${w}" height="${h}" alt="${escape(car.alt || photo.alt)}" loading="lazy" decoding="async">${badge}<span class="work-tile__title">${escape(car.title)}</span>${tileGo()}</a>`;
  }
  if (!item.title) throw new Error(`${token}: у плашки нет title`);
  if (item.img) return `<a class="work-tile" href="${href}">${tileImg(item)}<span class="work-tile__title">${escape(item.title)}</span>${tileGo()}</a>`;
  if (!item.price) throw new Error(`${token}: плашка «${item.title}» без фото — нужна price (позиция каталога)`);
  if (!(item.price in catalogPrice)) throw new Error(`${token}: нет позиции «${item.price}» в каталоге`);
  const price = catalogPrice[item.price] == null ? 'стоимость после осмотра' : 'от ' + money(catalogPrice[item.price]);
  return `<a class="work-tile work-tile--text" href="${href}"><span class="work-tile__title">${escape(item.title)}</span><span class="work-tile__price">${escape(price)}</span>${tileGo()}</a>`;
}
const tileList = (cls, attr, tiles) => `<ul class="${cls}" role="list" ${attr}>\n${tiles.map((t) => `  <li class="work-tiles__item">${t}</li>`).join('\n')}\n</ul>`;
function renderWorks(dir, entry, token) {
  const list = d.works?.[dir];
  if (!Array.isArray(list) || !list.length) throw new Error(`${token}: нет ряда работ «${dir}» в meatwash-content.json (works)`);
  return tileList('work-tiles', `data-works="${escape(dir)}"`, list.map((item) => workTile(item, entry, token)));
}
function renderRelated(ids, entry, token) {
  if (!ids.length || ids.some((id) => !id)) throw new Error(`${token}: нужен список направлений через запятую`);
  const items = ids.map((id) => d.directions?.items?.find((x) => x.id === id) || (() => { throw new Error(`${token}: нет направления «${id}» (directions)`); })());
  return tileList('work-tiles work-tiles--related', 'data-related', items.map((item) => `<a class="work-tile" href="${escape(tileHref(item, entry, token))}">${tileImg(item)}<span class="work-tile__title">${escape(item.title)}</span>${tileGo()}</a>`));
}
const stars = (n) => Array.from({length: 5}, (_, i) => icon('star', i < Math.round(n) ? 'review__star' : 'review__star review__star--off')).join('');
const score = (n) => n.toFixed(1).replace('.', ',');
const shortDate = (iso) => humanDate(iso).replace(/ г\.$/, '');
const BOTH_STUDIOS = new Set(['wash', 'detailing']);
function renderReviews(topic, token) {
  const r = d.reviews;
  if (!r?.items?.length) throw new Error(`${token}: нет отзывов в meatwash-content.json (reviews)`);
  if (topic && !TOPIC_IDS.has(topic)) throw new Error(`${token}: нет темы «${topic}»`);
  const items = topic ? r.items.filter((x) => x.topics?.includes(topic)) : r.items;
  if (!items.length) throw new Error(`${token}: нет отзывов с темой «${topic}»`);
  // Где делают работу темы: оклейка и кузов — только в Технопарке (студии отзывов темы),
  // мойка и детейлинг — в обеих студиях: рейтинг показываем у каждой студии темы.
  const topicStudios = topic && !BOTH_STUDIOS.has(topic) ? new Set(items.map((x) => x.studio)) : new Set(r.studios.map((s) => s.id));
  // Меньше трёх отзывов по теме — добираем отзывы той же студии (ряд не пустует).
  for (const x of r.items) if (items.length < 3 && !items.includes(x) && topicStudios.has(x.studio)) items.push(x);
  const studios = r.studios.filter((s) => topicStudios.has(s.id));
  const name = (id) => loc(id)?.name ?? (() => { throw new Error(`reviews: нет студии ${id}`); })();
  return `<section class="reviews" id="reviews" aria-labelledby="reviews-title">
  <header class="reviews__head">
    <h2 class="reviews__title" id="reviews-title">Отзывы клиентов</h2>
    <ul class="reviews__studios" role="list">
${studios.map((s) => `      <li class="reviews__studio">
        <p class="reviews__studio-name">${escape(name(s.id))}</p>
        <p class="reviews__rating"><b class="reviews__score">${score(s.rating)}</b><span class="review__stars" role="img" aria-label="Рейтинг ${score(s.rating)} из 5">${stars(s.rating)}</span></p>
        <p class="reviews__count">${plural(s.ratingsCount, 'оценка')}</p>
        <a class="reviews__link link-arrow" href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">Все отзывы на Яндекс Картах${icon('arrow-up-right')}<span class="sr">: ${escape(name(s.id))} (откроется в новой вкладке)</span></a>
      </li>`).join('\n')}
    </ul>
    <p class="reviews__asof">Рейтинг и отзывы — с Яндекс Карт на ${escape(humanDate(r.asOf))}</p>
  </header>
  <ul class="reviews__list" role="list" tabindex="0" aria-label="Отзывы клиентов">
${items.map((x) => `    <li class="reviews__item">
      <figure class="review">
        <span class="review__stars" role="img" aria-label="Оценка ${x.rating} из 5">${stars(x.rating)}</span>
        <blockquote class="review__text">${x.text.split(/\n+/).map((t) => `<p>${escape(t.trim())}</p>`).join('')}</blockquote>
        <figcaption class="review__meta"><span class="review__author">${escape(x.author)}</span><span class="review__studio">${escape(name(x.studio))}</span><time class="review__date" datetime="${escape(x.date)}">${escape(shortDate(x.date))}</time></figcaption>
      </figure>
    </li>`).join('\n')}
  </ul>
</section>`;
}

const LOC_FIELDS = {
  name: (l) => escape(l.name), type: (l) => escape(l.type), address: (l) => escape(l.address),
  hours: (l) => l.hours.map(escape).join('<br>'), floor: (l) => escape(l.floor),
  phone: (l) => escape(l.phone), tel: (l) => escape(l.tel), booking: (l) => escape(l.booking),
  map: (l) => escape(l.map), route: (l) => escape(l.route),
  card: (l) => l.card.map(escape).join('<br>'),
};

export async function readPartial(name) { return readFile(new URL(`src/partials/${name}.html`, root), 'utf8'); }

// Подстановки, которые выдают разметку: внутри тега (в атрибуте) — ошибка.
const MARKUP = new Set(['catalog', 'compare', 'cars', 'todo', 'icon', 'program-includes', 'mobile-cta', 'prices', 'reviews', 'works', 'related']);
const insideTag = (text, offset) => text.lastIndexOf('<', offset) > text.lastIndexOf('>', offset);

// template — разметка части или тела; page — файл страницы ('services.html').
export function renderPartial(template, page) {
  const entry = PAGES[page];
  if (!entry) throw new Error(`Нет страницы ${page} в src/content/pages.mjs`);
  const {id} = entry, home = id === 'home';
  const out = template.replace(/\{\{([a-z][a-z-]*)(?::([^{}]*))?\}\}/g, (token, name, rest, offset) => {
    const args = rest === undefined ? [] : rest.split(':');
    if (MARKUP.has(name) && name !== 'cars' && insideTag(template, offset)) throw new Error(`${page}: ${token} выдаёт разметку — нельзя внутри атрибута`);
    if (name === 'cars' && args[0] !== 'date' && insideTag(template, offset)) throw new Error(`${page}: ${token} выдаёт разметку — нельзя внутри атрибута`);
    const text = textValue(name, args, token);
    if (text !== undefined) return escape(text);
    switch (name) {
      case 'home': return home ? '' : './';
      case 'top': return home ? '#top' : './';
      case 'locations': return entry.shared.includes('locations') ? '' : pageUrl(BY_ID.about.file);
      case 'current': return args[0] === id ? ' aria-current="page"' : '';
      case 'to': {
        const target = BY_ID[args[0]];
        if (!target) throw new Error(`${page}: нет страницы с id «${args[0]}» (${token})`);
        return target.id === id ? '' : pageUrl(target.file);
      }
      case 'header-variant': {
        if (!['over', 'solid'].includes(entry.header)) throw new Error(`${page}: поле header — over или solid`);
        return entry.header;
      }
      case 'mobile-cta': {
        if (!MOBILE_CTA[entry.cta]) throw new Error(`${page}: нет нижней кнопки cta «${entry.cta}» (${token})`);
        return MOBILE_CTA[entry.cta](entry);
      }
      case 'topic': {
        if (entry.topic && !TOPIC_IDS.has(entry.topic)) throw new Error(`${page}: поле topic «${entry.topic}» — не тема из site.requests.topics`);
        return escape(entry.topic || '');
      }
      case 'prices': return renderSections(args.join(':').split(',').map((x) => x.trim()), id);
      case 'reviews': return renderReviews(args[0] || '', token);
      case 'works': return renderWorks(args[0], entry, token);
      case 'related': return renderRelated(args.join(':').split(',').map((x) => x.trim()), entry, token);
      case 'analytics': {
        if (!ANALYTICS[args[0]]) throw new Error(`Нет поля аналитики ${args[0]} (${token})`);
        return ANALYTICS[args[0]]();
      }
      case 'loc': {
        const location = loc(args[0]);
        if (!location) throw new Error(`Нет филиала ${args[0]} (${token})`);
        if (!LOC_FIELDS[args[1]]) throw new Error(`Нет поля ${args[1]} (${token})`);
        return LOC_FIELDS[args[1]](location);
      }
      case 'program-includes': {
        const list = d.programIncludes[Number(args[0])];
        if (!list) throw new Error(`Нет программы: ${token}`);
        return `<ul class="article-includes">\n${list.map((line) => `  <li>${escape(line)}</li>`).join('\n')}\n</ul>`;
      }
      case 'op': {
        if (!(args[0] in OPERATOR_HINT)) throw new Error(`Нет поля оператора: ${token}`);
        const value = d.site?.operator?.[args[0]];
        if (!value) return `<span class="doc-todo">[${OPERATOR_HINT[args[0]]}]</span>`;
        if (args[0] === 'ogrn') {
          // ОГРН юрлица — 13 цифр, ОГРНИП предпринимателя — 15.
          if (!/^(\d{13}|\d{15})$/.test(value)) throw new Error(`site.operator.ogrn: нужно 13 (ОГРН) или 15 (ОГРНИП) цифр — ${value}`);
          return `${value.length === 15 ? 'ОГРНИП' : 'ОГРН'} ${value}`;
        }
        if (args[0] === 'email') return `<a href="mailto:${escape(value)}">${escape(value)}</a>`;
        return escape(value);
      }
      case 'site': {
        if (args[0] === 'url') return SITE;
        if (args[0] === 'date') return humanDate(d.site.documentsDate);
        throw new Error(`Неизвестная подстановка ${token}`);
      }
      case 'catalog': return renderCatalog();
      case 'compare': return renderCompare();
      case 'cars': {
        if (args[0] === 'sale') return renderSale();
        if (args[0] === 'sold') return renderSold();
        if (args[0] === 'sold-cards') return renderSoldCards();
        if (args[0] === 'date') return escape(renderCarsDate());
        throw new Error(`Неизвестная подстановка ${token}`);
      }
      case 'todo': {
        const what = args.join(':').trim();
        if (!what) throw new Error(`${page}: пустая пометка ${token}`);
        return `<span class="todo" data-no-typo>[нужно от клиента: ${escape(what)}]</span>`;
      }
      case 'asset': return escape(assetUrl(args.join(':')));
      case 'icon': return icon(args[0], args[1]);
      default: throw new Error(`${page}: неизвестная подстановка ${token}`);
    }
  });
  // Оставшиеся «{{» и «}}» — недописанная подстановка (JSON-LD и скрипты не в счёт).
  const rest = out.replace(/<script\b[\s\S]*?<\/script>/g, '').match(/.{0,40}(\{\{|\}\}).{0,40}/);
  if (rest) throw new Error(`${page}: осталась нераспознанная подстановка: …${rest[0]}…`);
  return out;
}

const marker = (name, edge) => `<!-- SHARED:${name}:${edge} -->`;
export function sharedBlock(html, name) {
  const a = html.indexOf(marker(name, 'START')), b = html.indexOf(marker(name, 'END'));
  return a < 0 || b < 0 ? null : html.slice(a + marker(name, 'START').length, b);
}
// Фрагмент между маркерами — с переводами строк вокруг, чтобы разметка читалась.
export const wrap = (body) => '\n' + body.replace(/\s+$/, '') + '\n';
// Часть страницы так, как она стоит между маркерами: подстановки, затем неразрывные пробелы.
export const renderShared = async (name, page) => wrap(typo(renderPartial(await readPartial(name), page)));

export async function renderPage(page, html) {
  for (const name of PAGES[page].shared) {
    const a = html.indexOf(marker(name, 'START')), b = html.indexOf(marker(name, 'END'));
    if (a < 0 || b < 0) throw new Error(`${page}: нет маркеров SHARED:${name}`);
    html = html.slice(0, a + marker(name, 'START').length) + await renderShared(name, page) + html.slice(b);
  }
  return html;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const page of Object.keys(PAGES)) {
    const file = new URL(`dist/${page}`, root);
    await writeFile(file, await renderPage(page, await readFile(file, 'utf8')));
    console.log(`${page}: ${PAGES[page].shared.join(', ')}`);
  }
}
