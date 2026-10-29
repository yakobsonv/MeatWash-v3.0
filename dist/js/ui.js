// Общее для всех страниц Meat Wash: окна записи, «Узнать цену» и заявки, карты студий, переходы
// по якорям, появление блоков, блокировка прокрутки под любым открытым <dialog>.
// Владелец: WP6 (план §4.1, §4.2, §4.7; поправки критика 18, 21).
// Меню-шторка — js/shell.js (WP1): он открывает и закрывает <dialog id="drawer"> и закрывает его
// в фазе capture перед ссылкой, [data-book], [data-request], [data-membership]; потом этот модуль
// по тому же клику открывает своё окно. Класс html.is-locked ставит только этот модуль: он
// считает открытые <dialog> — шторку, окна записи и заявки, 3D-гараж (поправка 21).
// Любого элемента может не быть на странице — всё проверяется перед использованием.
// Здесь же — уведомление о cookie и цели Метрики (analytics.js: только с согласия).
import { setupAnalytics, goal } from './analytics.js';
import { LOCATIONS, REQUESTS, CATEGORIES, ITEMS } from './data.js';
import { getBody } from './body.js';

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
 const booking=$('#booking'), requestDialog=$('#request'), drawer=$('#drawer'), drawerOpener=$('#drawer-open');
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
 // Шторка закрывается сразу (dialog.close() в shell.js), её уход только дорисовывается
 // анимацией. Перед своим окном на всякий случай закрываем её и здесь.
 const closeDrawer=()=>{if(drawer?.open)drawer.close();};
 // Куда вернуть фокус после окна: на кнопку, которая его открыла, а если она была в шторке —
 // на «Меню» (#drawer-open): шторка к этому времени уже закрыта.
 // Кнопка внутри окна записи или заявки (переход между ними) прежнюю цель не меняет.
 let returnTo=null;
 const rememberOpener=control=>{if(control?.closest('dialog.dialog'))return;returnTo=control&&drawer?.contains(control)?drawerOpener:control||null;};
 // Окно открыто только что: второй клик двойного клика (или двойного тапа)
 // приходится в ту же точку — по фону он закрывал окно, по ссылке филиала
 // сам открывал запись. Такие клики по окну игнорируем.
 let openedAt=0;
 const show=dialog=>{
  if(!dialog||dialog.open) return;
  // Длинное окно открывается с начала, а не с места, где его закрыли в прошлый раз.
  dialog.scrollTop=0;
  dialog.showModal(); openedAt=performance.now(); syncLock();
 };
 const settling=e=>e.detail>1||performance.now()-openedAt<400;
 const closeDialogs=()=>{ booking?.close(); requestDialog?.close(); closeDrawer(); };
 const context=$('#booking-context'), lead=$('#booking-lead'), hint=$('#booking-hint'), branches=booking?.querySelector('.dialog__branches');
 const leadText=lead?.textContent||'';
 // Что именно выбрал или спрашивает человек — только текстом, без разметки. Строку пишет
 // скрипт, typo() сборки до неё не доходит: те же правила здесь (nb) — короткие слова
 // к следующему, неразрывный пробел перед тире, число к ₽. Сами data-book-context
 // остаются с обычными пробелами (поправка 16).
 const setContext=(note,prefix='Вы выбрали: ')=>{ if(!context)return; context.textContent=note?nb(prefix+note):''; context.hidden=!note; };
 // Телефоны студий (блок всегда развёрнут): порядок из разметки, по плёнке и защите
 // первым — Технопарк. Переставляем сами ссылки: порядок чтения и Tab тот же, что на экране.
 const phones=booking?.querySelector('.dialog__phones'), phoneLinks=[...(phones?.querySelectorAll('[data-phone]')||[])];
 const phonesFirst=id=>{ if(phones&&phoneLinks.length)phones.append(...[...phoneLinks].sort((a,b)=>(b.dataset.phone===id)-(a.dataset.phone===id))); };
 // Запись: филиал выбирается здесь, потому что у площадок разные компании в yclients.
 // Ссылки филиалов ведут в YCLIENTS с уже набранными услугами. Карта
 // соответствий подгружается один раз; пока её нет, ссылки остаются такими,
 // как в разметке — обычный выбор услуги, запись всё равно работает.
 let yc=null, bookingJob=0, bookingNote='';
 const loadYc=()=>yc?Promise.resolve(yc):import('./yclients.js').then(m=>m.loadMap().then(()=>(yc=m)));
 // Каждое открытие окна начинает с ссылок из разметки: иначе общая «Записаться»
 // унесла бы в yclients корзину прошлого выбора.
 branches?.querySelectorAll('[data-branch]').forEach(link=>{link.dataset.href=link.getAttribute('href');});
 const resetLinks=()=>branches?.querySelectorAll('[data-branch]').forEach(link=>{if(link.dataset.href)link.setAttribute('href',link.dataset.href);});
 const applyLinks=spec=>{
   if(!yc||!branches)return;
   const body=getBody();
   // rest — сколько работ этого же филиала уже попало в корзину: если ни одной,
   // выбранное целиком добавляют на месте.
   let unmatched=[],rest=0;
   branches.querySelectorAll('[data-branch]').forEach(link=>{
     const branch=link.dataset.branch;
     const {ids,missing}=yc.resolve(branch,spec,body);
     const url=yc.bookingUrl(branch,ids);
     if(url)link.href=url;
     if(missing.length>unmatched.length){unmatched=missing;rest=ids.length;}
   });
   // v2 (план юзабилити 08.10): выбранное онлайн не продаётся — одна строка вместо
   // «Вы выбрали», «На месте добавите… не продаются» и «Выберите студию» подряд.
   // Выбранное бывает само автомойкой (Трёхфазная): не «запишитесь на автомойку», а «выберите
   // в онлайн-записи любую» — фраза верна и для программы, и для работы к автомойке.
   if(!unmatched.length)return;
   const onSite=rest?`${unmatched.join(', ')} мастер добавит при\u00a0приёмке, остальное уже в\u00a0заказе.`:'Это\u00a0мастер добавит при\u00a0приёмке\u00a0— в\u00a0онлайн-записи выберите любую автомойку.';
   setContext((bookingNote?bookingNote+'. ':'')+onSite,bookingNote?'Вы выбрали: ':'');
   hint.hidden=true;
 };
 // Автомойка и другие работы выбраны вместе (гараж): запись — только автомойка, а окно
 // напоминает про цену остальных работ; общая строка про них тогда не нужна.
 const requestNote=$('#booking-request'), otherNote=$('#booking-other');
 const setRequestNote=list=>{
   if(!requestNote)return;
   requestNote.hidden=!list.length;
   if(otherNote)otherNote.hidden=Boolean(list.length);
   if(!list.length)return;
   requestNote.querySelector('[data-booking-request-text]').textContent=`Цену остальных работ назовёт администратор: ${list.join(', ')}.`;
   requestNote.querySelector('[data-booking-request]').dataset.requestServices=list.join('|');
 };
 const openBooking=(note='',spec=null,requestList=[])=>{
   if(!booking)return;
   closeDrawer(); requestDialog?.close();
   setRequestNote(requestList);
   booking.dataset.mode='book';
   $('#booking-title').textContent='Записаться';
   bookingNote=note;
   setContext(note); lead.hidden=true; hint.hidden=false; branches.hidden=false;
   phonesFirst('');
   resetLinks();
   // Ответ карты yclients может прийти после следующего открытия окна — тогда он уже не нужен.
   const job=++bookingJob;
   if(spec&&(spec.programs.length||spec.items.length))loadYc().then(()=>{if(job===bookingJob&&booking.open)applyLinks(spec);});
   show(booking);
   goal('booking_open',{context:note||'—'});
   // Фокус на заголовке, а не на Мясницкой: иначе она выглядела выбранной по умолчанию.
   $('#booking-title').focus({preventScroll:true});
 };
 // Разговор с администратором: то же окно без студий — заголовок, что человек
 // спрашивает, подсказка и телефоны. Окно бывает уже открыто (кнопка «Узнать цену»
 // в окне записи) — тогда оно перестраивается на месте и встаёт в начало.
 const openTalk=({title,ask='',text=leadText,first=''})=>{
   if(!booking)return;
   bookingJob++;
   closeDrawer(); requestDialog?.close();
   if(requestNote)requestNote.hidden=true;
   if(otherNote)otherNote.hidden=true;
   booking.dataset.mode='talk';
   $('#booking-title').textContent=title;
   setContext(ask,'Вы спрашиваете: ');
   lead.textContent=text; lead.hidden=false; hint.hidden=true; branches.hidden=true;
   phonesFirst(first);
   if(booking.open)booking.scrollTop=0;
   show(booking);
   $('#booking-title').focus({preventScroll:true});
 };
 const openMembership=(title='')=>openTalk({title:title||'Meat Wash Car Care Club'});
 // v2 (план юзабилити 08.10): «Узнать цену», пока заявки с сайта не принимаются, — не
 // форма, которую нельзя отправить, а телефоны студий. Условие то же, что в request.js:
 // адрес приёма задан и этот сайт в списке hosts. Когда приём включат, кнопки снова
 // открывают форму заявки (#request).
 const requestHosts=Array.isArray(REQUESTS.hosts)?REQUESTS.hosts:[];
 const requestsOn=Boolean(REQUESTS.endpoint)&&(!requestHosts.length||requestHosts.includes(location.hostname));
 const openPrice=(services,category)=>{
   // Категория — из кнопки или общая у всех выбранных работ (гараж): от неё порядок телефонов.
   const found=new Set(services.map(name=>ITEMS[name]?.category).filter(Boolean));
   const id=category||(found.size===1?[...found][0]:'');
   const group=CATEGORIES.find(c=>c.id===id);
   const about=group?group.desc.replace(/\.$/,''):'';
   openTalk({
     title:'Узнать цену',
     ask:services.length?services.join(', '):about&&about[0].toLowerCase()+about.slice(1),
     text:'Позвоните в\u00a0студию\u00a0— администратор назовёт цену и\u00a0подберёт время.',
     first:id==='protection'?'technopark':'',
   });
   goal('request_open',{works:services.length,from:category||(services.length?'selection':'general'),mode:'phone'});
 };

 // Окно заявки (js/request.js): модуль — по первому нажатию «Оставить заявку».
 let requestLoading=null;
 const loadRequest=()=>{
  if(!requestDialog)return null;
  requestLoading??=import('./request.js').then(module=>module.setupRequest(requestDialog,{show}))
   .catch(error=>{requestLoading=null;console.warn('Окно заявки не подключилось.',error);return null;});
  return requestLoading;
 };
 document.querySelectorAll('[data-request]').forEach(button=>button.setAttribute('aria-haspopup','dialog'));

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
  // Цели Метрики: звонок и переход в онлайн-запись филиала (yclients) — ссылки уходят сами.
  // Ссылка филиала бывает с уже набранными услугами (yclients.js), поэтому сверяем
  // по компании в yclients, а не по ссылке целиком.
  const href=control.getAttribute('href')||'';
  if(href.startsWith('tel:'))goal('phone_click',{tel:href.slice(4)});
  else if(control.hasAttribute('data-club-card'))goal('club_card');
  // Telegram — единственное действие на «Привозе» и «Покупке и продаже» (поправка критика 18):
  // с какой страницы, из какого места и в какой канал или чат ушёл посетитель.
  else if(/^https?:\/\/t\.me\//i.test(href))goal('telegram_click',{from:document.body.dataset.page||location.pathname,place:placeOf(control),to:href.replace(/^https?:\/\/t\.me\//i,'').split(/[?#]/)[0]});
  else{const branch=LOCATIONS.find(l=>href&&l.booking&&href.startsWith(l.booking.replace(/\/personal\/.*$/,'/')));if(branch)goal('booking_branch',{branch:branch.id,preset:/[?&]o=m-1s/.test(href)});}
  if(control.hasAttribute('data-book')){
   rememberOpener(control);
   const d=control.dataset;
   const programs=[d.program,...(d.ycPrograms||'').split(',')].filter(v=>v!=='' &&v!=null).map(Number).filter(Number.isInteger);
   const items=(d.ycItems||'').split('|').filter(Boolean);
   return openBooking(d.bookContext||'',{programs,items},(d.requestServices||'').split('|').filter(Boolean));
  }
  // «Узнать цену» — всё, кроме автомойки: пока приём заявок выключен — телефоны студий,
  // иначе заявка с фото (модуль окна грузится по первому нажатию).
  if(control.hasAttribute('data-request')){
   // Кнопка внутри уже открытого окна записи («Узнать цену» остальных работ): окно
   // перестраивается на месте, фокус потом вернётся туда же, куда и после записи.
   rememberOpener(control);
   const d=control.dataset;
   if(!requestsOn)return openPrice((d.requestServices||'').split('|').filter(Boolean),d.requestCategory||'');
   closeDrawer(); booking?.close();
   loadRequest()?.then(open=>open?.({services:(d.requestServices||'').split('|').filter(Boolean),category:d.requestCategory||'',washContext:d.washContext||'',washPrograms:d.washPrograms||''}));
   return;
  }
  if(control.hasAttribute('data-membership')){ rememberOpener(control); return openMembership(control.dataset.membership); }
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

 const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){entry.target.classList.add('is-in');observer.unobserve(entry.target);}},{threshold:.1});
 document.querySelectorAll('[data-reveal]').forEach(el=>observer.observe(el));
 setupAnalytics();
 // Пришли по «На карте» из подвала другой страницы: цель map_open — здесь, рядом с картой.
 try{const branch=sessionStorage.getItem('mw:map-goal');if(branch){sessionStorage.removeItem('mw:map-goal');if(location.hash==='#map-'+branch)goal('map_open',{branch,source:'footer'});}}catch{}
 return ()=>{abort.abort();observer.disconnect();mapWatch?.disconnect();lockWatch.disconnect();};
}
