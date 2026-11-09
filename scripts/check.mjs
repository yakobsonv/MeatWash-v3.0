// npm run check — проверка сайта Meat Auto без браузера (план §4.9, §6.2 WP7, §6.4 п. 1, 14, 15;
// поправки критика 7, 12, 16, 26, 29, 30). Работает по собранному dist и по источникам.
//
//   node scripts/check.mjs            ошибки → FAIL; пометки «нужно от клиента», реквизиты
//                                     оператора, нет og-картинки — предупреждения
//   node scripts/check.mjs --release  то же, но и предупреждения — FAIL (боевой пакет:
//                                     ни одной пометки и ни одной недописанной подстановки)
//
// Что проверяется (FAIL всегда):
//   сборка   dist/*.html, sitemap.xml, js/data.js совпадают с тем, что даёт npm run build;
//            нет оставшихся «{{» / «}}»; файл Вебмастера соответствует JSON;
//   ссылки   адреса страниц без .html, главная — ./, страница и якорь существуют, файлы есть
//            (src, href, srcset, url() в CSS страницы); полные адреса https://meatwash.ru/…;
//            kit.html — ни откуда не ссылается и не в sitemap;
//   мета     свой title и description ≤ 160, один h1, canonical и og:url, JSON-LD читается,
//            data-theme у <html> и theme-color — по теме реестра; цены «от N ₽» в description
//            и в тексте — из каталога;
//   шрифт    preload и @font-face — один адрес manrope-vf.woff2?v=… (поправка 28);
//   §4.9     href="privacy", блок analytics, mw-metrika и yandex-verification = JSON, кода
//            Метрики в разметке нет, analytics.js в графе модулей; обе ссылки онлайн-записи —
//            только в окнах (форма заявки, мелкой строкой), вне окон YCLIENTS нет; «На карте»
//            в подвале; карты студий без <iframe>; заявка (согласие, «До 5 фото», ловушка,
//            ym-hide-content / ym-disable-keys); Вебвизор назван в уведомлении и документах;
//            клубная карта ведёт на wahelp;
//   заявки   (Влад 05.11) все призывы — «Записаться онлайн»: кнопки data-request / data-book с этой
//            подписью, кнопка в шапке и нижняя кнопка на телефоне — data-request с темой страницы;
//            data-request-category — тема (site.requests.topics) или категория каталога; каждая
//            позиция каталога входит в тему;
//   Роман    имени и личного Telegram нет нигде (текст, атрибуты, мета, JSON-LD), кроме реквизитов
//            оператора ПДн (site.operator.name) в privacy / consent / consent-request;
//   отзывы   reviews в JSON: дата среза, рейтинги студий, авторы «Имя И.» или «Клиент», без имён
//            сотрудников и Романа; блок на странице — как в JSON; работы и направления — страницы,
//            машины, позиции каталога и файлы есть;
//   ключи    data-price-item / data-yc-items / data-request-services — названия из каталога,
//            data-book-context — без неразрывных пробелов (поправка 16);
//   каталог  по смыслу (§4.3, поправка 30): 4 вкладки и панели, подразделы и якоря из JSON,
//            41 позиция с ценой и действием, 5 программ с ценами по кузову и составом,
//            сравнение программ, «Не является публичной офертой», прежние якоря;
//   данные   цены программ, категории, подразделы, позиции (перенос без потерь);
//   гараж    только на /services в #garage-3d, 3D только по нажатию (garage.js →
//            porsche3d.bundle.js), цены и названия работ — из каталога;
//   машины   2 карточки, фото и проданные — как в src/data/cars.json; счётчики на главной,
//            в шторке и на /auto — из данных; /import без телефона;
//   проекты  projects.wrap (Влад 07.11): w223, rr, g20 на /wrap и /works; у каждого фото alt, подпись,
//            файлы 800/1600 размером 4:5, обложки 3:2; фото окна — только в <template> (грузятся по открытию);
//   бренд    (Влад 09.11) имя — «MEATWASH» капсом и слитно: «Meat Wash» / «Meatwash» нет в тексте,
//            alt, aria-label, title, og и строках скриптов; прежнее имя — только в строке YCLIENTS
//            окна записи и в alternateName JSON-LD (так студии названы в YCLIENTS и Картах); знаков ↗ ✓ нет;
//            пары «до/после» подписаны «Иллюстрация, не работа студии»; «ранее Meat Wash» на
//            «О нас» — один раз; {{todo}} — только на страницах направлений, /import и /works;
//   заявка   request.js и api/request.php согласованы; секретов в коде нет.
// Владелец: WP7.
import {readFile, readdir, stat} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {REGISTRY} from '../src/content/pages.mjs';
import {buildPage, renderSitemap, renderYandexVerification, FONT, missingOperator} from './content.mjs';
import {pageSlug, SITE, humanDate} from './pages.mjs';
import {content as d, renderData, money} from './catalog.mjs';
import {cars} from './cars.mjs';
import {importDist} from './dist-module.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'), dist = resolve(root, 'dist');
const release = process.argv.includes('--release');
const errors = [], warnings = [];
const fail = (m) => errors.push(m);
const soft = (m) => (release ? errors : warnings).push(m);
const ok = (cond, m) => { if (!cond) fail(m); return Boolean(cond); };
const exists = async (p) => { try { return (await stat(p)).isFile(); } catch { return false; } };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Текст без разметки: неразрывные пробелы (typo) — обычными, сущности — знаками.
const plain = (s) => s.replace(/<\/(?:p|li|h[1-6]|div|td|th|dt|dd|section|article|header|footer|figure|figcaption|button|a|summary|label)>|<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;|\u00a0/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/[ \t\n]+/g, ' ');
const strip = (text) => text.replace(/<script\b[\s\S]*?<\/script>/g, '').replace(/<style\b[\s\S]*?<\/style>/g, '').replace(/<!--[\s\S]*?-->/g, '');
const mainOf = (text) => text.match(/<main id="main">([\s\S]*?)<\/main>/)?.[1] ?? '';

// Переходный период (05.11, шаг 1 интегратора — каркас новой структуры). Тела страниц и общие
// части, которые переписывают другие исполнители (форма — A, главная — B, тексты без Романа — E),
// ещё со старыми призывами («Записаться», «Узнать цену»), Telegram Романа и ссылками YCLIENTS.
// Нарушения ТОЛЬКО в этих местах — предупреждения (в check:release — ошибки); в шапке, шторке,
// подвале, нижней кнопке и на новых страницах — ошибки сразу. На сведении интегратор удаляет
// из списков всё, что исполнители сдали (пустые списки — цель).
// Сведение 05.11 (шаг 3): все тела и общие части сданы — списки пусты, любое нарушение — ошибка.
const PENDING_BODIES = new Set([]);
const PENDING_SHARED = new Set([]);
// Где в странице стоит позиция: общая часть (SHARED:<имя>), тело <main> или оболочка.
const placeOf = (text, at) => {
  for (const [, name, body] of text.matchAll(/<!-- SHARED:([\w-]+):START -->([\s\S]*?)<!-- SHARED:\1:END -->/g)) {
    const a = text.indexOf(`<!-- SHARED:${name}:START -->`), b = a + body.length + `<!-- SHARED:${name}:START -->`.length;
    if (at >= a && at < b) return `shared:${name}`;
  }
  const m = text.indexOf('<main id="main">'), e = text.indexOf('</main>');
  return at >= m && at < e ? 'main' : 'shell';
};
const sharedOf = (text, name) => text.match(new RegExp(`<!-- SHARED:${name}:START -->([\\s\\S]*?)<!-- SHARED:${name}:END -->`))?.[1] || '';
const pending = (file, place) => place === 'main' ? PENDING_BODIES.has(file) : place.startsWith('shared:') && PENDING_SHARED.has(place.slice(7));
// Нарушение в переходной зоне — предупреждение с пометкой, иначе ошибка.
const breach = (file, text, at, message) => {
  const place = placeOf(text, at);
  if (pending(file, place)) soft(`[переходное: ${place === 'main' ? 'тело страницы' : place}] ${message}`);
  else fail(message);
};
const REQUEST_LABEL = 'Записаться онлайн';
const topics = d.site?.requests?.topics || [];
const topicIds = new Set(topics.map((t) => t.id));

// ── Страницы и сборка ────────────────────────────────────────────────────────
const html = {}, ids = {}, byId = {};
for (const page of REGISTRY) {
  html[page.file] = await readFile(resolve(dist, page.file), 'utf8');
  ids[page.file] = new Set([...strip(html[page.file]).matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  byId[page.id] = page;
}
const files = new Set(REGISTRY.map((p) => p.file));
for (const page of REGISTRY) if (html[page.file] !== await buildPage(page)) fail(`${page.file} отстал от src/content, src/partials или данных — выполните npm run build`);
const sitemap = await readFile(resolve(dist, 'sitemap.xml'), 'utf8');
if (sitemap !== renderSitemap()) fail('sitemap.xml отстал — выполните npm run build');
if (await readFile(resolve(dist, 'js/data.js'), 'utf8') !== renderData()) fail('js/data.js отстал от meatwash-content.json — выполните npm run build');
{
  const verification = renderYandexVerification(), found = (await readdir(dist)).filter((name) => /^yandex_\w+\.html$/.test(name));
  if (!same(found, verification ? [verification.file] : [])) fail(`файлы Вебмастера в dist (${found.join(', ') || 'нет'}) не совпадают с site.analytics.webmaster — npm run build`);
  else if (verification && await readFile(resolve(dist, verification.file), 'utf8') !== verification.text) fail(`${verification.file} отстал от site.analytics.webmaster — npm run build`);
}

// ── Каталог: имена и цены ────────────────────────────────────────────────────
const groupItems = d.groups.flatMap((g) => g.items);
const itemPrice = Object.fromEntries(groupItems.map(([name, price]) => [name, price]));
// Темы заявок и их варианты без каталога (site.requests.topics) — тоже допустимые названия работ.
const itemNames = new Set([...groupItems.map(([n]) => n), ...d.groups.flatMap((g) => g.sections.map((s) => s.title)), ...d.programs.map(([n]) => n), ...(d.site?.requests?.topics || []).flatMap((t) => [t.title, ...(t.options || [])])]);
// Любая цена «от N ₽» на сайте и в description — цена позиции, программы или «от» раздела.
const catalogPrices = new Set([...d.programPrices.flat(), ...Object.entries(d.programStudioPrices || {}).filter(([k]) => k !== "_comment").flatMap(([, v]) => Object.values(v).flat()), ...groupItems.map(([, p]) => p).filter((p) => p != null)]);
const priceIn = (text) => [...plain(text).matchAll(/от (\d{1,3}(?: \d{3})*) ₽/g)].map((m) => Number(m[1].replace(/\D/g, '')));

// ── Страницы: ссылки, мета, контракты ────────────────────────────────────────
const pageOf = (path) => { const name = path.replace(/^\.\//, ''); return name === '' || name === '.' ? 'index.html' : /\.\w+$/.test(name.split('/').pop()) ? null : name + '.html'; };
// «Бумага»: строка браузера — цвета шапки (тёмная полоса с белым быком), а не слоновой кости под ней.
const THEME_COLOR = {dark: '#080808', paper: '#080808', home: '#080808'};
const TODO_PAGES = new Set(['wash.html', 'detailing.html', 'wrap.html', 'bodywork.html', 'import.html', 'works.html']);
const site = d.site?.analytics || {};
const titles = new Map(), descriptions = new Map(), todos = [];
let links = 0;
const cssChecked = new Set();

for (const page of REGISTRY) {
  const file = page.file, text = html[file], body = strip(text);
  // Подстановки и пометки (поправка 7)
  const left = body.match(/.{0,40}(\{\{|\}\}).{0,40}/);
  if (left) fail(`${file}: осталась подстановка: …${left[0]}…`);
  for (const [, what] of text.matchAll(/<span class="todo"[^>]*>\[нужно от клиента: ([^\]]*)\]<\/span>/g)) {
    todos.push(`${file}: ${what}`);
    if (!TODO_PAGES.has(file) && file !== 'kit.html') fail(`${file}: пометка «нужно от клиента» — они допустимы только на страницах направлений, /import и /works: ${what}`);
  }
  for (const [, what] of text.matchAll(/<span class="doc-todo">\[([^\]]*)\]<\/span>/g)) soft(`${file}: не заполнены реквизиты оператора — ${what}`);
  // Мета
  const title = text.match(/<title>([^<]+)<\/title>/)?.[1], description = text.match(/<meta name="description" content="([^"]+)"/)?.[1];
  if (!title || !description) fail(`${file}: нет title или description`);
  else {
    if (titles.has(title)) fail(`${file}: title повторяет ${titles.get(title)}`); titles.set(title, file);
    if (descriptions.has(description)) fail(`${file}: description повторяет ${descriptions.get(description)}`); descriptions.set(description, file);
    const len = plain(description).length;
    if (len > 160) fail(`${file}: description длиннее 160 знаков (${len})`);
    for (const price of priceIn(description)) if (!catalogPrices.has(price)) fail(`${file}: в description цена от ${price} ₽ не из каталога`);
  }
  const seen = new Set();
  for (const [, id] of body.matchAll(/\bid="([^"]+)"/g)) { if (seen.has(id)) fail(`${file}: id="${id}" повторяется`); seen.add(id); }
  const h1 = [...text.matchAll(/<h1\b/g)].length;
  if (h1 !== 1) fail(`${file}: h1 на странице — ${h1}, нужен ровно один`);
  const url = SITE + pageSlug(file);
  if (!text.includes(`<link rel="canonical" href="${url}">`)) fail(`${file}: canonical должен быть ${url}`);
  if (!text.includes(`<meta property="og:url" content="${url}">`)) fail(`${file}: og:url должен быть ${url}`);
  for (const [, json] of text.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) { try { JSON.parse(json); } catch (e) { fail(`${file}: JSON-LD не читается: ${e.message}`); } }
  const theme = page.theme || 'dark';
  if (!text.includes(`<html lang="ru" data-theme="${theme}">`)) fail(`${file}: <html> без data-theme="${theme}" (поправка 24)`);
  if (!text.includes(`<meta name="theme-color" content="${THEME_COLOR[theme]}">`)) fail(`${file}: theme-color не по теме ${theme}`);
  if (!text.includes(`<body data-page="${page.id}" data-kind="${page.kind}">`) || !text.includes('<a class="skip-link" href="#main">')) fail(`${file}: нет body[data-page][data-kind] или ссылки «Перейти к содержанию»`);
  if (page.robots && !text.includes(`<meta name="robots" content="${page.robots}">`)) fail(`${file}: нет <meta name="robots" content="${page.robots}">`);
  const og = text.match(/<meta property="og:image" content="([^"]+)">/)?.[1];
  if (!og) fail(`${file}: нет og:image`);
  else if (!await exists(resolve(dist, og.replace(SITE, '')))) soft(`${file}: нет файла og:image ${og}`);
  // Шрифт: один адрес в preload и @font-face
  const pre = text.match(/<link rel="preload" href="([^"]+)" as="font"/)?.[1], face = text.match(/@font-face\{[^}]*src:url\('([^']+)'\)/)?.[1];
  if (!pre || pre !== face || !pre.startsWith(FONT + '?v=')) fail(`${file}: адрес шрифта в preload (${pre}) и @font-face (${face}) должен совпадать и быть ${FONT}?v=…`);
  if ((text.match(/@font-face/g) || []).length !== 1) fail(`${file}: @font-face должен быть один — в <head>`);
  if (/arsenal/i.test(text)) fail(`${file}: ссылка на шрифт Arsenal`);
  // Ссылки и файлы
  const urls = [...text.matchAll(/(?:src|href|data-static-src)="([^"]+)"/g)].map((m) => m[1]);
  for (const [, set] of text.matchAll(/(?:srcset|imagesrcset)="([^"]+)"/g)) urls.push(...set.split(',').map((part) => part.trim().split(/\s+/)[0]));
  for (const raw of urls) {
    if (/^(https?:|tel:|mailto:|data:)/.test(raw) || raw.includes(' ')) continue;
    links++;
    const [path, hash] = raw.split('#');
    if (path === '' && hash !== undefined) { if (hash !== '' && !ids[file].has(hash)) fail(`${file}: нет якоря #${hash}`); continue; }
    const clean = path.split('?')[0];
    if (clean.startsWith('/')) { fail(`${file}: адрес от корня сайта — нужен относительный: ${raw}`); continue; }
    if (/\.html$/.test(clean)) { fail(`${file}: ссылка на страницу с .html — нужен адрес без расширения: ${raw}`); continue; }
    if (/^(\.\/)?index$/.test(clean)) { fail(`${file}: ссылка на главную — ./ (не index): ${raw}`); continue; }
    const target = pageOf(clean);
    if (target) {
      if (!files.has(target)) { fail(`${file}: ссылка на несуществующую страницу ${raw}`); continue; }
      if (target === 'kit.html' && file !== 'kit.html') fail(`${file}: ссылка на служебную kit.html`);
      if (hash && !ids[target].has(hash)) fail(`${file}: в ${target} нет якоря #${hash} (${raw})`);
      continue;
    }
    if (!await exists(resolve(dist, clean.replace(/^\.\//, '')))) fail(`${file}: нет файла ${raw}`);
  }
  for (const [address] of text.matchAll(/https?:\/\/(?:www\.)?meatwash\.ru(?:\/[^"'\s<>\\]*)?/g)) {
    const u = address.replace(/[.,;:)»]+$/, '');
    if (!u.startsWith(SITE) && u !== SITE.slice(0, -1)) { fail(`${file}: адрес сайта — ${SITE}… (https, без www): ${u}`); continue; }
    const [rest, hash] = u.slice(SITE.length).split('#'), path = rest.split('?')[0];
    if (/\.\w+$/.test(path)) {
      if (/\.html$/.test(path) && !/^yandex_\w+\.html$/.test(path)) { fail(`${file}: адрес страницы с .html: ${u}`); continue; }
      if (!await exists(resolve(dist, path))) (/^assets\/img\/.*og[\w-]*\.webp$/.test(path) ? soft : fail)(`${file}: нет файла ${u}`);
      continue;
    }
    const target = path === '' ? 'index.html' : path + '.html';
    if (path === 'index' || !files.has(target)) { fail(`${file}: адрес несуществующей страницы ${u}`); continue; }
    if (target === 'kit.html' && file !== 'kit.html') fail(`${file}: полный адрес служебной kit`);
    if (hash && !ids[target].has(hash)) fail(`${file}: в ${target} нет якоря #${hash} (${u})`);
  }
  // url() в CSS страницы — файлы есть
  for (const [, name] of text.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="css\/([^"?]+)"/g)) {
    if (cssChecked.has(name)) continue; cssChecked.add(name);
    const css = await readFile(resolve(dist, 'css', name), 'utf8');
    for (const [, u] of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/url\(['"]?([^)'"\s]+)['"]?\)/g)) {
      if (/^(data:|#|https?:)/.test(u)) continue;
      if (!await exists(resolve(dist, 'css', u.split(/[?#]/)[0]))) fail(`css/${name}: нет ${u}`);
    }
  }
  // Контракты §4.9
  if (!text.includes('href="privacy"')) fail(`${file}: нет ссылки href="privacy"`);
  if (!text.includes('<!-- SHARED:analytics:START -->')) fail(`${file}: нет блока analytics в <head>`);
  if (!site.metrika !== !text.includes(`<meta name="mw-metrika" content="${site.metrika}">`)) fail(`${file}: номер счётчика Метрики не совпадает с JSON`);
  if (!site.webmaster !== !text.includes(`<meta name="yandex-verification" content="${site.webmaster}">`)) fail(`${file}: код Вебмастера не совпадает с JSON`);
  if (/mc\.yandex\.ru|metrika\/tag\.js/.test(text)) fail(`${file}: код Метрики в разметке — она грузится только после согласия (analytics.js)`);
  // Онлайн-запись YCLIENTS (Влад 05.11) — только мелкой строкой в форме заявки: ссылки обеих
  // студий есть в окнах (dialog.dialog) каждой страницы, вне окон их нет (шторка — тоже не окно).
  const dialogsOnly = [...text.matchAll(/<dialog class="dialog\b[\s\S]*?<\/dialog>/g)].map((m) => m[0]).join('\n');
  for (const [u] of text.replace(/<dialog class="dialog\b[\s\S]*?<\/dialog>/g, (m) => ' '.repeat(m.length)).matchAll(/https?:\/\/[\w.-]*yclients\.com[^"'\s<)\\]*/g)) breach(file, text, text.indexOf(u), `${file}: ссылка YCLIENTS вне формы заявки ${u} — онлайн-запись только мелкой строкой в окне`);
  for (const l of d.locations) {
    if (!dialogsOnly.includes(`href="${l.booking}"`)) fail(`${file}: в окнах нет ссылки онлайн-записи ${l.name} (${l.booking})`);
    const map = page.shared.includes('locations') ? '' : 'about';
    if (!text.includes(`<a class="footer__map" href="${map}#map-${l.id}" data-map-link="${l.id}">`)) fail(`${file}: в подвале нет «На карте» ${l.id} по контракту (href="${map}#map-${l.id}")`);
    if (!plain(text).includes(l.phone)) fail(`${file}: нет телефона студии ${l.name} (${l.phone})`);
  }
  for (const [u] of text.matchAll(/https?:\/\/[\w.-]*yclients\.com[^"'\s<)\\]*/g)) if (!d.locations.some((l) => l.booking === u)) fail(`${file}: неожиданная ссылка YCLIENTS ${u}`);
  if (page.shared.includes('locations')) {
    for (const l of d.locations) {
      const at = text.indexOf(`id="map-${l.id}"`), block = at < 0 ? '' : text.slice(at, text.indexOf('</article>', at));
      if (!/^id="map-[\w-]+"[^>]*data-map-embed="/.test(block) || !block.includes(`data-map-embed="${l.id}"`)) fail(`${file}: карта ${l.id} — у области первым атрибутом id="map-${l.id}", затем data-map-embed="${l.id}"`);
      if (!block.includes(`location__external" href="${l.map}"`)) fail(`${file}: у карты ${l.id} нет запасной ссылки на карточку в Яндекс Картах`);
    }
  }
  if (/<iframe\b/i.test(text) || /map-widget/.test(text)) fail(`${file}: iframe карты в разметке — его создаёт maps.js`);
  if (/map-dialog|data-map="/.test(text)) fail(`${file}: остатки окна карты (map-dialog, data-map)`);
  if (/id="(mobile-menu|burger)"/.test(text)) fail(`${file}: остатки старого меню (#mobile-menu, #burger)`);
  // Ключи корзины и окна записи — побуквенно из каталога (поправка 16)
  for (const [, attr, value] of text.matchAll(/\b(data-price-item|data-yc-items|data-request-services|data-book-context|data-yc-programs)="([^"]*)"/g)) {
    // typo() пишет &nbsp; — в атрибуте его быть не должно; U+00A0 в цене контекста ставит money() (разряды).
    if (attr === 'data-book-context') { if (/&nbsp;|&#160;/.test(value)) fail(`${file}: &nbsp; в ${attr}="${value}"`); continue; }
    if (/\u00a0|&nbsp;|&#160;/.test(value)) { fail(`${file}: неразрывный пробел в ${attr}="${value}"`); continue; }
    if (attr === 'data-yc-programs') continue;
    for (const name of value.split('|').map((s) => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'"))) if (name && !itemNames.has(name)) fail(`${file}: ${attr}: «${name}» нет в каталоге`);
  }
  // Цены «от N ₽» в тексте — из каталога
  for (const price of priceIn(body)) if (!catalogPrices.has(price)) fail(`${file}: цена от ${money(price)} не из каталога`);
  // Бренд (поправка 12): текст, атрибуты, og, JSON-LD — без старого имени
  const brandText = text.replace(/<!--[\s\S]*?-->/g, '').replace(/MeatWash\.detailing@gmail\.com/gi, '')
    .replace(/"alternateName":"Meat Wash"/g, '').replace('YCLIENTS <span class="nw">(<span lang="en">Meat Wash</span>)</span>', '');
  const old = brandText.match(/.{0,30}(\bMeat(?:\s|&nbsp;|&#160;)+Wash\b|\bMeatwash\b|\bMeatWash\b).{0,30}/);
  if (old) fail(`${file}: старое имя: …${old[0].trim()}…`);
  const glyph = plain(body).match(/.{0,20}[↗✓].{0,20}/);
  if (glyph) fail(`${file}: знак ↗ или ✓ в тексте (нет в Manrope — иконка спрайта): …${glyph[0].trim()}…`);
  // Постановочные пары «до/после» подписаны (решение Влада 27.10, поправка 9)
  for (const [figure] of text.matchAll(/<figure\b[^>]*\bdata-ba\b[\s\S]*?<\/figure>/g)) if (!plain(figure).includes('Иллюстрация, не работа студии')) fail(`${file}: пара «до/после» без подписи «Иллюстрация, не работа студии»`);
  // Окна (заявка с фото — §4.7)
  if (page.shared.includes('dialogs')) {
    for (const need of ['<input type="checkbox" name="consent" required', 'href="consent-request"', 'id="request"']) if (!text.includes(need)) fail(`${file}: в окнах нет ${need}`);
    if (!/<div class="visually-hidden" aria-hidden="true"><label>[^<]*<input name="mw_extra" tabindex="-1" autocomplete="off"><\/label><\/div>/.test(text)) fail(`${file}: в заявке нет ловушки mw_extra (скрыта, вне Tab и скринридера)`);
    const form = text.match(/<form class="request[^"]*"[\s\S]*?<\/form>/)?.[0] || '';
    if (!/<form class="request[^"]*\bym-hide-content\b/.test(form)) fail(`${file}: у формы заявки нет ym-hide-content — Вебвизор покажет текст`);
    for (const field of form.match(/<(?:input|textarea)\b[^>]*>/g) || []) {
      if (/type="(?:radio|checkbox|file)"|name="mw_extra"/.test(field)) continue;
      if (!/\bym-disable-keys\b/.test(field)) fail(`${file}: поле заявки без ym-disable-keys: ${field.slice(0, 80)}`);
    }
    if (!text.includes('Онлайн-запись откроется в YCLIENTS (Meat Wash)') && !plain(text).includes('Онлайн-запись откроется в YCLIENTS (Meat Wash)')) fail(`${file}: в окне записи нет строки «Онлайн-запись откроется в YCLIENTS (Meat Wash)» (поправка 17)`);
  }
  if (!plain(text).includes('Instagram принадлежит компании Meta, которая признана экстремистской организацией и запрещена на территории РФ.')) fail(`${file}: нет пометки о Meta в подвале`);
  // «Записаться онлайн» (Влад 05.11): каждая кнопка заявки или записи — с этой подписью
  // (продолжение для диктора — в .sr), тема — из site.requests.topics или категория каталога.
  const clean = text.replace(/<!--[\s\S]*?-->/g, (m) => ' '.repeat(m.length));
  for (const m of clean.matchAll(/<(button|a)\b([^>]*\sdata-(?:request|book)(?=[\s>=])[^>]*)>([\s\S]*?)<\/\1>/g)) {
    const [tag, , attrs, inner] = m;
    const label = plain(inner.replace(/<span class="sr">[\s\S]*?<\/span>/g, '')).trim();
    if (!label.startsWith(REQUEST_LABEL)) breach(file, text, m.index, `${file}: кнопка заявки «${label.slice(0, 40)}» — подпись должна быть «${REQUEST_LABEL}»: ${tag.slice(0, 90)}`);
    const category = attrs.match(/\bdata-request-category="([^"]*)"/)?.[1];
    if (category && !topicIds.has(category) && !d.groups.some((g) => g.id === category)) fail(`${file}: data-request-category="${category}" — не тема из site.requests.topics и не категория каталога`);
  }
  // Кнопка в шапке, «Записаться онлайн» в шторке и подвале, нижняя кнопка — заявка с темой страницы.
  if (page.shared.includes('header')) {
    const want = `type="button" data-request data-request-category="${page.topic || ''}">${REQUEST_LABEL}<`;
    ok(text.includes(`<button class="site-header__book btn btn--compact btn--secondary" ${want}`), `${file}: кнопка в шапке — не «${REQUEST_LABEL}» с темой «${page.topic || ''}»`);
    ok(text.includes(`<button class="btn btn--primary btn--block" ${want}`), `${file}: в шторке нет «${REQUEST_LABEL}» с темой страницы`);
    ok(!/t\.me\/(?!MEATWASH_Auto|meat_wash\/)/.test(sharedOf(text, 'header') + sharedOf(text, 'footer')), `${file}: в шапке или подвале ссылка на личный Telegram`);
  }
  if (page.cta === 'request') ok(text.includes(`<button class="btn btn--primary mobile-cta" ${`type="button" data-request data-request-category="${page.topic || ''}">${REQUEST_LABEL}<`}`), `${file}: нижняя кнопка на телефоне — не «${REQUEST_LABEL}» с темой страницы`);
  // Главная — без нижней кнопки, как прежняя главная (Влад 05.11: «главная как была»): заявка в шапке видна и на телефоне.
  else if (!(page.id === 'home' && page.cta === 'none' && !text.includes('mobile-cta'))) fail(`${file}: нижняя кнопка — cta: 'request' на всех страницах, кроме главной (там cta: 'none')`);
  if (page.topic && !topicIds.has(page.topic)) fail(`${file}: topic «${page.topic}» — нет такой темы в site.requests.topics`);
  // Роман (Влад 05.11): ни имени, ни личного Telegram — кроме реквизитов оператора ПДн в документах.
  {
    let scan = clean;
    // Реквизиты оператора (152-ФЗ) — как их выводит {{op:name}}: после typo() пробелы могут быть неразрывными.
    const operator = d.site?.operator?.name && new RegExp(esc(d.site.operator.name).split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(?:\\s|&nbsp;|\u00a0)+'), 'g');
    if (['privacy.html', 'consent.html', 'consent-request.html'].includes(file) && operator) scan = scan.replace(operator, (m) => ' '.repeat(m.length));
    for (const m of scan.matchAll(/Роман|Антонович|otec_roman/g)) breach(file, text, m.index, `${file}: «${m[0]}» на странице — имя убрано со всего сайта (кроме реквизитов оператора в документах): …${plain(scan.slice(Math.max(0, m.index - 40), m.index + 40)).trim()}…`);
  }
}
for (const t of todos) soft(`нужно от клиента — ${t}`);

// ── Каталог /services по смыслу (§4.3, поправка 30) ──────────────────────────
const services = html['services.html'];
{
  const tabs = [...services.matchAll(/<a class="anchor-tabs__tab catalog__tab" id="tab-price-([a-z]+)" href="#price-\1">([^<]+)<\/a>/g)].map((m) => [m[1], m[2]]);
  ok(same(tabs, d.groups.map((g) => [g.id, esc(g.title)])), 'services.html: вкладки каталога не совпадают с четырьмя категориями JSON (порядок, названия, href)');
  ok(services.includes('data-catalog-tabs'), 'services.html: нет [data-catalog-tabs]');
  const panels = [...services.matchAll(/<section class="catalog__panel" id="price-([a-z]+)" data-category="\1"/g)];
  ok(same(panels.map((m) => m[1]), d.groups.map((g) => g.id)), 'services.html: панели категорий не совпадают с JSON');
  const end = services.indexOf('id="price-note"');
  ok(end > 0 && plain(services.slice(end, services.indexOf('</p>', end))).includes('Не является публичной офертой'), 'services.html: нет «Не является публичной офертой» под каталогом');
  d.groups.forEach((group, gi) => {
    if (!panels[gi]) return;
    const panel = services.slice(panels[gi].index, gi + 1 < panels.length ? panels[gi + 1].index : end);
    ok(panel.includes(`id="price-${group.id}-title">${esc(group.title)}</h2>`) && plain(panel).includes(plain(esc(group.desc))), `Категория ${group.id}: нет заголовка или подписи`);
    const sections = [...panel.matchAll(/<section class="catalog__section([^"]*)" id="([a-z0-9-]+)"/g)];
    ok(same(sections.map((m) => [m[2], m[1].includes('--accent')]), group.sections.map((s) => [s.id, Boolean(s.accent)])), `Категория ${group.id}: подразделы не совпадают с JSON (порядок, якоря, выделение)`);
    group.sections.forEach((section, si) => {
      if (!sections[si]) return;
      const block = panel.slice(sections[si].index, si + 1 < sections.length ? sections[si + 1].index : panel.length);
      ok(plain(block.match(new RegExp(`id="${section.id}-title">([\\s\\S]*?)</h3>`))?.[1] || '') === section.title, `Подраздел ${section.id}: нет заголовка h3 «${section.title}»`);
      for (const name of section.items || []) {
        if (section.programs) continue;
        const [, price] = group.items.find(([n]) => n === name);
        const row = block.match(new RegExp(`<li class="catalog__item" data-price-item="${esc(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">[\\s\\S]*?</li>`))?.[0];
        if (!ok(row, `Нет позиции «${name}» в подразделе ${section.id}`)) continue;
        ok(plain(row).includes(price == null ? 'После оценки' : `от ${money(price).replace(/\u00a0/g, ' ')}`), `«${name}»: цена не как в JSON (${price ?? 'после оценки'})`);
        if (section.onsite) ok(!/data-book|data-request/.test(row) && plain(row).includes('добавим при приёмке'), `«${name}»: работа на месте — без кнопки, с подписью «добавим при приёмке»`);
        else if (group.booking === 'yclients') ok(row.includes(`data-book data-book-context="${esc(name)}" data-yc-items="${esc(name)}"`), `«${name}»: нет заявки на автомойку с работой (data-book, корзина онлайн-записи)`);
        else ok(row.includes(`data-request data-request-category="${group.id}" data-request-services="${esc(name)}"`), `«${name}»: нет «${REQUEST_LABEL}» с работой`);
        if (!section.onsite) ok(plain(row).includes(REQUEST_LABEL), `«${name}»: подпись кнопки — «${REQUEST_LABEL}»`);
      }
    });
    if (group.booking === 'yclients') ok(/data-book/.test(panel) && !/data-request/.test(panel), `Категория ${group.id}: у автомойки — data-book (форма с программой и онлайн-записью), без data-request`);
    else ok(/data-request/.test(panel) && !/data-book/.test(panel), `Категория ${group.id}: нужна «${REQUEST_LABEL}» (data-request), без data-book`);
  });
  const itemCount = groupItems.length;
  ok([...services.matchAll(/data-price-item=/g)].length === itemCount, `services.html: позиций в каталоге не ${itemCount}`);
  // Программы: цена по кузову, состав в details#program-i, запись с программой
  const progBlock = services.slice(services.indexOf('id="programs"'), services.indexOf('id="price-wash-extras"'));
  d.programs.forEach(([name], i) => {
    ok([...progBlock.matchAll(/<h4 class="program-card__name">([\s\S]*?)<\/h4>/g)].map((m) => plain(m[1]))[i] === name, `Программа ${i} «${name}»: нет карточки`);
    const shown = progBlock.match(new RegExp(`data-prices="${d.programPrices[i].join(',')}">([^<]*)<`))?.[1];
    ok(shown != null && plain(shown) === plain(money(d.programPrices[i][0])), `Программа ${i}: цены по кузову не из JSON`);
    const list = progBlock.match(new RegExp(`<details class="[^"]*" id="program-${i}">[\\s\\S]*?<ul class="program-includes">([\\s\\S]*?)</ul>`))?.[1] || '';
    ok(same([...list.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => plain(m[1])), d.programIncludes[i]), `Программа ${i}: состав в details#program-${i} не как в JSON`);
    ok(progBlock.includes(`data-book data-program="${i}"`), `Программа ${i}: нет записи с программой`);
  });
  ok([...progBlock.matchAll(/<input type="radio" name="body-type" value="(\d)"/g)].length === d.bodyTypes.length && progBlock.includes('id="body-price-label"'), 'services.html: нет переключателя кузова (4) или #body-price-label');
  // Сравнение программ: столбцы — программы, строки — состав, цены — из JSON
  const compare = progBlock.match(/<div class="compare" id="compare">[\s\S]*?<\/table>/)?.[0] || '';
  if (ok(compare, 'services.html: нет сравнения программ (#compare)')) {
    const heads = [...(compare.match(/<thead>([\s\S]*?)<\/thead>/)?.[1] || '').matchAll(/<th scope="col">([\s\S]*?)<\/th>/g)].map((m) => plain(m[1]).trim()).filter((h) => h !== 'Работа');
    ok(same(heads, d.programs.map(([n]) => n)), 'Сравнение: столбцы не совпадают с программами');
    for (let i = 0; i < d.programs.length; i++) ok(compare.includes(`data-prices="${d.programPrices[i].join(',')}"`), `Сравнение: нет цен программы ${i}`);
    ok(compare.includes('data-compare-only'), 'Сравнение: нет переключателя «Только различия»');
  }
  // Прежние якоря (статьи, закладки, поиск, шторка, §1.7)
  for (const id of ['catalog', 'price-list', 'programs', ...d.programs.map((_, i) => `program-${i}`), ...d.groups.map((g) => `price-${g.id}`), ...d.groups.flatMap((g) => g.sections.map((s) => s.id)), 'proof', 'individual', 'garage-3d'])
    ok(ids['services.html'].has(id), `services.html: нет якоря #${id}`);
}

// ── Якоря §1.7 на остальных страницах ────────────────────────────────────────
const ANCHORS = {
  // #founder снят 05.11: блок основателя убирается (имя — со всего сайта).
  'about.html': ['visit-locations', 'map-myasnitskaya', 'map-technopark', 'before-visit', 'club', 'path', 'studios', 'team', 'membership'],
  'auto.html': ['for-sale', 'sold', 'sell', 'auto-contact', ...cars.forSale.map((c) => c.id)],
  'import.html': ['what', 'rusifikaciya', 'prep', 'for-sale-link', 'contact'],
  'wrap.html': ['wrap-kind', 'wrap-prices', 'wrap-steps', 'wrap-works', 'wrap-call'],
  'works.html': ['works-lotus', 'works-wrap', 'works-m4', 'works-studio'],
  'index.html': ['top', 'contacts'],
};
for (const [file, list] of Object.entries(ANCHORS)) for (const id of list) ok(ids[file].has(id), `${file}: нет якоря #${id} (§1.7)`);

// ── Данные и цены (meatwash-content.json) ────────────────────────────────────
ok(d.programs.length === 5 && d.bodyTypes.length === 4, 'Программ мойки — 5, типов кузова — 4');
// Литерал — сознательно: правка цены — это JSON и эта строка (поправка 15), чтобы цена не уехала молча.
ok(same(d.programPrices, [[2150, 2250, 2450, 2650], [2850, 3150, 3450, 4250], [4950, 5450, 5950, 6450], [6450, 7450, 8450, 9450], [13950, 14950, 15950, 16950]]), 'programPrices изменились — сверьте с YCLIENTS и поправьте литерал в scripts/check.mjs');
ok(same(d.groups.map((g) => [g.id, g.title, g.booking]), [['wash', 'Автомойка', 'yclients'], ['detailing', 'Детейлинг', 'request'], ['wrap', 'Оклейка', 'request'], ['protection', 'Защита', 'request'], ['help', 'Помощь', 'request']]), 'Категории: ровно пять — Автомойка, Детейлинг, Оклейка, Защита, Помощь (Влад 29.10: оклейка — своя вкладка) — со своим сценарием записи');
{
  const MIGRATED = ['Заправка омывающей жидкости', 'Обезжиривание кузова и удаление реагентов', 'Очистка кузова от битума', 'Обработка резинок и уплотнителей силиконом', 'Удаление металлических вкраплений', 'Пылесос салона', 'Чистка багажника', 'Химчистка отдельного элемента', 'Химчистка руля', 'Химчистка сиденья', 'Озонация салона', 'Сухой туман', 'Детейлинг-химчистка салона', 'Очистка кондиционера', 'Кондиционер кожи сидений', 'Восстановление пластика салона', 'Химчистка и защита кожи кремом LeTech', 'Керамика кожи салона', 'Локальная полировка элемента', 'Восстановление хрома', 'Полировка фар', 'Полировка кузова + 2 слоя керамики', 'Защитное кварцевое покрытие кузова', 'Керамическое покрытие кузова', 'Керамика дисков', 'Оклейка зон риска', 'Полная оклейка', 'Оклейка фар плёнкой', 'Ремонт автомобильных стёкол', 'Бронирование лобового стекла', 'Антидождь передней полусферы', 'Антидождь всех стёкол автомобиля', 'Химчистка радиаторов', 'Детейлинг моторного отсека', 'Детейлинг дисков', 'Детейлинг подвески', 'Удаление сколов и подкраска', 'Удаление вмятин PDR', 'Локальный окрас элемента', 'Предпродажная подготовка', 'Порошковая покраска дисков'];
  const names = groupItems.map(([n]) => n);
  ok(new Set(names).size === names.length, 'Позиция каталога повторяется в двух категориях');
  ok(names.length === 41, `В каталоге ${names.length} позиций — ожидается 41 (инвентарь §9)`);
  for (const name of MIGRATED) ok(name in itemPrice, `Потеряна позиция каталога: ${name}`);
  for (const group of d.groups) {
    const inSections = group.sections.flatMap((s) => s.items || []);
    ok(same([...inSections].sort(), group.items.map(([n]) => n).sort()), `Категория ${group.id}: подразделы не совпадают с позициями`);
    for (const s of group.sections) ok(/^(programs|price-[a-z-]+)$/.test(s.id) && s.title && (!s.programs || group.id === 'wash') && (!s.onsite || group.booking === 'yclients' && !s.programs), `Подраздел ${s.id} в ${group.id}: id, программы только в «Мойке», onsite только у работ мойки`);
  }
  for (const [name, price, about] of groupItems) {
    ok(price == null || Number.isInteger(price) && price > 0, `«${name}»: цена — целое число или null (после оценки)`);
    ok(typeof about === 'string' && about.length > 5 && about.length <= 120, `«${name}»: нужно короткое пояснение (до 120 знаков)`);
  }
  ok(d.programItems.length === d.programs.length && d.programItems.flat().every((n) => n in itemPrice), 'programItems: по списку на программу, только позиции каталога');
  ok(d.programIncludes.every((list, j) => j === 0 || /^Всё из /.test(list[0])), 'Состав программы 1–4 начинается с «Всё из …» (сравнение программ)');
}

// ── Темы заявок, отзывы, плашки работ и направлений (Влад 05.11) ─────────────
{
  // Темы: id и названия уникальны, подразделы и позиции — из каталога, каждая позиция каталога
  // и каждая программа мойки входят хотя бы в одну тему (форма предлагает всё).
  ok(topics.length && new Set(topics.map((t) => t.id)).size === topics.length && topics.every((t) => /^[a-z]+$/.test(t.id) && t.title), 'site.requests.topics: темы с уникальными id (латиница) и названиями');
  ok(same(topics.map((t) => t.id), ['wash', 'detailing', 'wrap', 'bodywork', 'auto', 'import', 'club', 'other']), 'site.requests.topics: темы — автомойка, детейлинг, оклейка, кузовные работы, продажа/покупка, привоз, клуб, другое (Влад 05.11)');
  const sectionIds = new Set(d.groups.flatMap((g) => g.sections.map((x) => x.id)));
  const covered = new Set();
  for (const t of topics) {
    for (const id of t.sections || []) { if (!ok(sectionIds.has(id), `Тема ${t.id}: нет подраздела каталога ${id}`)) continue; d.groups.flatMap((g) => g.sections).find((x) => x.id === id).items?.forEach((n) => { if (!(t.except || []).includes(n)) covered.add(n); }); }
    for (const n of [...(t.items || []), ...(t.except || [])]) ok(n in itemPrice, `Тема ${t.id}: «${n}» нет в каталоге`);
    (t.items || []).forEach((n) => covered.add(n));
  }
  for (const [name] of groupItems) ok(covered.has(name), `Позиция каталога «${name}» не входит ни в одну тему заявки (site.requests.topics)`);
  ok(topics.some((t) => (t.sections || []).includes('programs')), 'Программы мойки не входят ни в одну тему заявки');

  // Отзывы (Влад 05.11): с Яндекс Карт, дата среза, рейтинги студий, без Романа и сотрудников.
  const r = d.reviews;
  if (ok(r && Array.isArray(r.items) && r.items.length && Array.isArray(r.studios), 'meatwash-content.json: нет reviews (asOf, studios, items)')) {
    const asOf = Date.parse(`${r.asOf}T00:00:00+03:00`);
    if (ok(/^\d{4}-\d{2}-\d{2}$/.test(r.asOf) && Number.isFinite(asOf), `reviews.asOf «${r.asOf}» — не дата YYYY-MM-DD`)) {
      const age = Math.floor((Date.now() - asOf) / 864e5);
      if (age > 60) soft(`отзывы и рейтинг — на ${r.asOf} (${age} дн. назад): обновить срез с Яндекс Карт (reviews в meatwash-content.json)`);
    }
    ok(same(r.studios.map((x) => x.id).sort(), d.locations.map((l) => l.id).sort()), 'reviews.studios: по записи на каждую студию из locations');
    for (const st of r.studios) {
      const l = d.locations.find((x) => x.id === st.id);
      ok(l && st.url === l.map + 'reviews/', `reviews.studios ${st.id}: ссылка — страница отзывов карточки студии (${l?.map}reviews/)`);
      ok(typeof st.rating === 'number' && st.rating >= 1 && st.rating <= 5 && Number.isInteger(st.ratingsCount) && st.ratingsCount > 0, `reviews.studios ${st.id}: рейтинг 1–5 и число оценок`);
    }
    const STAFF = /(?<![А-Яа-яЁё])(Роман\w*|Антонович\w*|Максим\w*|Павел|Павл\w+|Егор\w*|Лев|Льв\w+|Коба|Сыймык\w*|Разан\w*)(?![А-Яа-яЁё])|MEATWASH|Meatwash|\+?\d[\d\s()-]{8,}\d/;
    for (const x of r.items) {
      const who = `отзыв ${x.author} ${x.date}`;
      ok(d.locations.some((l) => l.id === x.studio), `${who}: нет студии ${x.studio}`);
      ok(/^\d{4}-\d{2}-\d{2}$/.test(x.date) && x.date <= r.asOf, `${who}: дата — YYYY-MM-DD не позже среза`);
      ok(Number.isInteger(x.rating) && x.rating >= 1 && x.rating <= 5, `${who}: оценка 1–5`);
      ok(/^(Клиент|[A-ZА-ЯЁ][a-zа-яё]+(?: [A-ZА-ЯЁ]\.)?)$/.test(x.author), `${who}: автор — имя и инициал фамилии («Сергей Л.») или «Клиент»`);
      const hit = (x.text || '').match(STAFF);
      ok(x.text && !hit, `${who}: в цитате ${hit ? `«${hit[0]}»` : 'пусто'} — имена сотрудников, Романа, старое имя и телефоны вырезать «[…]» или не брать отзыв`);
      ok(Array.isArray(x.topics) && x.topics.length && x.topics.every((t) => topicIds.has(t)), `${who}: topics — темы из site.requests.topics`);
    }
    // Блок на странице — тот же, что в JSON (подстановка reviews): дата среза, рейтинги, ссылки.
    for (const page of REGISTRY) {
      const block = html[page.file].match(/<section class="reviews" id="reviews"[\s\S]*?<\/section>/)?.[0];
      if (!block) continue;
      ok(plain(block).includes(`с Яндекс Карт на ${humanDate(r.asOf).replace(/\u00a0/g, ' ')}`), `${page.file}: у отзывов нет даты среза «на ${humanDate(r.asOf)}»`);
      for (const st of r.studios.filter((x) => block.includes(`href="${x.url}"`))) ok(plain(block).includes(`${st.rating.toFixed(1).replace('.', ',')}`), `${page.file}: рейтинг ${st.id} не из JSON`);
      const authors = [...block.matchAll(/<span class="review__author">([^<]*)<\/span>/g)].map((m) => m[1]);
      ok(authors.length && authors.every((a) => r.items.some((x) => esc(x.author) === a)), `${page.file}: отзывы на странице не из JSON (reviews)`);
      // Тексты отзывов — дословно из JSON (неразрывные пробелы после коротких слов — не правка слов).
      const quotes = [...block.matchAll(/<blockquote class="[^"]*">([\s\S]*?)<\/blockquote>/g)].map((m) => [...m[1].matchAll(/<p>([\s\S]*?)<\/p>/g)].map((q) => plain(q[1]).trim()));
      const texts = r.items.map((x) => x.text.split(/\n+/).map((t) => plain(esc(t.trim())).trim()));
      ok(quotes.length === authors.length && quotes.every((q) => texts.some((t) => same(q, t))), `${page.file}: текст отзыва на странице не совпадает с JSON дословно (reviews)`);
      ok(!/itemprop|"@type":\s*"(Review|AggregateRating)"/.test(html[page.file]), `${page.file}: разметка Review/AggregateRating — не ставим (отзывы с чужой площадки)`);
    }
    if (!html['index.html'].includes('<section class="reviews" id="reviews"')) soft('[переходное: тело страницы] index.html: на главной нет блока отзывов (подстановка reviews)');
  }

  // Плашки работ и направлений: страница из реестра, позиция каталога, машина, файлы кадров.
  const tiles = [...Object.entries(d.works || {}).filter(([k, v]) => k !== '_comment' && Array.isArray(v)).flatMap(([k, v]) => v.map((x) => [`works.${k}`, x])), ...(d.directions?.items || []).map((x) => [`directions.${x.id}`, x])];
  ok(same(Object.keys(d.works || {}).filter((k) => k !== '_comment'), ['home', 'wash', 'detailing', 'wrap', 'bodywork', 'sales', 'about']), 'works: ряды home (один ряд на главной), wash, detailing, wrap, bodywork, sales, about');
  ok(same((d.directions?.items || []).map((x) => x.id), ['wash', 'detailing', 'wrap', 'bodywork', 'sales', 'about']), 'directions: шесть направлений в порядке Влада (05.11)');
  for (const [where, x] of tiles) {
    const target = byId[x.page];
    if (!ok(target, `${where}: нет страницы «${x.page}»`)) continue;
    if (x.hash && !ids[target.file].has(x.hash)) soft(`${where}: на ${target.file} пока нет якоря #${x.hash} — страницу пишет исполнитель (на странице с плашкой это ошибка)`);
    if (x.car) { ok([...cars.forSale, ...cars.sold].some((c) => c.id === x.car), `${where}: нет машины ${x.car} в cars.json`); continue; }
    if (x.img) {
      ok(x.alt && x.title, `${where}: у кадра нужны title и alt`);
      for (const w of x.widths || [800, 1240]) if (!await exists(resolve(dist, `${x.img}-${w}.webp`))) soft(`${where}: нет файла ${x.img}-${w}.webp (кадры кладёт исполнитель фото; на странице с плашкой это ошибка)`);
      if (x.price) ok(x.price in itemPrice, `${where}: price «${x.price}» — нет такой позиции в каталоге`);
    } else ok(x.title && x.price in itemPrice, `${where}: плашка без фото — title и price (позиция каталога)`);
  }
}

// ── Проекты с галереей (projects, Влад 07.11): данные, файлы, размеры, разметка страниц ──
{
  const sharp = (await import('sharp')).default;
  const size = async (path) => { const m = await sharp(resolve(dist, path)).metadata(); return [m.width, m.height]; };
  const PROJECT_PAGES = {wrap: ['wrap.html', 'works.html']};
  ok(same(Object.keys(d.projects || {}).filter((k) => k !== '_comment'), Object.keys(PROJECT_PAGES)), `projects: ряды ${Object.keys(PROJECT_PAGES).join(', ')}`);
  for (const [dir, pages] of Object.entries(PROJECT_PAGES)) {
    const list = d.projects?.[dir] || [];
    ok(same(list.map((p) => p.id), ['w223', 'rr', 'g20']), `projects.${dir}: три проекта — w223, rr, g20 (Влад 07.11)`);
    for (const p of list) {
      const where = `projects.${dir}.${p.id}`;
      ok(p.title && p.lead && p.cover && p.photos?.length, `${where}: нужны title, lead, cover и photos`);
      for (const [w, dims] of [[800, [800, 533]], [1600, [1600, 1067]]]) {
        const f = `${p.cover}-${w}.webp`;
        if (ok(await exists(resolve(dist, f)), `${where}: нет обложки ${f}`)) ok(same(await size(f), dims), `${where}: обложка ${f} — не ${dims.join('×')}`);
      }
      const seen = new Set();
      for (const [i, x] of (p.photos || []).entries()) {
        const at = `${where}.photos[${i}]`;
        ok(x.img && x.alt?.trim() && x.caption?.trim(), `${at}: нужны img, alt и caption`);
        ok(!seen.has(x.img), `${at}: кадр ${x.img} повторяется`); seen.add(x.img);
        ok(!/Meat\s?Wash|Meatwash|гаранти|\d+\s*(дн|час|лет|год)|₽/i.test(`${x.alt} ${x.caption}`), `${at}: в alt/подписи бренд капсом, гарантия, сроки или цена — подписи только по фактам кадра`);
        for (const [w, dims] of [[800, [640, 800]], [1600, [1280, 1600]]]) {
          const f = `${x.img}-${w}.webp`;
          if (ok(await exists(resolve(dist, f)), `${at}: нет файла ${f}`)) ok(same(await size(f), dims), `${at}: ${f} — не ${dims.join('×')} (кадры галереи 4:5)`);
        }
      }
    }
    for (const file of pages) {
      const text = html[file] || '';
      ok(text.includes(`data-projects="${dir}"`) && text.includes(`id="gallery-${dir}"`), `${file}: нет плашек проектов ${dir} и окна #gallery-${dir}`);
      for (const p of list) {
        ok(text.includes(`data-gallery-open="${p.id}"`), `${file}: нет плашки проекта ${p.id}`);
        // Фото окна — только внутри <template>: до открытия браузер их не запрашивает.
        const tpl = text.match(new RegExp(`<template data-gallery-project="${p.id}">([\\s\\S]*?)</template>`))?.[1] || '';
        ok((tpl.match(/<img\b/g) || []).length === p.photos.length, `${file}: в шаблоне ${p.id} не ${p.photos.length} фото`);
        for (const x of p.photos) ok(tpl.includes(`alt="${esc(x.alt)}"`) && tpl.includes(`${x.img}-800.webp 640w`) && tpl.includes(`${x.img}-1600.webp 1280w`), `${file}: фото ${x.img} — нет alt или srcset 640w/1280w (настоящая ширина файлов 4:5)`);
      }
      ok(new RegExp(`id="gallery-${dir}"[\\s\\S]*?data-request-category="${dir}"[\\s\\S]*?</dialog>`).test(text), `${file}: в окне-галерее нет «Записаться онлайн» (data-request-category="${dir}")`);
      const outside = strip(text).replace(/<template\b[\s\S]*?<\/template>/g, '');
      ok(!/gallery__img/.test(outside), `${file}: фото окна-галереи вне <template> — загрузятся до открытия`);
      ok(/css\/projects\.css/.test(text) && /css\/tiles\.css/.test(text), `${file}: нужны css/tiles.css и css/projects.css`);
    }
  }
}

// ── Гараж: только /services, 3D по нажатию, цены из каталога ─────────────────
{
  for (const page of REGISTRY) {
    const has = /data-garage-open/.test(html[page.file]);
    if (page.file === 'services.html') ok(has && /id="garage-3d"[\s\S]*?data-garage-open/.test(services), 'services.html: нет кнопки [data-garage-open] в блоке #garage-3d');
    else if (page.file !== 'kit.html') ok(!has, `${page.file}: кнопка гаража — только на /services (решение 27.10)`);
    ok(!/css\/garage\.css/.test(html[page.file]) || page.file === 'services.html', `${page.file}: garage.css — только на /services`);
    ok(!/id="garage"|id="garage-title"/.test(strip(html[page.file])), `${page.file}: id garage и garage-title заняты окном garage.js`);
  }
  const config = await importDist(resolve(dist, 'js/config.js'));
  const sectionOf = {};
  for (const g of d.groups) for (const s of g.sections) for (const n of s.items || []) sectionOf[n] = g.id;
  const expected = (zone, body) => zone.price.program != null ? d.programPrices[zone.price.program][body] : itemPrice[zone.price.item];
  ok(same(config.ZONE_GROUPS.map((g) => [g.id, g.title]), d.groups.map((g) => [g.id, g.short])), 'Гараж: вкладки не совпадают с категориями каталога');
  for (const zone of config.ZONES) {
    if (!ok(zone.price && (zone.price.program != null ? d.programPrices[zone.price.program] : zone.price.item in itemPrice), `Гараж: у работы ${zone.id} нет цены в каталоге`)) continue;
    ok(zone.title === (zone.price.program != null ? d.programs[zone.price.program][0] : zone.price.item), `Гараж: название ${zone.id} не совпадает с каталогом`);
    ok(zone.group === (zone.price.program != null ? 'wash' : sectionOf[zone.price.item]), `Гараж: «${zone.title}» не в своей категории`);
    const prices = d.bodyTypes.map((_, b) => expected(zone, b));
    ok(zone.from === (prices.includes(null) ? null : Math.min(...prices)), `Гараж: «от» у ${zone.id} не минимальная цена каталога`);
    for (let b = 0; b < d.bodyTypes.length; b++) ok(config.zonePrice(zone, b) === expected(zone, b), `Гараж: цена ${zone.id} для кузова ${d.bodyTypes[b]}`);
  }
  const programZones = config.ZONES.filter((z) => z.price.program != null);
  ok(same(programZones.map((z) => z.price.program).sort(), d.programs.map((_, i) => i)), 'Гараж: нужны все программы мойки');
  ok(config.EXCLUSIVE.some((group) => programZones.every((z) => group.includes(z.id))), 'Гараж: программы мойки — в одной группе EXCLUSIVE');
  const includes = (i) => d.programItems.slice(0, i + 1).flat();
  for (const program of programZones) for (const zone of config.ZONES.filter((z) => includes(program.price.program).includes(z.price.item)))
    for (let b = 0; b < d.bodyTypes.length; b++) ok(config.garageSum([program.id, zone.id], b) === expected(program, b), `Гараж: «${zone.title}» входит в «${program.title}», но считается второй раз`);
  ok(same(config.ZONES.filter((z) => config.isWash(z)).map((z) => z.id), programZones.map((z) => z.id)), 'Гараж: в запись YCLIENTS уходит только мойка');
}

// ── Машины и счётчики (§4.6) ─────────────────────────────────────────────────
{
  const auto = html['auto.html'];
  const cards = [...auto.matchAll(/<article class="car-card" id="([\w-]+)"[\s\S]*?<\/article>/g)];
  // Карточки: сначала «в продаже», за ними проданные (окно «Уже продали», Влад 03.11).
  ok(same(cards.map((m) => m[1]), [...cars.forSale, ...cars.sold].map((c) => c.id)), `auto.html: карточки машин (${cards.map((m) => m[1]).join(', ')}) не совпадают с cars.json`);
  [...cars.forSale, ...cars.sold].forEach((car, i) => {
    const card = cards[i]?.[0] || '';
    const photos = (card.match(/<ul class="strip[^"]*"[\s\S]*?<\/ul>/)?.[0].match(/<li><img /g) || []).length;
    ok(photos === car.photos.length, `${car.id}: фото в карточке ${photos}, в cars.json ${car.photos.length}`);
    if (car.sold) ok(/Продан в /.test(plain(card)), `${car.id}: нет месяца продажи`);
    else ok(plain(card).includes(money(car.price).replace(/\u00a0/g, ' ')), `${car.id}: цена не из cars.json`);
  });
  // 03.11: BMW 740Ld продана (Влад) — в продаже одна машина; у каждой проданной есть адрес и фото для окна.
  ok(cars.forSale.length === 1 && cars.sold.length === 16, `cars.json: ${cars.forSale.length} машины в продаже, ${cars.sold.length} проданных — ожидается 1 и 16`);
  ok(cars.sold.every((c) => c.id && /^\d{4}-\d{2}$/.test(c.sold) && c.photos?.length), 'cars.json: у проданной машины нет id, месяца sold или фото');
  ok((auto.match(/<li class="sold-card"><a class="sold-card__link" href="#[\w-]+" data-car-open=/g) || []).length === cars.sold.length, `auto.html: проданных карточек-ссылок не ${cars.sold.length}`);
  // Цены машин — на дату pricesDate (план §4.6): старше 30 дней — сверить с клиентом
  // (в check:release — ошибка: на боевой сайт со старыми ценами не выходим).
  {
    const age = Math.floor((Date.now() - Date.parse(`${cars.pricesDate}T00:00:00+03:00`)) / 864e5);
    ok(Number.isFinite(age), `cars.json: pricesDate «${cars.pricesDate}» — не дата YYYY-MM-DD`);
    if (age > 30) soft(`цены машин — на ${cars.pricesDate} (${age} дн. назад): сверить цены и наличие с клиентом и обновить pricesDate в src/data/cars.json`);
  }
  const sale = cars.forSale.length, sold = cars.sold.length;
  for (const page of REGISTRY) if (page.shared.includes('header')) ok(html[page.file].includes(`<span class="drawer__count">${sale}</span>`) && html[page.file].includes(`<span class="drawer__count">${sold}</span>`), `${page.file}: счётчики машин в шторке не из данных`);
  ok(/href="#for-sale"><b>(\d+)<\/b>/.exec(auto)?.[1] === String(sale) && /href="#sold"><b>(\d+)<\/b>/.exec(auto)?.[1] === String(sold), 'auto.html: цифры героя не из данных');
  ok(new RegExp(`Уже продали ${sold} машин`).test(plain(html['index.html'])), 'index.html: «Уже продали N машин» не из данных');
  // Личного Telegram для связи больше нет (Влад 05.11): в данных машин — только канал.
  ok(!('contact' in cars) && cars.channel === 'https://t.me/MEATWASH_Auto', 'cars.json: поля contact (личный Telegram) быть не должно, channel — канал MEAT AUTO');
  ok(!/ранее Meat Wash/.test(plain(html['about.html'])), 'about.html: «ранее Meat Wash» не нужно — имя сайта снова Meat Wash (Влад 29.10)');
  ok(!/rusifikaciya/.test(html['index.html'].match(/<dialog class="drawer"[\s\S]*?<\/dialog>/)?.[0] || ''), 'Шторка: пункта «Русификация» нет до ответа клиента (поправка 6)');
}

// ── Скрипты: синтаксис, адреса, граф модулей ─────────────────────────────────
const is3d = (name) => /porsche3d/.test(name);
const js = {};
for (const name of (await readdir(resolve(dist, 'js'))).filter((n) => n.endsWith('.js'))) {
  const text = js[name] = await readFile(resolve(dist, 'js', name), 'utf8');
  const result = spawnSync(process.execPath, ['--check', '--input-type=module'], {input: text, encoding: 'utf8'});
  if (result.status !== 0) fail(`js/${name}: ${result.stderr.split('\n').slice(0, 4).join(' ')}`);
  if (is3d(name)) continue;
  for (const [, prefix, page, ext] of text.matchAll(/['"`]((?:[^'"`\s]*\/)?)([\w-]+)(\.html)?(?=[#?'"`])/g)) {
    if (!files.has(page + '.html') || !ext && !prefix.startsWith('/')) continue;
    fail(ext ? `js/${name}: адрес страницы ${prefix}${page}.html — нужен без расширения` : `js/${name}: адрес страницы ${prefix}${page} от корня — нужен относительный`);
  }
  for (const [, u] of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"](\.[^'"]+)['"]/g)) if (!await exists(resolve(dist, 'js', u.split('?')[0]))) fail(`js/${name}: нет модуля ${u}`);
}
const lazy3d = new Set();
const graph = (entry) => {
  const seen = new Set(), queue = [entry];
  while (queue.length) {
    const name = queue.pop();
    if (seen.has(name) || !js[name]) continue;
    seen.add(name);
    for (const [, u] of js[name].matchAll(/(?:\bfrom\s*|\bimport\s*)['"]\.\/([^'"?]+)['"]/g)) { if (is3d(u)) fail(`${name} статически импортирует 3D: ${u}`); else queue.push(u); }
    for (const [, u] of js[name].matchAll(/\bimport\(\s*['"]\.\/([^'"?]+)['"]/g)) { if (is3d(u)) lazy3d.add(`${name} → ${u}`); else queue.push(u); }
  }
  return seen;
};
for (const page of REGISTRY) {
  const text = html[page.file];
  const entries = [...text.matchAll(/<script\b[^>]*\bsrc="js\/([^"?]+)"/g)].map((m) => m[1]);
  ok(same(entries, ['site.js']), `${page.file}: один вход js/site.js (сейчас: ${entries.join(', ')})`);
  const modules = new Set(entries.flatMap((e) => [...graph(e)]));
  ok(modules.has('analytics.js'), `${page.file}: нет js/analytics.js в графе модулей`);
  ok(![...modules].some((n) => ['main.js', 'page.js'].includes(n)), `${page.file}: грузит старый модуль main.js или page.js`);
  const code = [text, ...[...modules].map((n) => js[n])].join('\n');
  ok(!/porsche-930|\.glb\b|assets\/3d\/|importmap|vendor\/build|vendor\/examples/.test(code), `${page.file}: ссылка на 3D-ресурсы (модель, three, importmap) до нажатия`);
  ok(!/porsche3d\.bundle|js\/porsche3d/.test(text), `${page.file}: страница ссылается на 3D-модуль`);
  for (const [tag] of text.matchAll(/<link\b[^>]*>/g)) ok(!(/modulepreload|prefetch|prerender/.test(tag) && /js\/|\.glb|assets\/3d/.test(tag)), `${page.file}: preload/prefetch скриптов или 3D: ${tag}`);
  for (const [u] of code.matchAll(/https?:\/\/[\w.-]*yclients\.com[^"'\s<)\\`]*/g)) ok(d.locations.some((l) => l.booking === u) || /\$\{|short\?o=/.test(u), `${page.file}: неожиданная ссылка YCLIENTS в коде ${u}`);
  ok(!/api\.telegram\.org|bot\d{6,}:|[?&](token|apikey|api_key)=|Bearer\s/i.test(code), `${page.file}: в клиентском коде адрес бота или токен`);
}
ok(same([...lazy3d], ['garage.js → porsche3d.bundle.js']), `3D грузит только garage.js по нажатию: ${[...lazy3d].join(', ') || 'нет'}`);
ok(/import\('\.\/garage\.js'\)/.test(js['site.js']) && /data-garage-open/.test(js['site.js']), 'site.js: garage.js — только import() по нажатию [data-garage-open]');
// Старое имя в строках скриптов (комментарии не в счёт)
for (const [name, text] of Object.entries(js)) {
  if (is3d(name)) continue;
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
  const old = code.match(/.{0,30}(\bMeat(?:\s|\\u00a0)+Wash\b|\bMeatwash\b|\bMeatWash\b).{0,30}/);
  if (old) fail(`js/${name}: старое имя в строке: …${old[0].trim()}…`);
  const glyph = code.match(/.{0,20}[↗✓].{0,20}/);
  if (glyph) fail(`js/${name}: знак ↗ или ✓ (нет в Manrope): …${glyph[0].trim()}…`);
}

// ── Согласие, Вебвизор, клубная карта ────────────────────────────────────────
{
  const code = js['analytics.js'];
  const webvisor = /\bwebvisor:\s*true\b/.test(code);
  ok(webvisor || /\bwebvisor:\s*false\b/.test(code), 'js/analytics.js: webvisor в init счётчика — явно true или false');
  for (const [name, text] of [['уведомление о cookie (js/analytics.js)', code.match(/consent__text">([^<]*)/)?.[1] || ''], ['privacy.html', html['privacy.html']], ['consent.html', html['consent.html']]])
    ok(webvisor === text.includes('Вебвизор'), `${name}: ${webvisor ? 'не назван Вебвизор, а он включён' : 'упомянут Вебвизор, а он выключен'}`);
  const CLUB_CARD = 'https://admin.wahelp.cards/lendings/019c6b46-a042-7121-8e8c-23717fd3195e';
  for (const page of REGISTRY.filter((p) => p.shared.includes('membership')))
    ok(html[page.file].includes(`<a class="membership__link" href="${CLUB_CARD}" target="_blank" rel="noopener noreferrer"`), `${page.file}: клубная карта не ведёт на ${CLUB_CARD}`);
}

// ── Заявка с фото: сайт и обработчик согласованы, секретов нет ───────────────
{
  const requestCode = js['request.js'], requestPhp = await readFile(resolve(dist, 'api/request.php'), 'utf8');
  ok(/result\?\.ok !== true/.test(requestCode) && /!response\.ok/.test(requestCode), 'js/request.js: «отправлено» — только после ответа сервера {ok:true}');
  const maxFiles = requestCode.match(/const MAX_FILES = (\d+);/)?.[1];
  ok(maxFiles && requestPhp.includes(`const MAX_FILES = ${maxFiles};`), 'js/request.js и api/request.php: разное наибольшее число фото');
  ok(/const MAX_BYTES = 10 \* 1024 \* 1024;/.test(requestCode) && /const MAX_FILE_BYTES = 10 \* 1024 \* 1024;/.test(requestPhp), 'Фото до 10 МБ в request.js и request.php');
  ok(requestCode.includes("body.append('photos[]'") && requestPhp.includes("$_FILES['photos']"), 'Фото уходят полем photos[]');
  ok(requestCode.includes("'mw_extra'") && requestPhp.includes("$_POST['mw_extra']") && requestPhp.includes("$_POST['consent'] ?? '') !== 'yes'"), 'api/request.php: ловушка и обязательное согласие');
  // После typo() «До 5 фото:» стоит с неразрывными пробелами — сравниваем текст.
  for (const page of REGISTRY.filter((p) => p.shared.includes('dialogs'))) ok(html[page.file].includes(`>До&nbsp;${maxFiles}&nbsp;фото:`) || html[page.file].includes(`>До ${maxFiles} фото:`), `${page.file}: в окне заявки «До N фото:» не как в js/request.js (${maxFiles})`);
  for (const name of (await readdir(resolve(dist, 'api'))).filter((n) => n.endsWith('.php'))) {
    const code = await readFile(resolve(dist, 'api', name), 'utf8');
    ok(!/\d{6,}:[\w-]{30,}/.test(code), `api/${name}: похоже на токен Telegram-бота`);
    ok(!/[\w.+-]+@[\w-]+(\.[\w-]+)*\.[a-z]{2,}/i.test(code), `api/${name}: адрес почты — только в настройках вне сайта`);
    ok(!/['"](secret|password|passwd|pass|token|api_?key|chat_id)['"]\s*=>\s*['"][^'"]{6,}/i.test(code), `api/${name}: секрет в коде`);
  }
  const example = await readFile(resolve(root, 'server/request-config.example.php'), 'utf8');
  ok(!/\d{6,}:[\w-]{30,}/.test(example) && [...example.matchAll(/[\w.+-]+@([\w-]+(?:\.[\w-]+)+)/g)].every((m) => /^example\.(com|org|net)$/i.test(m[1])) && /'secret' => 'ЗАМЕНИТЕ/.test(example), 'server/request-config.example.php: только заглушки');
}

// ── 404 и sitemap ────────────────────────────────────────────────────────────
{
  const page404 = await readFile(resolve(root, 'server/404.html'), 'utf8');
  for (const [, u] of page404.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (/^(https?:|tel:|mailto:|data:|#)/.test(u)) continue;
    if (!u.startsWith('/')) { fail(`server/404.html: адрес ${u} — от корня (/…): страница открывается по любому адресу`); continue; }
    const path = u.slice(1).split(/[?#]/)[0];
    if (path === '' || files.has(path + '.html')) continue;
    if (!await exists(resolve(dist, path))) fail(`server/404.html: нет файла ${u}`);
  }
  if (/Meat\s+Wash|Meatwash/.test(page404)) fail('server/404.html: старое имя');
  // 404 свёрстана вручную, вне генератора: её текст уже должен быть таким, каким его сделал бы typo().
  {
    const {typo} = await import('./typo.mjs');
    const body = page404.slice(page404.indexOf('<body>'), page404.indexOf('</body>'));
    if (typo(body) !== body) fail('server/404.html: короткие слова или тире без неразрывного пробела — прогоните текст через typo() (scripts/typo.mjs)');
  }
}
for (const page of REGISTRY) {
  const loc = `<loc>${SITE}${pageSlug(page.file)}</loc>`;
  if (page.sitemap && !sitemap.includes(loc)) fail(`sitemap.xml: нет ${page.file}`);
  if (!page.sitemap && sitemap.includes(loc)) fail(`sitemap.xml: служебной ${page.file} там быть не должно`);
}
if (/\.html<\/loc>/.test(sitemap)) fail('sitemap.xml: адреса страниц — без .html');

// ── Release: реквизиты и аналитика ───────────────────────────────────────────
if (missingOperator().length) soft(`реквизиты оператора в Политике и Согласии не заполнены: ${missingOperator().join(', ')}`);
if (!site.metrika) soft('не задан номер счётчика Метрики (site.analytics.metrika)');
if (!site.webmaster) soft('не задан код Вебмастера (site.analytics.webmaster)');

// ── Итог ─────────────────────────────────────────────────────────────────────
const pages = REGISTRY.filter((p) => p.sitemap).length;
console.log(`Страниц сайта: ${pages} (+ ${REGISTRY.length - pages} служебная), ссылок проверено: ${links}; каталог: ${d.groups.length} категории, ${groupItems.length} позиция, ${d.programs.length} программ; машины: ${cars.forSale.length} в продаже, ${cars.sold.length} продано; пометок «нужно от клиента»: ${todos.length}.`);
if (warnings.length) console.warn(`Предупреждения (${warnings.length}; в check:release — ошибки):\n- ${warnings.join('\n- ')}`);
if (errors.length) { console.error(`FAIL (${errors.length}):\n- ${errors.join('\n- ')}`); process.exit(1); }
console.log(release ? 'PASS (release)' : 'PASS');
