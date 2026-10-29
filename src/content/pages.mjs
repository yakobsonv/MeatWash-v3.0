// Реестр страниц Meat Wash (план §1.1, §3; поправки критика 29, 33, 34).
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
//   parent       id родителя в иерархии §1.2 (хлебные крошки): wrap, works → services
//   theme        dark | paper | home → data-theme у <html>
//   header       over (поверх фото) | solid (на фоне) → {{header-variant}}
//   cta          нижняя кнопка на телефоне: book | technopark | auto | import | none (главная: в v2 её не было)
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

// Герой A (§2.8): 21:9 от 760 px, 1:1 ниже. Имена фиксированы (поправка 29).
const heroA = (dir) => [
  { href: `assets/img/${dir}/hero-900.webp`, media: '(max-width: 759px)' },
  { href: `assets/img/${dir}/hero-1600.webp`, media: '(min-width: 760px)' },
];

export const ARTICLES = [
  {
    file: 'article-avto-k-zime.html', id: 'article-avto-k-zime',
    body: 'articles/avto-k-zime.html',
    title: 'Автомобиль к зиме: что сделать до реагентов — Meat Wash',
    description: 'Как подготовить автомобиль к зиме в Москве: защита кузова, сколы, стёкла, уплотнители и салон, уход в сезон реагентов. Цены — из каталога Meat Wash.',
    headline: 'Автомобиль к зиме: что сделать до первых реагентов',
    lead: 'Реагенты, соль и мокрая грязь каждый день работают против лака, порогов, стёкол и уплотнителей. Что стоит сделать заранее и как ухаживать за машиной в сезон — по порядку и без лишних процедур.',
    date: '2026-10-01',
    image: 'cf-sill-low',
    imageAlt: 'Порог и колесо Porsche в зимней грязи: с кузова стекает вода с реагентами',
  },
];

export const REGISTRY = [
  {
    file: 'index.html', id: 'home', kind: 'landing', body: 'home.html',
    title: 'Meat Wash — автомойка и детейлинг в Москве',
    description: 'Car Care Club Meat Wash: автомойка и детейлинг, привоз авто из-за рубежа, покупка и продажа автомобилей. Две студии в Москве — на Мясницкой и в Технопарке.',
    ogTitle: 'Meat Wash — Car Care Club в Москве',
    headline: 'Meat Wash', theme: 'home', header: 'over', cta: 'none',
    shared: ALL, css: ['home.css'],
    // Имена v2 (WP2 копирует source/v2-design/img → assets/img/home).
    preload: [
      { href: 'assets/img/home/hero-m-poster-720.webp', media: '(max-width: 699px)' },   // постеры роликов героя (js/video.js)
      { href: 'assets/img/home/hero-wash-1920.webp', media: '(min-width: 700px)' },
    ],
    jsonLd: ['autowash'], ogImage: 'assets/img/og-meat-auto.webp',
    date: '2026-10-27', sitemap: { changefreq: 'monthly', priority: '1.0' },
  },
  {
    file: 'services.html', id: 'services', kind: 'landing', body: 'services.html',
    title: 'Автомойка / Детейлинг: услуги и цены — Meat Wash',
    description: 'Автомойка от {{min:wash}}, детейлинг, защита кузова и ремонт повреждений: химчистка, полировка, керамика, плёнка, стёкла. Мясницкая и Технопарк.',
    headline: 'Автомойка / Детейлинг', theme: 'dark', header: 'over', cta: 'book',
    shared: WITH_BOOK,
    // garage.css — окно 3D-гаража (решение Влада 27.10: гараж остаётся блоком на этой странице,
    // 3D грузится только по нажатию). Владелец garage.css / garage.js / config.js — WP3.
    css: ['services.css', 'garage.css'],
    preload: heroA('services'), ogImage: 'assets/img/services/og.webp',
    date: '2026-10-27', sitemap: { changefreq: 'monthly', priority: '0.9' },
  },
  {
    file: 'wrap.html', id: 'wrap', kind: 'landing', body: 'wrap.html', parent: 'services',
    title: 'Оклейка полиуретаном — Meat Wash',
    description: 'Оклейка автомобиля защитной полиуретановой плёнкой в Москве: прозрачной или цветной, зоны риска, весь кузов, фары и лобовое стекло. Технопарк.',
    headline: 'Оклейка полиуретаном', theme: 'dark', header: 'solid', cta: 'technopark',
    shared: ALL, css: ['services.css'],
    date: '2026-10-27', sitemap: { changefreq: 'monthly', priority: '0.7' },
  },
  {
    file: 'works.html', id: 'works', kind: 'landing', body: 'works.html', parent: 'services',
    title: 'Наши работы — Meat Wash',
    description: 'Работы Meat Wash: подготовка Lotus Eletre R к продаже, оклейка BMW M4 цветным полиуретаном, химчистка салона и полировка кузова в студиях в Москве.',
    headline: 'Наши работы', theme: 'dark', header: 'solid', cta: 'book',
    shared: WITH_BOOK, css: ['services.css'], ogImage: 'assets/img/auto-lotus-4.webp',
    date: '2026-10-27', sitemap: { changefreq: 'monthly', priority: '0.6' },
  },
  {
    file: 'import.html', id: 'import', kind: 'landing', body: 'import.html',
    title: 'Привоз авто из-за рубежа — Meat Wash',
    description: 'Привезём автомобиль из-за рубежа и подготовим его к жизни в России — например, сделаем русификацию. Обсудите задачу с Meat Wash в Telegram.',
    headline: 'Привоз авто из-за рубежа', theme: 'dark', header: 'over', cta: 'import',
    shared: ALL, css: ['auto.css'],
    preload: heroA('import'), ogImage: 'assets/img/import/og.webp',
    sitemap: { changefreq: 'monthly', priority: '0.7' },
  },
  {
    file: 'auto.html', id: 'auto', kind: 'landing', body: 'auto.html',
    title: 'Покупка и продажа авто — Meat Wash',
    description: 'Meat Wash: автомобили в продаже, продажа под реализацию, подготовка к продаже в наших студиях, подбор и покупка автомобиля под ключ в Москве.',
    headline: 'Покупка и продажа авто', theme: 'dark', header: 'solid', cta: 'auto',
    shared: ALL, css: ['auto.css'], ogImage: 'assets/img/auto-lotus-1.webp',
    date: '2026-10-27', sitemap: { changefreq: 'weekly', priority: '0.7' },
  },
  {
    file: 'about.html', id: 'about', kind: 'landing', body: 'about.html',
    title: 'О нас — Meat Wash Car Care Club, Москва',
    description: 'Meat Wash Car Care Club — ручной уход за автомобилем в Москве. Химия под покрытие, согласование на приёмке, проверка перед выдачей. Две студии.',
    headline: 'О нас', theme: 'dark', header: 'over', cta: 'book',
    shared: [...ALL, 'locations', 'membership'], css: ['about.css'],
    preload: heroA('about'), jsonLd: ['autowash'], ogImage: 'assets/img/about/og.webp',
    date: '2026-10-27', sitemap: { changefreq: 'monthly', priority: '0.7' },
  },
  {
    file: 'articles.html', id: 'articles', kind: 'list',
    title: 'Статьи об уходе за автомобилем — Meat Wash',
    description: 'Статьи Meat Wash об уходе за автомобилем: автомойка, защита кузова, стёкла и салон. Практичные советы и цены из каталога студий на Мясницкой и в Технопарке.',
    ogTitle: 'Статьи — Meat Wash Car Care Club',
    headline: 'Статьи', theme: 'paper', header: 'solid', cta: 'book',
    shared: WITH_BOOK, css: ['reading.css'],
    sitemap: { changefreq: 'weekly', priority: '0.6' },
  },
  ...ARTICLES.map((a) => ({
    ...a, kind: 'article', parent: 'articles', ogTitle: a.headline,
    theme: 'paper', header: 'solid', cta: 'book',
    shared: WITH_BOOK, css: ['reading.css'], ogImage: `assets/shots/${a.image}.webp`,
    sitemap: { changefreq: 'monthly', priority: '0.6' },
  })),
  {
    file: 'privacy.html', id: 'privacy', kind: 'doc', body: 'privacy.html',
    title: 'Политика обработки персональных данных — Meat Wash',
    description: 'Политика обработки персональных данных посетителей сайта Meat Wash Car Care Club: какие данные, цели, cookie и Яндекс Метрика, права и отзыв согласия.',
    headline: 'Политика обработки персональных данных', theme: 'paper', header: 'solid', cta: 'book',
    shared: ALL, css: ['reading.css'],
    sitemap: { changefreq: 'yearly', priority: '0.2' },
  },
  {
    file: 'consent.html', id: 'consent', kind: 'doc', body: 'consent.html',
    title: 'Согласие на обработку персональных данных — Meat Wash',
    description: 'Согласие посетителя сайта Meat Wash на обработку персональных данных с помощью cookie и сервиса Яндекс Метрика: данные, цель, срок и отзыв.',
    headline: 'Согласие на обработку персональных данных', theme: 'paper', header: 'solid', cta: 'book',
    shared: ALL, css: ['reading.css'],
    sitemap: { changefreq: 'yearly', priority: '0.2' },
  },
  // Согласие для заявки с фото — отдельный документ: другие данные и цель, чем у cookie.
  {
    file: 'consent-request.html', id: 'consent-request', kind: 'doc', body: 'consent-request.html',
    title: 'Согласие на обработку персональных данных при отправке заявки — Meat Wash',
    description: 'Согласие на обработку персональных данных при отправке заявки с фото на сайте Meat Wash: какие данные, цель, срок и как отозвать.',
    headline: 'Согласие на обработку персональных данных при отправке заявки', theme: 'paper', header: 'solid', cta: 'book',
    shared: ALL, css: ['reading.css'],
    sitemap: { changefreq: 'yearly', priority: '0.2' },
  },
  // Набор компонентов (WP1): все компоненты во всех вариантах. Нет в sitemap и в пакете
  // превью, на meatwash.ru его не выкладывает prune-deploy; страниц сайта не 13 — их 12.
  {
    file: 'kit.html', id: 'kit', kind: 'landing', body: 'kit.html',
    title: 'Набор компонентов — Meat Wash',
    description: 'Служебная страница: компоненты дизайн-системы Meat Wash во всех вариантах для проверки переполнения и контраста.',
    headline: 'Набор компонентов', theme: 'dark', header: 'solid', cta: 'book',
    shared: WITH_BOOK, css: ['services.css', 'auto.css', 'about.css', 'reading.css'],
    robots: 'noindex, nofollow', sitemap: false,
  },
];

