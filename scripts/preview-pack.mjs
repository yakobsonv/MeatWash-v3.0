// Пакет превью Meat Auto для поддомена (план §6.5; поправки критика 1, 11, 26, 28, 35–37).
// Сам dist не трогает: копирует его в --out и готовит копию к загрузке в корень поддомена.
//
//   npm run build && npm run check
//   node scripts/preview-pack.mjs --out ../meat-auto-preview [--host new.meatwash.ru]
//        [--metrika] [--previous ../meat-auto-preview.manifest.txt]
//
// Что делает:
//   1. копирует dist в --out (папку очищает), запускает там prune-deploy, сжимает CSS (esbuild,
//      без смены синтаксиса), склеивает стили каждой страницы в один css/b-<хеш>.css и ставит
//      ?v=<короткий sha HEAD> (stamp-assets);
//   2. в каждом *.html: <meta name="robots" content="noindex, nofollow">; внутри <head>
//      (canonical, og:*, JSON-LD) https://meatwash.ru/ → https://<host>/ — тексты документов
//      не трогает; по умолчанию (--no-metrika) убирает <meta name="mw-metrika">: без номера
//      счётчика analytics.js не показывает уведомление и не грузит Метрику (поправка 11);
//   3. удаляет sitemap.xml, yandex_*.html, api/ (заявки на превью выключены), kit.html;
//   4. пишет robots.txt (Disallow: /) и .htaccess из server/htaccess.txt боевого сайта с
//      хостом превью и заголовком X-Robots-Tag: noindex, nofollow; проверяет, что адреса
//      meatwash.ru без поддомена в правилах не осталось;
//   5. кладёт 404.html из server/404.html (с ?v= у CSS) и PREVIEW.txt (хост, sha, дата);
//      из всех *.html вырезает HTML-комментарии (маркеры SHARED нужны только check, а он
//      работает по dist; в комментариях — заметки разработки), JS сжимает esbuild (без
//      комментариев; бандл 3D-гаража не трогает — он уже собран, лицензии в LEGAL.txt);
//   6. проверяет пакет (noindex на каждой странице, ?v= у каждого CSS и JS, нет адресов
//      боевого сайта в <head>, нет Метрики при --no-metrika) и печатает отчёт: страницы,
//      адреса с ?v=, пометки «нужно от клиента», размер, бюджеты (поправка 26);
//   7. пишет список файлов пакета рядом с папкой (<out>.manifest.txt — не в загрузку);
//      с --previous <старый manifest> печатает файлы прошлой выкладки, которых в новой
//      нет: их Влад удаляет на сервере сам (поправка 37).
// Код выхода 1 — пакет не прошёл проверку или превышен бюджет.
// Владелец: WP7.
import {cp, rm, mkdir, readdir, readFile, writeFile, stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve, dirname, join, relative, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'), dist = resolve(root, 'dist');
const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback; };
const host = opt('--host', 'new.meatwash.ru');
const out = resolve(opt('--out', resolve(root, '..', 'meat-auto-preview')));
const metrika = args.includes('--metrika') && !args.includes('--no-metrika');
const previous = opt('--previous', null);
const PROD = 'https://meatwash.ru';
const SITE = `https://${host}`;

if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) || host === 'meatwash.ru' || host === 'www.meatwash.ru') { console.error(`--host: нужен поддомен превью, не боевой сайт (${host})`); process.exit(1); }
const inside = (a, b) => a === b || a.startsWith(b + sep);
if (inside(out, root) || inside(dist, out) || out === '/' ) { console.error(`--out: папка вне репозитория и не над ним (${out})`); process.exit(1); }
if (!existsSync(resolve(dist, 'index.html'))) { console.error('Нет dist/index.html — сначала npm run build'); process.exit(1); }

const git = (...a) => execFileSync('git', a, {cwd: root, encoding: 'utf8'}).trim();
const sha = git('rev-parse', '--short=7', 'HEAD');
const dirty = git('status', '--porcelain', '--untracked-files=no', '--', 'dist', 'src', 'scripts', 'server') !== '';
const node = (script, ...a) => execFileSync(process.execPath, [resolve(root, 'scripts', script), ...a], {cwd: root, encoding: 'utf8'});
const problems = [];

// Список прошлой выкладки читаем до сборки: новый manifest может лечь по тому же пути.
const before = previous ? (await readFile(resolve(previous), 'utf8')).split('\n').filter(Boolean) : null;

// 1. Копия, отсев, сжатие CSS
await rm(out, {recursive: true, force: true});
await mkdir(dirname(out), {recursive: true});
await cp(dist, out, {recursive: true});
for (const name of ['sitemap.xml', 'kit.html', 'robots.txt']) await rm(resolve(out, name), {force: true});
for (const name of await readdir(out)) if (/^yandex_\w+\.html$/.test(name)) await rm(resolve(out, name));
await rm(resolve(out, 'api'), {recursive: true, force: true});
const pruned = node('prune-deploy.mjs', out).trim().split('\n').pop();
await cp(resolve(root, 'server/404.html'), resolve(out, '404.html'));
const cssFiles = (await readdir(resolve(out, 'css'))).filter((n) => n.endsWith('.css'));
for (const name of cssFiles) {
  const file = resolve(out, 'css', name);
  execFileSync(resolve(root, 'node_modules/.bin/esbuild'), [file, '--minify', '--log-level=error', '--allow-overwrite', `--outfile=${file}`], {cwd: root});
}
// JS: сжатие по файлу, без склейки (import './x.js' остаются как есть — их помечает stamp-assets).
for (const name of (await readdir(resolve(out, 'js'))).filter((n) => n.endsWith('.js') && n !== 'porsche3d.bundle.js')) {
  const file = resolve(out, 'js', name);
  execFileSync(resolve(root, 'node_modules/.bin/esbuild'), [file, '--minify', '--legal-comments=none', '--log-level=error', '--allow-overwrite', `--outfile=${file}`], {cwd: root});
}
// Один файл стилей на страницу (поправка 28, бюджет 26): 5 общих CSS + CSS страницы склеиваются
// в css/b-<хеш>.css в том же порядке. На мобильном Lighthouse каждый блокирующий файл — лишний
// круг по сети: с 6–7 файлами LCP был 2,8–3,3 с, с одним — 1,5–2,3 с. Страницы с одинаковым
// набором получают один и тот же файл; отдельные CSS, на которые больше никто не ссылается, удаляются.
let bundles = 0;
{
  const {createHash} = await import('node:crypto');
  const made = new Set();
  for (const name of (await readdir(out)).filter((n) => n.endsWith('.html'))) {
    const file = resolve(out, name);
    let html = await readFile(file, 'utf8');
    const run = html.match(/(?:<link rel="stylesheet" href="\/?css\/[\w.-]+\.css">\n)+/);
    if (!run) continue;
    const links = [...run[0].matchAll(/href="(\/?)css\/([\w.-]+\.css)"/g)];
    if (links.length < 2) continue;
    const css = (await Promise.all(links.map(([, , n]) => readFile(resolve(out, 'css', n), 'utf8')))).join('\n');
    const bundle = `b-${createHash('sha256').update(css).digest('hex').slice(0, 10)}.css`;
    if (!made.has(bundle)) { await writeFile(resolve(out, 'css', bundle), css); made.add(bundle); bundles++; }
    html = html.replace(run[0], `<link rel="stylesheet" href="${links[0][1]}css/${bundle}">\n`);
    await writeFile(file, html);
  }
  const used = (await Promise.all((await readdir(out)).filter((n) => n.endsWith('.html')).map((n) => readFile(resolve(out, n), 'utf8')))).join('\n').replace(/<!--[\s\S]*?-->/g, '');
  for (const name of await readdir(resolve(out, 'css'))) if (!used.includes(`css/${name}`)) await rm(resolve(out, 'css', name));
}
const stamped = node('stamp-assets.mjs', sha, out).trim();
// 404.html собирается вне генератора: шрифт и спрайт — по тем же адресам с хешем, что на
// страницах (иначе браузер держал бы вторую копию шрифта — поправка 28).
{
  const index = await readFile(resolve(out, 'index.html'), 'utf8'), file = resolve(out, '404.html');
  let page = await readFile(file, 'utf8');
  for (const asset of ['assets/fonts/manrope-vf.woff2', 'assets/brand/sprite.svg']) {
    const v = index.match(new RegExp(`${asset.replace(/[.]/g, '\\.')}\\?v=([\\w]+)`))?.[1];
    if (v) page = page.replace(new RegExp(`/${asset.replace(/[.]/g, '\\.')}(?![?\\w])`, 'g'), `/${asset}?v=${v}`);
  }
  await writeFile(file, page);
}

// 2. Страницы: без HTML-комментариев, noindex, адрес превью в <head>, без Метрики.
// Комментарии вырезаются вне <script>, <style>, <textarea> и <pre>; строка, где был только
// комментарий, уходит целиком.
const stripComments = (html) => html.split(/(<(script|style|textarea|pre)\b[\s\S]*?<\/\2>)/i)
  .map((part, i) => (i % 3 === 0 ? part.replace(/^[ \t]*<!--[\s\S]*?-->[ \t]*\n/gm, '').replace(/<!--[\s\S]*?-->/g, '') : i % 3 === 1 ? part : ''))
  .join('');
const pages = (await readdir(out)).filter((n) => n.endsWith('.html'));
let todo = 0;
for (const name of pages) {
  const file = resolve(out, name);
  let html = stripComments(await readFile(file, 'utf8'));
  const end = html.indexOf('</head>');
  if (end < 0) { problems.push(`${name}: нет </head>`); continue; }
  let head = html.slice(0, end), body = html.slice(end);
  head = head.replace(/<meta name="robots" content="[^"]*">\n?/g, '');
  head = head.replace(/(<meta charset="utf-8">\n?)/i, `$1<meta name="robots" content="noindex, nofollow">\n`);
  if (!head.includes('<meta name="robots" content="noindex, nofollow">')) head = head.replace(/<head>\n?/, `<head>\n<meta name="robots" content="noindex, nofollow">\n`);
  head = head.split(PROD + '/').join(SITE + '/').split(`"${PROD}"`).join(`"${SITE}"`);
  if (!metrika) head = head.replace(/<meta name="mw-metrika" content="\d+">\n?/g, '');
  html = head + body;
  todo += (html.match(/<span class="todo"/g) || []).length;
  await writeFile(file, html);
}

// 4. robots.txt и .htaccess
await writeFile(resolve(out, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
let htaccess = await readFile(resolve(root, 'server/htaccess.txt'), 'utf8');
htaccess = htaccess.split(PROD).join(SITE);
htaccess = htaccess.replace(/^# MEATWASH — meatwash\.ru\n/m, `# Meat Auto — превью ${host} (собрано scripts/preview-pack.mjs из server/htaccess.txt, ${sha}).\n# Боевой сайт meatwash.ru этот файл не использует. Всё превью закрыто от индексации.\n`);
htaccess = htaccess.replace(/<IfModule mod_headers\.c>\n/, `<IfModule mod_headers.c>\n  # Превью: закрыто от поиска (план §6.5)\n  Header always set X-Robots-Tag "noindex, nofollow"\n`);
if (!htaccess.includes('Header always set X-Robots-Tag "noindex, nofollow"')) problems.push('.htaccess: не удалось добавить X-Robots-Tag');
const rules = htaccess.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
const leak = rules.match(/.{0,40}(?<![\w.-])meatwash\.ru.{0,20}/);
if (leak) problems.push(`.htaccess: в правилах остался адрес боевого сайта: …${leak[0].trim()}…`);
if (!rules.includes(`${SITE}%1 [R=301,L,NE]`) || !rules.includes(`${SITE}/$1 [R=301,L]`)) problems.push('.htaccess: переадресации не ведут на поддомен');
await writeFile(resolve(out, '.htaccess'), htaccess);

// 5. PREVIEW.txt
const date = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
await writeFile(resolve(out, 'PREVIEW.txt'), `Meat Auto — превью\nhost: ${host}\nsha: ${sha}${dirty ? ' (рабочая копия с правками)' : ''}\nbuilt: ${date}\nmetrika: ${metrika ? 'on' : 'off'}\n`);

// 6. Проверка пакета
async function collect(dir) {
  const list = [];
  for (const e of await readdir(dir, {withFileTypes: true})) {
    const full = join(dir, e.name);
    if (e.isDirectory()) list.push(...await collect(full)); else list.push(full);
  }
  return list;
}
const all = (await collect(out)).map((f) => relative(out, f).split(sep).join('/')).sort();
for (const banned of ['sitemap.xml', 'kit.html', 'api/request.php', 'assets/meatwash-content.json']) if (all.includes(banned)) problems.push(`в пакете ${banned}`);
if (all.some((f) => /^yandex_\w+\.html$/.test(f))) problems.push('в пакете файл Вебмастера');
let versioned = 0;
const gz = async (p) => gzipSync(await readFile(resolve(out, p)), {level: 9}).length;
const js = {};
for (const f of all.filter((f) => /^js\/[^/]+\.js$/.test(f))) js[f.slice(3)] = await readFile(resolve(out, f), 'utf8');
const graph = (entry) => {
  const seen = new Set(), queue = [entry];
  while (queue.length) {
    const n = queue.pop();
    if (seen.has(n) || !js[n]) continue;
    seen.add(n);
    for (const [, u] of js[n].matchAll(/(?:\bfrom\s*|\bimport\s*)['"]\.\/([^'"?]+)(\?v=[\w.-]+)?['"]/g)) queue.push(u);
  }
  return [...seen];
};
const BUDGET = {html: 20 * 1024, css: 30 * 1024, js: 30 * 1024, font: 60 * 1024, lcpPhone: 120 * 1024, lcpDesktop: 200 * 1024};
const budgets = [];
for (const name of pages) {
  const html = await readFile(resolve(out, name), 'utf8');
  if (!html.includes('<meta name="robots" content="noindex, nofollow">')) problems.push(`${name}: нет noindex`);
  if (html.includes('<!--')) problems.push(`${name}: остался HTML-комментарий`);
  const head = html.slice(0, html.indexOf('</head>'));
  if (head.includes(PROD + '/')) problems.push(`${name}: в <head> остался адрес ${PROD}/`);
  if (!metrika && /mw-metrika|mc\.yandex\.ru/.test(html)) problems.push(`${name}: Метрика в пакете при --no-metrika`);
  for (const [, u] of html.matchAll(/<(?:link\b[^>]*\bhref|script\b[^>]*\bsrc)="(\/?(?:css|js)\/[^"]+)"/g)) { if (u.includes(`?v=${sha}`)) versioned++; else problems.push(`${name}: без ?v=${sha}: ${u}`); }
  if (name === '404.html') continue;
  const css = [...html.matchAll(/<link rel="stylesheet" href="css\/([^"?]+)/g)].map((m) => m[1]);
  const entry = [...html.matchAll(/<script\b[^>]*src="js\/([^"?]+)/g)].map((m) => m[1]);
  const mods = [...new Set(entry.flatMap(graph))];
  const row = {page: name, html: await gz(name), css: 0, js: 0, lcpPhone: 0, lcpDesktop: 0};
  for (const c of css) row.css += await gz(`css/${c}`);
  for (const m of mods) row.js += await gz(`js/${m}`);
  for (const [tag, href] of html.matchAll(/<link rel="preload" as="image" href="([^"]+)"[^>]*>/g)) {
    // Самый тяжёлый кадр, который может выбрать браузер (srcset), — в бюджет.
    const media = tag.match(/ media="([^"]+)"/)?.[1];
    const set = tag.match(/ imagesrcset="([^"]+)"/)?.[1]?.split(',').map((p) => p.trim().split(/\s+/)[0]) || [href];
    let size = 0;
    for (const p of set) size = Math.max(size, (await stat(resolve(out, p))).size);
    if (!media || /max-width/.test(media)) row.lcpPhone = Math.max(row.lcpPhone, size);
    if (!media || /min-width/.test(media)) row.lcpDesktop = Math.max(row.lcpDesktop, size);
  }
  for (const k of ['html', 'css', 'js', 'lcpPhone', 'lcpDesktop']) if (row[k] > BUDGET[k]) problems.push(`${name}: бюджет ${k} превышен — ${(row[k] / 1024).toFixed(1)} КБ > ${BUDGET[k] / 1024} КБ`);
  budgets.push(row);
}
// Заметки разработки не уходят в пакет (ревью 27.10): имена, номера поправок, автор чужого фото.
// Имя Романа и его личный Telegram (Влад 05.11) — тоже: единственное исключение — реквизиты
// оператора ПДн (152-ФЗ) в Политике и Согласиях; пробелы в них после typo() — неразрывные.
const operatorName = JSON.parse(await readFile(resolve(root, 'dist/assets/meatwash-content.json'), 'utf8')).site?.operator?.name || '';
const operatorRe = operatorName && new RegExp(operatorName.split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(?:\\s|&nbsp;|\u00a0)+'), 'g');
const LEGAL = new Set(['privacy.html', 'consent.html', 'consent-request.html']);
for (const f of all.filter((f) => /\.(html|js|css|txt)$/.test(f) && f !== 'js/porsche3d.bundle.js')) {
  let text = await readFile(resolve(out, f), 'utf8');
  if (LEGAL.has(f) && operatorRe) text = text.replace(operatorRe, '');
  const hit = text.match(/.{0,30}(?:Влад|Паш[аеи]|поправк|ГЕОмаркетинг|Бадаев|Роман|Антонович|otec_roman).{0,30}/);
  if (hit) problems.push(`${f}: внутренняя заметка или имя в пакете: …${hit[0].trim()}…`);
}
const fontSize = (await stat(resolve(out, 'assets/fonts/manrope-vf.woff2'))).size;
if (fontSize > BUDGET.font) problems.push(`шрифт ${fontSize} Б > 60 КБ`);
if (/meatwash\.ru\/(?!\w)/.test(await readFile(resolve(out, 'robots.txt'), 'utf8'))) problems.push('robots.txt: ссылка на боевой sitemap');

// 7. Список файлов (вне папки загрузки) и файлы прошлой выкладки, которых нет в новой
const manifest = `${out}.manifest.txt`;
await writeFile(manifest, all.join('\n') + '\n');
let stale = [];
if (before) {
  const now = new Set(all);
  stale = before.filter((f) => !now.has(f));
}

// Отчёт
let bytes = 0;
for (const f of all) bytes += (await stat(resolve(out, f))).size;
const kb = (n) => (n / 1024).toFixed(1);
console.log(`Пакет превью: ${out}`);
console.log(`  хост ${host}, sha ${sha}${dirty ? ' (в рабочей копии есть незакоммиченные правки)' : ''}, Метрика ${metrika ? 'включена' : 'выключена (--no-metrika)'}`);
console.log(`  страниц: ${pages.length} (из них 404.html), файлов: ${all.length}, размер: ${(bytes / 1048576).toFixed(2)} МБ`);
console.log(`  ${pruned}`);
console.log(`  ${stamped}; адресов CSS/JS с ?v=${sha} в HTML: ${versioned}; файлов стилей после склейки: ${bundles}`);
console.log(`  пометок «нужно от клиента»: ${todo}`);
console.log(`  шрифт manrope-vf.woff2: ${kb(fontSize)} КБ`);
console.log('  бюджеты, КБ gzip (HTML ≤ 20, CSS ≤ 30, JS до взаимодействия ≤ 30; LCP-картинка ≤ 120 телефон / ≤ 200 компьютер, КБ):');
for (const r of budgets) console.log(`    ${r.page.padEnd(26)} html ${kb(r.html).padStart(5)}  css ${kb(r.css).padStart(5)}  js ${kb(r.js).padStart(5)}  lcp ${r.lcpPhone ? kb(r.lcpPhone) : '—'} / ${r.lcpDesktop ? kb(r.lcpDesktop) : '—'}`);
console.log(`  список файлов: ${manifest}`);
if (previous) console.log(stale.length ? `  на сервере остались от прошлой выкладки (удалить вручную, ${stale.length}):\n    ${stale.join('\n    ')}` : '  файлов прошлой выкладки, которых нет в новой, — нет');
if (problems.length) { console.error(`ПАКЕТ НЕ ГОТОВ (${problems.length}):\n- ${problems.join('\n- ')}`); process.exit(1); }
console.log('Пакет готов. Загрузка и проверка — docs/meat-auto/PREVIEW.md.');
