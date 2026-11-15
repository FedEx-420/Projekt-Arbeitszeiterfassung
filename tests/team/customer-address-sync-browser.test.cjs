const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

const company = '10000000-0000-4000-8000-000000000001';
const customerId = '10000000-0000-4000-8000-000000000002';
const root = path.resolve(__dirname, '../..');
const profile = {id:company,role:'business',username:'Fiktiver Betrieb'};

async function run() {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage({serviceWorkers:'block'});
    let revision = 0, probes = 0, lists = 0;
    const customer = {id:customerId,employee_id:company,name:'Fiktiver Kunde',
      updated_at:'2026-11-15T16:00:00Z',custom_fields:{
        street:'Musterweg',house_no:'1',postal_code:'12345',city:'Musterstadt',country:'Deutschland'
      }};
    const remoteUpdate = number => {
      customer.custom_fields.house_no = number;
      customer.updated_at = '2026-11-15T16:00:0' + (++revision) + 'Z';
    };
    const app = fs.readFileSync(path.join(root,'app-v800.js'),'utf8').replace(/\}\)\(\);\s*$/,
      'window.customerTest={state,render,profile:' + JSON.stringify(profile) + '};})();');
    await page.route('https://worktime.test/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/config.js') return route.fulfill({
        contentType:'text/javascript',
        body:'window.WORKTIME_CONFIG={supabaseUrl:"https://supabase.test",supabasePublishableKey:"fixture"};'
      });
      if (url.pathname === '/app-v800.js') return route.fulfill({contentType:'text/javascript',body:app});
      const file = path.resolve(root,url.pathname.slice(1)||'index.html');
      if (!file.startsWith(root+path.sep)||!fs.existsSync(file)) return route.fulfill({status:404});
      const type = file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html';
      return route.fulfill({contentType:type,body:fs.readFileSync(file)});
    });
    await page.route('https://supabase.test/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/customer_address_sync_revision')) {
        assert.equal(route.request().postDataJSON().p_company,company);
        probes++;
        return route.fulfill({json:String(revision)});
      }
      if (url.pathname === '/rest/v1/customers') {
        lists++;
        return route.fulfill({json:[customer]});
      }
      return route.fulfill({json:[]});
    });
    await page.goto('https://worktime.test');
    await page.evaluate(()=>{
      const {state,render,profile} = window.customerTest;
      Object.assign(state,{
        session:{access_token:'synthetic',user:{id:profile.id},expires_at:Math.floor(Date.now()/1000)+4800},
        profile,businessId:profile.id,employeeId:profile.id,people:[profile],view:'customers'
      });
      render();
    });
    await page.getByRole('button',{name:/Fiktiver Kunde/}).click();
    const house = page.locator('form[data-form="customer"] [name=house_no]');
    assert.equal(await house.inputValue(),'1');
    await page.evaluate(()=>document.activeElement.blur());
    const initialLists = lists;
    await page.waitForRequest(req=>req.url().endsWith('/customer_address_sync_revision'));
    assert.equal(lists,initialLists,'An unchanged company revision skips the customer list');
    remoteUpdate('25b');
    await page.waitForFunction(()=>document.querySelector('form[data-form=customer] [name=house_no]')?.value==='25b',null,{timeout:6500});

    await house.fill('Entwurf');
    remoteUpdate('41');
    await page.getByRole('status').filter({hasText:'Dieser Kunde wurde inzwischen geändert'}).waitFor({timeout:6500});
    assert.equal(await house.inputValue(),'Entwurf');
    assert.ok(probes>=3);
    console.log('PASS native customer changes arrive on the next revision check and unsaved fields are preserved.');
  } finally {
    await browser.close();
  }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
