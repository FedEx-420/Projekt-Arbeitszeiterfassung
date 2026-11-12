import assert from 'node:assert/strict';
import {connectFif} from '../../supabase/functions/supplier-portal-docs-v1011/fif.mjs';
import {portalDate, readPortalPdf} from '../../supabase/functions/supplier-portal-docs-v1011/portal.mjs';
import {scanSupplier} from '../../supabase/functions/supplier-portal-docs-v1011/scan.mjs';

const original = new TextEncoder().encode('%PDF-1.7\nSynthetic original\n%%EOF');
assert.equal(portalDate('08.11.2026 11:12:13'), '2026-11-08');
assert.throws(() => portalDate('30.02.2026'));
await assert.rejects(readPortalPdf(new Response('<form>Login</form>')));
await assert.rejects(readPortalPdf(new Response(original, {status:206})));

const methods = [];
const source = await connectFif({username:'test',password:'test'}, {fetch:async (url, init) => {
  const u = new URL(url);
  assert.equal(u.origin, 'https://www.onlinesystem.de');
  methods.push([u.pathname, init.method, u.searchParams.get('year')]);
  const token = '<input name="__RequestVerificationToken" value="synthetic">';
  if (u.pathname === '/Login') return new Response(token);
  if (u.pathname === '/Manage') return new Response('<form action="/Logout">' + token + '</form>');
  if (u.pathname === '/Belege/Rechnungen') return Response.json({type:'Success',data:[
    {date:'08.11.2026',dateString:'20261108',invoiceNumber:123,typeShort:'S',
      currency:'EUR',salesTaxPercent:19,netValueOfGoods:100,salesTaxValue:19,invoiceSum:119},
    {date:'09.11.2026',dateString:'20261109',invoiceNumber:124,typeShort:'H'}
  ]});
  if (u.pathname === '/Belege/Auftr%C3%A4ge') {
    const row = {hasDeliveryNumber:true,deliveryNumber:'56',deliveryDateYear:2026,hasInvoiceNumber:true,invoiceNumber:'123'};
    return Response.json({type:'Success',data:{orders:[row,row],ordersCount:2}});
  }
  if (/^\/Belege\/Download(?:Invoice|DeliveryNote)$/.test(u.pathname)) return new Response(original);
  throw Error('Unexpected portal request');
}});
const range = {from:'2026-11-01T12:00:00.000Z',to:'2026-11-15T12:00:00.000Z'};
const first = await source.page(1,range.from,range.to);
assert.deepEqual(first.rows.map(row => row.document_type), ['invoice','credit_note','delivery_note']);
assert.deepEqual(first.rows[0].totals,{net:10000,tax:1900,gross:11900,rate:19});
assert.equal(first.rows[2].date,null);
assert.equal(first.rows[2].related_invoice_number,'123');
assert.deepEqual(await source.download(first.rows[0]), original);
assert.deepEqual(await source.download(first.rows[2]), original);
assert.ok(methods.some(([path,method,year]) => path === '/Belege/DownloadInvoice' && method === 'GET' && year === '20261108'));
assert.ok(methods.some(([path,method,year]) => path === '/Belege/DownloadDeliveryNote' && method === 'GET' && year === '2026'));

const ready = new Set();
const written = [];
const job = {provider:'fif',account_id:'supplier',lease:'scope',cursor_data:range};
const rpc = async (op,body) => {
  assert.equal(body.lease,'scope');
  if (op === 'known') return {ready:ready.has(body.document_key)};
  if (op === 'reserve') { assert.match(body.file_sha256,/^[0-9a-f]{64}$/); return {id:body.document_key,path:body.document_key}; }
  if (op === 'complete') { ready.add(body.document_key); return {ok:true}; }
  throw Error('Unexpected DB operation');
};
const save = async (key, bytes) => { assert.deepEqual(bytes, original); written.push(key); };
const run = await scanSupplier(job,source,rpc,save);
assert.equal(run.added,3);
assert.equal(run.result,'complete');
assert.equal((await scanSupplier(job,source,rpc,save)).added,0);
assert.equal(written.length,3);
console.log('PASS FiF date parameters, PDF validation, exact tax metadata, delivery-note grouping, and idempotent scan.');
