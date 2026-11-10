(function (root) {
  'use strict';

  const units = new Map([['stk', 'STK'], ['stk.', 'STK'], ['m', 'M'], ['kg', 'KG'], ['pau', 'PAU']]);
  const german = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss' };
  const digits = (value, width) => {
    const text = String(value);
    if (!/^\d+$/.test(text) || text.length > width) throw Error('Ein Zahlenwert passt nicht in das UGL-Format.');
    return text.padStart(width, '0');
  };

  function decimal(value, scale, label) {
    const match = /^(\d+)(?:\.(\d+))?$/.exec(String(value ?? ''));
    const fraction = match?.[2]?.replace(/0+$/, '') || '';
    if (!match || fraction.length > scale) throw Error(label + ' kann nicht exakt in UGL dargestellt werden.');
    return BigInt(match[1] + fraction.padEnd(scale, '0'));
  }

  function record(fields) {
    const bytes = Array(200).fill(' ');
    for (const [offset, text] of fields) {
      for (let index = 0; index < text.length; index++) bytes[offset - 1 + index] = text[index];
    }
    return bytes.join('');
  }

  function create({ order, items, materials, company }) {
    if (!order?.id || !company || !/^\d{4}-\d{2}-\d{2}$/.test(order.work_date)) {
      throw Error('Für die Materialdatei ist ein gespeicherter Arbeitsschein mit Datum erforderlich.');
    }
    if (!items.length) throw Error('Der gespeicherte Arbeitsschein enthält kein Material.');
    const byId = new Map(materials.filter(material => material.business_id === company).map(material => [material.id, material]));
    const suppliers = new Set();
    const records = items.map((item, index) => {
      const material = byId.get(item.material_id);
      const sku = material?.catalog_article_number;
      const supplier = material?.catalog_supplier?.trim();
      const label = 'Position ' + (index + 1);
      if (item.work_order_id !== order.id || !supplier || typeof sku !== 'string' || sku !== sku.trim() || !/^[\x20-\x7e]{1,15}$/.test(sku)) {
        throw Error(label + ' benötigt einen eindeutigen Katalogartikel mit Artikelnummer bis 15 Zeichen.');
      }
      suppliers.add(supplier.toLowerCase());
      const name = String(item.position_name ?? '').trim().replace(/[äöüÄÖÜß]/g, letter => german[letter]);
      if (!/^[\x20-\x7e]{1,80}$/.test(name)) throw Error(label + ' hat eine Bezeichnung, die nicht vollständig in die Materialdatei passt.');
      const unit = units.get(String(item.unit ?? '').trim().toLowerCase());
      if (!unit) throw Error(label + ' hat keine unterstützte Materialeinheit.');
      // Work orders store quantities to hundredths. ServicePad displays two decimal places.
      const hundredths = decimal(item.quantity, 2, label + ': Die Menge');
      if (hundredths === 0n) throw Error(label + ' benötigt eine positive Menge.');
      const priceCents = decimal(item.unit_price, 2, label + ': Der gespeicherte Nettopreis');
      const total = hundredths * priceCents;
      if (total % 100n !== 0n) throw Error(label + ': Der Nettobetrag kann nicht centgenau in UGL dargestellt werden.');
      const number = digits(index + 1, 10);
      return record([[1, 'POA'], [4, number], [14, number], [24, sku],
        [39, digits(hundredths * 10n, 11)], [50, name.slice(0, 40)], [90, name.slice(40)],
        [130, digits(priceCents, 11)], [141, '0'], [142, digits(total / 100n, 11)], [153, '00000'], [158, '00000'], [182, 'H'], [184, unit]]);
    });
    if (suppliers.size !== 1) throw Error('Für eine UGL-Datei müssen alle Materialpositionen aus demselben Kataloglieferanten stammen.');
    const reference = String(order.id).replace(/[^A-Za-z0-9]/g, '').slice(0, 15);
    if (!reference) throw Error('Die Arbeitsscheinnummer ist für die Materialdatei ungültig.');
    // PA is a read/import record type. The file carries no merchant account or recipient.
    const header = record([[1, 'KOP'], [24, 'PA'], [26, reference], [41, 'Arbeitszeiterfassung Material'],
      [91, reference], [114, 'EUR'], [117, '04.00'], [122, 'Arbeitszeiterfassung'], [162, order.work_date.replaceAll('-', '')]]);
    return [header, ...records, record([[1, 'END']]), ''].join('\r\n');
  }

  root.WorktimeJuprowaUgl = { create };
})(globalThis);
