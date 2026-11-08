const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '../..');
const storage = 'zeiterfassung-v800-session';
const profile = { id: 'test-admin', role: 'administrator', username: 'Admin Fixture' };
const session = () => ({ user: { id: profile.id }, access_token: 'fixture-access', refresh_token: 'fixture-refresh', expires_at: Date.now() / 1000 + 3600 });
const server = http.createServer((request, response) => {
  const name = new URL(request.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if (name === 'config.js') {
    response.setHeader('Content-Type', 'application/javascript');
    return response.end('window.WORKTIME_CONFIG={supabaseUrl:"https://test.invalid",supabasePublishableKey:"test"}');
  }
  const file = path.resolve(root, name);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.statusCode = 404;
    return response.end();
  }
  response.setHeader('Content-Type', name.endsWith('.js') || name.endsWith('.mjs') ? 'application/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.html') ? 'text/html' : 'application/octet-stream');
  response.end(fs.readFileSync(file));
});

async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
  try {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    let profileUnavailable = false, profileReads = 0, materialReads = 0, tokenRequests = 0;
    let holdMaterials = true, releaseMaterials;
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname === '127.0.0.1') return route.continue();
      if (url.hostname !== 'test.invalid') return route.abort();
      const send = (json, status = 200) => route.fulfill({ json, status });
      if (url.pathname === '/auth/v1/token') { tokenRequests++; return send(session()); }
      if (url.pathname === '/rest/v1/profiles' && url.searchParams.has('id')) {
        profileReads++;
        return profileUnavailable ? send({message:'Synthetic outage'},503) : send([profile]);
      }
      if (url.pathname === '/rest/v1/profiles') return send([profile,{id:'test-business',role:'business',username:'Testbetrieb'}]);
      if (url.pathname === '/rest/v1/materials') {
        materialReads++;
        if (holdMaterials) await new Promise(resolve => { releaseMaterials = resolve; });
      }
      return send([]);
    });
    const url = 'http://127.0.0.1:' + server.address().port;
    const form = page.locator('form[data-form="login"]');
    const openMenu = async () => { const button=page.locator('#app-menu-toggle'); if(await button.isVisible())await button.click(); };

    const enter = async () => {
      await form.locator('[name="administrator_login"]').check();
      await form.locator('[name="username"]').fill('admin-fixture');
      await form.locator('[name="password"]').fill('synthetic-test-password');
      await form.locator('[name="remember_device"]').selectOption('yes');
      await form.locator('button.primary').click();
    };
    await page.goto(url);
    await enter();
    await page.locator('.app-shell').waitFor({timeout: 5000});
    assert.equal(await form.count(), 0);
    assert.equal(profileReads, 1);
    assert.equal(tokenRequests, 1);
    await page.locator('[data-date]').waitFor({timeout: 5000});
    await page.locator('[data-action="shift-day"][data-days="-1"]').click();
    const selectedDate = await page.locator('[data-date]').inputValue();
    assert.equal(materialReads,0,'login does not download the material catalog');
    await openMenu();
    await page.locator('[data-view=materials]').click();
    await page.waitForFunction(()=>document.querySelector('[data-startup-view-pending]'));
    await page.waitForTimeout(30);
    assert.ok(releaseMaterials);
    await openMenu();
    await page.locator('[data-view=customers]').click();
    await page.getByRole('heading', {name:'Kundenliste',exact:true}).waitFor({timeout:5000});
    await page.locator('[data-action="new-customer"]').click();
    await page.locator('form[data-form="customer"]').waitFor({timeout:5000});
    const backgroundFinished = page.waitForResponse(r => new URL(r.url()).pathname === '/rest/v1/materials');
    await openMenu();
    await page.locator('[data-view=home]').click();
    holdMaterials = false;
    releaseMaterials();
    await backgroundFinished;
    assert.equal(await page.locator('[data-date]').inputValue(), selectedDate);
    await page.locator('.app-shell').waitFor();
    assert.equal(materialReads, 1, 'login must not trigger a second catalog download');
    assert.ok(await page.evaluate(key => localStorage.getItem(key), storage));
    profileUnavailable = true;
    await page.reload();
    await page.getByRole('button', {name:'Erneut versuchen'}).waitFor();
    assert.equal(await form.count(), 0);
    assert.ok(await page.evaluate(key => localStorage.getItem(key), storage));
    profileUnavailable = false;
    await page.getByRole('button', {name:'Erneut versuchen'}).click();
    await page.locator('.app-shell').waitFor();
    assert.equal(tokenRequests, 1, 'restore does not request a password');
    await openMenu();
    await page.getByRole('button', {name:'Abmelden'}).click();
    await form.waitFor();
    assert.equal(await page.evaluate(key => localStorage.getItem(key), storage), null);
    await page.reload();
    await form.waitFor();
    assert.deepEqual(errors, []);
    console.log('PASS interactive home and customer edit form before material download, one startup load, saved session after temporary outage, manual logout');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
