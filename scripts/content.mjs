// Сборка всех страниц Meat Wash из реестра src/content/pages.mjs: <head> (layout),
// тело из src/content/<body> (или разметка чтения scripts/reading.mjs вокруг тела),
// подстановки и общие части (scripts/pages.mjs), неразрывные пробелы (scripts/typo.mjs),
// JSON-LD, sitemap.xml и файл подтверждения Яндекс Вебмастера.
// Запуск: npm run content (входит в npm run build). Руками dist/*.html не править.
// Владелец: WP0, после сдачи — WP7.
import {readFile, writeFile, readdir, rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {content as d, escape} from './catalog.mjs';
import {REGISTRY, ARTICLES} from '../src/content/pages.mjs';
import {renderPartial, renderPage, pageSlug, pageUrl, metaText, assetUrl, PAGES, BY_ID, SITE, humanDate, missingOperator} from './pages.mjs';
import {typo} from './typo.mjs';
import {renderList, renderArticle, renderDoc, readingMinutes, shot} from './reading.mjs';

const root = new URL('../', import.meta.url);
const distFile = (path) => new URL(`dist/${path}`, root);
export {SITE, humanDate, missingOperator, typo};
// Полный адрес страницы для canonical, og:url, JSON-LD и sitemap: https://meatwash.ru/services, главная — https://meatwash.ru/.
export const pageAddress = (file) => SITE + pageSlug(file);

// Шрифт: один вариативный файл; адрес с версией по содержимому — один и тот же в preload
// и в @font-face (поправка критика 28). @font-face — только здесь, не в CSS.
export const FONT = 'assets/fonts/manrope-vf.woff2';
const fontFace = () => `@font-face{font-family:'Manrope';src:url('${assetUrl(FONT)}') format('woff2');font-weight:200 800;font-style:normal;font-display:swap}`;
// Общие CSS в порядке подключения; за ними — CSS страницы (поле css реестра).
export const SHARED_CSS = ['tokens', 'base', 'components', 'shell', 'dialogs'];
// «Бумага»: строка браузера — цвета шапки (тёмная полоса с белым быком), а не слоновой кости под ней.
const THEME_COLOR = {dark: '#080808', paper: '#080808', home: '#080808'};

// Старые якоря главной (поправка критика 32 и гараж на /services, решение 27.10): заход
// по старой ссылке ведём туда, где блок живёт теперь. #contacts и #top остаются у подвала и шапки.
const LEGACY_HOME_HASH = {
  locations: 'about#visit-locations', 'map-myasnitskaya': 'about#map-myasnitskaya', 'map-technopark': 'about#map-technopark',
  membership: 'about#membership', club: 'about#club', services: 'services', proof: 'services#proof', garage: 'services#garage-3d',
};
const headScript = (page) => page.id === 'home'
  ? `document.documentElement.classList.add('js');(function(m,h){if(m[h])location.replace(m[h])})(${JSON.stringify(LEGACY_HOME_HASH)},location.hash.slice(1))`
  : `document.documentElement.classList.add('js')`;

const json = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

// Размер og:image — из файла (sharp); файла ещё нет — без размеров.
async function ogMeta(path) {
  const tags = [`<meta property="og:image" content="${SITE}${path}">`];
  if (existsSync(distFile(path))) {
    const {width, height} = await sharp(fileURLToPath(distFile(path))).metadata();
    tags.push(`<meta property="og:image:width" content="${width}">`, `<meta property="og:image:height" content="${height}">`);
  }
  return tags.join('\n');
}
// Предзагрузка героя — когда файл уже лежит в dist (картинки кладут пакеты WP2–WP5).
const preloadTags = (page) => (page.preload || []).filter((p) => existsSync(distFile(p.href))).map((p) =>
  `<link rel="preload" as="image" href="${p.href}"${p.srcset ? ` imagesrcset="${p.srcset}"` : ''}${p.sizes ? ` imagesizes="${p.sizes}"` : ''}${p.media ? ` media="${p.media}"` : ''} fetchpriority="high">\n`).join('');

async function layout(page, {main, jsonLd, ogType = 'website'}) {
  const url = pageAddress(page.file);
  const theme = page.theme || 'dark';
  if (!THEME_COLOR[theme]) throw new Error(`${page.file}: тема ${theme} — dark, paper или home`);
  const title = metaText(page.title), description = metaText(page.description), ogTitle = metaText(page.ogTitle || page.title);
  const book = page.shared.includes('book') && !main.includes('<!-- SHARED:book:START -->')
    ? '\n<!-- SHARED:book:START -->\n<!-- SHARED:book:END -->\n' : '';
  return `<!doctype html>
<html lang="ru" data-theme="${theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<script>${headScript(page)}</script>
<meta name="theme-color" content="${THEME_COLOR[theme]}">
${page.robots ? `<meta name="robots" content="${escape(page.robots)}">\n` : ''}<!-- SHARED:analytics:START -->
<!-- SHARED:analytics:END -->
<title>${escape(title)}</title>
<meta name="description" content="${escape(description)}">
<link rel="canonical" href="${url}">
<meta property="og:site_name" content="Meat Wash">
<meta property="og:title" content="${escape(ogTitle)}">
<meta property="og:description" content="${escape(description)}">
<meta property="og:type" content="${ogType}">
<meta property="og:locale" content="ru_RU">
<meta property="og:url" content="${url}">
${await ogMeta(page.ogImage || 'assets/img/og-meat-auto.webp')}
<meta name="twitter:card" content="summary_large_image">
<link rel="preload" href="${assetUrl(FONT)}" as="font" type="font/woff2" crossorigin>
${preloadTags(page)}<style>${fontFace()}</style>
<link rel="icon" href="assets/favicon-bull.png" sizes="512x512" type="image/png">
<link rel="apple-touch-icon" href="assets/apple-touch-icon.png">
${[...SHARED_CSS.map((n) => `${n}.css`), ...(page.css || [])].map((name) => `<link rel="stylesheet" href="css/${name}">`).join('\n')}
<script type="module" src="js/site.js"></script>
<script type="application/ld+json">${json(jsonLd)}</script>
</head>
<body data-page="${page.id}" data-kind="${page.kind}">
<a class="skip-link" href="#main">Перейти к содержанию</a>

<!-- SHARED:header:START -->
<!-- SHARED:header:END -->

<main id="main">
${main.trim()}
${book}</main>

<!-- SHARED:footer:START -->
<!-- SHARED:footer:END -->

<!-- SHARED:dialogs:START -->
<!-- SHARED:dialogs:END -->
</body>
</html>
`;
}

// ── JSON-LD ──────────────────────────────────────────────────────────────────
const ORG = {'@type': 'Organization', name: `${d.brand.name} ${d.brand.descriptor}`, alternateName: d.brand.legacy, url: SITE, logo: {'@type': 'ImageObject', url: SITE + 'assets/favicon-bull.png'}};
// Хлебные крошки по иерархии §1.2: Meat Wash → [родитель] → страница.
function crumbs(page) {
  const chain = [];
  for (let p = page; p; p = p.parent ? BY_ID[p.parent] : null) chain.unshift(p);
  const items = [{name: d.brand.name, item: SITE}, ...chain.map((p) => ({name: p.headline, item: pageAddress(p.file)}))];
  return {'@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map((x, i) => ({'@type': 'ListItem', position: i + 1, name: x.name, item: x.item}))};
}
// Часы из строк сайта: «Пн–Пт 08:00–22:00», «Сб–Вс 09:00–22:00», «Ежедневно 08:00–22:00».
const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'], DAY_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
function openingHours(lines) {
  return lines.map((line) => {
    const m = line.match(/^(?:(Ежедневно)|(Пн|Вт|Ср|Чт|Пт|Сб|Вс)–(Пн|Вт|Ср|Чт|Пт|Сб|Вс)) (\d\d:\d\d)–(\d\d:\d\d)$/);
    if (!m) throw new Error(`Часы студии в непонятном виде: «${line}» — поправьте разбор в scripts/content.mjs`);
    const [from, to] = m[1] ? [0, 6] : [DAYS.indexOf(m[2]), DAYS.indexOf(m[3])];
    return {'@type': 'OpeningHoursSpecification', dayOfWeek: DAY_EN.slice(from, to + 1), opens: m[4], closes: m[5]};
  });
}
// Адрес для разметки — как на прежнем сайте (полное «улица / проспект»).
const STREET = {myasnitskaya: 'Мясницкая ул., 11', technopark: 'просп. Андропова, 8, стр. 2'};
// Фото студии в разметке — только своё (Мясницкая, автор — Роман Антонович): у фото
// Технопарка автор «ГЕОмаркетинг», прав на него нет (поправка критика 10).
const STUDIO_IMAGE = {myasnitskaya: 'assets/img/studio-myasnitskaya-1200.webp'};
const autoWash = () => d.locations.map((l) => ({
  '@context': 'https://schema.org', '@type': 'AutoWash',
  name: `${d.brand.name} — ${l.name}`, alternateName: d.brand.legacy,
  url: `${SITE}about#map-${l.id}`,
  ...(STUDIO_IMAGE[l.id] ? {image: SITE + STUDIO_IMAGE[l.id]} : {}),
  telephone: l.tel,
  address: {'@type': 'PostalAddress', streetAddress: STREET[l.id] || l.address, addressLocality: 'Москва', addressCountry: 'RU'},
  geo: {'@type': 'GeoCoordinates', latitude: l.lat, longitude: l.lon},
  openingHoursSpecification: openingHours(l.hours),
  sameAs: [l.map],
}));

function jsonLdFor(page, extra = []) {
  const out = [];
  if (page.id !== 'home') out.push(crumbs(page));
  for (const kind of page.jsonLd || []) {
    if (kind === 'autowash') out.push(...autoWash());
    else throw new Error(`${page.file}: неизвестный JSON-LD ${kind}`);
  }
  out.push(...extra);
  return out.length === 1 ? out[0] : out;
}

// ── Тела страниц ─────────────────────────────────────────────────────────────
const readBody = async (page, name) => renderPartial(await readFile(new URL(`src/content/${name}`, root), 'utf8'), page.file);

async function renderMain(page) {
  if (page.kind === 'landing') return {main: await readBody(page, page.body), jsonLd: jsonLdFor(page)};
  if (page.kind === 'list') {
    const articles = [];
    for (const a of ARTICLES) articles.push({article: a, minutes: readingMinutes(await readBody(BY_ID[a.id], a.body))});
    return {
      main: renderList(page, articles),
      jsonLd: jsonLdFor(page, [{'@context': 'https://schema.org', '@type': 'CollectionPage', name: `Статьи ${d.brand.name}`, url: pageAddress(page.file), hasPart: ARTICLES.map((a) => ({'@type': 'Article', headline: a.headline, url: pageAddress(a.file), datePublished: a.date}))}]),
    };
  }
  if (page.kind === 'article') {
    const body = await readBody(page, page.body), minutes = readingMinutes(body), image = SITE + shot(page.image);
    return {
      main: renderArticle(page, body, minutes), ogType: 'article',
      jsonLd: jsonLdFor(page, [{'@context': 'https://schema.org', '@type': 'Article', headline: page.headline, description: page.description, image, datePublished: page.date, dateModified: page.date, inLanguage: 'ru', mainEntityOfPage: pageAddress(page.file), author: ORG, publisher: ORG}]),
    };
  }
  if (page.kind === 'doc') return {main: renderDoc(page, await readBody(page, page.body)), jsonLd: jsonLdFor(page)};
  throw new Error(`${page.file}: неизвестный kind ${page.kind}`);
}

// Страница целиком: <head>, тело, неразрывные пробелы в тексте, общие части.
export async function renderContent(page) {
  const {main, jsonLd, ogType} = await renderMain(page);
  return typo(await layout(page, {main, jsonLd, ogType}));
}
export const buildPage = async (page) => renderPage(page.file, await renderContent(page));

// Подтверждение прав в Яндекс Вебмастере способом «HTML-файл»: тот же код, что в мета-теге
// yandex-verification (site.analytics.webmaster), файл — в корне сайта, текст — как выдаёт Вебмастер.
export function renderYandexVerification() {
  const code = d.site?.analytics?.webmaster;
  if (!code) return null;
  return {file: `yandex_${code}.html`, text: `<html>
    <head>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    </head>
    <body>Verification: ${code}</body>
</html>
`};
}

export function renderSitemap() {
  const entries = REGISTRY.filter((p) => p.sitemap).map((p) => ({file: p.file, lastmod: p.date || d.site.documentsDate, ...p.sitemap}));
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map((e) => `  <url>
    <loc>${pageAddress(e.file)}</loc>
    <lastmod>${e.lastmod}</lastmod>
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const page of REGISTRY) {
    await writeFile(distFile(page.file), await buildPage(page));
    console.log(page.file);
  }
  await writeFile(distFile('sitemap.xml'), renderSitemap());
  console.log('sitemap.xml');
  const verification = renderYandexVerification();
  for (const name of await readdir(new URL('dist/', root))) if (/^yandex_\w+\.html$/.test(name) && name !== verification?.file) await rm(distFile(name));
  if (verification) { await writeFile(distFile(verification.file), verification.text); console.log(verification.file); }
  const missing = missingOperator();
  if (missing.length) console.warn(`ВНИМАНИЕ: в Политике и Согласии не заполнены реквизиты оператора (site.operator в meatwash-content.json): ${missing.join(', ')}.`);
}
