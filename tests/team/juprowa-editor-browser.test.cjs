'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.setDefaultTimeout(8000);
    await page.setContent('<main id="app" class="content"></main>');
    for (const name of ['styles-v700.css','responsive-v701.css','neutral-theme-v1002.css','juprowa-servicepad-v1028.css']) {
      await page.addStyleTag({ path: path.resolve(__dirname, '../../'+name) });
    }
    await page.addScriptTag({ path: path.resolve(__dirname, '../../juprowa-servicepad-v1022.js') });
    await page.evaluate(() => {
      const root = document.querySelector('#app');
      const escapeNode = document.createElement('div');
      const escape = value => {
        escapeNode.textContent = String(value ?? '');
        return escapeNode.innerHTML.replaceAll('"','&quot;');
      };
      const connection = { revision: 'fixture', label: 'Fiktiver Betrieb' };
      const sheets = [
        { id: '12', number: 'TEST-12', project: '1003', customer: 'König Gebäudetechnik', date: '2026-11-16',
          location: 'Musterstraße 14, 53111 Bonn', technician: 'Monteur A', description: 'Leuchten im Flur austauschen' },
        { id: '13', number: 'TEST-13', project: '1002', customer: 'Rathaus Mitte', date: '2026-10-28',
          location: 'Rathausplatz 1, 53111 Bonn', technician: 'Monteur B', description: 'Steckdosen im Erdgeschoss prüfen' },
        { id: '14', number: 'TEST-14', project: '1001', customer: 'Hausverwaltung Rheinblick',
          location: 'Uferweg 7, 53111 Bonn', technician: 'Monteur C', description: 'Beleuchtung in der Tiefgarage prüfen' },
      ];
      const detail = { ...sheets[0], revision: 'fixture-sheet', requested: 'Fiktiver Auftrag', completed: 'Vorher', notes: '',
        addresses: { service: { street: 'Testweg 1' } }, workers: [{ id: '6', name: 'Monteur A' }, { id: '7', name: 'Monteur B' }],
        times: [{ day: '2026-11-16', workerId: '6', start: '08:00', end: '09:00' }],
        materials: [{ article: 'X', description: 'Altes Material', quantity: '4', unit: 'm' }], attachmentCount: 1 };
      window.sent = [];
      const api = async (_url, { body }) => {
        if (body.action === 'worksheet-detail') return { detail };
        if (body.action === 'worksheet-save') {
          window.sent.push(body);
          return { id: '12', closed: false };
        }
        if (body.action === 'customers-preview') return { fingerprint: 'test-preview', counts: { new: 2, linked: 0, review: 1 },
          new_candidates: [{ id: '10', name: 'Neukunde A' }, { id: '11', name: 'Neukunde B' }],
          review: [{ id: '20', name: 'Unklarer Kunde', matches: [{ id: 'target', name: 'Kunde im Stamm', city: 'Testort' }] }] };
        if (body.action === 'customers-import') {
          window.sent.push(body);
          return { applied: true, counts: { new: 2, linked: 0, review: 1, added: 2, assigned: 1 } };
        }
        return { connection, worksheets: sheets };
      };
      const servicePad = window.WorktimeServicePad.create({ root, state: { profile: { id: 'business' } },
        businessId: () => 'business', isManager: () => true, api, escape });
      root.innerHTML = servicePad.orders();
      servicePad.afterRender();
      window.showTestCustomers = () => { root.innerHTML = servicePad.customers(); servicePad.afterRender(); };
    });
    await page.getByText('Offene Juprowa-Arbeitsscheine', { exact: true }).click();
    const results = page.getByRole('list', { name: 'Offene Juprowa-Arbeitsscheine' });
    const search = page.getByRole('searchbox', { name: 'Juprowa-Arbeitsschein suchen' });
    await results.getByText('König Gebäudetechnik').waitFor();
    assert.equal(await results.locator('li').count(),3);
    assert.equal(await results.getByRole('listitem').first().getByRole('heading').innerText(),'König Gebäudetechnik');
    await page.getByRole('combobox', { name: 'Sortierung' }).selectOption('oldest');
    assert.equal(await results.getByRole('listitem').first().getByRole('heading').innerText(),'Rathaus Mitte');
    assert.equal(await results.getByRole('listitem').last().getByRole('heading').innerText(),'Hausverwaltung Rheinblick');
    await search.fill('konig mustersTrasse');
    await page.getByText('1 von 3 Arbeitsscheinen').waitFor();
    assert.equal(await results.getByRole('listitem').count(),1);
    await search.fill('Kein solcher Treffer');
    await page.getByText('Keine Arbeitsscheine passen zur Suche.').waitFor();
    await page.getByRole('button',{name:'Suche zurücksetzen'}).click();
    await page.getByText('3 offene Arbeitsscheine').waitFor();
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const firstSheet=results.getByRole('listitem').filter({hasText:'König Gebäudetechnik'});
    await firstSheet.getByRole('button',{name:'Details öffnen'}).click();
    const preview=page.getByRole('dialog',{name:'Arbeitsschein TEST-12'});
    await preview.getByText('Arbeitszeiten',{exact:true}).waitFor();
    await preview.getByText('Altes Material',{exact:false}).waitFor();
    await preview.getByRole('button',{name:'Schließen'}).click();
    await firstSheet.getByRole('button', { name: 'Arbeitsschein bearbeiten' }).click();
    const editor = page.getByRole('dialog');
    await editor.getByText('Einsatzort bearbeiten').click();
    await editor.getByRole('textbox', { name: 'Straße und Hausnummer' }).fill('Testweg 5');
    await editor.locator('textarea[name="completed"]').fill('Geändert');
    await editor.getByRole('button', { name: 'Zeitabschnitt hinzufügen' }).click();
    const time = editor.locator('[data-sp-row="time"]').last();
    await time.getByLabel('Monteur').selectOption('7');
    await time.getByLabel('Arbeitsbeginn').fill('14:00');
    await time.getByLabel('Arbeitsende').fill('15:00');
    await editor.getByRole('button', { name: 'Materialposition entfernen' }).click();
    await editor.getByRole('button', { name: 'Materialposition hinzufügen' }).click();
    const material = editor.locator('[data-sp-row="material"]');
    await material.locator('textarea[name="description"]').fill('Neues Material');
    await material.getByLabel('Menge').fill('2,5');
    await material.getByLabel('Einheit').fill('m');
    await editor.getByRole('button', { name: 'Änderungen speichern' }).click();
    assert.deepEqual(await page.evaluate(() => window.sent), []);
    await editor.getByRole('button', { name: 'Übertragung bestätigen' }).click();
    await page.getByText('Juprowa hat die Änderungen bestätigt.').waitFor();
    const [sent] = await page.evaluate(() => window.sent);
    assert.equal(sent.worksheetId, '12');
    assert.equal(sent.confirmed, true);
    assert.equal(sent.edits.completed, 'Geändert');
    assert.deepEqual(sent.edits.addresses.service, { street: 'Testweg 5' });
    assert.deepEqual(sent.edits.times[0], { originalIndex: 0 });
    assert.equal(sent.edits.times[1].workerId, '7');
    assert.equal(sent.edits.times[1].start, '14:00');
    assert.deepEqual(sent.edits.materials, [{ originalIndex: null, article: '', supplier: '', description: 'Neues Material', quantity: '2,5', unit: 'm' }]);
    await page.evaluate(() => window.showTestCustomers());
    await page.getByText('Juprowa-Kundendaten ergänzen', { exact: true }).click();
    await page.getByRole('button', { name: 'Kundenvorschau laden' }).click();
    await page.getByText('Neukunden auswählen', { exact: true }).click();
    await page.getByRole('button', { name: 'Alle auswählen', exact: true }).click();
    assert.equal(await page.locator('[data-juprowa-new]:checked').count(), 2);
    await page.getByText('Unklare Zuordnungen einzeln prüfen', { exact: true }).click();
    await page.locator('[data-juprowa-assignment="20"]').selectOption('target');
    await page.getByRole('button', { name: 'Fehlende Daten ergänzen und Auswahl übernehmen' }).click();
    assert.equal(await page.evaluate(() => window.sent.length), 1);
    await page.getByRole('button', { name: 'Kundenübernahme bestätigen' }).click();
    await page.getByText(/Manuell zugeordnet: 1/).waitFor();
    const staged = await page.evaluate(() => window.sent.at(-1));
    assert.deepEqual(staged.newCustomers, ['10','11']);
    assert.deepEqual(staged.customerAssignments, { '20': 'target' });
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
