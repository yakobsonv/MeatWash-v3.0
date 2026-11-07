# Доработка ретуши Range Rover после ревью (07.11): номера, отражения ZEN, следы на стене.
import sys, os, numpy as np, cv2
S='/private/tmp/claude-501/-Users-vladislavakobson----------/5d96f0a1-fd84-40b1-af22-15b80faa1c5c/scratchpad'
sys.path.insert(0, f'{S}/gal/tools')
import process as P

rng = np.random.default_rng(7)
def lum(a): return cv2.cvtColor(a, cv2.COLOR_RGB2GRAY).astype(float)

def grain_sd(a, box):
    x0,y0,x1,y1 = box
    g = lum(a[y0:y1,x0:x1]); return float(np.std(g - cv2.GaussianBlur(g,(0,0),2)))

def plate(a, box, thr=150, inset=2):
    """Табличка номера: внутренность (выпуклая оболочка белого) — гладкой поверхностью, подогнанной по белому."""
    x0,y0,x1,y1 = box
    sub = a[y0:y1,x0:x1].astype(float)
    g = lum(a[y0:y1,x0:x1])
    white = (g > thr).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(white)
    areas = st[1:, cv2.CC_STAT_AREA]
    keep = [1+i for i in range(len(areas)) if areas[i] > .1*areas.max()]
    plate_px = np.isin(lab, keep)
    pts = cv2.findNonZero(plate_px.astype(np.uint8))
    hull = cv2.convexHull(pts)
    m = np.zeros(g.shape, np.uint8); cv2.fillConvexPoly(m, hull, 255)
    m = cv2.erode(m, np.ones((2*inset+1,2*inset+1),np.uint8))
    # подгонка квадратичной поверхности по белым пикам вне знаков (свет + лёгкая тень)
    wm = plate_px & (m > 0)
    wm = cv2.erode(wm.astype(np.uint8), np.ones((3,3),np.uint8)).astype(bool)
    ys, xs = np.nonzero(wm)
    X = np.stack([np.ones_like(xs), xs, ys, xs*xs, ys*ys, xs*ys], 1).astype(float)
    yy, xx = np.nonzero(m)
    Xf = np.stack([np.ones_like(xx), xx, yy, xx*xx, yy*yy, xx*yy], 1).astype(float)
    out = sub.copy()
    for c in range(3):
        coef, *_ = np.linalg.lstsq(X, sub[ys, xs, c], rcond=None)
        out[yy, xx, c] = Xf @ coef
    sd = min(2.5, float(np.std(g[wm] - cv2.GaussianBlur(g,(0,0),2)[wm])))
    noise = rng.normal(0, sd, g.shape)
    out[yy, xx] += noise[yy, xx][:, None]
    # мягкий край 1 px
    mf = cv2.GaussianBlur(m.astype(float)/255, (0,0), .7)[..., None]
    a[y0:y1,x0:x1] = np.clip(sub*(1-mf) + out*mf, 0, 255).astype(np.uint8)
    return a

def hmedian(a, box, k=61, keep_cols=(), desat=False):
    """Горизонтальная медиана по полосе (рамка номера, коробки): стирает надписи, держит горизонтальные края."""
    from scipy.ndimage import median_filter
    x0,y0,x1,y1 = box
    sub = a[y0:y1,x0:x1].astype(float)
    out = median_filter(sub, size=(1,k,1), mode='nearest')
    if desat:
        L = out.mean(2, keepdims=True); out = L + (out - L)*.15
    sd = grain_sd(a, box)*.6
    out += rng.normal(0, min(sd,3), out.shape[:2])[..., None]
    m = np.ones(sub.shape[:2])
    for c0,c1 in keep_cols: m[:, c0-x0:c1-x0] = 0
    m = cv2.GaussianBlur(m, (0,0), 1.2)
    # края полосы — плавно
    e = np.ones(sub.shape[:2]); e[:, :3] = e[:, -3:] = 0; e[:2] = e[-2:] = 0
    m = (m * cv2.GaussianBlur(e,(0,0),1.5))[..., None]
    a[y0:y1,x0:x1] = np.clip(sub*(1-m) + out*m, 0, 255).astype(np.uint8)
    return a

def colfill(a, box, above, edge=None, ref=None):
    """Стена с вертикальными рёбрами: каждый столбец — продолжение стены над участком (те же рёбра),
    вертикальный ход яркости — по эталонной полосе стены ref; edge(x,y)->True = не трогать (машина)."""
    x0,y0,x1,y1 = box; a0,a1 = above
    col = a[a0:a1, x0:x1].astype(float).mean(0)             # (w,3)
    if ref:
        rx0,rx1 = ref
        prof = a[a0:y1, rx0:rx1].astype(float).mean((1,2))
        prof = cv2.GaussianBlur(prof.reshape(-1,1),(0,0),6).ravel()
        ratio = prof[y0-a0:] / prof[:a1-a0].mean()
    else:
        ratio = np.ones(y1-y0)
    fill = col[None,:,:] * ratio[:, None, None]
    sd = grain_sd(a, (x0, a0, x1, a1))
    fill += rng.normal(0, min(sd, 4), fill.shape[:2])[..., None]
    m = np.ones((y1-y0, x1-x0))
    if edge:
        yy, xx = np.mgrid[y0:y1, x0:x1]
        m[edge(xx, yy)] = 0
    m[:2] = 0; m[-2:] = 0; m[:, :2] = 0; m[:, -2:] = 0
    m = cv2.GaussianBlur(m, (0,0), 1.5)[..., None]
    sub = a[y0:y1,x0:x1].astype(float)
    a[y0:y1,x0:x1] = np.clip(sub*(1-m) + fill*m, 0, 255).astype(np.uint8)
    return a

def darkpoly(a, box, thr, inside, dil=2, r=5):
    """Светлые буквы отражения внутри стекла/лака — inpaint тёмным."""
    x0,y0,x1,y1 = box
    g = lum(a[y0:y1,x0:x1])
    yy, xx = np.mgrid[y0:y1, x0:x1]
    mm = (g > thr) & inside(xx, yy)
    m = np.zeros(a.shape[:2], np.uint8); m[y0:y1,x0:x1] = mm.astype(np.uint8)*255
    m = cv2.dilate(m, np.ones((2*dil+1,2*dil+1),np.uint8))
    return P.inpaint(a, m, r, grain=False)

def whitetext(a, box, dil=2):
    """Белые/серые буквы на цветном (канистра): низкая насыщенность + яркость."""
    x0,y0,x1,y1 = box
    sub = a[y0:y1,x0:x1]
    hsv = cv2.cvtColor(sub, cv2.COLOR_RGB2HSV)
    mm = (hsv[...,1] < 90) & (hsv[...,2] > 95)
    m = np.zeros(a.shape[:2], np.uint8); m[y0:y1,x0:x1] = mm.astype(np.uint8)*255
    m = cv2.dilate(m, np.ones((2*dil+1,2*dil+1),np.uint8))
    return P.inpaint(a, m, 5)

def post(a, box, src_rows):
    """Стойка стеллажа поверх стёртой графики: фон — медиана соседей, стойка — с чистых строк выше."""
    x0,y0,x1,y1 = box; s0,s1 = src_rows
    sub = a[y0:y1,x0:x1].astype(float)
    left = a[y0:y1, x0-14:x0].astype(float); right = a[y0:y1, x1:x1+14].astype(float)
    bg = np.median(np.concatenate([left,right],1), axis=1)            # (h,3)
    stripe = a[s0:s1, x0:x1].astype(float).mean(0)                     # (w,3) профиль стойки
    base = np.median(np.concatenate([a[s0:s1,x0-14:x0],a[s0:s1,x1:x1+14]],1).reshape(-1,3),0)
    out = bg[:, None, :] + (stripe - base)[None, :, :]
    out += rng.normal(0, 2, out.shape[:2])[..., None]
    a[y0:y1,x0:x1] = np.clip(out, 0, 255).astype(np.uint8)
    return a

OPS = {
 'rr-01': [
   ('colfill', (962,708,1242,823), (668,704),
     lambda x,y: x < 963 + (y-687)*0.366 + 5, (1250,1350)),
   ('bright', (1175,858,1240,935), 110, 3),
   ('whitetext', (1470,1380,1510,1480)),
 ],
 'rr-07': [
   ('plate', (612,1420,1108,1533)),
   ('hmedian', (622,1527,1098,1552), 81),
 ],
 'rr-08': [
   ('plate', (232,1305,466,1384)),
   ('hmedian', (240,1378,462,1394), 141),
   ('darkpoly', (588,1320,630,1386), 70, lambda x,y: np.ones_like(x,bool)),
 ],
 'rr-cover': [
   ('colfill', (1836,418,2226,511), (398,418),
     lambda x,y: y > 447 + (x-1813)*0.956 - 3, (2236,2300)),
   ('darkpoly', (1846,494,1906,549), 70, lambda x,y: y > 447 + (x-1813)*0.956 + 4),
   ('bright', (1905,533,2091,579), 85, 3), ('bright', (2109,533,2215,579), 85, 3),
   ('post', (2082,535,2112,582), (521,533)),
   ('hmedian', (1953,662,2186,730), 61, ((2015,2030),(2086,2109)), True),
   ('bright', (2180,536,2206,572), 85, 3),
   ('bright', (2334,898,2356,982), 120, 2), ('bright', (2332,998,2356,1024), 120, 2),
 ],
}

orig = P.apply_ops
def apply_ops(a, ops):
    for op in ops:
        k = op[0]
        if k == 'plate': a = plate(a, op[1])
        elif k == 'hmedian': a = hmedian(a, op[1], op[2], *(op[3:]))
        elif k == 'colfill': a = colfill(a, op[1], op[2], op[3], op[4])
        elif k == 'darkpoly': a = darkpoly(a, op[1], op[2], op[3])
        elif k == 'whitetext': a = whitetext(a, op[1])
        elif k == 'post': a = post(a, op[1], op[2])
        else: a = orig(a, [op])
    return a

if __name__ == '__main__':
    P.OPS.update(OPS)
    P.apply_ops = apply_ops
    if len(sys.argv) > 1 and sys.argv[1] == '--out':
        P.OUT = sys.argv[2]; names = sys.argv[3:]
    else:
        names = sys.argv[1:]
    P.PREV = f'{S}/fx/prev'; os.makedirs(P.PREV, exist_ok=True)
    import json as _j
    _d=_j.dump
    P.json.dump=lambda o,f,**k: _d(o,f,default=str,**k)
    P.run(names)
