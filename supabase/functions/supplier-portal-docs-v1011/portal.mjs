import {createMerchant} from '../supplier-cart-v949/merchant.mjs';

const efgOrigin = 'https://efgonlineplus.de';
const pdfLimit = 10 * 1024 * 1024;
export const fault = code => Object.assign(new Error(code), {code});
const efgId = v => /^[A-Za-z0-9_.:-]{1,150}$/.test(String(v ?? ''));
const number = v => /^[0-9]{1,30}$/.test(String(v ?? '')) && /[1-9]/.test(String(v)) ? String(v) : null;

export function portalDate(value) {
  const s = String(value || '');
  const de = /^(\d{2})\.(\d{2})\.(\d{4})(?: |$)/.exec(s);
  const iso = de ? [de[3], de[2], de[1]].join('-') : /^\d{4}-\d{2}-\d{2}(?:T|$)/.exec(s)?.[0].slice(0, 10);
  if (!iso) throw fault('document');
  const date = new Date(iso);
  if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== iso) throw fault('document');
  return iso;
}

export async function readPortalPdf(response) {
  if (response.status !== 200 || !response.body) {
    await response.body?.cancel().catch(() => {});
    throw fault(response.status === 401 || response.status === 403 ? 'permission' : 'document');
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.length;
      if (size > pdfLimit) throw fault('document');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const pdf = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    pdf.set(chunk, offset);
    offset += chunk.length;
  }
  if (new TextDecoder().decode(pdf.subarray(0, 5)) !== '%PDF-'
    || !new TextDecoder().decode(pdf.subarray(Math.max(0, size - 1024))).includes('%%EOF')) throw fault('document');
  return pdf;
}

function efgArchiveDocuments(row, response) {
  if (response?.successful !== true || !Array.isArray(response.array) || response.array.length > 150) throw fault('portal');
  const docs = response.array.filter(d => d?.archiveType === 3 || d?.archiveType === 4);
  for (const doc of docs) {
    if (!efgId(doc.archiveIndex) || !/^[A-Za-z0-9_. -]{1,220}\.pdf$/i.test(doc.fileName || '')) throw fault('document');
  }

  // A single invoice reference in a process can have plain and ZUGFeRD originals.
  const invoiceBase = d => d.fileName.replace(/_(?:ZUGFERD|FACTUR-X)\.pdf$/i, '.pdf').toLowerCase();
  const structured = d => /_(?:ZUGFERD|FACTUR-X)\.pdf$/i.test(d.fileName);
  const invoiceDocs = docs.filter(d => d.archiveType === 4);
  const invoiceGroups = new Map();
  for (const doc of invoiceDocs) {
    const base = invoiceBase(doc);
    const preferred = invoiceGroups.get(base);
    if (!preferred || structured(doc)) invoiceGroups.set(base, doc);
  }
  const pair = invoiceDocs.length === 2 && invoiceDocs.filter(structured).length === 1
    && portalDate(invoiceDocs[0].createDate) === portalDate(invoiceDocs[1].createDate);
  const invoice = invoiceGroups.size === 1 || pair ? number(row.invoiceNumber) : null;
  const credit = /gutschrift|stornorechnung/i.test(String(row.processTypeDisplayText || ''));
  const original = (doc, kind, document_key, documentNumber, related) => ({
    document_key, document_type:kind, number:documentNumber, related_invoice_number:related,
    date:portalDate(doc.createDate), file_name:doc.fileName, archiveIndex:doc.archiveIndex
  });
  const invoiceKind = doc => credit || /gutschrift|stornorechnung/i.test(doc.description || '') ? 'credit_note' : 'invoice';
  const invoices = invoice ? [invoiceDocs.find(structured) || invoiceDocs[0]] : [...invoiceGroups.values()];
  const primary = invoices.map(doc => original(doc, invoiceKind(doc),
    'invoice:' + (invoice ? portalDate(doc.createDate).slice(0,4) + ':' + invoice : invoiceBase(doc)), invoice, null));
  // Try both original files here. Their byte hashes suppress the already stored main PDF.
  const copies = invoice && invoiceDocs.length > 1
    ? invoiceDocs.map(doc => original(doc, 'invoice_copy', 'copy:' + doc.archiveIndex, null, invoice))
    : [];
  const deliveries = docs.filter(doc => doc.archiveType === 3).map(doc =>
    original(doc, 'delivery_note', 'delivery:' + doc.archiveIndex, null, credit ? null : invoice));
  return [...primary, ...copies, ...deliveries];
}

export async function connectEfg(credentials, {fetch = globalThis.fetch, md5}) {
  const merchant = createMerchant({fetch, md5});
  const session = await merchant.connect({shop:'efg', ...credentials, requireWarehouse:false});
  const settings = await merchant.call(session, '/api/account/getsettingsremaining?domain=efgonlineplus.de');
  if (!settings.user?.permissions?.processes?.granted || !settings.user?.permissions?.downloads?.granted
    || !settings.user?.permissions?.invoicesCredits?.granted) throw fault('permission');
  if (typeof settings.sfk !== 'string' || !settings.sfk || settings.sfk.length > 4000) throw fault('portal');
  return {
    async page(page, from, to) {
      const data = await merchant.call(session, '/api/process/search', {
        adress:'', backlog:true, billedGoods:false, collections:true, collectorName:'', commission:'',
        customerNumber:'', customerBaseCommission:'', deliveryNotes:true, fromDate:from, invoiceNumber:'',
        itemNumber:'', justComplete:false, makeAndHoldOrders:true, offers:false, orderNumber:'0', purchaser:'',
        reservedGoods:false, returns:true, sentWithParcelService:false, untillDate:to, periodSelector:'custom',
        customerCostCenter:'', displayCompletedProcesses:true, page
      });
      const list = data?.obj;
      if (data?.successful !== true || !Array.isArray(list?.resultList) || list.resultList.length > 250
        || typeof list.blnHasMore !== 'boolean') throw fault('portal');
      return {rows:list.resultList, more:list.blnHasMore};
    },
    async documents(row) {
      if (row.showMediaControlArchive !== true) return [];
      const no = number(row.processNumber);
      const suffix = String(row.processSuffix ?? '');
      if (!no || !/^\d{1,8}$/.test(suffix)) throw fault('portal');
      const query = new URLSearchParams({processNo:no, processSuffix:suffix});
      return efgArchiveDocuments(row, await merchant.call(session, '/api/mcinterface?' + query));
    },
    async download(document) {
      const query = new URLSearchParams({archiveId:document.archiveIndex, localFilename:document.file_name, sfk:settings.sfk});
      const cookie = Object.entries(session.cookies).map(([k, v]) => k + '=' + v).join('; ');
      return readPortalPdf(await fetch(efgOrigin + '/services/getMCFile.ashx?' + query, {
        headers:{Cookie:cookie, Accept:'application/pdf'}, redirect:'error', signal:AbortSignal.timeout(12000)
      }));
    }
  };
}
