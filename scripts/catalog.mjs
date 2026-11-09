// Всё, что зависит от цен и услуг, собирается из dist/assets/meatwash-content.json:
// - каталог на /services — подстановка {{catalog}} (renderCatalog) и сравнение программ
//   {{compare}} (renderCompare); их вызывает scripts/pages.mjs при сборке страницы;
// - цены подразделов на страницах направлений — {{prices:<id,…>}} (renderSections) и
//   «от» подраздела — {{min-section:<id>}} (sectionMin);
// - dist/js/data.js — те же цены и филиалы для скриптов (гараж, окно услуги, карты).
// Запуск: npm run catalog — пишет только dist/js/data.js (MEATWASH, WP0 27.10).
// Владелец: WP3 (разметка каталога по §4.3 плана, renderCompare, SECTION_LINKS; 27.10).
import {readFile,writeFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
export const content=JSON.parse(await readFile(new URL('dist/assets/meatwash-content.json',root),'utf8'));
const d=content;
export const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const money=n=>n.toLocaleString('ru-RU')+' ₽';
const number=n=>String(n+1).padStart(2,'0');
// Цена позиции: число — «от N ₽», null — «После оценки» (что оценивают — в пояснении, третьим полем).
export const priceText=price=>price==null?'После оценки':'от '+money(price);
const priced=items=>items.map(([,price])=>price).filter(price=>price!=null);
export const groupMin=id=>Math.min(...priced(d.groups.find(g=>g.id===id).items));
// Цена «от» раздела для шторки, героев и description ({{min:<group>}}): у автомойки — минимум
// цен программ (позиции «Дополнительно на автомойке» в «от» не входят), у остальных — минимум
// позиций с ценой.
export const minFor=id=>{
 const group=d.groups.find(g=>g.id===id);
 if(!group)throw new Error(`Нет раздела каталога ${id}`);
 const prices=group.sections.some(s=>s.programs)?d.programPrices.flat():priced(group.items);
 if(!prices.length)throw new Error(`В разделе ${id} нет позиций с ценой`);
 return Math.min(...prices);
};
// Контекст записи программы: название, кузов и цена для этого кузова. Тот же
// формат собирает js/catalog.js при смене кузова.
// Цена программы в филиале, если она выше общей (programStudioPrices): [{name,label,prices}].
const STUDIO_LABEL={myasnitskaya:'на Лубянке',technopark:'в Технопарке'};
export const studioPrices=i=>Object.entries(d.programStudioPrices?.[i]||{}).map(([id,prices])=>{
 const location=d.locations.find(l=>l.id===id);
 if(!location||!STUDIO_LABEL[id])throw new Error(`programStudioPrices: нет филиала ${id}`);
 return {name:location.name,label:STUDIO_LABEL[id],prices};
});
export const programContext=(i,body)=>`${d.programs[i][0]} — ${d.bodyTypes[body]}, ${money(d.programPrices[i][body])}${studioPrices(i).filter(s=>s.prices[body]!==d.programPrices[i][body]).map(s=>`, ${s.label} — ${money(s.prices[body])}`).join('')}`;
// Строка «На Лубянке — 3 150 ₽» под ценой: тот же data-program-price, его меняет кузов.
// Для кузова, где цена студии равна общей (микроавтобус: 4 250 ₽ в обеих), строки нет: data-base —
// общие цены, js/catalog.js ставит hidden при совпадении; в контексте записи — тоже без неё.
const studioLine=(i,tag,cls)=>studioPrices(i).map(s=>`<${tag} class="${cls}" data-studio-line data-base="${d.programPrices[i].join(',')}"${s.prices[0]===d.programPrices[i][0]?' hidden':''}>${s.label[0].toUpperCase()+s.label.slice(1)} — <span data-program-price data-prices="${s.prices.join(',')}">${money(s.prices[0])}</span></${tag}>`).join('');
export const serviceCount=()=>d.groups.reduce((sum,group)=>sum+group.items.length,0);
// Иконка спрайта — та же разметка, что у подстановки icon (scripts/pages.mjs). Своя копия:
// pages.mjs импортирует этот модуль, обратный импорт дал бы цикл при npm run catalog.
// Версия ?v= — по содержимому файла, как assetUrl() в pages.mjs (поправки 27, 28).
let spriteVersion;
const icon=name=>{
 spriteVersion??=createHash('sha256').update(readFileSync(new URL('dist/assets/brand/sprite.svg',root))).digest('hex').slice(0,8);
 return `<svg class="icon" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="assets/brand/sprite.svg?v=${spriteVersion}#i-${name}"/></svg>`;
};
// Подпись кнопки для экранного диктора: «Оставить заявку: Химчистка руля».
const forName=name=>`<span class="sr">: ${escape(name)}</span>`;
// Одно действие на позицию (Влад 05.11: всё — по заявкам). Подпись — requestLabel(страница):
// на /wash «Записаться онлайн», на остальных «Оставить заявку» (Влад 09.11 вечер).
// Атрибуты — контракт формы (docs/meat-auto/CONTRACTS.md, «Заявка»): автомойка (booking:
// yclients) — data-book с работой (форма #request с темой «Автомойка», мелкая ссылка онлайн-
// записи YCLIENTS с этой работой в корзине); остальное — data-request с категорией и работой.
// У подраздела с onsite: true (продаётся только на месте, «Дополнительно на автомойке»)
// кнопки нет — подпись «добавим при приёмке».
// Ключи data-* — побуквенно названия из JSON (typo() их не трогает, check сверяет).
export const ONSITE_LABEL='добавим при приёмке';
const ACTION_CLASS='catalog__action btn btn--compact btn--secondary';
// На телефоне от кнопки остаётся круглая стрелка (services.css), подпись — для диктора.
export const requestLabel=page=>page==='wash'?'Записаться онлайн':'Оставить заявку';
// Говорящая форма для текста («Оставьте заявку — …»).
export const requestSay=page=>page==='wash'?'Запишитесь онлайн':'Оставьте заявку';
// Подпись текущей отрисовки: ставят renderCatalog и renderSections (страница известна там).
let REQUEST_LABEL=requestLabel('');
const actionLabel=(label,name)=>`<span class="catalog__action-label">${label}</span>${forName(name)}${icon('arrow-right')}`;
const action=(group,name)=>group.booking==='yclients'
 ?`<button class="${ACTION_CLASS}" type="button" data-book data-book-context="${escape(name)}" data-yc-items="${escape(name)}">${actionLabel(REQUEST_LABEL,name)}</button>`
 :`<button class="${ACTION_CLASS}" type="button" data-request data-request-category="${escape(group.id)}" data-request-services="${escape(name)}">${actionLabel(REQUEST_LABEL,name)}</button>`;
const itemRow=(group,section,[name,price,note])=>`<li class="catalog__item" data-price-item="${escape(name)}"><div class="catalog__item-text"><p class="catalog__item-name">${escape(name)}</p>${note?`<p class="catalog__item-note">${escape(note)}</p>`:''}</div><p class="catalog__item-price${price==null?' catalog__item-price--estimate':''}">${priceText(price)}</p>${section.onsite?`<p class="catalog__item-onsite">${ONSITE_LABEL}</p>`:action(group,name)}</li>`;
const itemOf=(group,name)=>group.items.find(([n])=>n===name)??(()=>{throw new Error(`Подраздел ${group.id}: нет позиции «${name}» в items`);})();

// Ссылки подразделов на страницы направлений — здесь, не в JSON. page — id страницы из
// реестра; на самой этой странице ({{prices}}) ссылка не выводится.
export const SECTION_LINKS={
 programs:{page:'wash',label:'Подробнее об автомойке'},
 'price-interior':{page:'wash',label:'Подробнее об автомойке'},
 'price-polish':{page:'detailing',label:'Подробнее о детейлинге'},
 'price-film':{page:'wrap',label:'Подробнее об оклейке'},
 'price-bodywork':{page:'bodywork',label:'Подробнее о кузовных работах'},
 'price-presale':{page:'auto',hash:'sell',label:'Продажа автомобилей'},
};
// Адрес страницы по id реестра — его подставляет scripts/pages.mjs (setPageHref): этот модуль
// не импортирует реестр, чтобы npm run catalog работал отдельно.
let pageHref=id=>id;
export const setPageHref=fn=>{pageHref=fn;};
// Пояснение под заголовком подраздела.
const SECTION_NOTE={
 programs:'Каждая следующая включает предыдущую. Цена зависит от типа кузова.',
 onsite:'Записываться отдельно не нужно — скажите администратору, когда приедете на автомойку.',
};

// Программы и пакеты автомойки (P02; Влад 09.11 — «как в карточке Яндекса»): плитка li#program-i
// (на неё ведут ссылки #program-0…4) — кадр 4:3 (programCards: файлы <photo>-800/-1200.webp),
// div.program-card__text с названием h4 и описанием в 2–3 строки (programCards.text; обёртка —
// одна строка сетки карточки, поэтому под коротким названием нет пустой строки, а запас высоты
// уходит над ценой), строка «цена · время» (цена — для выбранного кузова, js/catalog.js меняет её
// по data-prices; время — сокращённо, «30 мин»), под ней цена в студии, где программа дороже, и
// запись с программой в корзине YCLIENTS — основная кнопка (btn--primary, как до 09.11).
// Состав по пунктам — в сравнении под карточками (renderCompare), в карточке его нет.
const shortTime=time=>time.replace(/\s*минут[аы]?$/,' мин');
const cardOf=i=>{
 const card=d.programCards?.items?.[i];
 if(!card?.photo||!card.alt||!card.text)throw new Error(`programCards.items[${i}]: нужны photo, alt и text`);
 return card;
};
// sizes: пять в ряд от 1240 px, 3 + 2 от 1000 px, ниже — лента карточек по 300 px / 78vw.
const PROGRAM_SIZES='(min-width: 1240px) 19vw, (min-width: 1000px) 31vw, (min-width: 760px) 300px, 78vw';
const programCard=([name,,time],i)=>{
 const card=cardOf(i);
 return `<li class="program-card" id="program-${i}">
      <div class="program-card__media"><img src="${escape(card.photo)}-800.webp" srcset="${escape(card.photo)}-800.webp 800w, ${escape(card.photo)}-1200.webp 1200w" sizes="${PROGRAM_SIZES}" width="800" height="600" alt="${escape(card.alt)}" loading="lazy" decoding="async"></div>
      <div class="program-card__text"><h4 class="program-card__name">${escape(name)}</h4><p class="program-card__desc">${escape(card.text)}</p></div>
      <p class="program-card__price"><span data-program-price data-prices="${d.programPrices[i].join(',')}">${money(d.programPrices[i][0])}</span><span class="program-card__time"><span class="program-card__dot" aria-hidden="true">·</span><span class="sr">, </span>${escape(shortTime(time))}</span>${studioLine(i,'span','program-card__studio')}</p>
      <button class="btn btn--primary program-card__book" type="button" data-book data-program="${i}" data-book-context="${escape(programContext(i,0))}">${REQUEST_LABEL}${forName(name)}</button>
     </li>`;
};
const programs=()=>`<fieldset class="body-types segmented"><legend class="sr">Тип кузова</legend>${d.bodyTypes.map((type,i)=>`<label><input type="radio" name="body-type" value="${i}"${i===0?' checked':''}><span>${escape(type)}</span></label>`).join('')}</fieldset>
    <p class="catalog__selection" id="body-price-label" aria-live="polite">Цены для типа кузова: ${escape(d.bodyTypes[0])}</p>
    <ol class="programs" aria-label="Программы и пакеты автомойки">
     ${d.programs.map(programCard).join('\n     ')}
    </ol>
    ${renderCompare()}`;

// Подраздел категории: заголовок h3 (+ пояснение, + ссылка на страницу направления) и
// позиции. accent — спокойно выделенный (оклейка, ремонт стёкол).
const sectionHead=(section,page)=>{
 const link=SECTION_LINKS[section.id]?.page===page?null:SECTION_LINKS[section.id];
 const note=section.programs?SECTION_NOTE.programs:section.onsite?SECTION_NOTE.onsite:'';
 return `<div class="catalog__section-head">
    <h3 class="catalog__subhead" id="${escape(section.id)}-title">${escape(section.title)}</h3>${note?`
    <p class="catalog__section-note">${note}</p>`:''}${link?`
    <a class="link-arrow catalog__section-link" href="${pageHref(link.page)}${link.hash?`#${link.hash}`:''}">${escape(link.label)}${icon('arrow-right')}</a>`:''}
   </div>`;
};
// data-summary — строка свёрнутого подраздела на телефоне (js/catalog.js): «4 позиции, от 2 000 ₽».
// Склонение — как plural() в pages.mjs (тот импортирует этот модуль, поэтому здесь своё).
const positions=n=>{const a=n%10,b=n%100;return `${n} ${a===1&&b!==11?'позиция':a>=2&&a<=4&&(b<12||b>14)?'позиции':'позиций'}`;};
const summary=(group,s)=>{
 const prices=priced(s.items.map(name=>itemOf(group,name)));
 return `${positions(s.items.length)}${prices.length?`, от ${money(Math.min(...prices))}`:''}`;
};
const section=(group,s,page)=>`<section class="catalog__section${s.accent?' catalog__section--accent':''}${s.programs?' catalog__section--programs':''}" id="${escape(s.id)}" aria-labelledby="${escape(s.id)}-title"${s.items?` data-summary="${escape(summary(group,s))}"`:''}>
   ${sectionHead(s,page)}
   ${s.programs?programs():`<ul class="catalog__items" role="list">${s.items.map(name=>itemRow(group,s,itemOf(group,name))).join('')}</ul>`}
  </section>`;
// Всё — по заявке (Влад 05.11): цену и время называет администратор.
const LEAD={yclients:'Оставьте заявку — администратор подберёт время.',request:'Стоимость для вашей машины назовёт администратор: оставьте заявку у работы.'};

// Каталог /services (§4.3 плана) — подстановка {{catalog}}. Пять категорий; без JS
// вкладки — ссылки на категории, панели идут подряд; js/catalog.js делает из них вкладки
// (WAI-ARIA tabs: role="tablist" ставится на .anchor-tabs__track[data-catalog-tabs] —
// вкладки его прямые потомки) и показывает одну. H1 стоит в герое, поэтому категории — h2,
// подразделы — h3, программы и сравнение — h4.
export function renderCatalog(){
 REQUEST_LABEL=requestLabel('services');
 return `
<div class="catalog" id="catalog">
 <nav class="catalog__tabs anchor-tabs" aria-label="Разделы каталога">
  <div class="anchor-tabs__track" data-catalog-tabs>${d.groups.map(group=>`<a class="anchor-tabs__tab catalog__tab" id="tab-price-${escape(group.id)}" href="#price-${escape(group.id)}">${escape(group.title)}</a>`).join('')}</div>
 </nav>
 <div class="catalog__list" id="price-list">
${d.groups.map(group=>` <section class="catalog__panel" id="price-${escape(group.id)}" data-category="${escape(group.id)}" aria-labelledby="price-${escape(group.id)}-title">
  <header class="catalog__panel-head">
   <h2 class="catalog__panel-title" id="price-${escape(group.id)}-title">${escape(group.title)}</h2>
   <p class="catalog__panel-lead">${escape(group.desc)} ${LEAD[group.booking]}</p>
  </header>
  ${group.sections.map(s=>section(group,s,'services')).join('\n  ')}
 </section>`).join('\n')}
 </div>
 <p class="catalog__note" id="price-note">Стоимость зависит от типа кузова и состояния автомобиля. Итоговый объём и цену согласуем перед работой. Не является публичной офертой.</p>
</div>
`}

// Цены подразделов на страницах направлений — {{prices:<id,…>}} (решение 05.11). Разметка —
// та же, что у подразделов каталога /services (section.catalog__section с h3, строки
// li.catalog__item с кнопкой заявки: data-book у автомойки, data-request у остального),
// обёртка div.catalog.catalog--prices[data-prices]: по ней site.js подключает js/catalog.js
// (переключатель кузова у программ). id подразделов — те же, что на /services (#price-film…):
// на одной странице подраздел — один раз. programs выводит карточки программ, переключатель
// кузова и сравнение (#compare) — {{compare}} рядом не ставить; id подборки из picks (price-wash-top)
// выводит её плитками (pickSection). Под подразделами — строка
// «Не является публичной офертой». page — id страницы (ссылка подраздела на неё не выводится).
// Подборка «Топ-5 услуг» (picks в JSON, id price-wash-top): позиции каталога из разных категорий
// своим описанием (сжато из YCLIENTS). Строки — та же разметка, что у строк каталога
// (li.catalog__item.pick: на телефоне и планшете — строки «как в чеке» с круглой стрелкой),
// без data-price-item: позиции уже есть в каталоге /services; от 1240 px — плитки в ряд под
// карточками программ (services.css). Цена и действие — из каталога: у автомойки data-book
// с работой, у остального data-request с категорией позиции; кнопка — второстепенная
// (btn--secondary), главное действие блока — запись на программу. Если позиция уже входит
// в программы (programItems), последним в строке — p.pick__in «Уже входит в программы «…»»
// (до 1239 px — на всю ширину строки под ценой и стрелкой, от 1240 px — под описанием плитки)
// (с первой программы, где она есть, до последней: каждая следующая включает предыдущую;
// check.mjs сверяет строку с programItems). Рядом с заголовком — ссылка на вкладку
// «Автомойка» /services, где полный прайс с «Дополнительно на автомойке».
const pickOf=id=>d.picks?.items?.find(p=>p.id===id);
const quoted=name=>name.replace(/^Пакет /,'').replace(/^(?!«)(.*)$/,'«$1»');
const listRu=xs=>xs.length<2?xs.join(''):`${xs.slice(0,-1).join(', ')} и ${xs.at(-1)}`;
export const pickIn=name=>{
 const from=d.programItems.findIndex(list=>list.includes(name));
 if(from<0)return '';
 const names=d.programs.slice(from).map(([n])=>quoted(n));
 return `Уже входит в ${names.length>1?'программы':'программу'} ${listRu(names)}`;
};
const pickRow=([name,text])=>{
 const group=d.groups.find(g=>g.items.some(([n])=>n===name));
 if(!group)throw new Error(`picks: нет позиции «${name}» в каталоге`);
 if(!text)throw new Error(`picks: у «${name}» нет описания`);
 const [,price]=itemOf(group,name);
 const inside=pickIn(name);
 return `<li class="catalog__item pick"><div class="catalog__item-text"><p class="catalog__item-name">${escape(name)}</p><p class="catalog__item-note">${escape(text)}</p></div><p class="catalog__item-price${price==null?' catalog__item-price--estimate':''}">${priceText(price)}</p>${action(group,name)}${inside?`<p class="pick__in">${escape(inside)}</p>`:''}</li>`;
};
const pickSection=(p,page)=>`<section class="catalog__section catalog__section--picks" id="${escape(p.id)}" aria-labelledby="${escape(p.id)}-title">
   <div class="catalog__section-head">
    <h3 class="catalog__subhead" id="${escape(p.id)}-title">${escape(p.title)}</h3>${page==='services'?'':`
    <a class="link-arrow catalog__section-link" href="${pageHref('services')}#price-wash">Все цены автомойки${icon('arrow-right')}</a>`}
   </div>
   <ul class="catalog__items picks" role="list">${p.items.map(pickRow).join('')}</ul>
  </section>`;
const sectionOf=id=>{
 for(const group of d.groups){const s=group.sections.find(x=>x.id===id);if(s)return {group,s};}
 throw new Error(`{{prices}}: нет подраздела каталога «${id}»`);
};
export function renderSections(ids,page){
 REQUEST_LABEL=requestLabel(page);
 if(!ids.length||ids.some(id=>!id))throw new Error('{{prices}}: нужен список подразделов через запятую');
 if(new Set(ids).size!==ids.length)throw new Error(`{{prices:${ids.join(',')}}}: подраздел повторяется`);
 return `<div class="catalog catalog--prices" data-prices>
  ${ids.map(id=>{if(pickOf(id))return pickSection(pickOf(id),page);const {group,s}=sectionOf(id);return section(group,s,page);}).join('\n  ')}
  <p class="catalog__note">Стоимость зависит от типа кузова и состояния автомобиля. Итоговый объём и цену согласуем перед работой. Не является публичной офертой.</p>
 </div>`;
}
// «от» подраздела ({{min-section:<id>}}): у программ — минимум цен программ, у остальных —
// минимум позиций с ценой; позиций с ценой нет — ошибка (пишите «после осмотра» текстом).
export const sectionMin=id=>{
 const {group,s}=sectionOf(id);
 const prices=s.programs?d.programPrices.flat():priced(s.items.map(name=>itemOf(group,name)));
 if(!prices.length)throw new Error(`{{min-section:${id}}}: в подразделе нет позиций с ценой`);
 return Math.min(...prices);
};

// Темы формы заявки (site.requests.topics): позиции каталога каждой темы.
export const requestTopics=()=>(d.site?.requests?.topics||[]).map(t=>{
 const fromSections=(t.sections||[]).flatMap(id=>{const {s}=sectionOf(id);return s.programs?[]:s.items;});
 const items=[...fromSections,...(t.items||[])].filter(n=>!(t.except||[]).includes(n));
 for(const n of items)if(!d.groups.some(g=>g.items.some(([x])=>x===n)))throw new Error(`site.requests.topics ${t.id}: нет позиции «${n}» в каталоге`);
 return {id:t.id,title:t.title,...((t.sections||[]).includes('programs')?{programs:true}:{}),items,options:t.options||[]};
});

// Сравнение программ автомойки (P04; Влад 09.11 — «красиво и понятно») — «лесенка», стоит в
// #programs. Строки — пункты состава programIncludes без первых «Всё из …» у программ 1–4,
// разложенные по этапам programStages (каждый пункт — ровно в одном этапе, иначе ошибка сборки);
// внутри этапа строки идут по программе, с которой пункт входит, — полосы «входит» начинаются
// всё правее, и ступени видны глазом. Программа j отмечена в строках программ 0…j: буквальное
// правило «каждая следующая включает предыдущую».
// Разметка: таблица (от 1100 px; tbody на этап с заголовком th scope="rowgroup"; в шапке столбца —
// .compare__name и «+N работ»; ячейка «входит» — td.compare__yes, первая в строке — ещё и
// --start с галочкой; внизу время и цена, цену меняет кузов — тот же data-program-price) и тот же
// состав списком по шагам ol.compare__steps (до 1100 px, таблица там скрыта): программа, цена ·
// время, шкала «N из M работ» и что добавляется к предыдущей.
const works=n=>{const a=n%10,b=n%100;return `${n} ${a===1&&b!==11?'работа':a>=2&&a<=4&&(b<12||b>14)?'работы':'работ'}`;};
export function compareRows(){
 const from=new Map();
 d.programIncludes.forEach((list,j)=>list.forEach((item,k)=>{
  if(j>0&&k===0){
   if(!/^Всё из /.test(item))throw new Error(`Программа ${j} «${d.programs[j][0]}»: первый пункт состава — «Всё из <предыдущей>», сейчас «${item}»`);
   return;
  }
  if(from.has(item))throw new Error(`programIncludes: «${item}» повторяется`);
  from.set(item,j);
 }));
 const stages=d.programStages?.items;
 if(!stages?.length)throw new Error('Нет programStages.items — этапов сравнения программ');
 const staged=stages.flatMap(s=>s.items);
 const missing=[...from.keys()].filter(x=>!staged.includes(x)),extra=staged.filter(x=>!from.has(x));
 if(missing.length||extra.length||new Set(staged).size!==staged.length)throw new Error(`programStages: каждый пункт programIncludes — ровно в одном этапе (нет: ${missing.join(', ')||'—'}; лишние: ${extra.join(', ')||'—'})`);
 return stages.map(s=>({title:s.title,rows:s.items.map(item=>({item,from:from.get(item)})).sort((x,y)=>x.from-y.from)}));
}
export function renderCompare(){
 const stages=compareRows();
 const names=d.programs.map(([name])=>name);
 const last=names.length-1;
 const added=j=>d.programIncludes[j].slice(j?1:0);
 const total=d.programIncludes.reduce((sum,list,j)=>sum+added(j).length,0);
 const upTo=j=>d.programIncludes.slice(0,j+1).reduce((sum,_,k)=>sum+added(k).length,0);
 const cell=(row,j)=>j<row.from
  ?`<td class="compare__no"><span class="sr">не входит</span></td>`
  :j===row.from
   ?`<td class="compare__yes compare__yes--start${j===last?' compare__yes--end':''}">${icon('check')}<span class="sr">входит</span></td>`
   :`<td class="compare__yes${j===last?' compare__yes--end':''}"><span class="sr">входит</span></td>`;
 const price=(i,cls)=>`<span data-program-price data-prices="${d.programPrices[i].join(',')}">${money(d.programPrices[i][0])}</span>${studioLine(i,'span',cls)}`;
 return `<div class="compare" id="compare">
     <div class="compare__head">
      <h4 class="compare__title" id="compare-title">Чем отличаются программы</h4>
     </div>
     <div class="compare__scroll" role="region" aria-labelledby="compare-title" tabindex="0" data-scroll-region>
      <table class="compare__table">
       <caption class="sr">Состав программ автомойки по этапам: каждая следующая программа включает предыдущую, полоса в строке начинается с программы, в которую работа входит впервые</caption>
       <thead><tr><th scope="col"><span class="sr">Работа</span></th>${names.map((name,j)=>`<th scope="col"><span class="compare__name">${escape(name)}</span><span class="compare__adds">${j?'+':''}${works(added(j).length)}</span></th>`).join('')}</tr></thead>
${stages.map(stage=>`       <tbody class="compare__stage">
        <tr class="compare__stage-row"><th scope="rowgroup" colspan="${names.length+1}">${escape(stage.title)}</th></tr>
${stage.rows.map(row=>`        <tr><th scope="row">${escape(row.item)}</th>${names.map((_,j)=>cell(row,j)).join('')}</tr>`).join('\n')}
       </tbody>`).join('\n')}
       <tfoot>
        <tr class="compare__time"><th scope="row">Время</th>${d.programs.map(([,,time])=>`<td>${escape(shortTime(time))}</td>`).join('')}</tr>
        <tr class="compare__price"><th scope="row">Цена</th>${d.programs.map((_,i)=>`<td>${price(i,'compare__studio')}</td>`).join('')}</tr>
       </tfoot>
      </table>
     </div>
     <ol class="compare__steps" aria-label="Состав программ по шагам">
${d.programs.map(([name,,time],j)=>`      <li class="compare__step">
       <div class="compare__step-head">
        <h5 class="compare__step-name">${escape(name)}</h5>
        <p class="compare__step-price"><span data-program-price data-prices="${d.programPrices[j].join(',')}">${money(d.programPrices[j][0])}</span><span class="compare__step-time"><span aria-hidden="true">·</span><span class="sr">, </span>${escape(shortTime(time))}</span>${studioLine(j,'span','compare__studio')}</p>
       </div>
       <p class="compare__meter"><span class="compare__meter-bar" aria-hidden="true"><span style="width: ${(upTo(j)/total*100).toFixed(1)}%"></span></span><span class="compare__meter-label">${upTo(j)} из ${works(total)}</span></p>
       <p class="compare__step-base">${j?`${escape(d.programIncludes[j][0])}, плюс:`:'Входит:'}</p>
       <ul class="compare__step-list">${added(j).map(item=>`<li>${escape(item)}</li>`).join('')}</ul>
      </li>`).join('\n')}
     </ol>
    </div>`;
}

// Превью на главной (прежняя главная; на MEATWASH не используется) — четыре категории в порядке каталога, ссылка
// ведёт на вкладку категории. Подпись — название и короткое описание, цена «от» —
// минимальная в категории (у автомойки — минимальная цена программ), всё из JSON.
// Кадры assets/shots — 1600×894, уменьшенные (-s) — 900 px.
const shot=(id,size)=>`assets/shots/${id}${size==='s'?'-s':''}.webp`;
const PREVIEW={
 wash:{shot:'cf-foam-crop',alt:'Спорткупе в активной пене на тёмном полу студии'},
 detailing:{shot:'cf-interior-seat',alt:'Салон классического купе: руль и кожаные сиденья с тканевыми вставками'},
 protection:{shot:'cf-front-corner',alt:'Фара и переднее крыло бордового автомобиля крупным планом'},
 help:{shot:'cf-chip-macro',alt:'Скол на тёмно-бордовом лаке крупным планом'},
};
const previewFrom=group=>{
 const prices=group.sections.some(section=>section.programs)?d.programPrices.flat():priced(group.items);
 return prices.length?`от ${money(Math.min(...prices))}`:'После оценки';
};
export function renderPreview(){
 return `
  <div class="strip strip--4">
${d.groups.map((group,i)=>{
 const card=PREVIEW[group.id];
 if(!card)throw new Error(`Превью: нет кадра для категории ${group.id}`);
 return `   <a class="card card--${escape(group.id)}" href="services#price-${escape(group.id)}"><img src="${shot(card.shot)}" srcset="${shot(card.shot,'s')} 900w, ${shot(card.shot)} 1600w" sizes="(max-width: 900px) 50vw, 25vw" alt="${escape(card.alt)}" width="1600" height="894" loading="lazy" decoding="async"><span class="card__label"><span>${number(i)}</span><span>${escape(group.title)}</span></span><span class="card__caption">${escape(group.desc)}<b class="card__price">${previewFrom(group)}</b></span></a>`;}).join('\n')}
  </div>
  `;
}

// Модуль данных для скриптов страницы. Только то, что им нужно: цены программ по
// кузову и их состав (гараж не берёт повторно работу, уже входящую в автомойку:
// items — позиции каталога), цены работ по названию (null — после оценки),
// позиции с пояснением, категорией и подразделом, четыре категории с подразделами,
// настройка заявок и филиалы (карты в карточках, цель записи).
// Категория каталога → тема заявки по умолчанию (без указанной работы).
export const CATEGORY_TOPIC={wash:'wash',detailing:'detailing',wrap:'wrap',protection:'detailing',help:'bodywork'};
export function renderData(){
 const prices=Object.fromEntries(d.groups.flatMap(g=>g.items.map(([name,price])=>[name,price])));
 const items=Object.fromEntries(d.groups.flatMap(g=>g.sections.filter(s=>s.items).flatMap(s=>s.items.map(name=>{
  const [,price,about]=g.items.find(([n])=>n===name);
  return [name,{price,about,category:g.id,section:s.id}];
 }))));
 const categories=d.groups.map(g=>({id:g.id,title:g.title,short:g.short,desc:g.desc,booking:g.booking,
  sections:g.sections.map(s=>({id:s.id,title:s.title,...(s.programs?{programs:true}:{}),...(s.accent?{accent:true}:{}),...(s.items?{items:s.items}:{})})),
  items:g.items.map(([name])=>name)}));
 // Филиалы для скриптов: цель Метрики по ссылке записи (ui.js) и карты в карточках (maps.js).
 const locations=d.locations.map(l=>({id:l.id,name:l.name,address:l.address,booking:l.booking,map:l.map,mapWidget:l.mapWidget}));
 return `// Сгенерировано scripts/catalog.mjs из assets/meatwash-content.json — руками не править:
// после правки JSON выполните npm run catalog (npm run check сверяет этот файл).
export const BODY_TYPES = ${JSON.stringify(d.bodyTypes)};
export const PROGRAMS = ${JSON.stringify(d.programs.map(([name,,time,description],i)=>({name,time,description,prices:d.programPrices[i],studio:studioPrices(i).map(({label,prices})=>({label,prices})),includes:d.programIncludes[i],items:d.programItems[i]})),null,1)};
export const PRICES = ${JSON.stringify(prices,null,1)};
// Позиции каталога: цена (null — после оценки), короткое пояснение, категория и подраздел.
export const ITEMS = ${JSON.stringify(items,null,1)};
// Пять категорий в порядке показа: booking yclients — запись в филиал, request —
// заявка с фото; sections — подразделы (programs: true — программы и пакеты автомойки,
// accent: true — выделенный подраздел).
export const CATEGORIES = ${JSON.stringify(categories,null,1)};
// Заявка с фото: адрес приёма (null — отправка не подключена, форма предлагает позвонить)
// и сайты, где он работает (пусто — везде; копия на GitHub Pages PHP не выполняет).
export const REQUESTS = ${JSON.stringify({endpoint:d.site?.requests?.endpoint??null,hosts:d.site?.requests?.hosts??[]})};
export const LOCATIONS = ${JSON.stringify(locations,null,1)};
// Темы формы заявки (site.requests.topics) в порядке показа: programs — программы
// мойки (PROGRAMS), items — позиции каталога темы, options — варианты без каталога.
// data-request-category кнопки — id темы или категории каталога (CATEGORY_TOPIC — тема
// категории, если работа не указана; с работой тема — та, в чьих items она есть).
export const REQUEST_TOPICS = ${JSON.stringify(requestTopics(),null,1)};
export const CATEGORY_TOPIC = ${JSON.stringify(CATEGORY_TOPIC)};
`;
}

export function replaceBetween(html,name,body,file){
 const start=`<!-- ${name}:START -->`,end=`<!-- ${name}:END -->`;
 if(!html.includes(start)||!html.includes(end))throw new Error(`${file}: нет маркеров ${name}`);
 return html.slice(0,html.indexOf(start)+start.length)+body+html.slice(html.indexOf(end));
}
export const between=(html,name)=>{const start=`<!-- ${name}:START -->`,end=`<!-- ${name}:END -->`;const a=html.indexOf(start),b=html.indexOf(end);return a<0||b<0?null:html.slice(a+start.length,b);};

if(process.argv[1]===fileURLToPath(import.meta.url)){
 await writeFile(new URL('dist/js/data.js',root),renderData());
 console.log(`js/data.js: ${d.groups.length} categories, ${d.programs.length} wash programs, ${d.programs.length*d.bodyTypes.length} body prices, ${serviceCount()} services.`);
}
