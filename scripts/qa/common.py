"""Общее для проверок в браузере (план §6.4; поправки критика 23, 36). Владелец: WP7.

Только Playwright и его встроенные браузеры (Chrome for Testing и WebKit из
~/Library/Caches/ms-playwright); системный Chrome не запускается. Запросы к
mc.yandex.ru во всех прогонах обрываются, считается только попытка запроса.
Снимки и выгрузки — в папку --out вне репозитория (по умолчанию ../meat-auto-qa).
"""
import json
import os
import pathlib
import socket
import subprocess
import sys
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
DIST = ROOT / 'dist'
WIDTHS = [320, 360, 375, 390, 414, 768, 1024, 1280, 1440, 1920]
LANDSCAPE = [(667, 375), (844, 390)]
METRIKA = 'mc.yandex.ru'


def registry():
    """Страницы из src/content/pages.mjs: file, id, theme, kind, адрес без .html."""
    code = ("import {REGISTRY} from './src/content/pages.mjs';"
            "console.log(JSON.stringify(REGISTRY.map(p=>({file:p.file,id:p.id,theme:p.theme||'dark',kind:p.kind,sitemap:Boolean(p.sitemap),cta:p.cta,topic:p.topic||''}))))")
    out = subprocess.run(['node', '--input-type=module', '-e', code], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    pages = json.loads(out)
    for p in pages:
        p['path'] = '' if p['file'] == 'index.html' else p['file'][:-5]
    return pages


def content():
    return json.loads((DIST / 'assets/meatwash-content.json').read_text(encoding='utf-8'))


def free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


class DistServer:
    """npm start (serve.cjs) на свободном порту, если --base не задан."""

    def __init__(self, base=None):
        self.base, self.proc = base, None

    def __enter__(self):
        if self.base:
            return self.base.rstrip('/')
        port = free_port()
        self.proc = subprocess.Popen(['node', 'serve.cjs'], cwd=ROOT, env={**os.environ, 'PORT': str(port)},
                                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.base = f'http://127.0.0.1:{port}'
        for _ in range(50):
            try:
                urllib.request.urlopen(self.base + '/', timeout=1)
                break
            except Exception:
                time.sleep(0.1)
        return self.base

    def __exit__(self, *exc):
        if self.proc:
            self.proc.terminate()


class Context:
    """Контекст браузера: обрыв mc.yandex.ru (с подсчётом попыток), заголовки, согласие."""

    def __init__(self, browser, width=1440, height=900, *, consent=None, reduced=False, headers=None,
                 block_maps=False, touch=False):
        opts = {'viewport': {'width': width, 'height': height}, 'reduced_motion': 'reduce' if reduced else 'no-preference'}
        if headers:
            opts['extra_http_headers'] = headers
        if touch:
            opts.update(has_touch=True, is_mobile=True, device_scale_factor=2)
        self.ctx = browser.new_context(**opts)
        self.metrika = []
        self.metrika_frames = []
        self.failed = []
        self.responses = []

        def route(r):
            url = r.request.url
            if METRIKA in url:
                # Запрос самой страницы или чужого iframe (виджет Яндекс Карт грузит свою Метрику).
                try:
                    main = r.request.frame.parent_frame is None
                except Exception:
                    main = True
                (self.metrika if main else self.metrika_frames).append(url)
                return r.abort()
            if block_maps and ('yandex.ru/map-widget' in url or 'api-maps' in url):
                return r.abort()
            return r.continue_()
        self.ctx.route('**/*', route)
        if consent is not None:
            value = json.dumps({'v': 1, 'analytics': bool(consent), 'at': '2026-10-27T00:00:00Z'})
            self.ctx.add_init_script(f"try{{localStorage.setItem('mw:consent',{json.dumps(value)})}}catch(e){{}}")

    def page(self):
        pg = self.ctx.new_page()
        pg.on('response', lambda r: self.responses.append((r.status, r.url)))
        pg.on('requestfailed', lambda r: self.failed.append((r.url, r.failure)))
        self.errors = []
        pg.on('pageerror', lambda e: self.errors.append(str(e)))
        pg.on('console', lambda m: self.errors.append(m.text) if m.type == 'error' and METRIKA not in m.text and 'ERR_FAILED' not in m.text else None)
        return pg

    def close(self):
        self.ctx.close()


def load(pg, url, *, scroll=False):
    pg.goto(url, wait_until='load')
    pg.evaluate('document.fonts.ready.then(() => true)')
    if scroll:
        pg.evaluate("""async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += Math.round(innerHeight * .8)) { scrollTo(0, y); await new Promise(r => setTimeout(r, 40)); } scrollTo(0, 0); }""")
    pg.wait_for_timeout(150)


def own(url, base):
    return url.startswith(base)


class Results:
    def __init__(self, out):
        self.out = pathlib.Path(out)
        self.out.mkdir(parents=True, exist_ok=True)
        # Пункты прошлых запусков (--only) сохраняются; у каждого — время своего прогона.
        f = self.out / 'results.json'
        self.items = json.loads(f.read_text(encoding='utf-8')) if f.exists() else {}

    def add(self, key, title, ok, numbers, details=None):
        self.items[key] = {'title': title, 'pass': bool(ok), 'numbers': numbers, 'details': details or [], 'at': time.strftime('%Y-%m-%d %H:%M')}
        mark = 'PASS' if ok else 'FAIL'
        print(f'[{mark}] {key} {title}: {numbers}', flush=True)
        for d in (details or [])[:12]:
            print(f'       - {d}', flush=True)
        self.save()

    def save(self):
        (self.out / 'results.json').write_text(json.dumps(self.items, ensure_ascii=False, indent=1), encoding='utf-8')


def log(*a):
    print(*a, file=sys.stderr, flush=True)
