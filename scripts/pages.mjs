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
//                          href="{{to:about}}#founder" → "#founder" на «О нас», "about#founder" на других
//   {{current:<id>}}       aria-current="page" на своей странице
//   {{top}}                логотип: '#top' на главной, './' на остальных
//   {{home}}               '' на главной, './' на остальных
//   {{locations}}          '' на странице с блоком студий («О нас»), 'about' на остальных
//   {{header-variant}}     over | solid (поле header реестра) → site-header--{{header-variant}}
//   {{mobile-cta}}         нижняя кнопка на телефоне (поле cta, MOBILE_CTA ниже)
//   {{analytics:webmaster|metrika}}  мета-теги Вебмастера и номер счётчика из site.analytics
// Данные (meatwash-content.json, src/data/cars.json):
//   {{loc:<id>:<поле>}}    name type address hours floor phone tel booking map route card
//   {{price:<позиция>}}    «от 1 000 ₽» или «стоимость после оценки»
//   {{program:<i>}}        «Трёхфазная» (в кавычках); {{program:<i>:name|time|price}} — имя,
//                          «30 минут», «от 2 150 ₽»; {{program-from:<i>}}, {{program-includes:<i>}}
//   {{min:<раздел>}}       «2 150 ₽» — минимальная цена раздела каталога (у автомойки — программ)
//   {{count:sale|sold|studios}}  число; {{count:sold:машина}} → «16 машин» (склонение)
//   {{cars:sale|sold|date}}      разметка машин и дата цен (scripts/cars.mjs, WP4)
//   {{catalog}}, {{compare}}     каталог и сравнение программ (scripts/catalog.mjs, WP3)
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
import {content, escape, money, minFor, renderCatalog, renderCompare} from './catalog.mjs';
import {cars, renderSale, renderSold, renderCarsDate} from './cars.mjs';
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
const ICON_BOX = {bull: '0 0 1097 800', ccc: '0 0 1231 198'};
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
        case '': return `«${program[0]}»`;
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

// Нижняя кнопка на телефоне (.mobile-cta, src/partials/dialogs.html) — главное действие страницы.
// Класс один у кнопки и у ссылки: ui.js делает её inert под окнами, CSS прячет при открытом окне.
const loc = (id) => d.locations.find((l) => l.id === id);
const MOBILE_CTA = {
  none: () => '',
  book: () => '<button class="btn btn--primary mobile-cta" type="button" data-book>Записаться</button>',
  technopark: () => `<a class="btn btn--primary mobile-cta" href="tel:${escape(loc('technopark').tel)}">Позвонить в Технопарк</a>`,
  auto: () => `<a class="btn btn--primary mobile-cta" href="${escape(cars.contact)}" target="_blank" rel="noopener">Спросить о машине<span class="sr"> в Telegram</span></a>`,
  import: () => `<a class="btn btn--primary mobile-cta" href="${escape(cars.contact)}" target="_blank" rel="noopener">Обсудить привоз<span class="sr"> в Telegram</span></a>`,
};

const LOC_FIELDS = {
  name: (l) => escape(l.name), type: (l) => escape(l.type), address: (l) => escape(l.address),
  hours: (l) => l.hours.map(escape).join('<br>'), floor: (l) => escape(l.floor),
  phone: (l) => escape(l.phone), tel: (l) => escape(l.tel), booking: (l) => escape(l.booking),
  map: (l) => escape(l.map), route: (l) => escape(l.route),
  card: (l) => l.card.map(escape).join('<br>'),
};

export async function readPartial(name) { return readFile(new URL(`src/partials/${name}.html`, root), 'utf8'); }

// Подстановки, которые выдают разметку: внутри тега (в атрибуте) — ошибка.
const MARKUP = new Set(['catalog', 'compare', 'cars', 'todo', 'icon', 'program-includes', 'mobile-cta']);
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
        return MOBILE_CTA[entry.cta]();
      }
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
