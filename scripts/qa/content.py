"""§6.4 п. 14 (ничего не потеряно — чек-лист инвентаря §9) и п. 15 (бренд) — по DOM после
скриптов. Владелец: WP7."""
import json
import re
from common import Context, load, content as site_content, DIST


def inventory(browser, base, pages, res):
    d = site_content()
    cars = json.loads((DIST.parent / 'src/data/cars.json').read_text(encoding='utf-8'))
    facts, issues = [], []
    c = Context(browser, 1440, 900, consent=False)
    pg = c.page()
    load(pg, f'{base}/services')
    s = pg.evaluate("""() => { const T = (x) => x.replace(/\u00a0/g, ' '); return {
      items: document.querySelectorAll('li.catalog__item[data-price-item]').length,
      notes: document.querySelectorAll('li.catalog__item .catalog__item-note').length,
      estimate: document.querySelectorAll('.catalog__item-price--estimate').length,
      onsite: document.querySelectorAll('.catalog__item-onsite').length,
      programs: [...document.querySelectorAll('.program-card__price > [data-program-price]')].map(e => e.dataset.prices.split(',').length),
      details: [...document.querySelectorAll('details[id^="program-"]')].map(e => e.id),
      sections: [...document.querySelectorAll('.catalog__section[id]')].map(e => e.id),
      bodies: document.querySelectorAll('input[name="body-type"]').length,
      includesNote: T(document.body.innerText).includes('Каждая следующая включает предыдущую'),
      offer: T(document.body.innerText).includes('Не является публичной офертой'),
      pairs: [...document.querySelectorAll('figure[data-ba]')].map(f => T(f.innerText).includes('Иллюстрация, не работа студии')),
      garage: Boolean(document.querySelector('#garage-3d [data-garage-open]')),
    }; }""")
    onsite_want = sum(len(sec['items']) for g in d['groups'] for sec in g['sections'] if sec.get('onsite'))
    want_sections = [sec['id'] for g in d['groups'] for sec in g['sections']]
    checks = [
        (s['items'] == 41 and s['notes'] == 41, f"позиций {s['items']}, с пояснением {s['notes']} (41)"),
        (s['estimate'] == 4, f"«После оценки» {s['estimate']} (4)"),
        (s['onsite'] == onsite_want, f"«добавим при приёмке» {s['onsite']} ({onsite_want})"),
        (sum(s['programs']) == 20 and len(s['programs']) == 5, f"цен программ {sum(s['programs'])} (5 × 4 = 20)"),
        (s['details'] == [f'program-{i}' for i in range(5)], f"#program-0…4: {len(s['details'])}"),
        (s['sections'] == want_sections, f"подразделов с якорями {len(s['sections'])} — как в JSON ({len(want_sections)}; в инвентаре написано 13, но сумма его же таблицы 2+3+4+3 = 12)"),
        (s['bodies'] == 4 and s['includesNote'], 'переключатель кузова (4) и «каждая следующая включает предыдущую»'),
        (s['offer'], '«Не является публичной офертой»'),
        (s['pairs'] and all(s['pairs']), f"пары «до/после» с подписью «Иллюстрация, не работа студии»: {sum(s['pairs'])}/{len(s['pairs'])}"),
        (s['garage'], '3D-гараж: кнопка в #garage-3d'),
    ]
    load(pg, f'{base}/auto')
    a = pg.evaluate("""() => ({cards: [...document.querySelectorAll('article.car-card')].map(c => [c.id, c.querySelectorAll('.strip img').length]),
      sold: document.querySelectorAll('li.sold-card').length, channel: [...document.querySelectorAll('a[href*="t.me/MEATWASH_Auto"], a[href*="t.me/meat"]')].length,
      date: document.body.innerText.replace(/\u00a0/g, ' ').includes('22 сентября 2026')})""")
    checks += [
        ([x[0] for x in a['cards']] == ['lotus-eletre', 'bmw-740ld'] and sum(x[1] for x in a['cards']) == 18, f"машин {len(a['cards'])}, фото {sum(x[1] for x in a['cards'])} (2, 18)"),
        (a['sold'] == len(cars['sold']) == 16, f"проданных {a['sold']} (16)"),
        (a['channel'] >= 1, 'ссылка на канал MEAT AUTO'),
        (a['date'], 'дата цен «22 сентября 2026»'),
    ]
    load(pg, f'{base}/about')
    b = pg.evaluate("""() => { const t = document.body.innerText.replace(/\u00a0/g, ' '); return {founder: Boolean(document.querySelector('#founder img')), path: document.querySelectorAll('#path li').length,
      press: document.querySelectorAll('img[src*="press-service-parts"]').length, team: Boolean(document.querySelector('#team')),
      visit: ['500', 'аркинг', 'плат'].every(w => (document.querySelector('#before-visit')?.innerText || '').replace(/\u00a0/g, ' ').includes(w)),
      authors: /Фото|фото:/.test(t), talk: Boolean(document.querySelector('[data-membership]')), wahelp: Boolean(document.querySelector('a.membership__link[href*="wahelp"]')),
      external: document.querySelectorAll('a.location__external').length, earlier: (t.match(/ранее Meat Wash/g) || []).length}; }""")
    checks += [
        (b['founder'] and b['path'] >= 4 and b['press'] >= 2 and b['team'], f"основатель, путь ({b['path']}), пресса ({b['press']}), команда"),
        (b['visit'], '«Перед визитом»: скидка 500 ₽, паркинг, оплата'),
        (b['talk'] and b['wahelp'], '«Обсудить условия» и клубная карта wahelp'),
        (b['external'] == 2, f"«Открыть в Яндекс Картах» у обеих карт: {b['external']}"),
        (b['earlier'] == 0, f"«ранее Meat Wash» на «О нас» (имя снова Meat Wash, 29.10): {b['earlier']}"),
    ]
    # Старые якоря главной ведут на новые места (поправка 32)
    hops = {}
    for h, want in [('garage', 'services#garage-3d'), ('locations', 'about#visit-locations'), ('map-technopark', 'about#map-technopark'), ('membership', 'about#membership')]:
        pg.goto(f'{base}/#{h}', wait_until='load')
        pg.wait_for_timeout(300)
        hops[h] = pg.url.endswith(want)
    checks.append((all(hops.values()), f"старые якоря главной → новые места: {sum(hops.values())}/{len(hops)}"))
    # Каждая страница: телефоны обеих студий, пометка Meta, «Статьи» в подвале, нижняя кнопка со своим действием
    phones = [l['phone'] for l in d['locations']]
    per = []
    c2 = Context(browser, 390, 844, consent=False, touch=True)
    pg2 = c2.page()
    for p in pages:
        load(pg2, f"{base}/{p['path']}")
        r = pg2.evaluate("""(phones) => { const f = document.querySelector('footer'); const t = f ? f.innerText.replace(/\\u00a0/g, ' ') : '';
          const cta = document.querySelector('.mobile-cta'); const cs = cta && getComputedStyle(cta);
          return {phones: phones.every(p => t.includes(p)), meta: t.includes('Instagram принадлежит компании Meta'), articles: Boolean(f && f.querySelector('a[href="articles"], a[href="#"][aria-current], a[href=""]')) || t.includes('Статьи'),
                  cta: cta ? (cta.getAttribute('href') || (cta.hasAttribute('data-book') ? 'book' : '?')) : null, visible: Boolean(cta && cs.display !== 'none' && cs.visibility !== 'hidden')}; }""", phones)
        # На главной нижней кнопки нет: в утверждённой v2 её не было (запись — шторка и подвал).
        want = None if p['id'] == 'home' else 'tel:' if p['id'] == 'wrap' else 't.me' if p['id'] in ('auto', 'import') else 'book'
        cta_ok = (r['cta'] is None) if want is None else (r['cta'] is not None and r['visible'] and (want in r['cta'] if want != 'book' else r['cta'] == 'book'))
        if not (r['phones'] and r['meta'] and r['articles'] and cta_ok):
            per.append(f"/{p['path']}: телефоны {r['phones']}, Meta {r['meta']}, «Статьи» {r['articles']}, нижняя кнопка {r['cta']} видна {r['visible']}")
    c2.close()
    checks.append((not per, f'на всех {len(pages)} страницах: телефоны обеих студий, пометка о Meta, «Статьи» в подвале, нижняя кнопка со своим действием на 390'))
    sitemap = (DIST / 'sitemap.xml').read_text(encoding='utf-8')
    locs = re.findall(r'<loc>([^<]+)</loc>', sitemap)
    checks.append((len(locs) == 12 and not any(l.endswith('.html') for l in locs), f'адресов в sitemap {len(locs)} (11 + /import), без .html'))
    c.close()
    ok = all(x for x, _ in checks)
    issues = [t for x, t in checks if not x] + per
    res.add('14', 'Ничего не потеряно', ok, '; '.join(t for _, t in checks), issues)


def brand(browser, base, pages, res):
    c = Context(browser, 1440, 900, consent=False)
    pg = c.page()
    found, scanned = [], 0
    for p in pages:
        load(pg, f"{base}/{p['path']}")
        r = pg.evaluate(r"""() => {
          const texts = [document.body.innerText, document.querySelector('#drawer')?.textContent || '', document.querySelector('#booking')?.textContent || '', document.title];
          for (const el of document.querySelectorAll('[alt], [aria-label], [title]')) texts.push(el.getAttribute('alt') || '', el.getAttribute('aria-label') || '', el.getAttribute('title') || '');
          for (const m of document.querySelectorAll('meta[property^="og:"], meta[name="description"]')) texts.push(m.content);
          for (const s of document.querySelectorAll('script[type="application/ld+json"]')) texts.push(s.textContent);
          const all = texts.join('\n').replace(/MeatWash\.detailing@gmail\.com/gi, '').replace(/t\.me\/MEATWASH_Auto/g, '');
          return [...all.matchAll(/.{0,25}\b(MEATWASH|Meatwash)\b.{0,25}/g)].map(m => m[0]);
        }""")
        scanned += 1
        found += [f"/{p['path']}: …{x}…" for x in r]
    c.close()
    res.add('15', 'Бренд', not found, f'{scanned} страниц: видимый текст, шторка, окна, alt, aria-label, title, og, JSON-LD — «MEATWASH»/«Meatwash» найдено {len(found)}', found)
