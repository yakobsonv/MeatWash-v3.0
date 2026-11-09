// Общее для всех страниц MEATWASH: окно «Записаться онлайн» (одно на все призывы, Влад 05.11),
// карты студий, переходы по якорям, появление блоков, блокировка прокрутки под любым открытым
// <dialog>. Владелец: исполнитель A (раньше WP6; план §4.1, §4.7; поправки критика 18, 21).
// Меню-шторка — js/shell.js (WP1): он открывает и закрывает <dialog id="drawer"> и закрывает его
// в фазе capture перед ссылкой, [data-book], [data-request], [data-membership]; потом этот модуль
// по тому же клику открывает своё окно. Класс html.is-locked ставит только этот модуль: он
// считает открытые <dialog> — шторку, окно заявки, 3D-гараж (поправка 21).
// Любого элемента может не быть на странице — всё проверяется перед использованием.
// Здесь же — уведомление о cookie и цели Метрики (analytics.js: только с согласия).
import { setupAnalytics, goal } from './analytics.js';
import { LOCATIONS } from './data.js';

// Неразрывные пробелы в тексте, который пишет скрипт (правила scripts/typo.mjs, без сущностей).
const NB = ' ';
const SHORT = '[а-яёa-z]{1,2}|для|без|под|над|при|про|обо|изо|или|как|что|чем|где|его|её|все|это';
const SHORT_RE = new RegExp(`(^|[\\s\\u00a0(«„"—–-])(?!(?:же|ли|бы) )(${SHORT}) (?=\\S|$)`, 'giu');
export const nb = (text) => String(text)
  .replace(SHORT_RE, `$1$2${NB}`).replace(SHORT_RE, `$1$2${NB}`)
  .replace(/ (же|ли|бы)(?=[\s.,;:!?»)]|$)/giu, `${NB}$1`)
  .replace(/ (—|–)(?= )/g, `${NB}$1`)
  .replace(/(\d) (?=[\dа-яёa-z₽%°×])/giu, `$1${NB}`);

export function setupUI() {
 const abort=new AbortController(), options={signal:abort.signal};
 const $=s=>document.querySelector(s);
 const root=document.documentElement;
 const requestDialog=$('#request'), drawer=$('#drawer'), drawerOpener=$('#drawer-open');
 const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
 // Прокрутка фона выключена, пока открыт любой <dialog>: шторка меню, окно записи или заявки,
 // 3D-гараж. Класс на <html>: iOS не считается с overflow у одного body. Место полосы
 // прокрутки держит scrollbar-gutter (dialogs.css), поэтому страница не прыгает вбок.
 // Состояние считается заново при каждом открытии и закрытии, а не переключается: шторка
 // закрывается и окно записи открывается одним кликом — гонки нет (поправка критика 21).
 const syncLock=()=>{
  const dialogOpen=Boolean(document.querySelector('dialog[open]'));
  document.body.classList.toggle('dialog-open',dialogOpen);
  root.classList.toggle('is-locked',dialogOpen);
 };
 // Чужие окна (шторку открывает shell.js, гараж строит garage.js) событий открытия не дают:
 // следим за атрибутом open у всех <dialog>, в том числе появившихся позже. Закрытие
 // ловим и событием close (оно не всплывает, но проходит фазу capture через document).
 const lockWatch=new MutationObserver(records=>{if(records.some(r=>r.target.localName==='dialog'))syncLock();});
 lockWatch.observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
 document.addEventListener('close',e=>{if(e.target instanceof HTMLDialogElement)syncLock();},{capture:true,signal:abort.signal});
 // Окно закрыли касанием или кликом: второе касание двойного «Закрыть» приходится в ту же точку,
 // а там уже страница — на /auto под крестиком окна машины ряд якорей, и страница уезжала
 // к «Как работаем» (QA 02.11). Гасим клик только в той же точке (до 40 px) и не позже 400 мс
 // после закрывшего клика: нажатие в другом месте проходит сразу. Защиту включает только клик,
 // который сам закрыл окно, — это видно в той же задаче (наблюдатель за open ниже); Esc, «назад»
 // и закрытие из скрипта её не включают. Клавиатура (detail 0) проходит всегда.
 // Точка — у самого клика, а не у pointerup: Safari на телефоне задерживает клик после касания.
 // Время — e.timeStamp (момент нажатия): клик, ждавший в очереди, пока гараж разбирает сцену,
 // всё равно меряется от первого. Слушатель на window в фазе capture — раньше всех
 // обработчиков document (shell.js, catalog.js).
 let lastClick=null, ghost=null;
 addEventListener('click',e=>{
  if(!e.detail)return;
  if(ghost&&e.timeStamp-ghost.t<400&&Math.hypot(e.clientX-ghost.x,e.clientY-ghost.y)<=40&&!e.target.closest?.('dialog[open]')){e.preventDefault();e.stopImmediatePropagation();return;}
  lastClick={x:e.clientX,y:e.clientY,t:e.timeStamp};
  setTimeout(()=>{lastClick=null;});
 },{capture:true,signal:abort.signal});
 new MutationObserver(records=>{if(lastClick&&records.some(r=>r.target.localName==='dialog'&&!r.target.open))ghost=lastClick;})
  .observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
 // Шторка закрывается сразу (dialog.close() в shell.js), её уход только дорисовывается
 // анимацией. Перед своим окном на всякий случай закрываем её и здесь.
 const closeDrawer=()=>{if(drawer?.open)drawer.close();};
 // Куда вернуть фокус после окна: на кнопку, которая его открыла, а если она была в шторке —
 // на «Меню» (#drawer-open): шторка к этому времени уже закрыта.
 // Кнопка внутри окна прежнюю цель не меняет.
 let returnTo=null;
 const rememberOpener=control=>{if(control?.closest('dialog.dialog'))return;returnTo=control&&drawer?.contains(control)?drawerOpener:control||null;};
 // Окно открыто только что: второй клик двойного клика (или двойного тапа)
 // приходится в ту же точку — по фону он закрывал окно, по ссылке онлайн-записи
 // сам открывал запись. Такие клики по окну игнорируем.
 let openedAt=0;
 const show=dialog=>{
  if(!dialog||dialog.open) return;
  // Длинное окно открывается с начала, а не с места, где его закрыли в прошлый раз:
  // у закрытого окна scrollTop не действует — сбрасываем после showModal.
  dialog.showModal(); dialog.scrollTop=0; openedAt=performance.now(); syncLock();
 };
 const settling=e=>e.detail>1||performance.now()-openedAt<400;
 const closeDialogs=()=>{ requestDialog?.close(); closeDrawer(); };

 // Окно «Записаться онлайн» (js/request.js): модуль — по первому нажатию любой кнопки заявки.
 // Все призывы сайта ведут в эту форму (Влад 05.11): data-request (тема, работы, о чём заявка),
 // data-book у автомойки (тема «Автомойка», программа и работы — в корзину онлайн-записи),
 // data-membership — прежние кнопки клуба, пока страницы не переписаны (тема «Клубная карта»).
 let requestLoading=null;
 const loadRequest=()=>{
  if(!requestDialog)return null;
  requestLoading??=import('./request.js').then(module=>module.setupRequest(requestDialog,{show}))
   .catch(error=>{requestLoading=null;console.warn('Окно заявки не подключилось.',error);return null;});
  return requestLoading;
 };
 const list=value=>(value||'').split('|').filter(Boolean);
 const indexes=(...values)=>values.flatMap(v=>String(v??'').split(',')).filter(v=>v.trim()!=='').map(Number).filter(Number.isInteger);
 const specOf=control=>{
  const d=control.dataset, from=placeOf(control);
  if(control.hasAttribute('data-book'))return {book:true,programs:indexes(d.program,d.ycPrograms),items:list(d.ycItems),services:list(d.requestServices),context:d.bookContext||'',contextPrefix:'Вы выбрали: ',from};
  if(control.hasAttribute('data-membership'))return {category:'club',services:['Клубная карта'],context:d.membership||'',from};
  // Гараж услуг: мойка и другие работы вместе — программы мойки идут в ту же заявку.
  // data-request-studio — студия кнопки (myasnitskaya, technopark): её телефон в окне первым.
  if(d.requestContext)return {category:d.requestCategory||'',services:list(d.requestServices),programs:indexes(d.washPrograms),context:d.requestContext,studio:d.requestStudio||'',from};
  return {category:d.requestCategory||'',services:list(d.requestServices),programs:indexes(d.washPrograms),context:d.washContext||'',contextPrefix:d.washContext?'Вы выбрали: ':'',studio:d.requestStudio||'',from};
 };
 const openRequest=control=>{
  rememberOpener(control);
  closeDrawer();
  const spec=specOf(control);
  loadRequest()?.then(open=>open?.(spec));
 };
 document.querySelectorAll('[data-request],[data-book],[data-membership]').forEach(button=>button.setAttribute('aria-haspopup','dialog'));

 // Карты студий в карточках локаций (js/maps.js): модуль и iframe виджета — только
 // когда область карты появляется на экране. Запаса нет (было 600 px, WP7 27.10): на «О нас»
 // карты стоят сразу под героем, и с запасом виджет Яндекса (≈ 5 МБ, сторонние cookie и
 // его собственная Метрика) грузился при открытии страницы, до прокрутки. До этого, без скриптов
 // и при ошибке в области — заглушка со ссылкой на карточку в Яндекс Картах.
 const mapBoxes=document.querySelectorAll('[data-map-embed]');
 let mapsLoading=null;
 const loadMaps=()=>mapsLoading??=import('./maps.js').catch(error=>{mapsLoading=null;console.warn('Карты студий не подключились: остаётся ссылка на Яндекс Карты.',error);return null;});
 const mapWatch=mapBoxes.length&&'IntersectionObserver' in window?new IntersectionObserver(entries=>{
  for(const entry of entries){
   if(!entry.isIntersecting)continue;
   mapWatch.unobserve(entry.target);
   loadMaps().then(module=>module?.showMap(entry.target));
  }
 },{rootMargin:'0px'}):null;
 mapBoxes.forEach(box=>mapWatch?.observe(box));

 // Где на странице кнопка или ссылка — для параметров целей (telegram_click).
 const placeOf=control=>control.closest('#drawer')?'drawer':control.closest('.site-header')?'header':control.closest('.site-footer,#contacts')?'footer':control.classList.contains('mobile-cta')?'mobile-cta':control.closest('dialog')?'dialog':'page';

 // Прыжок к блоку этой же страницы: раскрыть <details>, закрыть шторку и окна,
 // фокус — на цель (без второй прокрутки).
 const jump=(target,hash)=>{
  if(target.tagName==='DETAILS')target.open=true;
  target.scrollIntoView({behavior:reduced()?'instant':'smooth'});
  if(!target.matches('a[href],button,input,select,textarea,summary,[tabindex]'))target.setAttribute('tabindex','-1');
  target.focus({preventScroll:true});
  if(hash)history.replaceState(null,'',hash);
 };

 document.addEventListener('click',e=>{
  const control=e.target.closest('a,button'); if(!control)return;
  // Цели Метрики: звонок и переход в онлайн-запись студии (YCLIENTS, мелкая строка в форме
  // заявки — booking_branch) — ссылки уходят сами.
  // Ссылка филиала бывает с уже набранными услугами (yclients.js), поэтому сверяем
  // по компании в yclients, а не по ссылке целиком.
  const href=control.getAttribute('href')||'';
  if(href.startsWith('tel:'))goal('phone_click',{tel:href.slice(4)});
  else if(control.hasAttribute('data-club-card'))goal('club_card');
  // Telegram — единственное действие на «Привозе» и «Покупке и продаже» (поправка критика 18):
  // с какой страницы, из какого места и в какой канал или чат ушёл посетитель.
  else if(/^https?:\/\/t\.me\//i.test(href))goal('telegram_click',{from:document.body.dataset.page||location.pathname,place:placeOf(control),to:href.replace(/^https?:\/\/t\.me\//i,'').split(/[?#]/)[0]});
  else{const branch=LOCATIONS.find(l=>href&&l.booking&&href.startsWith(l.booking.replace(/\/personal\/.*$/,'/')));if(branch)goal('booking_branch',{branch:branch.id,preset:/[?&]o=m-1s/.test(href)});}
  // «Записаться онлайн» (и запись на автомойку, и прежние кнопки клуба) — одна форма #request.
  if(control.matches('[data-book],[data-request],[data-membership]')){ e.preventDefault(); return openRequest(control); }
  // «На карте» в подвале — переход к карте студии: якорь на этой странице или на «О нас».
  // Уходя на главную, запрос Метрики со старой страницы может не успеть — тогда цель
  // отправит главная по прибытии (отметка в sessionStorage, см. ниже setupAnalytics).
  if(control.dataset.mapLink){
   const branch=control.dataset.mapLink;
   if(href.startsWith('#'))goal('map_open',{branch,source:'footer'});else try{sessionStorage.setItem('mw:map-goal',branch);}catch{}
  }
  const hash=control.getAttribute('href');
  if(hash?.startsWith('#')&&hash.length>1){const target=document.getElementById(hash.slice(1));if(target){e.preventDefault();returnTo=null;closeDialogs();jump(target,hash);}}
 },options);

 const outside=(dialog,e)=>{const r=dialog.getBoundingClientRect();return e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom;};
 for(const dialog of document.querySelectorAll('dialog.dialog')){
  // Закрываем по фону, только если и нажатие, и отпускание были вне окна:
  // выделение текста, отпущенное за краем окна, его больше не закрывает.
  let downOutside=false;
  dialog.addEventListener('pointerdown',e=>{downOutside=e.target===dialog&&outside(dialog,e);},options);
  // Фокус-ловушка: showModal() делает страницу под окном инертной, но Tab с последнего поля
  // уводит фокус в интерфейс браузера. Замыкаем круг внутри окна: с последнего — на первое,
  // Shift+Tab с первого — на последнее.
  dialog.addEventListener('keydown',e=>{
   if(e.key!=='Tab'||e.altKey||e.ctrlKey||e.metaKey)return;
   const items=[...dialog.querySelectorAll('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])')]
    .filter(el=>!el.disabled&&el.tabIndex>=0&&!el.closest('[hidden],[inert],[aria-hidden="true"]')&&el.getClientRects().length);
   if(!items.length)return;
   const first=items[0], last=items[items.length-1], active=document.activeElement;
   if(e.shiftKey&&(active===first||!dialog.contains(active)||active===dialog)){e.preventDefault();last.focus();}
   else if(!e.shiftKey&&(active===last||!dialog.contains(active))){e.preventDefault();first.focus();}
  },options);
  dialog.addEventListener('click',e=>{
   if(settling(e)){ if(e.target.closest('a[href]')) e.preventDefault(); return; }
   if(e.target===dialog&&downOutside&&outside(dialog,e)) dialog.close();
  },options);
  dialog.addEventListener('close',()=>{
   syncLock();
   // Окно сменилось другим (заявка → запись): кнопку-источник запомним для того, второго.
   if(document.querySelector('dialog.dialog[open]'))return;
   // Браузер сам возвращает фокус туда, где он был до showModal(). Если это не вышло
   // (кнопка была в шторке, которая уже закрыта, или фокус остался на body) — ставим его
   // на запомненную кнопку. Если фокус уже на месте (переход к якорю) — не трогаем.
   const target=returnTo; returnTo=null;
   const active=document.activeElement;
   const lost=!active||active===document.body||Boolean(active.closest('dialog:not([open])'));
   if(lost&&target?.isConnected&&!target.closest('[inert]'))target.focus({preventScroll:true});
  },options);
 }

 // Прямой заход по адресу с якорем (services#price-polish, #programs внутри
 // «Автомойки»): раскрыть <details> цели и все, в которые она вложена, и встать к ней
 // под шапкой. Браузер сам прокрутил к закрытому блоку до раскрытия; повторяем
 // после шрифтов — они меняют высоту строк.
 const hashTarget=()=>{try{return location.hash.length>1?document.getElementById(decodeURIComponent(location.hash.slice(1))):null;}catch{return null;}};
 const reveal=target=>{let opened=false;for(let box=target.tagName==='DETAILS'?target:target.parentElement?.closest('details');box;box=box.parentElement?.closest('details'))if(!box.open){box.open=true;opened=true;}return opened;};
 const arrival=hashTarget();
 if(arrival&&(arrival.tagName==='DETAILS'||arrival.closest('details'))){
  reveal(arrival);
  // Второе выравнивание — только если человек ещё не прокрутил страницу сам.
  let placed=-1;
  const settle=()=>{if(placed>=0&&Math.abs(scrollY-placed)>2)return;arrival.scrollIntoView({behavior:'instant'});placed=scrollY;};
  requestAnimationFrame(settle);
  document.fonts?.ready.then(()=>requestAnimationFrame(settle));
 }
 // Хеш сменили на открытой странице (адресная строка, «назад»): тоже раскрыть группу.
 addEventListener('hashchange',()=>{
  const target=hashTarget();
  if(!target||!(target.tagName==='DETAILS'||target.closest('details')))return;
  reveal(target);
  requestAnimationFrame(()=>target.scrollIntoView({behavior:'instant'}));
 },options);
 // Ссылка на тот же якорь второй раз hashchange не даёт: раскрываем по клику.
 document.addEventListener('click',e=>{
  const link=e.target.closest('a[href^="#"]');if(!link||link.getAttribute('href').length<2)return;
  let target=null;try{target=document.getElementById(decodeURIComponent(link.getAttribute('href').slice(1)));}catch{}
  if(target&&reveal(target)&&location.hash===link.getAttribute('href')){e.preventDefault();target.scrollIntoView({behavior:'instant'});}
 },options);

 const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){entry.target.classList.add('is-in');observer.unobserve(entry.target);}},{threshold:0,rootMargin:'0px 0px -6% 0px'});
 document.querySelectorAll('[data-reveal]').forEach(el=>observer.observe(el));
 setupAnalytics();
 // Пришли по «На карте» из подвала другой страницы: цель map_open — здесь, рядом с картой.
 try{const branch=sessionStorage.getItem('mw:map-goal');if(branch){sessionStorage.removeItem('mw:map-goal');if(location.hash==='#map-'+branch)goal('map_open',{branch,source:'footer'});}}catch{}
 return ()=>{abort.abort();observer.disconnect();mapWatch?.disconnect();lockWatch.disconnect();};
}
