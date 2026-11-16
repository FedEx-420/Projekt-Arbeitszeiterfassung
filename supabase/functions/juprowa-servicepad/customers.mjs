import { requestPortal, ServicepadError } from './portal.mjs';

const pageSize = 400;
const identifier = value => /^[1-9]\d{0,14}$/.test(String(value ?? ''));
const text = (value, max = 160) => ['string', 'number'].includes(typeof value)
  ? String(value).replace(/[\x00-\x1f\x7f]+/g, ' ').trim().slice(0, max) : '';
const emails = value => text(value, 254).split(/[;, ]+/).find(part => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(part)) || '';

export async function customerPage(fetcher, auth, customerMandantId, cursor = '0') {
  if (customerMandantId == null) throw new ServicepadError('customer_scope', 422,
    'Für diesen Mandanten konnte die Kundenfreigabe aus ServicePad nicht eindeutig ermittelt werden.');
  if (cursor !== '0' && !identifier(cursor)) throw new ServicepadError('customer_cursor', 400,
    'Diese Kundenseite ist ungültig.');
  const raw = await requestPortal(fetcher, 'KundeList', auth, { lastID: cursor, limit: pageSize, lastSaved: '' });
  const error = () => new ServicepadError('customer_reply', 502,
    'ServicePad hat keine gültige Kundenliste geliefert.');
  if (!raw || typeof raw !== 'object') throw error();
  const page = Object.values(raw);
  if (page.length > pageSize + 1 || page.some(row => !identifier(row?.ID))) throw error();
  // ServicePad uses the extra row as the continuation marker and includes it
  // in the current page. Preserve its ID even when it belongs to another scope.
  const last = page.length > pageSize ? String(page.at(-1).ID) : null;
  if (last && Number(last) <= Number(cursor)) throw error();
  const customers = new Map();
  for (const row of page) {
    const scope = row.ID_MANDANT == null || row.ID_MANDANT === '' ? '0' : String(row.ID_MANDANT);
    if (scope !== customerMandantId) continue;
    const customer = mapCustomer(row);
    if (customer) customers.set(customer.source_id, customer);
  }
  return { customers: [...customers.values()], next: last };
}

function mapCustomer(row) {
  const master = row.STAMM;
  if (!master || typeof master !== 'object') return null;
  // Locked or archived customers must not generate new active customers.
  if (['1', 'true', 'ja'].includes(text(master.KU_GESPERRT).toLowerCase())) return null;
  const name = text(master.KU_NAME) || [master.KU_NAM1, master.KU_NAM2].map(part => text(part)).filter(Boolean).join(' ');
  if (!name) return null;
  const sourceStreet = text(master.KU_STREET);
  const split = /^(.+?)\s+(\d+[\wäöüÄÖÜ]*(?:\s*[-/]\s*\d+[\wäöüÄÖÜ]*)?)$/u.exec(sourceStreet);
  const contacts = Object.values(row.CONTACTS ?? {}).slice(0, 40).filter(contact => contact && typeof contact === 'object')
    .map(contact => Object.fromEntries(Object.entries({
      name: text(contact.KK_NAME),
      email: emails(contact.KK_EMAIL),
      phone: text(contact.KK_TELE1, 80),
      phone_2: text(contact.KK_TELE2, 80),
      phone_3: text(contact.KK_TELE3, 80),
      mobile: text(contact.KK_MOBILE, 80),
      fax: text(contact.KK_FAX, 80),
      note: text(contact.KK_VERMERK, 500),
    }).filter(([, value]) => value)));
  const primary = contacts.find(contact => contact.email || contact.phone || contact.mobile) ?? {};
  const country = text(master.KU_COUNTRY) || text(master.KU_LCODE, 40);
  const fields = Object.fromEntries(Object.entries({
    street: split?.[1] || sourceStreet,
    house_no: split?.[2] || '',
    postal_code: text(master.KU_ZIP, 30),
    city: text(master.KU_CITY),
    country: country === 'D' ? 'Deutschland' : country,
    email: primary.email,
    phone_private: primary.phone,
    phone_mobile: primary.mobile,
    phone_office: primary.phone_2,
    fax: primary.fax,
    contact_name: primary.name,
    juprowa_number: text(master.KU_NUMMER, 80),
    juprowa_title: text(master.KU_TITEL, 80),
    juprowa_name_addendum: text(master.KU_NAM3),
    juprowa_contacts: contacts.filter(contact => Object.keys(contact).length),
  }).filter(([, value]) => value?.length));
  return { source_id: String(row.ID), name: name.slice(0, 160), fields };
}
