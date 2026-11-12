const day = 86400000;
const fileHash = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
  .map(n => n.toString(16).padStart(2, '0')).join('');

export async function scanSupplier(job, portal, rpc, upload, now = Date.now) {
  const deadline = now() + 55000;
  const cursor = {
    from: new Date(now() - 45 * day).toISOString(),
    to: new Date(now() + day).toISOString(),
    page: 1,
    row: 0,
    document: 0,
    issue: null,
    ...job.cursor_data
  };
  const scope = {provider: job.provider, account_id: job.account_id, lease: job.lease};
  const act = (op, data) => rpc(op, {...scope, ...data});
  const listing = await portal.page(cursor.page, cursor.from, cursor.to);
  let added = 0;
  let processed = 0;
  while (cursor.row < listing.rows.length && now() < deadline && processed++ < 12) {
    const row = listing.rows[cursor.row];
    const documents = await portal.documents(row).catch(error => {
      if (error.code !== 'document') throw error;
      cursor.issue = 'document';
      return [];
    });
    while (cursor.document < documents.length) {
      if (now() >= deadline) return {result:'continue', cursor, added};
      const document = documents[cursor.document++];
      try {
        const {document_key, document_type, number, related_invoice_number, date, file_name, totals} = document;
        const metadata = {document_key, document_type, number, related_invoice_number, date, file_name, totals};
        if ((await act('known', metadata)).ready) continue;
        const bytes = await portal.download(document);
        const file_sha256 = await fileHash(bytes);
        const reserved = await act('reserve', {...metadata, file_sha256});
        if (reserved.ready) continue;
        await upload(reserved.path, bytes);
        await act('complete', {document_key, id:reserved.id, file_sha256});
        added++;
      } catch (error) {
        // Preserve the rest of the import if the portal cannot supply a particular file.
        if (error.code !== 'document') throw error;
        cursor.issue = 'document';
      }
    }
    cursor.row++;
    cursor.document = 0;
  }
  if (cursor.row < listing.rows.length) return {result:'continue', cursor, added};
  if (listing.more) return {result:'continue', cursor:{...cursor, page:cursor.page + 1, row:0}, added};
  if (cursor.issue) return {result:cursor.issue, cursor:{}, added};
  return {result:'complete', cursor:{}, added};
}
