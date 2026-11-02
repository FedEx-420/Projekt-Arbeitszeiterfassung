# Working on Arbeitszeiterfassung

## Code Review Rules

- Preserve company and employee boundaries. Authorize using the authenticated identity and authoritative company membership; keep RLS and existing server checks. Never expose account credentials, private catalogs or service keys in client assets, logs, fixtures or commits.
- Preserve issued documents and exact prices. Invoice preparation, tax review, supplier selection and finalization must use the same net prices and source revisions. Retries must return the same invoice/cart result, and billed work orders must stay locked. Single-worker overlaps are allowed across work orders; multi-worker conflict and absence checks remain enforced.
- Keep article identity and merchant claims exact. A wholesaler SKU is not automatically a manufacturer SKU. Do not merge merely similar names or infer photos, German approval, positive stock or successful cart transfer from missing/ambiguous data. Stock must match the selected account, supplier, SKU and warehouse; transfer success requires a cart readback. Test using isolated fixtures without placing real orders or creating production invoices.
