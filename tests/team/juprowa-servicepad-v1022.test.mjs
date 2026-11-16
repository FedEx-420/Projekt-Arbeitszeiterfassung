import test from 'node:test';
import assert from 'node:assert/strict';
import { createServicepadHandler } from '../../supabase/functions/juprowa-servicepad/handler.mjs';

const company = 'c1010000-0000-4000-8000-000000000001';
const other = 'c1010000-0000-4000-8000-000000000002';
const admin = 'c1010000-0000-4000-8000-000000000003';
const employee = 'c1010000-0000-4000-8000-000000000004';
const login = { serial: 'T01', username: 'monteur', password: 'p%20+&= ä' };
const uid = 'T01MONTEUR';
const canonical = { uid: 'synth-hashed-portal-user', passport: 'opaque/from+portal&=' };
const profiles = { [company]: 'business', [other]: 'business', [admin]: 'administrator', [employee]: 'employee' };
const records = [
  { ID: 11, ID_MANDANT: 4, AK_AUFSTATUS: '2', AK_SCHEINNR: 'S-11', AK_BAUADR_NAM1: 'A', PRICE: 80 },
  { ID: 12, ID_MANDANT: 4, AK_AUFSTATUS: 5 },
  { ID: 13, ID_MANDANT: 5, AK_AUFSTATUS: 2 },
  { ID: 14, ID_MANDANT: null, AK_AUFSTATUS: 2 },
  { ID: 11, ID_MANDANT: 4, AK_AUFSTATUS: 2, AK_SCHEINNR: 'S-11', AK_BAUADR_NAM1: 'A', PRICE: 81 },
];

function fixture() {
  const serviceKey = 'dummy-service-key';
  const portal = { calls: 0, reply: records, login: true, allowed: 'ABTEILUNG,BASIS' };
  const stored = new Map();
  const fetcher = async (endpoint, options) => {
    const url = new URL(endpoint);
    const auth = options.headers.Authorization?.slice(7);
    if (url.hostname === 'services.juprowa.net') {
      portal.calls++;
      assert.equal(url.pathname, '/Cloud/WebService/v6.0/jsondata.php');
      assert.equal(options.redirect, 'error');
      assert.equal(options.method, undefined);
      if (!portal.login) return new Response(null, { status: 401 });
      if (url.searchParams.get('type') === 'Userdata') {
        if (url.searchParams.get('UID') === uid) assert.equal(url.searchParams.get('PASSPORT'), uid + login.password);
        else {
          assert.equal(url.searchParams.get('UID'), canonical.uid);
          assert.equal(url.searchParams.get('PASSPORT'), canonical.passport);
        }
        return Response.json({
          CURR_USER: { UID: canonical.uid, PASSPORT: encodeURIComponent(canonical.passport), ALLOWED_MANDANT: portal.allowed },
          CURR_CUSTOMER: { ID: '701', MANDANTEN: {
            4: { ID: '4', MANDANT_ID: 'Abteilung' }, 5: { ID: '5', MANDANT_ID: 'Andere' },
          } },
        });
      }
      assert.equal(url.searchParams.get('type'), 'WorksheetList');
      assert.equal(url.searchParams.get('UID'), canonical.uid);
      assert.equal(url.searchParams.get('PASSPORT'), canonical.passport);
      return portal.reply == null ? new Response('') : Response.json(portal.reply);
    }
    assert.equal(options.headers.apikey, serviceKey);
    if (url.pathname === '/auth/v1/user') {
      return profiles[auth] ? Response.json({ id: auth }) : new Response(null, { status: 401 });
    }
    assert.equal(auth, serviceKey);
    if (url.pathname === '/rest/v1/profiles') {
      const role = profiles[url.searchParams.get('id').slice(3)];
      return Response.json(role ? [{ role }] : []);
    }
    assert.equal(url.pathname, '/rest/v1/juprowa_servicepad_connections');
    const id = url.searchParams.get('business_id')?.slice(3);
    const row = stored.get(id);
    if (options.method === 'GET') return Response.json(row ? [row] : []);
    if (options.method === 'POST') {
      const inserted = JSON.parse(options.body);
      if (stored.has(inserted.business_id)) return new Response(null, { status: 409 });
      stored.set(inserted.business_id, inserted);
      return Response.json([inserted]);
    }
    if (row?.revision !== url.searchParams.get('revision')?.slice(3)) return Response.json([]);
    if (options.method === 'DELETE') {
      stored.delete(id);
      return Response.json([row]);
    }
    assert.equal(options.method, 'PATCH');
    const updated = JSON.parse(options.body);
    stored.set(id, updated);
    return Response.json([updated]);
  };
  const handler = createServicepadHandler({ baseUrl: 'https://database.example', serviceKey, fetcher });
  const call = async (action, fields = {}, bearer = company) => {
    const response = await handler(new Request('https://functions.example', {
      method: 'POST', headers: { Authorization: 'Bearer ' + bearer },
      body: JSON.stringify({ action, businessId: company, ...fields }),
    }));
    return { status: response.status, body: await response.json() };
  };
  return { call, portal, stored };
}

test('rejects unauthenticated, employee, and cross-company access before calling the portal', async () => {
  const { call, portal } = fixture();
  assert.equal((await call('connect', login, 'bad')).status, 401);
  assert.equal((await call('connect', login, employee)).status, 403);
  assert.equal((await call('connect', login, other)).status, 403);
  assert.equal((await call('status', { businessId: employee }, admin)).status, 403);
  assert.equal(portal.calls, 0);
});

test('verifies the chosen mandant, strips prices, deduplicates and encrypts login for that business', async () => {
  const { call, stored } = fixture();
  const choices = await call('connect', login);
  assert.deepEqual(choices.body.mandants.map(entry => entry.id), ['0', '4']);
  assert.equal(stored.size, 0);
  const { body } = await call('connect', { ...login, mandantId: '4' }, admin);
  assert.deepEqual(body.worksheets.map(entry => entry.id), ['11']);
  assert.equal(Object.hasOwn(body.worksheets[0], 'PRICE'), false);
  assert.equal(body.connection.label, 'Abteilung');
  const row = stored.get(company);
  assert.ok(!JSON.stringify(row).includes(uid));
  assert.ok(!JSON.stringify(row).includes(canonical.uid));
  assert.ok(!JSON.stringify(body).includes(login.password));
  assert.equal((await call('list', { revision: body.connection.revision })).body.worksheets.length, 1);
  stored.set(other, { ...row, business_id: other });
  const moved = await call('list', { revision: row.revision, businessId: other }, other);
  assert.equal(moved.body.code, 'reconnect');
});

test('does not mask expired access or malformed responses as an empty list', async () => {
  const { call, portal, stored } = fixture();
  portal.login = false;
  assert.equal((await call('connect', { ...login, mandantId: '4' })).body.code, 'portal_login');
  assert.equal(stored.size, 0);
  portal.login = true;
  const { body } = await call('connect', { ...login, mandantId: '4' });
  const revision = body.connection.revision;
  portal.reply = { error: 'authentication failed' };
  assert.equal((await call('list', { revision })).body.code, 'portal_reply');
  portal.reply = null;
  assert.deepEqual((await call('list', { revision })).body.worksheets, []);
  portal.allowed = 'BASIS';
  assert.equal((await call('list', { revision })).body.code, 'portal_scope');
  assert.equal((await call('disconnect', { revision: 'stale' })).body.code, 'connection_changed');
  assert.equal((await call('disconnect', { revision })).body.connection, null);
  assert.equal(stored.size, 0);
});
