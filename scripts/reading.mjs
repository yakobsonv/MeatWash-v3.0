// Разметка страниц для чтения: список статей, статья, документ (план §3.8–3.9, паттерны
// Porsche P13, P27, P28, P30). Вынесено из content.mjs, чтобы вид (WP2) и каркас (WP0/WP7)
// не правили один файл (поправка критика 29). <head>, JSON-LD и общие части — scripts/content.mjs.
// Тема всех трёх видов — «бумага» (data-theme="paper" на <html>, решение Влада 27.10).
// Владелец: WP2. Классы общих компонентов — контракт §2.8 (hero-d, back-link, photo-card,
// promo, link-arrow, btn, col-*); вид страниц — dist/css/reading.css.
import {escape} from './catalog.mjs';
import {pageUrl, humanDate, icon} from './pages.mjs';
import {ARTICLES} from '../src/content/pages.mjs';

export const shot = (id, size) => `assets/shots/${id}${size === 's' ? '-s' : ''}.webp`;
// Время чтения — по числу слов (≈180 слов в минуту), без разметки.
export const readingMinutes = (html) => Math.max(1, Math.round(html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length / 180));
// Содержание статьи: h2 с id, кроме data-toc="no".
export const toc = (html) => [...html.matchAll(/<h2\b([^>]*)>([\s\S]*?)<\/h2>/g)]
  .map(([, attrs, inner]) => ({id: attrs.match(/\bid="([^"]+)"/)?.[1], skip: /\bdata-toc="no"/.test(attrs), text: inner.replace(/<[^>]+>/g, '').trim()}))
  .filter((h) => h.id && !h.skip);

// Тело статьи делится меткой «article:after» (HTML-комментарий): до неё — текст в колонке
// чтения, после — блоки во всю ширину под статьёй (промо записи #book-cta, P11).
const AFTER = '<!-- article:after -->';
export const splitArticle = (body) => {
  const i = body.indexOf(AFTER);
  return i < 0 ? [body, ''] : [body.slice(0, i), body.slice(i + AFTER.length)];
};

const img = (id, {sizes, alt = '', lazy = true, priority = false}) =>
  `<img src="${shot(id)}" srcset="${shot(id, 's')} 900w, ${shot(id)} 1600w" sizes="${sizes}" width="1600" height="894" alt="${escape(alt)}"${lazy ? ' loading="lazy"' : ''}${priority ? ' fetchpriority="high"' : ''} decoding="async">`;

// Карточка статьи (P13 «текст на фото»): вся карточка — одна ссылка (заголовок растянут
// на карточку), заголовок — h2 списка (h3 в «Ещё статьи»). Размер l — первая статья крупно, s — сетка (P27).
const articleCard = (a, minutes, size, h = 'h2') => `  <article class="photo-card photo-card--${size} article-card article-card--${size}">
    ${img(a.image, {sizes: size === 'l' ? '(max-width: 759px) 100vw, 82vw' : '(max-width: 759px) 100vw, (max-width: 1099px) 50vw, 30vw'})}
    <div class="photo-card__body article-card__body">
      <p class="article-card__meta"><time datetime="${a.date}">${humanDate(a.date)}</time>${minutes ? ` · ${minutes} мин чтения` : ''}</p>
      <${h} class="photo-card__title article-card__title"><a class="article-card__link" href="${pageUrl(a.file)}">${escape(a.headline)}</a></${h}>
      <p class="article-card__lead">${escape(a.lead)}</p>
      <span class="article-card__more" aria-hidden="true">Читать${icon('arrow-right')}</span>
    </div>
  </article>`;

// Список (P27): hero-d «Статьи» с лидом, первая статья крупно (photo-card--l), дальше сетка
// в 3 колонки. Вкладки-рубрики — от двух рубрик (план §3.8), пока их нет.
export function renderList(page, articles) {
  const [first, ...rest] = articles;
  return `<section class="hero-d col-wide reading-hero" aria-labelledby="page-title">
  <h1 id="page-title">${escape(page.headline)}</h1>
  <p class="hero-d__lead">Об уходе за автомобилем: что делать, когда и зачем. Цены в статьях — из каталога студий.</p>
</section>
<section class="section articles col-wide" aria-label="Список статей">
${first ? articleCard(first.article, first.minutes, 'l') : ''}
${rest.length ? `  <div class="articles__grid">\n${rest.map((a) => articleCard(a.article, a.minutes, 's')).join('\n')}\n  </div>` : ''}
</section>`;
}

// «Ещё статьи» под статьёй (P28 «Weitere Artikel»): до трёх других статей карточками s.
// Пока статья одна, блока нет (план §3.8).
export const renderMore = (others) => others.length ? `<section class="section more-articles col-wide" aria-labelledby="more-title">
  <h2 class="more-articles__title" id="more-title">Ещё статьи</h2>
  <div class="articles__grid">
${others.slice(0, 3).map((a) => articleCard(a, 0, 's', 'h3')).join('\n')}
  </div>
</section>` : '';

// Статья (P28): «← Статьи» вместо крошек (BreadcrumbList остаётся в JSON-LD), H1, лид,
// дата и минуты чтения, большое фото; тело в колонке --narrow; от 1100 px справа липкий
// столбец «Содержание» (h2[id] без data-toc="no") и «Записаться», уже — содержание блоком
// над текстом. Блоки после метки article:after — во всю ширину под статьёй.
export function renderArticle(page, body, minutes) {
  const [text, after] = splitArticle(body);
  const items = toc(text);
  const more = renderMore(ARTICLES.filter((a) => a.id !== page.id));
  return `<article class="article" aria-labelledby="page-title">
  <header class="article__head">
    <a class="back-link" href="${pageUrl('articles.html')}">${icon('chevron-left')}Статьи</a>
    <h1 id="page-title">${escape(page.headline)}</h1>
    <p class="article__lead">${escape(page.lead)}</p>
    <p class="article__meta"><time datetime="${page.date}">${humanDate(page.date)}</time> · ${minutes} мин чтения</p>
  </header>
  <figure class="article__hero">
    ${img(page.image, {sizes: '(max-width: 759px) 100vw, (max-width: 1099px) 92vw, 70vw', alt: page.imageAlt, lazy: false, priority: true})}
    ${page.imageNote ? `<figcaption class="article__hero-note">${escape(page.imageNote)}</figcaption>` : ''}
  </figure>
  <div class="article__layout">
    <aside class="article__aside" aria-label="Содержание статьи">
      <nav class="article__toc" aria-labelledby="toc-title">
        <h2 class="article__toc-title" id="toc-title" data-toc="no">Содержание</h2>
        <ol>${items.map((h) => `<li><a href="#${escape(h.id)}">${escape(h.text)}</a></li>`).join('')}</ol>
      </nav>
      <button class="btn btn--primary btn--block article__book" type="button" data-book>Записаться</button>
    </aside>
    <div class="article__body">
${text.trim()}
    </div>
  </div>
</article>${after.trim() ? `\n${after.trim()}` : ''}${more ? `\n${more}` : ''}`;
}

// Документ (P30): H1 --fs-3xl по колонке --basic, текст по --narrow, разделы --fs-lg.
// Строка «Редакция от …» (первый p.doc-meta тела) встаёт в шапку документа под H1.
export function renderDoc(page, body) {
  const meta = body.match(/^\s*(<p class="doc-meta">[\s\S]*?<\/p>)/);
  const text = meta ? body.slice(meta[0].length) : body;
  return `<article class="doc" aria-labelledby="page-title">
  <header class="doc__head col-basic">
    <h1 id="page-title">${escape(page.headline)}</h1>${meta ? `\n    ${meta[1]}` : ''}
  </header>
  <div class="doc__body col-narrow">
${text.trim()}
  </div>
</article>`;
}
