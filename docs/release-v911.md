# v911 — search before catalog import and automatic price assignment

The catalog can be searched by article name and supplier article number before
anything is saved. Enter or the search button scans the local file, including
rows outside the current bounded excerpt. Typing filters the loaded preview
immediately without replacing the search input or closing the keyboard. Paging
uses filtered source indices. Only selected matching rows, including matching
rows on other preview pages, enter the final confirmed import. Hidden rows are
excluded. The original catalog file is not uploaded or modified.

Recognized EK, VK *, VK ** columns are applied automatically and remain separate.
DATANORM final supplier-net and BMEcat net_customer map to EK. A separate explicit
rule can use the supplier list price as VK *; it is not assumed to include the
user's purchasing discount. Unknown/missing prices stay empty, and gross prices
are never copied as net. Price-unit conversion happens once, preserving up to
four decimal places and leading-zero article numbers. Optional column overrides
and missing-value corrections remain available before confirmation.

## Standard selling price and server prerequisite

The user selected VK * as the normal net selling price for future offers and
invoices. The new opt-in `import_material_catalog_v911` endpoint stores EK and both
VK values, then applies a supplied VK * to the standard price in the SAME database
transaction. Existing EK-only updates preserve the prior standard price. New
materials require an explicit VK *; a missing price never silently becomes zero.
The existing v908 endpoint is unchanged for older clients.

Install `20261025172307_catalog_vk1_default_v911.sql` ONCE before activating this
frontend. Installation only adds the guarded invoker function, does not rewrite
stored records, and does not change material RLS/policies. The endpoint preserves
company authorization, revision checks, exact supplier/SKU identity, protected
hourly items and atomic rollback. An exact retry is idempotent; an old/blind retry
cannot overwrite a later manually changed standard price. Historical finalized
invoices and work/time snapshots are not rewritten. No agent live database
access, SQL execution or production catalog import is implied by this release.

If the earlier v911 setup was already installed, do NOT replay its CREATE file.
The separate forward repair `20261025223014_catalog_reserved_name_guard_v911.sql`
checks the installed source and security metadata and upgrades only the known
original body to the reviewed protected-name guard. Already-current source is a
no-op; unknown definitions are rejected. Activation requires its persisted
`protected_hourly_names_guarded` result. It does not rewrite existing catalog or
invoice data and does not change grants, policies, or account records.

Local tests cover pure reader/mapping/search, real browser focus/filter/paging at
phone and desktop widths, role/company reset, actual disposable PostgreSQL/RLS,
VK precision/zero/missing semantics, old-client compatibility, stale revisions and
financial-history regression. No physical-iPhone or real-user E2E claim is made.

Format and safety bounds remain as documented in v910: DATANORM 4, ZIP32,
CSV/TSV/TXT, JSON, XLSX and BMEcat; bounded explicit batches of 1000, no universal
DATANORM 3/5 or PDF/image-catalog OCR support, no invented supplier discounts.
