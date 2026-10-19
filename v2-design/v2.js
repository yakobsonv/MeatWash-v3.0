/* MEATWASH v2 — the only two things CSS cannot do everywhere yet:
   1) the header turns solid once the hero has scrolled away;
   2) the section heading rises in when it reaches the screen (ref: 1.2 s). */
(function () {
  var root = document.documentElement;
  if (!('IntersectionObserver' in window)) return;
  root.classList.add('js');

  var header = document.querySelector('.site-header');
  var hero = document.querySelector('.hero');
  if (header && hero) {
    new IntersectionObserver(function (entries) {
      header.classList.toggle('is-solid', !entries[0].isIntersecting);
    }, { rootMargin: '-84px 0px 0px 0px' }).observe(hero);
  }

  var reveal = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('is-in'); reveal.unobserve(e.target); }
    });
  }, { rootMargin: '0px 0px -10% 0px' });
  document.querySelectorAll('[data-reveal]').forEach(function (el) { reveal.observe(el); });
})();
