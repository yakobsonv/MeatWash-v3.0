// Реестр страниц MEATWASH (план §1.1, §3; поправки критика 29, 33, 34).
// Все страницы собирает scripts/content.mjs: <head> (layout), тело из src/content/<body>,
// общие части — scripts/pages.mjs по списку shared. Руками dist/*.html не править.
//
// Владелец файла: WP0, после сдачи — WP7 (интегратор). Пакеты WP1–WP6 его не правят:
// имена картинок героя и og зафиксированы здесь заранее (поправка 29) — пакет просто
// кладёт файл с этим именем, и сборка подхватывает его (preload выводится, когда файл есть).
//
// Поля:
//   file         файл в dist; адрес — без .html (services.html → /services, index.html → /)
//   id           ключ страницы: data-page у <body>, {{to:<id>}}, {{current:<id>}}
//   kind         landing — тело целиком в src/content/<body>; list / article / doc —
//                разметку даёт scripts/reading.mjs (WP2) вокруг тела
//   body         файл тела в src/content
//   title, description, ogTitle?  мета; в них работают {{min:*}}, {{count:*}}, {{price:*}},
//                {{brand:*}}, {{program:*}} — цены «от» в мете из JSON, не руками
//   headline     название для хлебных крошек JSON-LD (и H1 у list/article/doc)
//   parent       id родителя в иерархии §1.2 (хлебные крошки): wash, detailing, wrap, bodywork,
//                works → services («Услуги и цены»)
//   theme        dark | paper | home → data-theme у <html>
//   header       over (поверх фото) | solid (на фоне) → {{header-variant}}
//   cta          нижняя кнопка на телефоне: request («Записаться онлайн» с темой topic, Влад 05.11:
//                на всех страницах, и на главной) | none
//   topic        тема заявки страницы (site.requests.topics): у кнопки в шапке и нижней кнопки —
//                data-request-category; нет — форма открывается без выбранной темы
//   shared       общие части: analytics, header, footer, dialogs + book | locations | membership
//   css          CSS страницы после 5 общих (tokens, base, components, shell, dialogs)
//   preload      картинка героя: [{href, srcset?, sizes?, media?}] — выводится, если файл есть в dist
//   jsonLd       дополнительно к хлебным крошкам: 'autowash' — две студии из locations
//   ogImage      путь от корня сайта; 1200×630 для новых og
//   date         lastmod в sitemap (без него — site.documentsDate); у статьи — datePublished
//   sitemap      {changefreq, priority} или false — страницы нет в sitemap.xml
//   robots       мета robots (только kit.html)

const ALL = ['analytics', 'header', 'footer', 'dialogs'];
const WITH_BOOK = [...ALL, 'book'];
// Страницы направлений (05.11): каталожные стили services.css (строки цен — подстановка prices),
// tiles.css — плашки работ и отзывы (общие с главной, пишет исполнитель главной) и section.css
// страниц направлений (пишет исполнитель Автомойки и Детейлинга, Оклейка и Кузовные дописывают
// в конец своим блоком).
const SECTION_CSS = ['services.css', 'tiles.css', 'section.css'];

// Герой A (§2.8): 21:9 от 760 px, 1:1 ниже. Имена фиксированы (поправка 29).
const heroA = (dir) => [
  { href: `assets/img/${dir}/hero-900.webp`, media: '(max-width: 759px)' },
  { href: `assets/img/${dir}/hero-1600.webp`, media: '(min-width: 760px)' },
];

export const ARTICLES = [
  {
    file: 'article-avto-k-zime.html', id: 'article-avto-k-zime',
    body: 'articles/avto-k-zime.html',
    title: 'Автомобиль к зиме: что сделать до реагентов — MEATWASH',
    description: 'Как подготовить автомобиль к зиме в Москве: защита кузова, сколы, стёкла, уплотнители и салон, уход в сезон реагентов. Цены — из каталога MEATWASH.',
    headline: 'Автомобиль к зиме: что сделать до первых реагентов',
    lead: 'Реагенты, соль и мокрая грязь каждый день работают против лака, порогов, стёкол и уплотнителей. Что стоит сделать заранее и как ухаживать за машиной в сезон — по порядку и без лишних процедур.',
    date: '2026-10-01',
    image: 'cf-sill-low',
    imageNote: 'Иллюстрация, не работа студии',
    imageAlt: 'Порог и колесо Porsche в зимней грязи: с кузова стекает вода с реагентами',
  },
];

export const REGISTRY = [
  {
    file: 'index.html', id: 'home', kind: 'landing', body: 'home.html',
    title: 'MEATWASH — автомойка и детейлинг в Москве',
    description: 'MEATWASH Car Care Club: автомойка, детейлинг, оклейка плёнкой, кузовные работы и продажа автомобилей. Две студии в Москве — на Лубянке и в Технопарке.',
    ogTitle: 'MEATWASH — Car Care Club в Москве',
    headline: 'MEATWASH', theme: 'home', header: 'over', cta: 'none',   // нижней кнопки на главной нет (как прежде): заявка — в шапке
    shared: ALL, css: ['tiles.css', 'projects.css', 'home.css'],
    // Имена v2 (WP2 копирует source/v2-design/img → assets/img/home).
    preload: [
      { href: 'assets/img/home/hero-m-poster-720.webp', media: '(max-width: 699px)' },   // постеры роликов героя (js/video.js)
      { href: 'assets/img/home/hero-wash-1920.webp', media: '(min-width: 700px)' },
    ],
    jsonLd: ['autowash'], ogImage: 'assets/img/og-meat-wash.jpg',
    date: '2026-11-05', sitemap: { changefreq: 'monthly', priority: '1.0' },
  },
  // Направления (задание Влада 05.11, скелет — research/privecar-structure.md): тела пишут
  // исполнители страниц; {{todo}} на этих четырёх страницах допустимы (check.mjs, TODO_PAGES).
  {
    file: 'wash.html', id: 'wash', kind: 'landing', body: 'wash.html', parent: 'services',
    title: 'Автомойка в Москве — MEATWASH',
    description: 'Автомойка MEATWASH в Москве: программы от {{min:wash}}, цена зависит от типа кузова. Две студии — на Лубянке и в Технопарке. Запишитесь онлайн.',
    headline: 'Автомойка', theme: 'dark', header: 'solid', cta: 'request', topic: 'wash',
    shared: ALL, css: SECTION_CSS, preload: heroA('wash'),
    date: '2026-11-05', sitemap: { changefreq: 'monthly', priority: '0.9' },
  },
  {
    file: 'detailing.html', id: 'detailing', kind: 'landing', body: 'detailing.html', parent: 'services',
    title: 'Детейлинг автомобиля в Москве — MEATWASH',
    description: 'Детейлинг MEATWASH в Москве: химчистка салона, уход за кожей и пластиком, полировка и керамика, диски и моторный отсек. Лубянка и Технопарк.',
    headline: 'Детейлинг', theme: 'dark', header: 'solid', cta: 'request', topic: 'detailing',
    shared: ALL, css: SECTION_CSS, preload: heroA('detailing'),
    date: '2026-11-05', sitemap: { changefreq: 'monthly', priority: '0.9' },
  },
  {
    file: 'services.html', id: 'services', kind: 'landing', body: 'services.html',
    title: 'Услуги и цены — MEATWASH',
    description: 'Услуги и цены MEATWASH: автомойка от {{min:wash}}, детейлинг, полировка и керамика, оклейка плёнкой, стёкла и кузовные работы. Лубянка и Технопарк.',
    headline: 'Услуги и цены', theme: 'dark', header: 'over', cta: 'request',
    shared: WITH_BOOK,
    // garage.css — окно 3D-гаража (решение Влада 27.10: гараж остаётся блоком на этой странице,
    // 3D грузится только по нажатию). Владелец garage.css / garage.js / config.js — WP3.
    css: ['services.css', 'tiles.css', 'garage.css'],
    preload: heroA('services'), ogImage: 'assets/img/services/og.webp',
    date: '2026-10-27', sitemap: { changefreq: 'monthly', priority: '0.9' },
  },
  {
    file: 'wrap.html', id: 'wrap', kind: 'landing', body: 'wrap.html', parent: 'services',
    title: 'Оклейка автомобиля плёнкой в Москве — MEATWASH',
    description: 'Оклейка автомобиля полиуретановой плёнкой: прозрачной или цветной, зоны риска, весь кузов, фары и лобовое стекло. Только в Технопарке, Москва.',
    headline: 'Оклейка плёнкой', theme: 'dark', header: 'solid', cta: 'request', topic: 'wrap',
    shared: ALL, css: [...SECTION_CSS, 'projects.css'], preload: heroA('wrap'),
    date: '2026-11-05', sitemap: { changefreq: 'monthly', priority: '0.9' },
  },
  {
    file: 'bodywork.html', id: 'bodywork', kind: 'landing', body: 'bodywork.html', parent: 'services',
    title: 'Кузовные работы: вмятины и покраска — MEATWASH',
    description: 'Кузовные работы MEATWASH: выправление вмятин без покраски {{price:Удаление вмятин PDR}}, ремонт сколов и покраска элемента. Только в Технопарке, Москва.',
    headline: 'Кузовные работы', theme: 'dark', header: 'solid', cta: 'request', topic: 'bodywork',
    shared: ALL, css: SECTION_CSS, preload: heroA('bodywork'),
    date: '2026-11-05', sitemap: { changefreq: 'monthly', priority: '0.9' },
  },
  {
    file: 'works.html', id: 'works', kind: 'landing', body: 'works.html', parent: 'services',
    title: 'Наши работы — MEATWASH',
    description: 'Работы MEATWASH: подготовка Lotus Eletre R к продаже, оклейка плёнкой Mercedes-Benz S-класса, Range Rover и BMW, химчистка салона и полировка кузова в Москве.',
    headline: 'Наши работы', theme: 'dark', header: 'solid', cta: 'request',
    shared: WITH_BOOK, css: ['services.css', 'tiles.css', 'projects.css'], ogImage: 'assets/img/auto-lotus-4.webp',
    date: '2026-11-07', sitemap: { changefreq: 'monthly', priority: '0.6' },
  },
  {
    file: 'import.html', id: 'import', kind: 'landing', body: 'import.html',
    title: 'Привоз авто из-за рубежа — MEATWASH',
    description: 'Привезём автомобиль из-за рубежа и подготовим его к жизни в России — например, сделаем русификацию. Запишитесь онлайн на сайте MEATWASH.',
    headline: 'Привоз авто из-за рубежа', theme: 'dark', header: 'over', cta: 'request', topic: 'import',
    shared: ALL, css: ['auto.css'],
    preload: heroA('import'), ogImage: 'assets/img/import/og.webp',
    sitemap: { changefreq: 'monthly', priority: '0.7' },
  },
  {
    file: 'auto.html', id: 'auto', kind: 'landing', body: 'auto.html',
    title: 'Продажа и покупка автомобилей — MEATWASH',
    description: 'MEATWASH: автомобили в продаже, продажа под реализацию, подготовка к продаже в наших студиях, подбор и покупка автомобиля под ключ в Москве.',
    headline: 'Продажа автомобилей', theme: 'dark', header: 'solid', cta: 'request', topic: 'auto',
    shared: ALL, css: ['auto.css'], ogImage: 'assets/img/auto-lotus-1.webp',
    date: '2026-10-27', sitemap: { changefreq: 'weekly', priority: '0.7' },
  },
  {
    file: 'about.html', id: 'about', kind: 'landing', body: 'about.html',
    title: 'О нас — MEATWASH Car Care Club, Москва',
    description: 'MEATWASH Car Care Club — ручной уход за автомобилем в Москве. Химия под покрытие, согласование на приёмке, проверка перед выдачей. Две студии.',
    headline: 'О нас', theme: 'dark', header: 'over', cta: 'request',
    shared: [...ALL, 'locations', 'membership'], css: ['about.css'],
    preload: heroA('about'), jsonLd: ['autowash'], ogImage: 'assets/img/about/og.webp',
    date: '2026-10-27', sitemap: { changefreq: 'monthly', priority: '0.7' },
  },
  {
    file: 'articles.html', id: 'articles', kind: 'list',
    title: 'Статьи об уходе за автомобилем — MEATWASH',
    description: 'Статьи MEATWASH об уходе за автомобилем: автомойка, защита кузова, стёкла и салон. Практичные советы и цены из каталога студий на Лубянке и в Технопарке.',
    ogTitle: 'Статьи — MEATWASH Car Care Club',
    headline: 'Статьи', theme: 'paper', header: 'solid', cta: 'request',
    shared: WITH_BOOK, css: ['reading.css'],
    sitemap: { changefreq: 'weekly', priority: '0.6' },
  },
  ...ARTICLES.map((a) => ({
    ...a, kind: 'article', parent: 'articles', ogTitle: a.headline,
    theme: 'paper', header: 'solid', cta: 'request',
    shared: WITH_BOOK, css: ['reading.css'], ogImage: `assets/shots/${a.image}.webp`,
    sitemap: { changefreq: 'monthly', priority: '0.6' },
  })),
  {
    file: 'privacy.html', id: 'privacy', kind: 'doc', body: 'privacy.html',
    title: 'Политика обработки персональных данных — MEATWASH',
    description: 'Политика обработки персональных данных посетителей сайта MEATWASH Car Care Club: какие данные, цели, cookie и Яндекс Метрика, права и отзыв согласия.',
    headline: 'Политика обработки персональных данных', theme: 'paper', header: 'solid', cta: 'request',
    shared: ALL, css: ['reading.css'],
    sitemap: { changefreq: 'yearly', priority: '0.2' },
  },
  {
    file: 'consent.html', id: 'consent', kind: 'doc', body: 'consent.html',
    title: 'Согласие на обработку персональных данных — MEATWASH',
    description: 'Согласие посетителя сайта MEATWASH на обработку персональных данных с помощью cookie и сервиса Яндекс Метрика: данные, цель, срок и отзыв.',
    headline: 'Согласие на обработку персональных данных', theme: 'paper', header: 'solid', cta: 'request',
    shared: ALL, css: ['reading.css'],
    sitemap: { changefreq: 'yearly', priority: '0.2' },
  },
  // Согласие для заявки с фото — отдельный документ: другие данные и цель, чем у cookie.
  {
    file: 'consent-request.html', id: 'consent-request', kind: 'doc', body: 'consent-request.html',
    title: 'Согласие на обработку персональных данных при отправке заявки — MEATWASH',
    description: 'Согласие на обработку персональных данных при отправке заявки с фото на сайте MEATWASH: какие данные, цель, срок и как отозвать.',
    headline: 'Согласие на обработку персональных данных при отправке заявки', theme: 'paper', header: 'solid', cta: 'request',
    shared: ALL, css: ['reading.css'],
    sitemap: { changefreq: 'yearly', priority: '0.2' },
  },
  // Набор компонентов (WP1): все компоненты во всех вариантах. Нет в sitemap и в пакете
  // превью, на meatwash.ru его не выкладывает prune-deploy; страниц сайта 15 (+ эта служебная).
  {
    file: 'kit.html', id: 'kit', kind: 'landing', body: 'kit.html',
    title: 'Набор компонентов — MEATWASH',
    description: 'Служебная страница: компоненты дизайн-системы MEATWASH во всех вариантах для проверки переполнения и контраста.',
    headline: 'Набор компонентов', theme: 'dark', header: 'solid', cta: 'request',
    shared: WITH_BOOK, css: ['services.css', 'auto.css', 'about.css', 'reading.css'],
    robots: 'noindex, nofollow', sitemap: false,
  },
];

