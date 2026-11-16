import test from 'node:test';
import assert from 'node:assert/strict';
import { customerPage } from '../../supabase/functions/juprowa-servicepad/customers.mjs';
import { worksheetDetail } from '../../supabase/functions/juprowa-servicepad/portal.mjs';

const auth = { uid: 'fixture', passport: 'fixture' };

test('loads the shared or selected customer scope and preserves contact details without unrelated account data', async () => {
  const payload = {
    row1: { ID: 21, ID_MANDANT: null, STAMM: {
      KU_NAME: 'Testkundin', KU_STREET: 'Dorfstraße 18a', KU_ZIP: '01234', KU_CITY: 'Dorf', KU_COUNTRY: 'D',
      KU_NUMMER: '00-123', KU_BANK: 'exclude-from-address-book',
    }, CONTACTS: [{ KK_EMAIL: 'valid@example.invalid', KK_MOBILE: '0123', KK_TELE1: '0228',
      KK_TELE2: '0232', KK_NAME: 'Testkontakt' }] },
    row2: { ID: 22, ID_MANDANT: 4, STAMM: { KU_NAME: 'Anderer Mandant' } },
    row3: { ID: 23, ID_MANDANT: 0, STAMM: { KU_NAME: 'Gesperrt', KU_GESPERRT: '1' } },
  };
  const fetcher = async url => {
    assert.equal(url.searchParams.get('type'), 'KundeList');
    assert.equal(url.searchParams.get('lastID'), '0');
    return Response.json(payload);
  };
  const result = await customerPage(fetcher, auth, '0');
  assert.deepEqual(result.customers.map(row => row.source_id), ['21']);
  const fields = result.customers[0].fields;
  assert.equal(fields.email, 'valid@example.invalid');
  assert.equal(fields.street, 'Dorfstraße');
  assert.equal(fields.house_no, '18a');
  assert.equal(fields.country, 'Deutschland');
  assert.equal(fields.juprowa_number, '00-123');
  assert.equal(fields.juprowa_contacts[0].mobile, '0123');
  assert.ok(!JSON.stringify(result).includes('exclude-from'));
  await assert.rejects(customerPage(fetcher, auth, null), error => error.code === 'customer_scope');
});

test('worksheet details are read inside the allowed scope and exclude prices and raw signatures', async () => {
  const row = { ID: 4, AK_AUFSTATUS: 2, ID_MANDANT: 0, AK_SCHEINNR: 'S-02',
    AK_ARBEITEN: 'Fiktive Arbeiten', WORKTIMES: [{ AZ_DATUM: '2026-11-11', AZ_WORK_BEG: '08:25', AZ_WORK_PAUSE: 15 }],
    POSITIONS: [{ AP_KT1: 'Bauteil', AP_MENGE: 3, AP_VKPREIS: '123.45' }],
    SIGNATURE_DATA: 'image/jsignature;base30,bytesfixture', MEDIAFILES: [{ ID: 3, URL: 'https://example.invalid' }],
  };
  const fetcher = async () => Response.json([row]);
  const detail = await worksheetDetail(fetcher, auth, '0', '4');
  assert.equal(detail.times[0].breakMinutes, '15');
  assert.equal(detail.materials[0].quantity, '3');
  assert.equal(detail.attachmentCount, 1);
  assert.equal(detail.signed, true);
  assert.doesNotMatch(JSON.stringify(detail), /123\.45|bytesfixture|example.invalid/);
  await assert.rejects(worksheetDetail(fetcher, auth, '9', '4'), error => error.code === 'worksheet_missing');
});
