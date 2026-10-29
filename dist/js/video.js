// Ролики студии (Влад 27.10, видео с Яндекс Диска): фон героя главной и «живые» карточки
// по наведению. Рядом с каждым <video> стоит обычная картинка-постер — она же LCP и то, что
// видно при «меньше движения», экономии трафика и на сенсорных экранах (карточки).
// Сеть до вызова не тратится: preload="none", адрес ролика — в data-src*.
//  data-video="hero"  — играет сам после load; ролик по ширине окна: data-src-m до 699 px,
//                       data-src-hd от 1600 px (или от 2200 физических пикселей), иначе data-src.
//                       Кнопка [data-video-toggle] останавливает и запускает (WCAG 2.2.2);
//                       пока ролик не играет, кнопка скрыта. Вне экрана — пауза.
//  data-video="hover" — с мышью играет, пока указатель над [data-video-host]. На сенсорных
//                       экранах (Роман 28.10: «ролик к каждому блоку» — смотрят с телефона)
//                       играет сам, пока карточка видна на 60 % и больше: в карусели главной это
//                       только слайд по центру. Ушла с экрана — пауза; ролик грузится при первом показе.
//  data-video="tab"   — шапка /services (Влад 30.10): по ролику на категорию каталога
//                       (data-category), виден ролик открытой вкладки (#catalog[data-current],
//                       событие mw:category из catalog.js). data-src-m — до 759 px. Ролик
//                       грузится при первом выборе вкладки и проявляется поверх прежнего, когда
//                       есть кадр. У категории без ролика видно фото. Кнопка паузы и пауза вне
//                       экрана — как у героя главной.
// Подключает site.js, когда на странице есть [data-video].
function setupTabVideos(play) {
  const videos = [...document.querySelectorAll('video[data-video="tab"]')];
  if (!videos.length) return;
  const narrow = innerWidth < 760;
  const toggle = videos[0].closest('section')?.querySelector('[data-video-toggle]');
  let current = null, stopped = false, visible = true, ready = false, fade = 0;

  const show = (category) => {
    current = videos.find((video) => video.dataset.category === category) || null;
    if (toggle) toggle.hidden = !current;
    clearTimeout(fade);
    if (!current) {
      videos.forEach((video) => { video.pause(); video.classList.remove('is-top', 'is-shown'); });
      return;
    }
    if (!ready) return;
    const video = current;
    if (!video.src) { video.muted = true; video.src = narrow && video.dataset.srcM ? video.dataset.srcM : video.dataset.src; }
    if (visible && !stopped) play(video);
    // Пока у нового нет кадра, виден прежний; потом прежний гаснет под новым. Ролик,
    // который уже показывали, идёт с того места, где встал.
    const reveal = () => {
      if (video !== current || video.classList.contains('is-top')) return;
      videos.forEach((other) => other.classList.toggle('is-top', other === video));
      video.classList.add('is-shown');
      fade = setTimeout(() => videos.forEach((other) => {
        if (other !== current) { other.pause(); other.classList.remove('is-shown'); }
      }), 900);
    };
    if (video.readyState >= 2) reveal();
    else video.addEventListener('loadeddata', reveal, { once: true });
  };

  if (toggle) toggle.addEventListener('click', () => {
    stopped = !stopped;
    toggle.setAttribute('aria-pressed', String(stopped));
    toggle.setAttribute('aria-label', stopped ? 'Включить видео' : 'Остановить видео');
    if (!current) return;
    if (stopped) current.pause(); else if (visible) play(current);
  });
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (!current?.src) return;
    if (!visible) current.pause(); else if (!stopped) play(current);
  }).observe(videos[0].parentElement);
  addEventListener('mw:category', (event) => show(event.detail));
  // Каталог ещё не выбрал вкладку (catalog.js подключается отдельно) — ждём mw:category,
  // иначе по адресу #price-wrap сначала грузился бы ролик автомойки.
  const start = () => {
    ready = true;
    const catalog = document.getElementById('catalog');
    if (!catalog || catalog.dataset.current) show(catalog?.dataset.current || videos[0].dataset.category);
  };
  if (document.readyState === 'complete') start(); else addEventListener('load', start, { once: true });
}

export function setupVideo() {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  if (reduce.matches || navigator.connection?.saveData) return;

  const play = (video) => video.play().catch(() => {});   // автозапуск запрещён — остаётся постер
  const mark = (video) => {
    video.addEventListener('playing', () => video.classList.add('is-playing'));
    video.addEventListener('pause', () => video.classList.remove('is-playing'));
  };

  document.querySelectorAll('video[data-video="hero"]').forEach((video) => {
    const { srcM, src, srcHd } = video.dataset;
    const wide = innerWidth >= 1600 || innerWidth * (devicePixelRatio || 1) >= 2200;
    const url = innerWidth < 700 && srcM ? srcM : wide && srcHd ? srcHd : src;
    const toggle = video.parentElement.querySelector('[data-video-toggle]');
    let stopped = false, visible = true;
    video.muted = true;
    mark(video);
    if (toggle) {
      video.addEventListener('playing', () => { toggle.hidden = false; }, { once: true });
      toggle.addEventListener('click', () => {
        stopped = !stopped;
        toggle.setAttribute('aria-pressed', String(stopped));
        toggle.setAttribute('aria-label', stopped ? 'Включить видео' : 'Остановить видео');
        if (stopped) video.pause(); else play(video);
      });
    }
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (!video.src) return;
      if (!visible) video.pause(); else if (!stopped) play(video);
    }).observe(video);
    const start = () => { video.src = url; if (visible && !stopped) play(video); };
    if (document.readyState === 'complete') start(); else addEventListener('load', start, { once: true });
  });

  setupTabVideos(play);

  const load = (video) => { if (!video.src) { video.muted = true; video.src = video.dataset.src; } };
  const inView = new IntersectionObserver((entries) => {
    entries.forEach(({ target, isIntersecting }) => {
      const video = target.__video;
      target.__in = isIntersecting;
      if (fine.matches) return;
      if (isIntersecting && !document.hidden) { load(video); play(video); } else video.pause();
    });
  }, { threshold: 0.6 });

  document.querySelectorAll('video[data-video="hover"]').forEach((video) => {
    const host = video.closest('[data-video-host]') || video.parentElement;
    mark(video);
    host.addEventListener('pointerenter', () => {
      if (!fine.matches) return;
      load(video);
      play(video);
    });
    host.addEventListener('pointerleave', () => { if (fine.matches) video.pause(); });
    host.__video = video;
    inView.observe(host);
  });
  // Вкладка в фоне — все ролики карточек на паузе; вернулись — на сенсорных снова играет видимый.
  document.addEventListener('visibilitychange', () => {
    document.querySelectorAll('video[data-video="hover"]').forEach((video) => {
      const host = video.closest('[data-video-host]') || video.parentElement;
      if (document.hidden) video.pause();
      else if (!fine.matches && host.__in) { load(video); play(video); }
    });
  });
}
