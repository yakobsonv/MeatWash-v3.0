"""§6.4 п. 2 (переполнение), п. 3 (шрифт), п. 12 (уменьшение движения). Владелец: WP7."""
from common import Context, load, WIDTHS, LANDSCAPE

OVERFLOW_JS = r"""() => {
  const vw = innerWidth, de = document.documentElement;
  const scroller = (el) => { for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) { const o = getComputedStyle(a).overflowX; if (o === 'auto' || o === 'scroll') return a; } return null; };
  const name = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.classList.length ? '.' + [...el.classList].slice(0, 3).join('.') : '');
  const hard = [], clipped = [];
  for (const el of document.body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.right <= vw + 0.5) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
    if (el.closest('[hidden], dialog:not([open]), .sr, .visually-hidden, .skip-link')) continue;
    if (scroller(el)) continue;
    let cut = null;
    for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const o = getComputedStyle(a).overflowX;
      if ((o === 'hidden' || o === 'clip') && a.getBoundingClientRect().right <= vw + 0.5) { cut = a; break; }
    }
    (cut ? clipped : hard).push(`${name(el)} right=${r.right.toFixed(1)}${cut ? ' ⊂ ' + name(cut) : ''}`);
  }
  return {sw: de.scrollWidth - de.clientWidth, hard, clipped};
}"""


# WebKit (Safari): узкие экраны — там у него своя ошибка: min-height с aspect-ratio давал
# фото промо минимальную ширину 320 px (ревью 27.10, Chromium её не показывает).
WEBKIT_SIZES = [(320, 700), (340, 700), (360, 800), (390, 844)]


def overflow(browser, base, pages, res, webkit=None):
    runs, bad, clipped_total, details, clipped_notes = 0, 0, 0, [], []
    sizes = [(w, 900) for w in WIDTHS] + LANDSCAPE
    runs_plan = [(browser, w, h, '') for w, h in sizes] + ([(webkit, w, h, ' WebKit') for w, h in WEBKIT_SIZES] if webkit else [])
    for engine, w, h, tag in runs_plan:
        c = Context(engine, w, h, touch=w < 768 or (w, h) in LANDSCAPE)
        pg = c.page()
        for p in pages:
            load(pg, f"{base}/{p['path']}", scroll=True)
            r = pg.evaluate(OVERFLOW_JS)
            runs += 1
            if r['sw'] != 0 or r['hard']:
                bad += 1
                details.append(f"/{p['path']} {w}×{h}{tag}: scrollWidth−clientWidth={r['sw']}; за краем: {', '.join(r['hard'][:4])}")
            if r['clipped']:
                clipped_total += 1
                clipped_notes.append(f"/{p['path']} {w}×{h}{tag}: срезано родителем: {', '.join(r['clipped'][:3])}")
        c.close()
    res.add('2', 'Нет горизонтальной прокрутки', bad == 0,
            f'{runs} прогонов ({len(pages)} страниц × {len(sizes)} размеров Chromium' + (f' + × {len(WEBKIT_SIZES)} WebKit: 320, 340, 360, 390' if webkit else '') + f'), нарушений {bad}; прогонов со срезанным родителем содержимым {clipped_total} (для глаз)',
            details + clipped_notes[:20])


def fonts(browser, base, pages, res):
    c = Context(browser, 1440, 900)
    pg = c.page()
    details, ok_pages = [], 0
    arsenal = 0
    for p in pages:
        c.responses.clear()
        load(pg, f"{base}/{p['path']}")
        r = pg.evaluate("""() => ({check: document.fonts.check('300 40px Manrope'),
          h1: getComputedStyle(document.querySelector('h1')).fontFamily.split(',')[0].replace(/["']/g, '').trim(),
          body: getComputedStyle(document.body).fontFamily.split(',')[0].replace(/["']/g, '').trim(),
          loaded: [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family.replace(/["']/g, '') + ' ' + f.weight)})""")
        font = [s for s, u in c.responses if 'manrope-vf.woff2' in u]
        arsenal += sum(1 for _, u in c.responses if 'arsenal' in u.lower())
        good = r['check'] and r['h1'] == 'Manrope' and r['body'] == 'Manrope' and (font == [] or all(s in (200, 304) for s in font))
        # Шрифт кэшируется между страницами — 200 достаточно увидеть на первой.
        if p is pages[0] and not any(s == 200 for s in font):
            good = False
            details.append(f"/{p['path']}: manrope-vf.woff2 не загрузился ({font})")
        ok_pages += good
        if not good:
            details.append(f"/{p['path']}: check={r['check']} h1={r['h1']} body={r['body']} {font}")
    c.close()
    res.add('3', 'Шрифт Manrope', ok_pages == len(pages) and arsenal == 0,
            f"{ok_pages}/{len(pages)} страниц: fonts.check('300 40px Manrope')=true, у h1 и body первым Manrope; manrope-vf.woff2 → 200; запросов arsenal: {arsenal}", details)


# Движение — анимации и переходы дольше 50 мс по transform, translate, inset, размерам и т. п.;
# смена цвета и прозрачности (затемнение фона шторки) движением не считается.
MOVING_JS = r"""const MOVING = (a) => { const t = Number(a.effect?.getTiming?.().duration) || 0; if (t <= 50 && t !== Infinity) return false;
  let props = a.transitionProperty ? [a.transitionProperty] : []; if (!props.length) { try { props = a.effect.getKeyframes().flatMap((k) => Object.keys(k)).filter((k) => !['offset', 'easing', 'composite', 'computedOffset'].includes(k)); } catch (e) { props = ['?']; } }
  return props.some((p) => /^(transform|translate|scale|rotate|left|right|top|bottom|inset|margin|width|height|offset|\?)/i.test(p)); };"""

REVEAL_JS = "() => { " + MOVING_JS + r"""
  const els = [...document.querySelectorAll('[data-reveal], .reveal')];
  const notFinal = els.filter(el => { const cs = getComputedStyle(el); return +cs.opacity < 0.99 || (cs.transform !== 'none' && cs.transform !== 'matrix(1, 0, 0, 1, 0, 0)'); });
  const imgs = [...document.querySelectorAll('[data-reveal] img')].filter(img => +getComputedStyle(img).opacity < 0.99);
  const running = document.getAnimations().filter(a => a.playState === 'running' && MOVING(a));
  return {count: els.length, notFinal: notFinal.length + imgs.length, running: running.map(a => (a.animationName || a.transitionProperty || 'anim') + ':' + (a.effect?.target?.className || '')).slice(0, 5)};
}"""


def motion(browser, base, pages, res):
    details, checked, bad = [], 0, 0
    for w in (390, 1440):
        c = Context(browser, w, 900, reduced=True, consent=False, touch=w < 768)
        pg = c.page()
        for p in pages:
            load(pg, f"{base}/{p['path']}", scroll=True)
            pg.wait_for_timeout(400)
            r = pg.evaluate(REVEAL_JS)
            checked += r['count']
            if r['notFinal'] or r['running']:
                bad += 1
                details.append(f"/{p['path']} {w}: не в конечном состоянии {r['notFinal']}, идут анимации {r['running']}")
        # Шторка без переезда
        load(pg, f"{base}/services")
        pg.click('#drawer-open')
        a = pg.evaluate("() => { " + MOVING_JS + " const p = document.querySelector('#drawer .drawer__panels') || document.querySelector('#drawer'); return {x: p.getBoundingClientRect().x, anim: document.getAnimations().filter(a => a.playState === 'running' && MOVING(a)).length}; }")
        pg.wait_for_timeout(120)
        b = pg.evaluate("() => { const p = document.querySelector('#drawer .drawer__panels') || document.querySelector('#drawer'); return p.getBoundingClientRect().x; }")
        if abs(a['x'] - b) > 0.5 or a['anim']:
            bad += 1
            details.append(f'шторка {w}: сдвиг {a["x"]:.1f}→{b:.1f}, анимаций {a["anim"]}')
        pg.keyboard.press('Escape')
        c.close()
    res.add('12', 'Уменьшение движения', bad == 0,
            f'{len(pages)} страниц × 2 ширины: элементов с появлением проверено {checked}, не в конечном состоянии 0 — {"да" if bad == 0 else "нет"}; шторка открывается без переезда', details)
