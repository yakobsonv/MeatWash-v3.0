"""§6.4 п. 5 (заявка), п. 6 (согласие), п. 7 (карты), п. 8 (шторка и клавиатура; WebKit —
поправка 23). Переходы в YCLIENTS не открываются. Владелец: WP7, с 05.11 — интегратор.

П. 5 после решения Влада 05.11 («всё — по заявкам»): любая «Оставьте заявку» ([data-request]
или [data-book] у программ мойки) открывает форму #request; онлайн-запись YCLIENTS — мелкая
строка [data-request-online] внутри формы со ссылками студий a[data-branch] (корзина программ
сохраняется). Контракт — docs/meat-auto/CONTRACTS.md, «Заявка»."""
import json
from common import Context, load, DIST

STUDIOS = {'myasnitskaya': '906067', 'technopark': '1743348'}

REQUEST_STATE = r"""() => {
  const d = document.querySelector('#request');
  const form = d?.querySelector('[data-request-form]');
  const online = d?.querySelector('[data-request-online]');
  const links = online && online.offsetParent ? [...online.querySelectorAll('a[data-branch]')].map(a => ({branch: a.dataset.branch, href: a.href})) : [];
  const chips = [...(d?.querySelectorAll('[data-request-chips] li') || [])].map(li => li.textContent.replace(/\u00a0/g, ' ').trim());
  return {open: Boolean(d?.open), topic: form?.elements?.topic?.value ?? null, chips, links, locked: document.documentElement.classList.contains('is-locked'),
          title: (document.querySelector('#request-title')?.textContent || '').trim(), context: (document.querySelector('#request-context')?.textContent || '').trim()};
}"""


# Открыть каждое окно записи / «Узнать цену» / разговора и проверить строку контекста.
CONTEXT_TYPO = r"""() => {
  const SHORT = '[а-яёa-z]{1,2}|для|без|под|над|при|про|обо|изо|или|как|что|чем|где|его|её|все|это';
  const bad = new RegExp(`(?:^|[ \u00a0(«„"—–-])(?:${SHORT}) (?=\\S)| —|\\d [\\d₽]`, 'iu');
  const out = {n: 0, bad: []};
  for (const el of document.querySelectorAll('[data-book],[data-request]')) {
    if (el.closest('dialog')) continue;
    el.click();
    const c = document.querySelector('#request-context');
    const t = c && !c.hidden ? c.textContent : '';
    document.querySelectorAll('dialog[open]').forEach(d => d.close());
    if (!t) continue;
    out.n++;
    if (bad.test(t)) out.bad.push(t.replace(/\u00a0/g, '~'));
  }
  return out;
}"""


def booking(browser, base, pages, res):
    details, ok_pages = [], 0
    for w in (1440, 390):
        c = Context(browser, w, 900, consent=False, touch=w < 768)
        pg = c.page()
        for p in pages:
            load(pg, f"{base}/{p['path']}")
            # Первая видимая «Оставьте заявку» (в шапке на компьютере, нижняя кнопка на телефоне).
            btn = pg.locator('[data-request]:visible').first
            btn.scroll_into_view_if_needed()
            label = btn.inner_text().replace('\u00a0', ' ').strip()
            btn.click()
            pg.wait_for_timeout(450)
            s = pg.evaluate(REQUEST_STATE)
            good = s['open'] and s['locked'] and label.startswith('Оставьте заявку') and (s['topic'] or '') == p['topic']
            pg.keyboard.press('Escape')
            pg.wait_for_timeout(450)
            closed = pg.evaluate("() => !document.querySelector('#request').open && !document.documentElement.classList.contains('is-locked')")
            if good and closed:
                ok_pages += 1
            else:
                details.append(f"/{p['path']} {w}: «{label}» open={s['open']} тема={s['topic']} (нужна «{p['topic']}») locked={s['locked']} closedByEsc={closed}")
        c.close()
    # /wash: «Внедорожник» + программа 3 → форма с темой «Автомойка», мелкая строка онлайн-записи
    # с корзиной YCLIENTS (ID из yclients.json)
    yc = json.loads((DIST / 'assets/yclients.json').read_text(encoding='utf-8'))
    c = Context(browser, 1440, 900, consent=False)
    pg = c.page()
    load(pg, f'{base}/wash')
    pg.locator('input[name="body-type"][value="2"]').evaluate('el => el.closest("label").click()')
    pg.wait_for_timeout(200)
    label = pg.locator('#body-price-label').inner_text()
    pg.locator('[data-book][data-program="3"]').first.click()
    try:
        pg.wait_for_function("() => [...document.querySelectorAll('#request [data-request-online] a[data-branch]')].some(a => a.href.includes('short?o='))", timeout=8000)
    except Exception:
        pass
    s = pg.evaluate(REQUEST_STATE)
    want = {b: yc['programs'][3][b][2] for b in STUDIOS}
    hrefs = {l['branch']: l['href'] for l in s['links']}
    cart_ok = s['open'] and s['topic'] == 'wash' and all(f'short?o=m-1s{want[b]}' in hrefs.get(b, '') for b in STUDIOS if want[b])
    pg.keyboard.press('Escape')
    pg.wait_for_timeout(400)
    # /services: «Оставьте заявку» в «Защите» → форма с темой «Детейлинг» и этой работой
    load(pg, f'{base}/services')
    pg.click('#tab-price-protection')
    pg.wait_for_timeout(300)
    row = pg.locator('#price-protection [data-request][data-request-category="protection"]').first
    service = row.get_attribute('data-request-services')
    row.click()
    pg.wait_for_timeout(450)
    t = pg.evaluate(REQUEST_STATE)
    talk_ok = t['open'] and t['topic'] == 'detailing' and any(service in x for x in t['chips']) and not t['links']
    c.close()
    # Строка «Вы выбрали / Вы спрашиваете» в окне (её пишет скрипт): короткие слова не висят,
    # перед тире и ₽ — неразрывный пробел; все кнопки записи, «Узнать цену» и разговора на
    # страницах с ними, на /services — при четырёх типах кузова, 320 и 390 (ревью 27.10).
    typo_total, typo_bad = 0, []
    for w in (320, 390):
        c = Context(browser, w, 800, consent=False)
        pg = c.page()
        for path in ('services', 'wash', 'detailing', 'wrap', 'bodywork', 'works', 'about', 'auto', 'article-avto-k-zime'):
            load(pg, f'{base}/{path}')
            for body in ((0, 1, 2, 3) if path == 'services' else (None,)):
                if body is not None:
                    pg.evaluate(f"() => {{ const i = document.querySelector('input[name=body-type][value=\"{body}\"]'); i.checked = true; i.dispatchEvent(new Event('change', {{bubbles: true}})); }}")
                r = pg.evaluate(CONTEXT_TYPO)
                typo_total += r['n']
                typo_bad += [f'/{path} {w}{"" if body is None else f" кузов {body}"}: {x}' for x in r['bad']]
        c.close()
    total = len(pages) * 2
    res.add('5', 'Заявка', ok_pages == total and cart_ok and talk_ok and not typo_bad,
            f'первая «Оставьте заявку» → #request[open] с темой страницы, блокировка и Esc: {ok_pages}/{total} ({len(pages)} страниц × 1440 и 390); '
            f'/wash «{label}» + программа 3 → тема {s["topic"]}, онлайн-запись {", ".join(f"{b}: …{hrefs.get(b, "")[-24:]}" for b in STUDIOS)} (ожидалось m-1s{want["myasnitskaya"]}/{want["technopark"]}) — {"да" if cart_ok else "нет"}; '
            f'«Оставьте заявку» в «Защите» → тема {t["topic"]}, работы {t["chips"]}, онлайн-записи нет: {not t["links"]}; '
            f'строка контекста в форме: {typo_total} открытий на 320 и 390, висящих слов и тире — {len(typo_bad)}',
            details + ([] if cart_ok else [f'корзина: {s}']) + ([] if talk_ok else [f'«Защита»: {t}']) + typo_bad[:10])


def consent(browser, base, res):
    c = Context(browser, 1440, 900)
    pg = c.page()
    load(pg, f'{base}/services')
    pg.wait_for_timeout(300)
    shown = pg.locator('.consent').is_visible()
    pg.click('[data-consent="0"]')
    pg.wait_for_timeout(300)
    load(pg, f'{base}/about')
    pg.wait_for_timeout(500)
    again = pg.locator('.consent').is_visible()
    after_decline = len(c.metrika)
    pg.locator('[data-consent-open]').scroll_into_view_if_needed()
    pg.click('[data-consent-open]')
    pg.wait_for_timeout(300)
    reopened = pg.locator('.consent').is_visible()
    focus = pg.evaluate("() => document.activeElement?.dataset?.consent")
    pg.click('[data-consent="1"]')
    pg.wait_for_timeout(800)
    frames_after_decline = list(c.metrika_frames)
    tag = [u for u in c.metrika if 'tag.js' in u]
    c.close()
    # Высокий экран (1280×1024): карты «О нас» в первом экране — виджет грузится сразу, без
    # прокрутки, и тянет свою Метрику (Политика п. 2.5 об этом говорит; «карта за согласием»
    # или по нажатию — решение Влада, план §4.4).
    c = Context(browser, 1280, 1024, consent=False)
    pg = c.page()
    load(pg, f'{base}/about')
    pg.wait_for_timeout(4000)
    tall_own, tall_frames = len(c.metrika), len(c.metrika_frames)
    c.close()
    ok = shown and not again and after_decline == 0 and tall_own == 0 and reopened and focus == '1' and tag
    res.add('6', 'Согласие (код сайта; виджет Карт — с оговоркой)', ok,
            f'первый визит — уведомление: {shown}; «Отказаться» → запросов кода сайта к mc.yandex.ru {after_decline + tall_own}, после перехода уведомления нет: {not again}; '
            f'«Настройки cookie» → уведомление {reopened}, фокус на «Принять»: {focus == "1"}; «Принять» → запрос tag.js: {len(tag)}; '
            f'ОГОВОРКА: виджет Яндекс Карт на /about без согласия сам обращается к mc.yandex.ru — после прокрутки {len(frames_after_decline)}, '
            f'на 1280×1024 без прокрутки {tall_frames} (Политика п. 2.5; карта по нажатию — решение Влада)',
            [f'виджет Карт (не код сайта): {u[:90]}' for u in frames_after_decline[:4]])


def maps(browser, base, res):
    out = []
    for w in (1440, 390):
        c = Context(browser, w, 900, consent=False, touch=w < 768)
        pg = c.page()
        load(pg, f'{base}/about')
        for studio in ('myasnitskaya', 'technopark'):
            pg.locator(f'#map-{studio}').scroll_into_view_if_needed()
            try:
                pg.wait_for_function(f"() => ['loaded','error'].includes(document.querySelector('#map-{studio}').dataset.state)", timeout=25000)
            except Exception:
                pass
            r = pg.evaluate(f"""() => {{ const m = document.querySelector('#map-{studio}'); const f = m.querySelector('iframe');
              return {{state: m.dataset.state, iframe: Boolean(f), widget: Boolean(f && f.src.includes('map-widget')),
                       retry: Boolean(m.querySelector('[data-map-retry]')?.offsetParent)}}; }}""")
            r.update(studio=studio, width=w)
            out.append(r)
        c.close()
    ok = all(r['iframe'] and r['widget'] and (r['state'] == 'loaded' or r['state'] == 'error' and r['retry']) for r in out)
    res.add('7', 'Карты', ok, '; '.join(f"{r['studio']} {r['width']}: iframe mapWidget {r['widget']}, data-state={r['state']}" for r in out))


FOCUS_JS = r"""() => { const a = document.activeElement; const cs = getComputedStyle(a);
  return {id: a.id, cls: a.className && a.className.baseVal === undefined ? a.className : '', text: (a.textContent || '').trim().slice(0, 30),
          style: cs.outlineStyle, width: parseFloat(cs.outlineWidth), color: cs.outlineColor,
          inDrawer: Boolean(a.closest('#drawer')), modal: document.querySelector('#drawer').matches(':modal')}; }"""


def drawer(browser, base, res, webkit=None):
    details, facts = [], []

    def scenario(br, name, w):
        c = Context(br, w, 900, consent=False, touch=w < 768)
        pg = c.page()
        load(pg, f'{base}/services')
        pg.keyboard.press('Tab')
        skip = pg.evaluate(FOCUS_JS)
        pg.keyboard.press('Tab')
        menu = pg.evaluate(FOCUS_JS)
        if name == 'webkit' and menu['id'] != 'drawer-open':
            # Safari по умолчанию не ставит Tab на ссылки: фокус на «Меню» ставим сами.
            pg.focus('#drawer-open')
            menu = pg.evaluate(FOCUS_JS)
        red = menu['style'] != 'none' and menu['width'] >= 2 and menu['color'] in ('rgb(226, 35, 26)', 'rgb(192, 21, 15)')
        pg.keyboard.press('Enter')
        pg.wait_for_timeout(500)
        opened = pg.evaluate(FOCUS_JS)
        trapped = True
        for _ in range(25):
            pg.keyboard.press('Tab')
            # Из модального окна Tab уходит только в интерфейс браузера (activeElement — body), не в страницу.
            if not pg.evaluate("() => document.activeElement === document.body || Boolean(document.activeElement.closest('#drawer'))"):
                trapped = False
                break
        pg.keyboard.press('Escape')
        pg.wait_for_timeout(500)
        back = pg.evaluate("() => ({id: document.activeElement.id, open: document.querySelector('#drawer').open, locked: document.documentElement.classList.contains('is-locked')})")
        deep = None
        if w < 768:
            pg.click('#drawer-open')
            pg.wait_for_timeout(450)
            pg.click('#drawer .drawer__item[aria-controls="drawer-p-care"]')
            pg.wait_for_timeout(450)
            sub = pg.evaluate("() => ({panel: !document.querySelector('#drawer-p-care').hidden, back: Boolean(document.querySelector('#drawer-p-care [data-drawer-back]')?.offsetParent)})")
            pg.click('#drawer-p-care [data-drawer-back]')
            pg.wait_for_timeout(450)
            root = pg.evaluate("() => Boolean(document.querySelector('#drawer .drawer__panel--root').offsetParent)")
            deep = sub['panel'] and sub['back'] and root
            pg.keyboard.press('Escape')
            pg.wait_for_timeout(400)
        # Ссылка «к содержанию»
        load(pg, f'{base}/about')
        if name == 'webkit':
            pg.focus('.skip-link')
        else:
            pg.keyboard.press('Tab')
        pg.keyboard.press('Enter')
        pg.wait_for_timeout(200)
        skipped = pg.evaluate("() => location.hash === '#main' || document.activeElement.id === 'main'")
        sticky = pg.evaluate("""async () => { const t = document.querySelector('.anchor-tabs'); if (!t) return null; scrollTo(0, t.getBoundingClientRect().top + scrollY + 900); await new Promise(r => setTimeout(r, 200)); return Math.round(t.getBoundingClientRect().top); }""")
        has = pg.evaluate("() => CSS.supports('selector(:has(a))')")
        c.close()
        ok = ((skip['cls'] == 'skip-link' or name == 'webkit') and menu['id'] == 'drawer-open' and red and opened['inDrawer'] and opened['modal'] and trapped
              and back['id'] == 'drawer-open' and not back['open'] and not back['locked'] and (deep is None or deep) and skipped and sticky == 0 and has)
        facts.append(f"{name} {w}: Tab → «{skip['text']}» → «Меню» (обводка {menu['style']} {menu['width']}px {menu['color']}); шторка :modal {opened['modal']}, фокус внутри {opened['inDrawer']}, "
                     f"Tab не выходит {trapped}; Esc → фокус на #{back['id']}, прокрутка свободна {not back['locked']}"
                     + (f'; вглубь «Услуги и цены» и «←» назад {deep}' if deep is not None else '') + f"; «к содержанию» {skipped}; липкие вкладки top={sticky}px; :has {has}")
        if not ok:
            details.append(facts[-1])
        return ok

    results = [scenario(browser, 'chromium', 1440), scenario(browser, 'chromium', 390)]
    if webkit:
        results += [scenario(webkit, 'webkit', 1440), scenario(webkit, 'webkit', 390)]
    res.add('8', 'Шторка и клавиатура', all(results), ' | '.join(facts), details)
