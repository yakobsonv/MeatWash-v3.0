// «Гараж услуг»: работы, категории и правила расчёта.
// Цены, названия и пояснения — только из assets/meatwash-content.json: data.js
// генерирует npm run catalog. Здесь — ссылки на позиции каталога, а не числа.
import { PROGRAMS, PRICES, ITEMS, CATEGORIES } from './data.js';

const item = name => { if (!(name in PRICES)) throw new Error('Нет цены в каталоге: ' + name); return PRICES[name]; };

// Вкладки — четыре категории каталога (CATEGORIES в data.js) в том же порядке
// и с теми же короткими названиями. booking: yclients — мойка (запись в филиал),
// request — остальные работы (заявка с фото).
export const ZONE_GROUPS = CATEGORIES.map(c => ({ id: c.id, title: c.short, full: c.title, booking: c.booking }));

// price  — позиция каталога: { program: i } — программа или пакет мойки (цена
//          зависит от кузова), { item: "название" } — работа из прайса (цена
//          null — после оценки). Название в гараже — то же, что в каталоге
//          (title ниже подставляется из него).
// group  — категория каталога: у работы прайса совпадает с ITEMS[название].category,
//          программы и пакеты — мойка.
// caption — что делает работа, одной фразой, подставляется ниже: у программ и
//          пакетов — описание программы, у работ прайса — пояснение позиции (ITEMS).
// Порядок внутри категории — как в каталоге services.html.
// Ракурс камеры для каждой работы — src/porsche3d/views.js (SERVICE_VIEWS, по id).
export const ZONES = [
  { id: 'three-phase', group: 'wash', price: { program: 0 } },
  { id: 'complex', group: 'wash', price: { program: 1 } },
  { id: 'reagents', group: 'wash', price: { program: 2 } },
  { id: 'exterior', group: 'wash', price: { program: 3 } },
  { id: 'premium', group: 'wash', price: { program: 4 } },
  // Химчистка в гараже — салон целиком, а не набор сидений и деталей:
  // отдельные элементы остаются в подробном прайсе.
  { id: 'interior', group: 'detailing', price: { item: 'Детейлинг-химчистка салона' } },
  { id: 'leather', group: 'detailing', price: { item: 'Кондиционер кожи сидений' } },
  { id: 'wheels', group: 'detailing', price: { item: 'Детейлинг дисков' } },
  { id: 'film', group: 'wrap', price: { item: 'Оклейка зон риска' } },
  { id: 'film-full', group: 'wrap', price: { item: 'Полная оклейка' } },
  { id: 'film-lights', group: 'wrap', price: { item: 'Оклейка фар плёнкой' } },
  { id: 'polish', group: 'protection', price: { item: 'Полировка кузова + 2 слоя керамики' } },
  { id: 'headlights', group: 'protection', price: { item: 'Полировка фар' } },
  { id: 'ceramic', group: 'protection', price: { item: 'Керамическое покрытие кузова' } },
  { id: 'armor', group: 'protection', price: { item: 'Бронирование лобового стекла' } },
  { id: 'rain', group: 'protection', price: { item: 'Антидождь передней полусферы' } },
  { id: 'rain-all', group: 'protection', price: { item: 'Антидождь всех стёкол автомобиля' } },
  { id: 'glass-repair', group: 'help', price: { item: 'Ремонт автомобильных стёкол' } },
  { id: 'chips', group: 'help', price: { item: 'Удаление сколов и подкраска' } },
];
for (const zone of ZONES) {
  const program = zone.price.program != null ? PROGRAMS[zone.price.program] : null;
  zone.title = program ? program.name : zone.price.item;
  zone.package = Boolean(program && /^Пакет/.test(program.name));
  if (program) { zone.caption = program.description; continue; }
  item(zone.price.item);
  const entry = ITEMS[zone.price.item];
  // Категория работы — та же, что у позиции в каталоге: иначе вкладка гаража
  // и раздел services.html разошлись бы (npm run check сверяет то же).
  if (entry?.category !== zone.group) throw new Error(`Работа гаража ${zone.id}: категория ${zone.group}, в каталоге — ${entry?.category}`);
  zone.caption = entry.about;
}

// Взаимоисключающие работы — вторая заменяет первую:
// - программы и пакеты мойки вложены друг в друга («каждая следующая включает
//   предыдущую»), две сразу посчитали бы мойку дважды;
// - «Полировка кузова + 2 слоя керамики» уже с керамикой — вместе с «Керамическим
//   покрытием» керамика считалась бы дважды;
// - полная оклейка включает зоны риска, антидождь всех стёкол — передние.
export const EXCLUSIVE = [
  ['three-phase', 'complex', 'reagents', 'exterior', 'premium'],
  ['polish', 'ceramic'],
  ['film', 'film-full'],
  ['rain', 'rain-all'],
];

// Состав программы или пакета i позициями каталога — с составом всех предыдущих
// (они вложены): programItems в JSON.
const programItems = i => PROGRAMS.slice(0, i + 1).flatMap(p => p.items || []);
// Программа из выбранных, в которую уже входит работа: «Пакет «Экстерьер»»
// включает «Антидождь передней полусферы». Такая работа отдельно не выбирается
// и в сумму второй раз не попадает.
export function includedIn(zone, ids) {
  if (!zone.price.item) return null;
  for (const id of ids) {
    const other = ZONES.find(z => z.id === id);
    if (other?.price.program != null && programItems(other.price.program).includes(zone.price.item)) return other;
  }
  return null;
}

// Цена работы для типа кузова (индекс BODY_TYPES): число или null (после оценки).
// Работы прайса от кузова не зависят.
export const zonePrice = (zone, body = 0) => zone.price.program != null
  ? PROGRAMS[zone.price.program].prices[body] ?? PROGRAMS[zone.price.program].prices[0]
  : item(zone.price.item);
// «от» — минимальная цена работы (для программ — по всем кузовам); null — после оценки.
for (const zone of ZONES) zone.from = zone.price.program != null ? Math.min(...PROGRAMS[zone.price.program].prices) : zonePrice(zone);

// Сумма «от» по выбранным работам для кузова body: программа мойки одна
// (EXCLUSIVE), работа, входящая в выбранную программу, не считается, работы
// с ценой после оценки в сумму не входят (garageOpen их называет).
export const garageSum = (ids, body = 0) => ids.reduce((sum, id) => {
  const zone = ZONES.find(z => z.id === id);
  return zone && !includedIn(zone, ids) ? sum + (zonePrice(zone, body) ?? 0) : sum;
}, 0);
// Выбранные работы, цену которых назовут после оценки.
export const garageOpen = ids => ids.map(id => ZONES.find(z => z.id === id)).filter(z => z && !includedIn(z, ids) && zonePrice(z) == null);
// Мойка (запись в YCLIENTS) и остальные работы (заявка с фото) — отдельно.
export const isWash = zone => ZONE_GROUPS.find(g => g.id === zone.group)?.booking === 'yclients';
