# Meat Auto: контракты пакетов (WP0, 27.10.2026)

Ветка `meat-auto` от `v2` (`fd8d88d`). План — `redesign/blueprint.md` (§8 «Поправки критика» важнее
остального), решения Влада 27.10 — в задаче. У каждого пакета своя ветка от `meat-auto` и PR в `meat-auto`;
`main`, `v2`, `v2-design` не трогаем, прод и хостинг не трогаем.

## Сборка и запуск

```
npm ci
npm run build          # catalog (js/data.js) → content (все 13 страниц + sitemap) → pages (общие части)
npm run check          # scripts/check.mjs: сборка, ссылки, якоря, мета, §4.9, каталог по смыслу, машины, бренд, гараж
npm run check:release  # то же, но пометки «нужно от клиента», реквизиты, нет og — ошибки (боевой пакет)
npm run check:3d       # бандл и модели 3D-гаража
npm start              # http://127.0.0.1:4173, адреса без .html (/services, /import, /kit); PORT=… — другой порт
npm run img -- <исходник> assets/img/<страница>/hero-{w}.webp --aspect 21:9 --focus 0.6,0.5 --widths 900,1600
npm run font           # пересобрать подмножество Manrope (docs/meat-auto/fonts.md)
node scripts/preview-pack.mjs --out ../meat-auto-preview   # пакет превью (docs/meat-auto/PREVIEW.md)
python3 scripts/qa/run.py [--preview URL --forwarded-proto https]   # приёмка §6.4 в браузере
```

`dist/*.html`, `dist/sitemap.xml`, `dist/js/data.js` — результат сборки, руками не править. В PR их можно не
включать (план §6.1): CI (`.github/workflows/check.yml`) сам делает `build` → `check` → `check:3d` на каждый push
и на PR в `meat-auto`. Проверки каркаса WP0 и нужное из прежней проверки сведены в `scripts/check.mjs` (WP7).


Браузер для проверок — только Playwright и его Chromium/WebKit, запросы к `mc.yandex.ru` обрывать. Снимки — не в git
(`scratchpad/shots/<пакет>/`).

## Владение файлами (каждым файлом владеет ровно один пакет)

«WP0 →» — заготовку сделал WP0, дальше файл принадлежит указанному пакету. Нужна правка чужого файла —
просьба владельцу; общие файлы (реестр, JSON, `site.js`, `package.json`, CI) правит только интегратор WP7.

| Пакет | Файлы |
|---|---|
| **WP1** оболочка и дизайн-система | `dist/css/tokens.css` (WP0 →), `base.css`, `components.css`, `shell.css`; `src/partials/header.html`, `footer.html` (WP0 →); `dist/js/shell.js`, `components.js` (WP0 →); `src/content/kit.html` (WP0 →); `server/404.html`; `dist/assets/brand/sprite.svg`, `bull.svg`, `car-care-club.svg` (WP0 →); `dist/assets/fonts/manrope-vf.woff2`, `source/fonts/*`, `scripts/font.sh` (WP0 →); `dist/assets/img/menu/*` |
| **WP2** главная и чтение | `src/content/home.html` (WP0 →), `dist/css/home.css`, `dist/js/home.js` (WP0 →); `dist/assets/img/home/*`, `dist/assets/img/og-meat-wash.jpg`; `scripts/reading.mjs` (WP0 →), `dist/css/reading.css`; `src/content/articles/*.html` |
| **WP3** мойка и детейлинг | `scripts/catalog.mjs`; `src/content/services.html`, `wrap.html`, `works.html` (WP0 →); `dist/css/services.css`; `dist/js/catalog.js`, `proof.js`; 3D-гараж: `dist/js/garage.js`, `config.js`, `porsche3d.bundle.js`, `dist/css/garage.css`, `src/porsche3d/**`, `source/3d/**`, `dist/assets/3d/**`, `scripts/bundle-3d.mjs`, `optimize-3d.mjs`, `check-3d.mjs`; `dist/assets/img/services/*` |
| **WP4** привоз, покупка и продажа | `scripts/cars.mjs`, `src/data/cars.json` (WP0 →); `src/content/auto.html`, `import.html` (WP0 →); `dist/css/auto.css`; `dist/assets/img/import/*` |
| **WP5** о нас и студии | `src/content/about.html` (WP0 →); `src/partials/locations.html`, `membership.html`; `dist/css/about.css`; `dist/js/maps.js`; `dist/assets/img/about/*` |
| **WP6** запись, окна, согласие, документы | `src/partials/dialogs.html`, `book.html`, `analytics.html`; `dist/css/dialogs.css`; `dist/js/ui.js`, `analytics.js`, `request.js`, `yclients.js`, `body.js`; `dist/assets/yclients.json`; `src/content/privacy.html`, `consent.html`, `consent-request.html` |
| **WP7** проверки, сведение, выкладка | `scripts/check.mjs`, `stamp-assets.mjs`, `prune-deploy.mjs`, `preview-pack.mjs`, `scripts/qa/**`; интегратор (WP0 →): `src/content/pages.mjs`, `scripts/content.mjs`, `pages.mjs`, `typo.mjs`, `img.mjs`, `dist/js/site.js`, `dist/assets/meatwash-content.json` (цены, `site.documentsDate`), `package.json`, `.github/workflows/check.yml`, `docs/meat-auto/*`; сгенерированные `dist/*.html`, `sitemap.xml`, `js/data.js` |
| никто (только чтение) | `source/v2-design/**` — утверждённая главная из `625ce74`, исходник для обрезок; `server/htaccess.txt` (прод); старые `dist/js/main.js`, `page.js`, `dist/css/style.css`, `cinematic.css`, `pages.css`, `catalog.css`, `proof.css`, шрифты Arsenal, `manrope.woff2/.ttf`, логотипы `Horizontal_*`, `Main_*` — страницы их не подключают, из выкладки их убирает WP7 |

## Сборка страниц: что уже работает

- **Реестр** `src/content/pages.mjs` — 12 страниц + `kit.html` (вне sitemap, `robots noindex`, ссылаться на неё нельзя —
  check). Поля и значения — в шапке файла. Имена картинок героя и og зафиксированы заранее:
  `assets/img/{services,import,about}/hero-900.webp` (1:1, до 760 px) и `hero-1600.webp` (21:9, от 760 px), `…/og.webp`
  1200×630; главная — имена v2 в `assets/img/home/` и `assets/img/og-meat-wash.jpg`. Положите файл — сборка сама
  добавит `preload` и размеры og. Пока файла нет, check предупреждает.
- **`<head>`** (`scripts/content.mjs`): `<html lang="ru" data-theme="dark|paper|home">`, класс `.js`, `theme-color` по теме,
  мета и og, preload шрифта и героя, `@font-face` с тем же `?v=`, 5 общих CSS (`tokens, base, components, shell, dialogs`)
  + CSS страницы, `<script type="module" src="js/site.js">`, JSON-LD. `<body data-page="<id>" data-kind="landing|list|article|doc">`,
  ссылка «Перейти к содержанию» → `#main`.
- **Темы:** тёмная — услуги, оклейка, работы, привоз, авто, о нас, kit; **«бумага»** — список статей, статья, три документа
  (Влад 27.10); главная — `home` (светлая страница + `.is-dark`, как v2, делает WP2).
- **JSON-LD:** хлебные крошки по иерархии (`Meat Auto` → Мойка и детейлинг → Оклейка / Наши работы; → Статьи → статья);
  `AutoWash` ×2 на главной и «О нас» (`name` «Meat Auto — Мясницкая», `alternateName` «Meat Wash», `url` `…/about#map-<id>`,
  часы из JSON, `sameAs` — карточка в Картах; фото Технопарка не ставим — автор «ГЕОмаркетинг»); `Article`, `CollectionPage`.
- **Старые якоря главной** (`/#locations`, `#map-*`, `#membership`, `#club`, `#services`, `#proof`, `#garage`) уводятся
  `location.replace` на `about#…` / `services#…`; `#contacts` и `#top` остаются.
- **3D-гараж** (решение Влада 27.10): блок `#garage-3d` на `/services` с кнопкой `[data-garage-open]`; `site.js` грузит
  `garage.js` по первому нажатию, сцена и модель — внутри, как раньше. Id `garage` и `garage-title` заняты окном,
  которое строит `garage.js`, — разметке страниц их не давать. `garage.css` подключён на `/services`, но держится на
  старых переменных (`--ivory-rgb`, `--t` и др.): WP3 переводит его на токены. Абзац о гараже в Политике остаётся.

## Подстановки (одни и те же в частях и телах)

Аргументы — любые символы, кроме `{` `}`; кириллица работает (`{{price:Полировка кузова + 2 слоя керамики}}`).
Неизвестная подстановка или оставшиеся `{{`/`}}` — сборка падает. Подстановка с разметкой внутри атрибута — тоже.
**В HTML-комментариях фигурные скобки подстановок не писать.** Полный список — в шапке `scripts/pages.mjs`; главное:

| Подстановка | Результат |
|---|---|
| `{{to:<id>}}#якорь` | `#якорь` на своей странице, `about#якорь` на чужой (ссылки шторки, подвала) |
| `{{current:<id>}}` | ` aria-current="page"` только на этой странице |
| `{{header-variant}}` | `over` \| `solid` из реестра |
| `{{locations}}#map-<id>` | `#map-…` на «О нас», `about#map-…` на остальных |
| `{{loc:<id>:<поле>}}` | name type address hours floor phone tel booking map **route** card |
| `{{price:<позиция>}}`, `{{min:<раздел>}}` | «от 1 000 ₽»; «2 150 ₽» (мойка — минимум программ) |
| `{{program:<i>}}` / `:name` / `:time` / `:price` | «Трёхфазная» в кавычках / имя / «30 минут» / «от 2 150 ₽» |
| `{{count:sale\|sold\|studios}}`, `{{count:sold:машина}}` | 2 / 16 / 2; «16 машин» (склонение — `NOUNS` в `pages.mjs`) |
| `{{cars:sale}}`, `{{cars:sold}}`, `{{cars:date}}` | карточки `article.car-card#<id>`, `li.sold-card` ×16, «22 сентября 2026 года» |
| `{{catalog}}`, `{{compare}}` | каталог и сравнение программ (`scripts/catalog.mjs`, WP3) |
| `{{brand:name\|descriptor\|legacy\|since}}` | Meat Auto · Car Care Club · Meat Wash · 2021 |
| `{{todo:<что нужно>}}` | `<span class="todo" data-no-typo>[нужно от клиента: …]</span>`; только `/import` и `/works` |
| `{{icon:<имя>}}`, `{{icon:bull}}`, `{{icon:ccc:<класс>}}` | `<svg><use href="assets/brand/sprite.svg?v=<хеш>#i-…">`; иконки: menu close chevron-right/left/down arrow-right arrow-up-right arrow-up check phone telegram pin play pause cta-arrow |
| `{{asset:<путь>}}` | путь с `?v=<хеш содержимого>` |

В `title`, `description`, `ogTitle` реестра работают текстовые: `{{min}}`, `{{count}}`, `{{price}}`, `{{brand}}`, `{{program}}`
(description `/services` берёт «Мойка от {{min:wash}}» из JSON).

## Типографика

- `typo()` (`scripts/typo.mjs`) сама ставит `&nbsp;` после предлогов и союзов, перед тире, между числом и словом/₽ —
  **только в текстовых узлах** всех страниц и частей. Атрибуты не трогает (поправка 16): `data-price-item`,
  `data-yc-items`, `data-request-services`, `data-book-context` пишите обычными пробелами, побуквенно как в JSON
  (check сверяет). Не трогает `script style svg title textarea pre code option`. Отключить для элемента —
  атрибут `data-no-typo`. Слова через дефис — `<span class="nw">из-за</span>`.
- Знаков ↗ и ✓ в тексте нет (их нет в Manrope) — только `{{icon:arrow-up-right}}`, `{{icon:check}}`. U+2011 есть.
- **Решение Влада: никаких мелких надзаголовков-дескрипторов и никакой нумерации блоков** — `.eyebrow` над H1/H2
  и «01 / 02 / 03» в шагах страницам не ставить (план местами их предлагает — решение Влада важнее).
- `lang="en"` у «Meat Auto» и «Car Care Club» в заголовках.

## Классы и атрибуты — контракт

- **Оболочка (WP1):** `header.site-header.site-header--{over|solid}#top > .site-header__bar > button.site-header__menu#drawer-open[aria-controls=drawer][aria-expanded] + a.site-header__logo + button.site-header__book[data-book]`;
  `dialog.drawer#drawer > .drawer__panels > nav.drawer__panel--root` + `section.drawer__panel#drawer-p-{care|import|auto|about|contacts}[hidden]`,
  `button.drawer__item[aria-controls=drawer-p-*]`, `[data-drawer-back]`, `[data-drawer-close]`, `.drawer__tiles > a.drawer__tile`,
  `.drawer__links`, `.drawer__foot`. Подвал `footer.site-footer#contacts`, «На карте» строго
  `<a class="footer__map" href="{{locations}}#map-<id>" data-map-link="<id>">`. Нижняя кнопка — `.btn.btn--primary.mobile-cta`
  (пишет `pages.mjs` по полю `cta`: book, technopark, auto, import). Пункта шторки «Русификация» нет до ответа Романа.
- **Компоненты (§2.8, WP1 стилизует, страницы пишут сразу):** `hero-a/b/c/d/e` с `__media __body __lead __actions __aside`,
  `back-link`, `section-head`, `btn` + `--primary --secondary --ghost --compact --block`, `pill-cta`, `link-arrow`,
  `chip` + `--solid --photo --check`, `anchor-tabs[data-anchor-tabs] > .anchor-tabs__track > a.anchor-tabs__tab`,
  `segmented`, `page-bar[data-page-bar]`, `details.accordion > summary.accordion__head + .accordion__body`, `card`,
  `card--outline`, `zigzag`, `promo.col-ext > .promo__media + .promo__panel` (+ `--paper --reverse`), `teaser`, `teasers--skewed`,
  `photo-card--{l|m|s}`, `carousel[data-carousel]`, `mosaic`, `ul.strip[tabindex=0][aria-label]` (+ `--tall`), `counters`,
  `steps`, `link-rows`, `quote-band`, `figure.ba[data-ba]`, `span.todo`, контейнеры `col-wide|ext|basic|title|narrow`,
  `section`, `section--tight`, скрытый текст `.sr` (ловушка заявки — `.visually-hidden`).
- **Запись (WP6, без изменений):** любой `[data-book]` + `data-book-context`, `data-program="0…4"`, `data-yc-programs`,
  `data-yc-items="A|B"`, `data-request-services`; «Узнать цену» — `[data-request][data-request-category][data-request-services]`;
  разговор — `[data-membership="…"]`; окно `#booking` и его id §4.2; клубная карта `[data-club-card]`; `[data-consent-open]`.
  В окне записи — строка «Онлайн-запись откроется в YCLIENTS (Meat Wash)».
- **Каталог (WP3, §4.3):** `#catalog`, `nav[data-catalog-tabs]`, `#price-<раздел>`, id подразделов из JSON, `#price-list`,
  `#programs`, `details#program-0…4`, `input[name=body-type]`, `#body-price-label`, `[data-program-price][data-prices]`,
  `li.catalog__item[data-price-item]`. Сейчас `renderCatalog()` ещё отдаёт прежнюю разметку (на 320 px она шире экрана
  на 23 px без стилей); тизер гаража и «Под вашу задачу» из неё убраны — они теперь `#garage-3d` и `#individual` в `services.html`.
  Пары «до/после» — с видимой подписью «Иллюстрация, не работа студии» (Влад 27.10).
- **Карты (WP5, §4.4):** `div.location__map#map-<id>[data-map-embed=<id>][data-state=idle][tabindex=-1]`, `[data-map-status]`,
  `[data-map-retry]`, `a.location__external`, `[data-map-slow]`; `<iframe>` в разметке нет. Блок студий — внутри
  `#visit-locations` на «О нас» (маркеры части уже в теле). Один раз на странице — «ранее Meat Wash»; H1 не «Meat Auto».
- **Машины (WP4, §4.6):** данные — `src/data/cars.json` (не в `meatwash-content.json`, поправка 29), разметка — `scripts/cars.mjs`:
  `article.car-card#<id>` (`lotus-eletre`, `bmw-740ld`), `.car-card__title/__facts/__price/__lead/__specs/__prep/__actions`,
  `li.sold-card > img + h3.sold-card__name + span.chip`. `/import`: только Telegram @otec_roman, без телефона; пометки `{{todo}}`.
- **Якоря §1.7** уже есть в заготовках и проверяются: `services#price-*`, `#programs`, `#program-0…4`, `#price-list`, `#proof`,
  `#individual`, `#garage-3d`; `about#visit-locations`, `#map-myasnitskaya`, `#map-technopark`, `#before-visit`, `#founder`, `#club`,
  `#path`, `#studios`, `#team`, `#membership`; `auto#for-sale`, `#sold`, `#sell`, `#auto-contact`, `#lotus-eletre`, `#bmw-740ld`;
  `import#what`, `#rusifikaciya`, `#prep`, `#for-sale-link`, `#contact`; `wrap#wrap-kind`, `#wrap-prices`, `#wrap-steps`, `#wrap-call`;
  `works#works-lotus`, `#works-m4`, `#works-studio`. Убирать якорь можно только вместе со всеми ссылками на него.
- **JS:** вход один — `dist/js/site.js`: `setupShell()` → `setupComponents()` → `setupUI()`, затем по признаку в разметке
  `catalog.js` (`#catalog`), `proof.js` (`[data-ba]`), `home.js` (`.dirs`), `garage.js` (`[data-garage-open]`, по нажатию).
  `html.is-locked` ставит только `ui.js` (WP6 вешает `syncLock` на `close` всех `dialog`); `shell.js` его не трогает,
  шторку закрывает сразу (`dialog.close()`) в фазе capture перед `[data-book]`, `[data-request]`, `[data-membership]`, `a`.
- **Картинки:** только существующие файлы или обрезки `scripts/img.mjs`; для машин — только из замаскированных
  `source/v2-design/img/*` (номера и таблички закрыты), новый кадр проверить глазами; после первой выкладки файл
  не перезаписывать — новое имя. Фото «ГЕОмаркетинг» на новые страницы не ставить.

## «Готово, когда» (по §6.4)

| Пакет | Готово, когда |
|---|---|
| WP1 | `kit.html` со всеми компонентами; 0 горизонтальной прокрутки на 320–1920 и 667×375; шторка: Tab → фокус внутри, Esc закрывает и возвращает фокус на «Меню», переход вглубь на 390; контраст выбранных состояний ≥ 3:1, фокус на бордо — слоновой костью |
| WP2 | главная совпадает с /v2/ (свой рендер в видимом окне) с общими шапкой и подвалом; плитка 2 → `import`; статья и документы на «бумаге», содержание из `h2[id]`; `check` без предупреждений о бренде в статье |
| WP3 | 41 позиция и 20 цен программ в DOM `/services`, 13 якорей подразделов, `#program-0…4`; кузов «Внедорожник» + программа 3 → ссылка `short?o=m-1s…`; гараж открывается по нажатию, 3D не грузится до него; подписи у пар «до/после» |
| WP4 | 2 машины, 18 фото, 16 проданных; счётчики совпадают на главной, в шторке и на `/auto`; `/import` без телефона и без выдуманных фактов |
| WP5 | карты: `iframe` появляется при прокрутке, `data-state=loaded` или `error` с «Повторить»; все якоря «О нас»; «ранее Meat Wash» один раз |
| WP6 | на каждой странице первая `[data-book]` открывает `#booking` с двумя студиями; «Отказаться» → 0 запросов к `mc.yandex.ru`; «Узнать цену» в «Защите» — первым Технопарк; документы с датой новой редакции |
| WP7 | `npm run check` = переписанный `check.mjs` (включая проверки отсюда), `check:release` зелёный перед боевым пакетом, `preview-pack` по §6.5 с `--no-metrika` по умолчанию, `qa` по §6.4 |

## Что ещё знать

- **Белый бык на «бумаге» не виден.** Шапка на страницах с темой `paper` должна оставаться тёмной полосой
  (бык белый, как решил Влад) — или это вопрос Владу. Решает WP1.
- Подпись плитки 2 главной: Влад изменил только ссылку (→ `import`); «Подробнее о привозе» (поправка 8) — вопрос Владу.
- Предупреждения `check` сейчас: старые части WP5/WP6 (`MEATWASH / REQUEST`, «MEATWASH Car Care Club» в клубном блоке,
  знак ↗), «MEATWASH» в тексте статьи (WP2), нет og-картинок (WP2–WP5), три пометки `{{todo}}` (WP3, WP4).
  Подпись разговора в `ui.js` 'Meatwash Car Care Club' → 'Meat Auto Car Care Club' (WP6).
- После `typo()` строка окна заявки — `До&nbsp;5&nbsp;фото:`; старая проверка ищет `>До 5 фото:` побуквенно — WP7 учитывает.
- Метрика на превью выключена по умолчанию (`preview-pack --no-metrika`, WP7); мета счётчика в `dist` остаётся.
- `site.documentsDate` (сейчас 2026-10-02) и `lastmod` в реестре выставляет WP7 при сведении.
- Материалы Porsche (`redesign/ref/`, замеры) в репозиторий и пакет не кладём.

## Сведение WP7 (27.10.2026)

Ветки `wp1`…`wp6` слиты в `meat-auto` по очереди без конфликтов; сгенерированное пересобрано отдельным коммитом.
Правки в чужих файлах при сведении (минимальные):

- `dist/css/auto.css` (WP4), `dist/css/about.css` (WP5) — удалены временные слои `wp4-fallback` и `wp5-fallback`.
  Вне слоёв оставлены правила, которые слои давали страницам: форма панели «RU» на `/import` (4:3, радиус),
  цвет текста бордовой панели связи; удалена строка-заплатка героя A на `/import` (WP1 исправил у себя).
- `src/content/about.html`, `import.html` — у `.hero-a__actions` добавлен класс `actions` (контракт WP1).
- `dist/css/about.css` — клубный блок на 320 px был шире экрана на 22 px (фото 4:3 с `min-height: 240px` растягивало
  колонку); колонка — `minmax(0, 1fr)`, до 760 px без `min-height`.
- `dist/js/ui.js` (WP6) — карты студий грузятся, когда появляются на экране (было с запасом 600 px): на «О нас» они
  сразу под героем, и виджет Яндекса (≈ 5 МБ, сторонние cookie, его Метрика) грузился при открытии страницы.
  Помогает только на экранах ниже ≈ 930 px: на 768×1024, 1280×1024 и выше карта Мясницкой уже в первом экране и
  виджет со своей Метрикой грузится сразу, без согласия (ревью 27.10). Политика п. 2.1 и 2.5 теперь говорит об этом
  прямо; «карта по нажатию» или «карта за согласием» — решение Влада (план §4.4), п. 6 приёмки — с оговоркой.
- `src/content/pages.mjs` — `date` страниц и `site.documentsDate` — 2026-10-27 (новая редакция документов WP6);
  удалены совместимые экспорты `CONTENT` и `SITEMAP` старой проверки.

Новое у WP7: `scripts/check.mjs` (+ `--release`), `stamp-assets.mjs [папка]` (и `url()` шрифтов в CSS),
`prune-deploy.mjs` (список Meat Auto; гараж остаётся), `preview-pack.mjs`, `scripts/qa/*` (приёмка §6.4,
`serve-preview.sh` — пакет в локальном Apache). Порядок выкладки превью — `docs/meat-auto/PREVIEW.md`.
