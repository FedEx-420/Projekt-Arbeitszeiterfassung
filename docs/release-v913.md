# v913 — saved-material search uses the catalog word matcher

The saved material-list search still used whole-phrase substring matching, while
catalog search already used the shared tolerant per-word matcher. As a result,
words separated by an article number or compound prefix were not found there.

Both searches now use the shared matcher: every query term can appear at a
different position and in a different order. The query `Berker Steckdose` matches
`Berker 47598989 Doppelsteckdose SCHUKO Abdeckpl.erh.BS Berker S.1 polarweiss`.
Saved-list mapping uses the stored catalog article number and retains optional
supplier search. Supplier matching remains literal per-term, not fuzzy, and is
enabled only by an explicit field mapping; the local catalog scan does not start
searching supplier or price columns. Existing v912 numeric/short-code safeguards
and name-only spelling tolerance remain.

Filtering hides existing cards without rerendering/replacing the live search
input. Company/manager checks, counts, edits, source identifiers, prices and
historical data remain unchanged. No automatic name replacement, merge, import
or new database/server installation. Isolated synthetic regression covers the
reported example in both reader and saved-list UI; no live-user account or
physical-device test is claimed.
