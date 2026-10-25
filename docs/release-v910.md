# v910 — reviewed supplier catalogs and material prices

This source-only release retains the existing database, accounts and finalized
financial records. It uses the already installed v908 material-price/import RPCs.
No catalog file or receipt is automatically uploaded or imported.

## Catalog workflow

- Local DATANORM 4 (.001 etc.), ZIP32 (Store/Deflate), CSV/TSV/TXT, JSON, XLSX and BMEcat XML reading.
- Streaming DATANORM/delimited preview and search, at most 1000 articles per batch;
  20 editable articles per UI page. Next batch is explicit. No claim of a full
  background import. Partial ZIP previews have not verified the whole-file CRC.
- Explicit supplier, column meaning, price unit and final EUR-net confirmation.
  DATANORM list/net price kinds are not the VAT distinction. Discounts, copper,
  formulas, time-dependent prices and unsupported price types are not guessed.
- Missing values can be entered, articles excluded, and duplicate descriptions
  optionally distinguished by appending the SKU on an explicit button click.
  SKU leading zeros are preserved; unsafe numeric IDs require text correction.
- Matching uses supplier plus exact SKU and a captured record revision. Same-name
  collisions, stale previews and invalid rows fail before the final batch write.
- A separate confirmation imports only reviewed structured fields. Existing
  standard selling prices and historical invoices remain untouched. New articles
  start at standard selling price 0 EUR, not an invented EK-to-VK conversion;
  that standard net selling price must be consciously set in the material list.

File safety limits: 2 GiB input/inflated ZIP contents; no encrypted/multidisk/ZIP64
archives, extraction to disk, external XML entities or executable formulas. JSON,
XML and XLSX structures have smaller bounded limits. DATANORM 3/5, standalone
DATPREIS/rabatt files, binary XLS, ODS and PDF/image catalogs require a supported
supplier export. PDF receipts still use the separate existing receipt scanner.
Browsers without local raw-Deflate support must select an unpacked catalog.

## Material and offer editing

Material cards expose article number, supplier, EK, VK * and VK **; metadata is
editable through the existing scoped editor. Standard selling-price fields are
clearly net-only, with a read-only gross reference at 19% (the actual invoice VAT
remains an explicit invoice decision). A local saved-material search keeps focus.
Offer price sliders use a fine band anchored to the selected price. Exact number
inputs remain available. Postal-address fields fit the checked phone/desktop sizes.
Historical gross-based offers are converted only in a cloned edit draft with a
visible warning; persisted originals remain unchanged until explicit saving.

## Verification limits

Disposable PostgreSQL, pure-reader and local-browser tests cover normalization,
price identity, atomic import, role/company scope, missing-value review, cancellation,
stale responses, viewport bounds, focus and offer lifecycle. A bounded large local
DATANORM ZIP sample was read and validated without upload or storage. No physical
iPhone certification, live-account catalog import or universal OCR claim is made.
