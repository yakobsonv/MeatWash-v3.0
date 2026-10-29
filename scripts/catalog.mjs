// Всё, что зависит от цен и услуг, собирается из dist/assets/meatwash-content.json:
// - каталог на /services — подстановка {{catalog}} (renderCatalog) и сравнение программ
//   {{compare}} (renderCompare); их вызывает scripts/pages.mjs при сборке страницы;
// - dist/js/data.js — те же цены и филиалы для скриптов (гараж, окно услуги, карты).
// Запуск: npm run catalog — пишет только dist/js/data.js (Meat Wash, WP0 27.10).
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
const STUDIO_LABEL={myasnitskaya:'на Мясницкой',technopark:'в Технопарке'};
export const studioPrices=i=>Object.entries(d.programStudioPrices?.[i]||{}).map(([id,prices])=>{
 const location=d.locations.find(l=>l.id===id);
 if(!location||!STUDIO_LABEL[id])throw new Error(`programStudioPrices: нет филиала ${id}`);
 return {name:location.name,label:STUDIO_LABEL[id],prices};
});
export const programContext=(i,body)=>`${d.programs[i][0]} — ${d.bodyTypes[body]}, ${money(d.programPrices[i][body])}${studioPrices(i).map(s=>`, ${s.label} — ${money(s.prices[body])}`).join('')}`;
// Строка «На Мясницкой — 3 150 ₽» под ценой: тот же data-program-price, его меняет кузов.
const studioLine=(i,tag,cls)=>studioPrices(i).map(s=>`<${tag} class="${cls}">${s.label[0].toUpperCase()+s.label.slice(1)} — <span data-program-price data-prices="${s.prices.join(',')}">${money(s.prices[0])}</span></${tag}>`).join('');
export const serviceCount=()=>d.groups.reduce((sum,group)=>sum+group.items.length,0);
// Иконка спрайта — та же разметка, что у подстановки icon (scripts/pages.mjs). Своя копия:
// pages.mjs импортирует этот модуль, обратный импорт дал бы цикл при npm run catalog.
// Версия ?v= — по содержимому файла, как assetUrl() в pages.mjs (поправки 27, 28).
let spriteVersion;
const icon=name=>{
 spriteVersion??=createHash('sha256').update(readFileSync(new URL('dist/assets/brand/sprite.svg',root))).digest('hex').slice(0,8);
 return `<svg class="icon" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="assets/brand/sprite.svg?v=${spriteVersion}#i-${name}"/></svg>`;
};
// Ролик категории (media в JSON — «Оклейка», Влад 29.10): постер и <video data-video="hover"> —
// как у тизеров /services (js/video.js: с мышью по наведению, на тач-экране — пока виден).
// Версия ?v= — по содержимому файла, как у спрайта.
const assetV=path=>`${path}?v=${createHash('sha256').update(readFileSync(new URL('dist/'+path,root))).digest('hex').slice(0,8)}`;
const media=({video,poster,alt})=>`<figure class="vframe catalog__media" data-video-host>
   <img src="${assetV(poster)}" width="720" height="1280" alt="${escape(alt)}" loading="lazy" decoding="async">
   <video class="vframe__video" data-video="hover" muted loop playsinline disablepictureinpicture preload="none" aria-hidden="true" tabindex="-1" data-src="${assetV(video)}"></video>
  </figure>`;
// Подпись кнопки для экранного диктора: «Узнать цену: Химчистка руля».
const forName=name=>`<span class="sr">: ${escape(name)}</span>`;
// Одно действие на позицию. Автомойка (booking: yclients) — окно филиалов с этой работой
// в корзине (ui.js → yclients.js); остальное — «Узнать цену» с этой работой (ui.js:
// пока заявки с сайта не принимаются — окно с телефонами студий, потом — request.js).
// У подраздела с onsite: true (продаётся только на месте, «Дополнительно на автомойке»)
// кнопки нет — подпись «добавим при приёмке».
// Ключи data-* — побуквенно названия из JSON (typo() их не трогает, check сверяет).
export const ONSITE_LABEL='добавим при приёмке';
const ACTION_CLASS='catalog__action btn btn--compact btn--secondary';
const action=(group,name)=>group.booking==='yclients'
 ?`<button class="${ACTION_CLASS}" type="button" data-book data-book-context="${escape(name)}" data-yc-items="${escape(name)}">Записаться${forName(name)}</button>`
 :`<button class="${ACTION_CLASS}" type="button" data-request data-request-category="${escape(group.id)}" data-request-services="${escape(name)}">Узнать цену${forName(name)}</button>`;
const itemRow=(group,section,[name,price,note])=>`<li class="catalog__item" data-price-item="${escape(name)}"><div class="catalog__item-text"><p class="catalog__item-name">${escape(name)}</p>${note?`<p class="catalog__item-note">${escape(note)}</p>`:''}</div><p class="catalog__item-price${price==null?' catalog__item-price--estimate':''}">${priceText(price)}</p>${section.onsite?`<p class="catalog__item-onsite">${ONSITE_LABEL}</p>`:action(group,name)}</li>`;
const itemOf=(group,name)=>group.items.find(([n])=>n===name)??(()=>{throw new Error(`Подраздел ${group.id}: нет позиции «${name}» в items`);})();

// Ссылки подразделов на страницы направления (§4.3 плана) — здесь, не в JSON.
export const SECTION_LINKS={
 'price-film':{href:'wrap',label:'Подробнее об оклейке'},
 'price-presale':{href:'auto#sell',label:'Покупка и продажа авто'},
};
// Пояснение под заголовком подраздела.
const SECTION_NOTE={
 programs:'Каждая следующая включает предыдущую. Цена зависит от типа кузова.',
 onsite:'Записываться отдельно не нужно — скажите администратору, когда приедете на автомойку.',
};

// Программы и пакеты автомойки (P02): карточка — название, цена для выбранного кузова
// (js/catalog.js меняет её по data-prices), время, пояснение, состав в <details id="program-i">
// (на него ведут ссылки #program-0…4) и запись с программой в корзине YCLIENTS.
const programCard=([name,,time,description],i)=>`<li class="program-card">
      <h4 class="program-card__name">${escape(name)}</h4>
      <p class="program-card__price"><span data-program-price data-prices="${d.programPrices[i].join(',')}">${money(d.programPrices[i][0])}</span>${studioLine(i,'span','program-card__studio')}</p>
      <ul class="chips program-card__chips"><li class="chip">${escape(time)}</li></ul>
      <p class="program-card__desc">${escape(description)}</p>
      <details class="accordion program-card__includes" id="program-${i}"><summary class="accordion__head">Что входит</summary><div class="accordion__body"><ul class="program-includes">${d.programIncludes[i].map(item=>`<li>${escape(item)}</li>`).join('')}</ul></div></details>
      <button class="btn btn--primary program-card__book" type="button" data-book data-program="${i}" data-book-context="${escape(programContext(i,0))}">Записаться${forName(name)}</button>
     </li>`;
const programs=()=>`<fieldset class="body-types segmented"><legend class="sr">Тип кузова</legend>${d.bodyTypes.map((type,i)=>`<label><input type="radio" name="body-type" value="${i}"${i===0?' checked':''}><span>${escape(type)}</span></label>`).join('')}</fieldset>
    <p class="catalog__selection" id="body-price-label" aria-live="polite">Цены для типа кузова: ${escape(d.bodyTypes[0])}</p>
    <ol class="programs" aria-label="Программы и пакеты автомойки">
     ${d.programs.map(programCard).join('\n     ')}
    </ol>
    ${renderCompare()}`;

// Подраздел категории: заголовок h3 (+ пояснение, + ссылка на страницу направления) и
// позиции. accent — спокойно выделенный (оклейка, ремонт стёкол).
const sectionHead=section=>{
 const link=SECTION_LINKS[section.id];
 const note=section.programs?SECTION_NOTE.programs:section.onsite?SECTION_NOTE.onsite:'';
 return `<div class="catalog__section-head">
    <h3 class="catalog__subhead" id="${escape(section.id)}-title">${escape(section.title)}</h3>${note?`
    <p class="catalog__section-note">${note}</p>`:''}${link?`
    <a class="link-arrow catalog__section-link" href="${link.href}">${escape(link.label)}${icon('arrow-right')}</a>`:''}
   </div>`;
};
const section=(group,s)=>`<section class="catalog__section${s.accent?' catalog__section--accent':''}${s.programs?' catalog__section--programs':''}" id="${escape(s.id)}" aria-labelledby="${escape(s.id)}-title">
   ${sectionHead(s)}
   ${s.programs?programs():`<ul class="catalog__items" role="list">${s.items.map(name=>itemRow(group,s,itemOf(group,name))).join('')}</ul>`}
  </section>`;
// Пока заявки с сайта не принимаются, цену называют по телефону (окно «Узнать цену»).
const LEAD={yclients:'Запись онлайн — в выбранную студию.',request:'Стоимость для вашей машины назовёт администратор: нажмите «Узнать цену» у работы.'};

// Каталог /services (§4.3 плана) — подстановка {{catalog}}. Пять категорий; без JS
// вкладки — ссылки на категории, панели идут подряд; js/catalog.js делает из них вкладки
// (WAI-ARIA tabs: role="tablist" ставится на .anchor-tabs__track[data-catalog-tabs] —
// вкладки его прямые потомки) и показывает одну. H1 стоит в герое, поэтому категории — h2,
// подразделы — h3, программы и сравнение — h4.
export function renderCatalog(){
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
  ${group.media?media(group.media):''}
  ${group.sections.map(s=>section(group,s)).join('\n  ')}
 </section>`).join('\n')}
 </div>
 <p class="catalog__note" id="price-note">Стоимость зависит от типа кузова и состояния автомобиля. Итоговый объём и цену согласуем перед работой. Не является публичной офертой.</p>
</div>
`}

// Сравнение программ автомойки (P04, §4.3 плана) — {{compare}}, стоит в #programs каталога.
// Строки — пункты состава в порядке появления, кроме первого пункта «Всё из …» у программ
// 1–4; программа j отмечена в строках программ 0…j — буквальное правило «каждая следующая
// включает предыдущую». Строки, общие для всех программ, помечены data-same: переключатель
// «Только различия» прячет их без JS (services.css, :has). Нижние строки — время и цена;
// цену меняет кузов (тот же data-program-price, что у карточек).
export function renderCompare(){
 const rows=[];
 d.programIncludes.forEach((list,j)=>{
  list.forEach((item,k)=>{
   if(j>0&&k===0){
    if(!/^Всё из /.test(item))throw new Error(`Программа ${j} «${d.programs[j][0]}»: первый пункт состава — «Всё из <предыдущей>», сейчас «${item}»`);
    return;
   }
   rows.push({item,from:j});
  });
 });
 const names=d.programs.map(([name])=>name);
 const cell=(row,j)=>j>=row.from
  ?`<td class="compare__yes">${icon('check')}<span class="sr">входит</span></td>`
  :`<td class="compare__no"><span aria-hidden="true">—</span><span class="sr">не входит</span></td>`;
 return `<div class="compare" id="compare">
     <div class="compare__head">
      <h4 class="compare__title" id="compare-title">Чем отличаются программы</h4>
      <label class="compare__only"><input type="checkbox" data-compare-only><span class="compare__switch" aria-hidden="true"></span><span>Только различия</span></label>
     </div>
     <div class="compare__scroll" role="region" aria-labelledby="compare-title" tabindex="0" data-scroll-region>
      <table class="compare__table">
       <caption class="sr">Состав программ автомойки: каждая следующая включает предыдущую</caption>
       <thead><tr><th scope="col"><span class="sr">Работа</span></th>${names.map(name=>`<th scope="col">${escape(name)}</th>`).join('')}</tr></thead>
       <tbody>
${rows.map(row=>`        <tr${row.from===0?' data-same':''}><th scope="row">${escape(row.item)}</th>${names.map((_,j)=>cell(row,j)).join('')}</tr>`).join('\n')}
       </tbody>
       <tfoot>
        <tr class="compare__time"><th scope="row">Время</th>${d.programs.map(([,,time])=>`<td>${escape(time)}</td>`).join('')}</tr>
        <tr class="compare__price"><th scope="row">Цена</th>${d.programs.map((_,i)=>`<td><span data-program-price data-prices="${d.programPrices[i].join(',')}">${money(d.programPrices[i][0])}</span>${studioLine(i,'span','compare__studio')}</td>`).join('')}</tr>
       </tfoot>
      </table>
     </div>
    </div>`;
}

// Превью на главной (прежняя главная; на Meat Wash не используется) — четыре категории в порядке каталога, ссылка
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
