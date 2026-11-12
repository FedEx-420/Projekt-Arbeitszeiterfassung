import {createFifMerchant} from '../supplier-fif-v995/merchant.mjs';
import {fault, portalDate, readPortalPdf} from './portal.mjs';

const reference = value => /^[0-9]{1,30}$/.test(String(value ?? '')) && /[1-9]/.test(String(value)) ? String(value) : null;
const german = iso => iso.slice(0,10).split('-').reverse().join('.');
const day = 86400000;

function invoiceTotals(row) {
  if (row.currency !== 'EUR' || ![0,7,19].includes(row.salesTaxPercent)) return null;
  const [net, tax, gross] = [row.netValueOfGoods, row.salesTaxValue, row.invoiceSum]
    .map(value => typeof value === 'number' ? Math.round(value * 100) : NaN);
  if (![net,tax,gross].every(Number.isSafeInteger) || net <= 0 || tax < 0 || net + tax !== gross
    || (row.salesTaxPercent === 0 && tax) || (row.salesTaxPercent > 0 && Math.abs(tax - net * row.salesTaxPercent / 100) > 2)) return null;
  return {net, tax, gross, rate:row.salesTaxPercent};
}

function invoices(response) {
  if (response?.type !== 'Success' || !Array.isArray(response.data)) throw fault('portal');
  return response.data.map(row => {
    const number = reference(row.invoiceNumber);
    const date = portalDate(row.date);
    if (!number || date.replaceAll('-','') !== row.dateString || !['S','H'].includes(row.typeShort)) throw fault('document');
    return {
      document_key:'invoice:' + number + ':' + row.dateString,
      document_type:row.typeShort === 'H' ? 'credit_note' : 'invoice',
      number, date,
      year:row.dateString,
      file_name:(row.typeShort === 'H' ? 'Gutschrift-' : 'Rechnung-') + number + '-' + date + '.pdf',
      totals:row.typeShort === 'S' ? invoiceTotals(row) : null
    };
  });
}

function deliveryNotes(response) {
  const list = response?.data?.orders;
  if (response?.type !== 'Success' || !Array.isArray(list) || response.data.ordersCount !== list.length) throw fault('portal');
  const delivery = new Map();
  for (const row of list) {
    if (!row.hasDeliveryNumber) continue;
    const number = reference(row.deliveryNumber);
    const year = String(row.deliveryDateYear);
    if (!number || !/^\d{4}$/.test(year)) throw fault('document');
    const key = 'delivery:' + number + ':' + year;
    const invoice = row.hasInvoiceNumber ? reference(row.invoiceNumber) : null;
    const known = delivery.get(key);
    if (known) {
      if (invoice) known.invoices.add(invoice);
      continue;
    }
    delivery.set(key, {number, year, invoices:new Set(invoice ? [invoice] : [])});
  }
  return [...delivery].map(([document_key, row]) => ({
    document_key, document_type:'delivery_note', number:row.number, date:null, year:row.year,
    related_invoice_number:row.invoices.size === 1 ? [...row.invoices][0] : null,
    file_name:'Lieferschein-' + row.number + '-' + row.year + '.pdf'
  }));
}

export async function connectFif(credentials, {fetch = globalThis.fetch} = {}) {
  const merchant = createFifMerchant({fetch});
  const session = await merchant.connect(credentials);
  return {
    async page(page, from, to) {
      // Smaller fixed date ranges keep the purchase list below the portal's display limit.
      const start = Date.parse(from) + (page - 1) * 15 * day;
      const end = Math.min(start + 14 * day, Date.parse(to));
      const startDe = german(new Date(start).toISOString());
      const endDe = german(new Date(end).toISOString());
      const [invoice, delivery] = await Promise.all([
        merchant.searchDocuments(session, 'invoice', startDe, endDe),
        merchant.searchDocuments(session, 'delivery_note', startDe, endDe)
      ]);
      const unique = new Map([...invoices(invoice), ...deliveryNotes(delivery)].map(doc => [doc.document_key, doc]));
      return {rows:[...unique.values()], more:end + day <= Date.parse(to)};
    },
    async documents(row) { return [row]; },
    async download(doc) {
      const kind = doc.document_type === 'delivery_note' ? 'delivery_note' : 'invoice';
      return readPortalPdf(await merchant.downloadDocument(session, kind, doc.number, doc.year));
    }
  };
}
