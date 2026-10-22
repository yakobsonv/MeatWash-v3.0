/* Meat Auto v2 — three behaviours of the reference that CSS cannot do alone:
   1) the page turns dark while the directions are on screen and light again
      after them (ref CarRange__toDark: section top ≤ 12 % of the viewport,
      section bottom ≤ 49 %, both directions);
   2) the section heading and the tiles reveal when they reach the screen,
      and the heading's words light up with scroll (redomedia.co, 22.10);
   3) on phones the directions are a swipe carousel with a paginator whose
      active dot fills over 9.5 s, then moves on, and a pause button. */
(function () {
  var root = document.documentElement;
  var body = document.body;
  root.classList.add('js');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* 1. Page colour */
  var dirs = document.querySelector('.dirs');
  if (dirs) {
    var queued = false;
    var paint = function () {
      queued = false;
      var r = dirs.getBoundingClientRect();
      var vh = window.innerHeight;
      body.classList.toggle('is-dark', r.top <= vh * 0.12 && r.bottom > vh * 0.49);
    };
    var queue = function () { if (!queued) { queued = true; requestAnimationFrame(paint); } };
    // First state without the 1.2 s fade (a reload in the middle of the page).
    body.classList.add('no-tr');
    paint();
    requestAnimationFrame(function () { requestAnimationFrame(function () { body.classList.remove('no-tr'); }); });
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);
  }

  /* 2. Heading entrance */
  var reveals = document.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window) {
    var reveal = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); reveal.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -10% 0px' });
    reveals.forEach(function (el) { reveal.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* 2b. Scroll-linked word fill: the heading's words go from dim to full as
     its top travels from 92 % to 40 % of the viewport, one after another.
     Read-only on scroll (no scroll-jacking); off for reduced motion. */
  var words = Array.prototype.slice.call(document.querySelectorAll('.dirs__heading .wd'));
  var head = document.querySelector('.dirs__heading');
  if (words.length && head && !reduce.matches) {
    var fillQueued = false;
    var fill = function () {
      fillQueued = false;
      var vh = window.innerHeight, top = head.getBoundingClientRect().top;
      var p = Math.min(1, Math.max(0, (vh * 0.92 - top) / (vh * 0.52)));
      words.forEach(function (w, i) {
        var k = Math.min(1, Math.max(0, p * words.length - i * 0.7));
        w.style.setProperty('--k', k.toFixed(3));
      });
    };
    var queueFill = function () { if (!fillQueued) { fillQueued = true; requestAnimationFrame(fill); } };
    fill();
    window.addEventListener('scroll', queueFill, { passive: true });
    window.addEventListener('resize', queueFill);
  }

  /* 3. Phone carousel */
  var track = document.querySelector('.dirs__grid');
  var ctrl = document.querySelector('.dirs__controls');
  if (!track || !ctrl) return;
  var slides = Array.prototype.slice.call(track.querySelectorAll('.dir'));
  var dots = Array.prototype.slice.call(ctrl.querySelectorAll('.dirs__dot'));
  var play = ctrl.querySelector('.dirs__play');
  var phone = window.matchMedia('(max-width: 759px)');
  var index = 0;
  var wantPlay = !reduce.matches;
  var inView = false, touching = false, focused = false, lockUntil = 0;

  var leftOf = function (i) {
    var s = slides[i].getBoundingClientRect(), t = track.getBoundingClientRect();
    return track.scrollLeft + (s.left - t.left) - (track.clientWidth - s.width) / 2;
  };
  var setActive = function (i) {
    if (dots[index]) dots[index].removeAttribute('aria-current');
    index = i;
    var d = dots[i];
    d.setAttribute('aria-current', 'true');
    // Restart the 9.5 s fill on the new dot.
    d.classList.add('is-restart');
    void d.offsetWidth;
    d.classList.remove('is-restart');
  };
  var go = function (i) {
    lockUntil = performance.now() + 1500;
    setActive(i);
    track.scrollTo({ left: leftOf(i), behavior: reduce.matches ? 'auto' : 'smooth' });
  };
  var sync = function () {
    var run = wantPlay && inView && !touching && !focused && phone.matches && !document.hidden;
    ctrl.classList.toggle('is-playing', run);
  };

  dots.forEach(function (d, i) { d.addEventListener('click', function () { go(i); }); });
  ctrl.addEventListener('animationend', function (e) {
    if (e.animationName === 'dot-progress' && phone.matches) go((index + 1) % slides.length);
  });
  if (play) {
    play.addEventListener('click', function () {
      wantPlay = !wantPlay;
      play.dataset.state = wantPlay ? 'playing' : 'paused';
      play.setAttribute('aria-label', wantPlay ? 'Остановить автопрокрутку' : 'Включить автопрокрутку');
      sync();
    });
    if (!wantPlay) { play.dataset.state = 'paused'; play.setAttribute('aria-label', 'Включить автопрокрутку'); }
  }

  // The slide nearest the centre is the active one (swipes, keyboard focus).
  var pick = function () {
    if (!phone.matches) return;
    var mid = track.getBoundingClientRect().left + track.clientWidth / 2, best = 0, dist = Infinity;
    slides.forEach(function (s, i) {
      var r = s.getBoundingClientRect(), dd = Math.abs(r.left + r.width / 2 - mid);
      if (dd < dist) { dist = dd; best = i; }
    });
    if (best !== index) setActive(best);
  };
  var ticking = false;
  track.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      if (performance.now() >= lockUntil) pick();
    });
  }, { passive: true });
  // When a scroll settles (or a dot's smooth scroll is cut short), trust the position.
  track.addEventListener('scrollend', function () { lockUntil = 0; pick(); });
  track.addEventListener('touchstart', function () { touching = true; sync(); }, { passive: true });
  track.addEventListener('touchend', function () { touching = false; sync(); }, { passive: true });
  track.addEventListener('touchcancel', function () { touching = false; sync(); }, { passive: true });
  // Keyboard focus anywhere in the carousel (slides, dots, pause) stops the rotation.
  dirs.addEventListener('focusin', function () { focused = true; sync(); });
  dirs.addEventListener('focusout', function (e) { if (!dirs.contains(e.relatedTarget)) { focused = false; sync(); } });
  document.addEventListener('visibilitychange', sync);
  if (phone.addEventListener) phone.addEventListener('change', sync);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) { inView = entries[0].isIntersecting; sync(); }, { threshold: 0.5 }).observe(track);
  }
  sync();
})();
