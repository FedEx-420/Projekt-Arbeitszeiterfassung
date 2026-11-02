# Availability before article selection (v952)

Both material browsing and purchasing search use the same company/account/supplier/warehouse-scoped connection and stock cache. A confirmed positive stock is ranked before unknown stock, then zero stock. Zero-stock offers are hidden by default; unchecking the existing filter includes them below confirmed stock. Missing or failed stock is never treated as positive.

Availability badges appear before the add-to-purchase button, with quantity, selected warehouse and check time. Stock is not a reservation. The existing confirmed-cart transfer is unchanged.

Matching imported materials are considered before pagination, so available items beyond the original first page can fill the first page. Saved catalog candidates can be queried without importing them, through authenticated `stock_catalog` calls. Local catalog discovery continues in small batches until enough confirmed stock is found for the page or matching sources are exhausted. Further pages extend the search. Exact article numbers still use the local catalog index.

The stock edge function retains caller/company authorization, an owner-bound encrypted merchant session, fixed merchant origins and read-only merchant operations. Both material and catalog batches are limited to 20 candidates. Each upstream stock response is mapped to exactly one SKU; at most three upstream requests run concurrently. There is no new database schema or stock-driven material import.

Verification: full-app fixtures cover stock beyond the first page, raw catalog stock after 40 unavailable candidates, badge order before Add, connection reuse, warehouse changes, truthful unknown states, pagination and exact catalog IDs beyond 1000, stale-query/account replies, no password persistence by default and mobile layouts. These fixtures do not place real orders or modify production data. Stock connection and live inventory still depend on the wholesaler login and API response.
