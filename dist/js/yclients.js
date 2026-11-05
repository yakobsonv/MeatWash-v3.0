// Онлайн-запись YCLIENTS: ссылка с уже выбранными услугами.
//
// Формат проверен на живых формах обоих филиалов:
//   /company/{company}/personal/short?o=m-1s{id}s{id}…
// «m-1» — любой мастер, дальше подряд идентификаторы услуг. Такая ссылка
// открывает шаг «Ваш заказ»: услуги уже в корзине, клиенту остаётся выбрать
// время. Без услуг открываем обычный выбор услуг.
//
// assets/yclients.json — соответствие каталога сайта идентификаторам YCLIENTS.
// Часть работ прайса в YCLIENTS не заведена; для них идентификатора нет, и
// такая работа в ссылку не попадает — об этом окно записи говорит прямо.

let map = null;
let pending = null;

export function loadMap() {
  if (map) return Promise.resolve(map);
  if (!pending) {
    pending = fetch('assets/yclients.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => (map = data))
      .catch(() => null);
  }
  return pending;
}

const branchOf = (name) => map?.branches?.[name];

// spec: { programs: [индексы программ], items: ['Название из прайса'] }
// body — индекс типа кузова (0 седан … 3 микроавтобус); важен только для программ.
export function resolve(branch, spec, body = 0) {
  const ids = [];
  const missing = [];
  if (!map) return { ids, missing };
  for (const i of spec.programs || []) {
    const row = map.programs[i];
    const id = row && row[branch] && row[branch][body];
    if (id) ids.push(id);
    else if (row) missing.push(row.name);
  }
  for (const name of spec.items || []) {
    const id = map.items[name]?.[branch];
    if (id) ids.push(id);
    else missing.push(name);
  }
  return { ids: [...new Set(ids)], missing };
}

// Программы, которых в этой студии нет ни для одного типа кузова (все ячейки пустые):
// «Трёхфазная» на Мясницкой. Такую студию в записи не предлагаем.
export function unavailable(branch, spec) {
  if (!map) return [];
  return (spec.programs || []).map((i) => map.programs[i]).filter((row) => row && !(row[branch] || []).some(Boolean)).map((row) => row.name);
}

export function bookingUrl(branch, ids = []) {
  const b = branchOf(branch);
  if (!b) return null;
  const base = `https://n${b.form}.yclients.com/company/${b.company}/personal/`;
  return ids.length
    ? `${base}short?o=m-1${ids.map((id) => 's' + id).join('')}`
    : `${base}select-services?o=`;
}
