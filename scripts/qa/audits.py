"""§6.4 п. 9 (Lighthouse, мобильный режим) и п. 13 (контраст: axe-core + пары выбранных
состояний, поправка 20). Владелец: WP7.

Lighthouse — `npx lighthouse` с CHROME_PATH на Chrome for Testing из ms-playwright (не
системный Chrome). axe-core — файл axe.min.js: --axe, переменная AXE_PATH или
node_modules/axe-core рядом с репозиторием; нет файла — п. 13 только по парам цветов.
"""
import json
import os
import pathlib
import subprocess
from common import Context, load, ROOT

LH_PAGES = ['', 'wash', 'services', 'auto', 'about', 'article-avto-k-zime']
LH_VERSION = os.environ.get('LIGHTHOUSE_VERSION', '12.8.2')
RUNS = int(os.environ.get('LIGHTHOUSE_RUNS', '5'))


def lighthouse(chrome, base, out, res, *, headers=None, seo_base=None):
    out = pathlib.Path(out) / 'lighthouse'
    out.mkdir(parents=True, exist_ok=True)
    rows, details, ok = [], [], True

    def run(url, name, cats):
        path = out / f'{name}.json'
        cmd = ['npx', '--yes', f'lighthouse@{LH_VERSION}', url, '--form-factor=mobile', '--quiet', '--output=json', f'--output-path={path}',
               '--chrome-flags=--headless=new --no-first-run', f'--only-categories={",".join(cats)}']
        if headers:
            cmd.append('--extra-headers=' + json.dumps(headers))
        subprocess.run(cmd, cwd=ROOT, env={**os.environ, 'CHROME_PATH': chrome}, capture_output=True, text=True, timeout=300)
        data = json.loads(path.read_text(encoding='utf-8'))
        score = {k: round((v.get('score') or 0) * 100) for k, v in data['categories'].items()}
        audits = data['audits']
        return score, audits

    # Медиана пяти прогонов (так советует сам Lighthouse): у симулированного LCP бывают выбросы до +1 с.
    med = lambda xs: sorted(xs)[len(xs) // 2]
    for p in LH_PAGES:
        runs = [run(f'{base}/{p}', f"{p or 'home'}-{i}", ['performance', 'accessibility', 'best-practices']) for i in range(RUNS)]
        score = {k: med([r[0][k] for r in runs]) for k in runs[0][0]}
        lcps = [r[1]['largest-contentful-paint']['numericValue'] / 1000 for r in runs]
        lcp, cls = med(lcps), med([r[1]['cumulative-layout-shift']['numericValue'] for r in runs])
        a = runs[[x for x in lcps].index(lcp)][1]
        seo = None
        if seo_base:
            s2, _ = run(f'{seo_base}/{p}', (p or 'home') + '-seo', ['seo'])
            seo = s2['seo']
        good = score['performance'] >= 85 and score['accessibility'] >= 95 and score['best-practices'] >= 95 and lcp <= 2.5 and cls <= 0.05 and (seo is None or seo >= 95)
        ok &= good
        row = f"/{p}: P {score['performance']} · A {score['accessibility']} · BP {score['best-practices']}" + (f' · SEO {seo}' if seo is not None else '') + f' · LCP {lcp:.2f} s ({"/".join(f"{x:.2f}" for x in lcps)}) · CLS {cls:.3f}'
        rows.append(row)
        if not good:
            fails = [f"{k}: {v['title']} ({v.get('displayValue', '')})" for k, v in a.items() if v.get('score') is not None and v['score'] < 0.9 and v.get('scoreDisplayMode') in ('binary', 'numeric', 'metricSavings')]
            details.append(row + ' — ' + '; '.join(fails[:8]))
    res.add('9', f'Lighthouse (мобильный, медиана {RUNS} прогонов)', ok, ' | '.join(rows), details)


CONTRAST_JS = r"""() => {
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return {r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1}; };
  const over = (top, under) => ({r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1});
  const lum = ({r, g, b}) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const bgOf = (el) => { let stack = []; for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0) { stack.push(c); if (c.a >= 1) break; } } let base = {r: 255, g: 255, b: 255, a: 1}; if (!stack.length || stack[stack.length - 1].a < 1) base = parse(getComputedStyle(document.body).backgroundColor) || base; return stack.reverse().reduce((acc, c) => over(c, acc), base); };
  const out = [];
  const check = (sel, label) => { for (const el of document.querySelectorAll(sel)) { if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') continue; const own = bgOf(el), page = bgOf(el.parentElement.parentElement || el.parentElement); const text = over(parse(getComputedStyle(el).color), own); out.push({label, state: ratio(own, page).toFixed(2), text: ratio(text, own).toFixed(2)}); break; } };
  check('.anchor-tabs__tab[aria-current="true"], .anchor-tabs__tab[aria-current="location"], .anchor-tabs__tab[aria-current="page"]', 'вкладка-якорь выбрана');
  check('.catalog__tab[aria-selected="true"]', 'вкладка каталога выбрана');
  check('.segmented input:checked + span', 'переключатель выбран');
  return out;
}"""


def contrast(browser, base, res, axe=None):
    pages = ['', 'wash', 'detailing', 'wrap', 'bodywork', 'services', 'auto', 'about', 'article-avto-k-zime', 'privacy', 'kit']
    axe = axe or os.environ.get('AXE_PATH') or next((str(p) for p in [ROOT / 'node_modules/axe-core/axe.min.js', ROOT.parent / 'node_modules/axe-core/axe.min.js'] if p.exists()), None)
    violations, nodes, details, pairs = 0, 0, [], []
    for w in (1440, 390):
        c = Context(browser, w, 900, consent=False, reduced=True, touch=w < 768)
        pg = c.page()
        for p in pages:
            load(pg, f'{base}/{p}', scroll=True)
            if p in ('services', 'about'):
                pg.evaluate("() => { const t = document.querySelector('.anchor-tabs, .catalog__tabs'); if (t) scrollTo(0, t.getBoundingClientRect().top + scrollY + 600); }")
                pg.wait_for_timeout(300)
                for pr in pg.evaluate(CONTRAST_JS):
                    pairs.append(f"/{p} {w}: {pr['label']} — к фону {pr['state']}:1, текст {pr['text']}:1")
                    if float(pr['state']) < 3 or float(pr['text']) < 4.5:
                        details.append(pairs[-1])
                        violations += 1
            if axe:
                pg.add_script_tag(path=axe)
                # Без исключений: водяные знаки «PPF» — generated content (::before), не текст.
                r = pg.evaluate("async () => { const r = await axe.run(document, {runOnly: {type: 'rule', values: ['color-contrast']}}); return r.violations.map(v => v.nodes.map(n => n.target.join(' ') + ' — ' + (n.any[0]?.message || '').slice(0, 120))).flat(); }")
                nodes += 1
                if r:
                    violations += len(r)
                    details += [f'/{p} {w}: {x}' for x in r[:6]]
        c.close()
    res.add('13', 'Контраст', violations == 0,
            (f'axe-core color-contrast без исключений: {len(pages)} страниц × 2 ширины, нарушений {violations}' if axe else 'axe-core не найден (AXE_PATH) — только пары выбранных состояний')
            + '; пары выбранных состояний: ' + ('; '.join(pairs) or 'нет'), details)
