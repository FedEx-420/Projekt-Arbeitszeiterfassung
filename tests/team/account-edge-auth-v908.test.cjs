// Local adapter regression tests; Auth is stubbed, never a production project.
// Real SDK/Deno resolution is a separate check, not simulated by this suite.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');

const file = path.join(__dirname, '../../supabase/functions/account-management/index.ts');
const raw = fs.readFileSync(file, 'utf8');
assert.match(raw, /^import \{ createClient, type SupabaseClient \} from 'https:\/\/esm\.sh\/@supabase\/supabase-js@2\.118\.0'/);
assert.doesNotMatch(raw, /withSupabase|decodeJwt|decodeProtectedHeader|jwtDecode/);
assert.doesNotMatch(raw, /\.deleteUser\(|removeOrphanedAuthIdentity|\.rpc\('delete_account_v908'/);
const code = stripTypeScriptTypes(raw.replace(/^import[^\r\n]+\r?\n/, ''), { mode: 'strip' });
const origin = 'https://fedex-420.github.io';
const actorId = '20000000-0000-4000-8000-000000000001';
const businessId = '30000000-0000-4000-8000-000000000001';
const employeeId = '40000000-0000-4000-8000-000000000001';
const legacyEnv = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'test-legacy-public', SUPABASE_SERVICE_ROLE_KEY: 'test-legacy-private' };
const jwt = (header, payload = { sub: 'forged-sub', user_metadata: { role: 'administrator' } }) => [header, payload].map(v => Buffer.from(JSON.stringify(v)).toString('base64url')).join('.') + '.synthetic-signature';
const legacyJwt = jwt({ alg: 'HS256', typ: 'JWT' });
const modernJwt = jwt({ alg: 'ES256', typ: 'JWT', kid: 'synthetic-key-id' });

function harness({ env = legacyEnv, user = { id: actorId }, authError = null, actor = { id: actorId, role: 'administrator', username: 'Tester', business_id: null }, profiles = {}, authThrows = false, createError = null } = {}) {
  let handler;
  const calls = { clients: [], authTokens: [], profileIds: [], mutations: [], creates: 0 };
  const profileMap = { [actorId]: actor, ...profiles };
  const createClient = (url, key, options) => {
    calls.clients.push({ url, key, options });
    return {
      auth: {
        getUser: async token => { calls.authTokens.push(token); if (authThrows) throw new Error('private Auth details'); return { data: { user }, error: authError }; },
        admin: { updateUserById: async (...args) => { calls.mutations.push(args); return { error: null }; }, createUser: async () => { calls.creates++; return { data: { user: createError ? null : { id: employeeId } }, error: createError }; }, deleteUser: async () => { throw Error('Forbidden identity deletion'); } },
      },
      from(table) {
        assert.equal(table, 'profiles');
        let id;
        return {
          select() { return this; },
          eq(column, value) { assert.equal(column, 'id'); id = value; return this; },
          async single() { calls.profileIds.push(id); return { data: profileMap[id] || null, error: profileMap[id] ? null : new Error('not found') }; },
          update(values) { calls.mutations.push(values); return this; },
        };
      },
    };
  };
  vm.runInNewContext(code, { Request, Response, URL, TextEncoder, createClient, Deno: { env: { get: name => env[name] }, serve: value => { handler = value; } } }, { filename: file });
  return { calls, request: (body = { action: 'unknown' }, options = {}) => handler(new Request('https://example.invalid/account', { method: 'POST', headers: { origin, authorization: 'Bearer ' + modernJwt, 'Content-Type': 'application/json', ...options.headers }, body: JSON.stringify(body), ...options })) };
}

async function main() {
  let passed = 0;
  const test = async (name, fn) => { await fn(); passed++; console.log('PASS ' + name); };
  await test('Legacy HS256 JWT without kid reaches project Auth unchanged', async () => {
    const h = harness(); const r = await h.request(undefined, { headers: { authorization: 'Bearer ' + legacyJwt } });
    assert.equal(r.status, 400); assert.deepEqual(h.calls.authTokens, [legacyJwt]); assert.deepEqual(h.calls.profileIds, [actorId]);
  });
  await test('Modern signing-key JWT also uses getUser; identity is not decoded from claims', async () => {
    const h = harness(); assert.equal((await h.request()).status, 400); assert.deepEqual(h.calls.authTokens, [modernJwt]); assert.deepEqual(h.calls.profileIds, [actorId]);
  });
  await test('Deleted or rejected Auth users never create the privileged client', async () => {
    for (const config of [{ user: null }, { authError: new Error('User deleted: private details') }, { authThrows: true }]) {
      const h = harness(config); const r = await h.request(); assert.equal(r.status, 401); assert.equal(h.calls.clients.length, 1); assert.equal(h.calls.profileIds.length, 0); assert.doesNotMatch(await r.text(), /private details|private Auth/);
    }
  });
  await test('A deleted profile is denied even if Auth still returns an identity', async () => {
    const h = harness({ actor: null }); assert.equal((await h.request()).status, 401); assert.equal(h.calls.mutations.length, 0);
  });
  await test('Old frontend delete actions return a clear pause, never a mutation or target lookup', async () => {
    for (const action of ['employee-delete', 'business-delete']) {
      const h = harness(); const r = await h.request({ action, employeeId, businessId }); const body = await r.json();
      assert.equal(r.status, 409); assert.equal(body.code, 'ACCOUNT_DELETION_PAUSED'); assert.match(body.error, /keine Daten und keine Zugänge geändert/); assert.match(body.error, /weiterhin verwendet/); assert.equal(body.ok, undefined); assert.equal(h.calls.mutations.length, 0); assert.equal(h.calls.creates, 0); assert.deepEqual(h.calls.profileIds, [actorId]);
    }
  });
  await test('Employees are denied; business owners cannot delete a company and cannot bypass the employee pause', async () => {
    for (const role of ['employee', 'business']) for (const action of ['employee-delete', 'business-delete']) {
      const h = harness({ actor: { id: actorId, role, business_id: businessId } }); const r = await h.request({ action, employeeId, businessId });
      assert.equal(r.status, role === 'business' && action === 'employee-delete' ? 409 : 403); assert.equal(h.calls.mutations.length, 0); assert.equal(h.calls.creates, 0);
    }
  });
  await test('Duplicate worker creation never deletes an older identity or retries account creation', async () => {
    const h = harness({ profiles: { [businessId]: { id: businessId, role: 'business', company_name: 'Synthetic Company' } }, createError: new Error('User already registered') });
    const r = await h.request({ action: 'employee-create', businessId, username: 'Synthetic Worker', password: 'synthetic-new-password' });
    assert.equal(r.status, 409); assert.match((await r.json()).error, /nicht automatisch gelöscht/); assert.equal(h.calls.creates, 1); assert.equal(h.calls.mutations.length, 0);
  });
  await test('Creating a genuinely new worker still works while deletion is suspended', async () => {
    const h = harness({ profiles: { [businessId]: { id: businessId, role: 'business', company_name: 'Synthetic Company' } } });
    const r = await h.request({ action: 'employee-create', businessId, username: 'Synthetic Worker', password: 'synthetic-new-password' });
    assert.equal(r.status, 201); assert.equal((await r.json()).employee.id, employeeId); assert.equal(h.calls.creates, 1); assert.equal(h.calls.mutations.length, 1);
  });
  await test('Editable or stale administrator claims do not replace the current DB role', async () => {
    const h = harness({ actor: { id: actorId, role: 'employee', username: 'Tester', business_id: businessId } });
    assert.equal((await h.request({ action: 'business-create', username: 'Forged' })).status, 403); assert.equal(h.calls.mutations.length, 0);
  });
  await test('Business credentials cannot change an employee from another company', async () => {
    const h = harness({ actor: { id: actorId, role: 'business', username: 'Tester', business_id: actorId }, profiles: { [employeeId]: { id: employeeId, role: 'employee', business_id: businessId } } });
    assert.equal((await h.request({ action: 'employee-credentials-update', employeeId, username: 'Changed', password: 'synthetic-new-password' })).status, 400); assert.equal(h.calls.mutations.length, 0);
  });
  await test('Modern default dictionaries take priority over legacy keys', async () => {
    const h = harness({ env: { ...legacyEnv, SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: 'test-modern-public', spare: 'ignored-public' }), SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'test-modern-private', spare: 'ignored-private' }) } });
    assert.equal((await h.request()).status, 400); assert.deepEqual(h.calls.clients.map(c => c.key), ['test-modern-public', 'test-modern-private']);
  });
  await test('Modern singular keys and an unambiguous named key are supported', async () => {
    for (const keys of [{ SUPABASE_PUBLISHABLE_KEY: 'test-single-public', SUPABASE_SECRET_KEY: 'test-single-private' }, { SUPABASE_PUBLISHABLE_KEYS: '{"named":"test-single-public"}', SUPABASE_SECRET_KEYS: '{"named":"test-single-private"}' }]) {
      const h = harness({ env: { SUPABASE_URL: legacyEnv.SUPABASE_URL, ...keys } }); assert.equal((await h.request()).status, 400); assert.deepEqual(h.calls.clients.map(c => c.key), ['test-single-public', 'test-single-private']);
    }
  });
  await test('An empty modern dictionary permits the explicit legacy fallback', async () => {
    const h = harness({ env: { ...legacyEnv, SUPABASE_PUBLISHABLE_KEYS: '{}', SUPABASE_SECRET_KEYS: '{}' } });
    assert.equal((await h.request()).status, 400); assert.deepEqual(h.calls.clients.map(c => c.key), [legacyEnv.SUPABASE_ANON_KEY, legacyEnv.SUPABASE_SERVICE_ROLE_KEY]);
  });
  await test('Missing, malformed or ambiguous configuration fails closed without leaking keys', async () => {
    for (const env of [{}, { ...legacyEnv, SUPABASE_URL: 'http://untrusted.invalid' }, { ...legacyEnv, SUPABASE_SECRET_KEYS: '{broken-private' }, { ...legacyEnv, SUPABASE_SECRET_KEYS: '{"one":"private-one","two":"private-two"}' }, { ...legacyEnv, SUPABASE_PUBLISHABLE_KEYS: '[]' }, { ...legacyEnv, SUPABASE_SECRET_KEYS: '{"default":null}' }]) {
      const h = harness({ env }); const r = await h.request(); assert.equal(r.status, 500); assert.equal(h.calls.clients.length, 0); assert.doesNotMatch(await r.text(), /private|test-legacy|SUPABASE_/);
    }
  });
  await test('Both clients are stateless and the service client never receives user headers', async () => {
    const h = harness(); await h.request();
    for (const client of h.calls.clients) { assert.equal(client.options.auth.persistSession, false); assert.equal(client.options.auth.autoRefreshToken, false); assert.equal(client.options.auth.detectSessionInUrl, false); assert.equal(client.options.global, undefined); assert.equal(client.options.accessToken, undefined); }
    assert.notEqual(h.calls.clients[0].key, h.calls.clients[1].key);
  });
  await test('Missing or malformed Bearer credentials are denied before environment access', async () => {
    for (const authorization of ['', 'Basic synthetic', 'Bearer', 'Bearer token extra']) { const h = harness({ env: {} }); assert.equal((await h.request(undefined, { headers: { authorization } })).status, 401); assert.equal(h.calls.clients.length, 0); }
  });
  await test('Preflight, unsupported methods and foreign origins do not call Auth', async () => {
    const h = harness({ env: {} });
    assert.equal((await h.request(undefined, { method: 'OPTIONS', body: undefined })).status, 200);
    assert.equal((await h.request(undefined, { method: 'GET', body: undefined })).status, 405);
    assert.equal((await h.request(undefined, { headers: { origin: 'https://foreign.invalid', authorization: 'Bearer ' + modernJwt } })).status, 403);
    assert.equal(h.calls.clients.length, 0);
  });
  console.log(JSON.stringify({ passed, productionWrites: 0, scope: 'local adapter tests; no real JWT verification or Deno bundling simulated' }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
