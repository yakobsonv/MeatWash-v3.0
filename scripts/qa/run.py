"""Приёмка Meat Auto в браузере (план §6.4, п. 1–15; поправки критика 23, 26, 36). Владелец: WP7.

Только Playwright и его встроенные Chromium и WebKit (Chrome for Testing из
~/Library/Caches/ms-playwright); системный Chrome не запускается. Запросы к mc.yandex.ru
во всех прогонах обрываются. Снимки и выгрузки — в --out вне репозитория.

  python3 scripts/qa/run.py                       # dist через npm start; п. 4, 10, 11 — пропуск
  python3 scripts/qa/run.py --preview https://new.meatwash.ru
  python3 scripts/qa/run.py --preview http://127.0.0.1:4180 --forwarded-proto https   # пакет в локальном Apache
  python3 scripts/qa/run.py --only 2,5 --out ../meat-auto-qa

  --base URL           сайт из dist (по умолчанию npm start на свободном порту)
  --preview URL        пакет превью (п. 4, 10, 11 и Lighthouse); без него п. 4/10/11 пропускаются
  --forwarded-proto    добавить X-Forwarded-Proto (как за nginx хостинга) к запросам на --preview
  --host               имя поддомена для проверки 301 (new.meatwash.ru)
  --axe PATH           axe.min.js (иначе AXE_PATH или node_modules/axe-core)
  --only / --skip      номера пунктов через запятую
"""
import argparse
import json
import pathlib
import subprocess
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from playwright.sync_api import sync_playwright  # noqa: E402
from common import ROOT, DistServer, Results, registry  # noqa: E402
import layout, links, flows, audits, content  # noqa: E402,E401


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--base')
    ap.add_argument('--preview')
    ap.add_argument('--forwarded-proto')
    ap.add_argument('--host', default='new.meatwash.ru')
    ap.add_argument('--out', default=str(ROOT.parent / 'meat-auto-qa'))
    ap.add_argument('--axe')
    ap.add_argument('--only', default='')
    ap.add_argument('--skip', default='')
    a = ap.parse_args()
    only = set(filter(None, a.only.split(','))) or {str(i) for i in range(1, 16)}
    only -= set(filter(None, a.skip.split(',')))
    res = Results(a.out)
    pages = registry()
    headers = {'X-Forwarded-Proto': a.forwarded_proto} if a.forwarded_proto else None

    if '1' in only:
        r = subprocess.run(['node', 'scripts/check.mjs'], cwd=ROOT, capture_output=True, text=True)
        text = r.stdout + r.stderr
        todo_pages = sorted({line.split('—', 1)[1].split(':')[0].strip() for line in text.splitlines() if 'нужно от клиента —' in line})
        # Пометки «нужно от клиента» — только на страницах направлений, /import и /works (check.mjs, TODO_PAGES).
        ok = r.returncode == 0 and set(todo_pages) <= {'wash.html', 'detailing.html', 'wrap.html', 'bodywork.html', 'import.html', 'works.html'}
        res.add('1', 'Сборка и статические проверки', ok, (text.strip().splitlines() or [''])[0] + f'; check: {"PASS" if r.returncode == 0 else "FAIL"}; пометки «нужно от клиента» только на: {", ".join(todo_pages) or "—"}',
                [l for l in text.splitlines() if l.startswith('- ') and 'нужно от клиента' not in l][:20])

    with DistServer(a.base) as base, sync_playwright() as p:
        chromium = p.chromium.launch()
        webkit = p.webkit.launch() if only & {'2', '8'} else None
        if '2' in only: layout.overflow(chromium, base, pages, res, webkit)
        if '3' in only: layout.fonts(chromium, base, pages, res)
        if a.preview and only & {'4', '10', '11'}:
            links.run(a.preview, a.host, headers or {}, pages, res)
            if '4' in only: links.sweep(chromium, a.preview, headers, pages, res)
        elif only & {'4', '10', '11'}: print('[SKIP] 4, 10, 11 — нужен --preview (пакет превью)')
        if '5' in only: flows.booking(chromium, base, pages, res)
        if '6' in only: flows.consent(chromium, base, res)
        if '7' in only: flows.maps(chromium, base, res)
        if '8' in only: flows.drawer(chromium, base, res, webkit)
        if '9' in only: audits.lighthouse(p.chromium.executable_path, (a.preview or base).rstrip('/'), a.out, res, headers=headers if a.preview else None, seo_base=base)
        if '12' in only: layout.motion(chromium, base, pages, res)
        if '13' in only: audits.contrast(chromium, base, res, a.axe)
        if '14' in only: content.inventory(chromium, base, pages, res)
        if '15' in only: content.brand(chromium, base, pages, res)
        chromium.close()
        if webkit: webkit.close()

    print('\n# | Проверка | Итог | Числа')
    for k in sorted(res.items, key=int):
        v = res.items[k]
        print(f"{k} | {v['title']} | {'PASS' if v['pass'] else 'FAIL'} | {v['numbers']}")
    print(f'\nПодробности: {pathlib.Path(a.out) / "results.json"}')
    sys.exit(0 if all(v['pass'] for v in res.items.values()) else 1)


if __name__ == '__main__':
    main()
