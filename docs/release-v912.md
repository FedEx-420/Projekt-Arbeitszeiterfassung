# v912 — tolerant article-name search

Catalog searches no longer require the exact spelling of an article name.
Existing case-insensitive partial matches and German umlaut normalization remain.
Alphabetic name terms of four to seven normalized characters allow one insertion,
deletion, substitution or adjacent transposition; longer terms up to 64 characters
allow two edits. Approximate partial compound names are included. This is spelling
similarity, not a synonym or product-equivalence recommendation.

Every entered term must still match. Short terms, article numbers, mixed codes
such as B16 and numeric dimensions are not fuzzily substituted. Only the mapped
article name and article number are searched, never supplier or price columns.
An article-number fragment remains an exact fragment match; leading zeros remain.

The same matcher is used for the streaming local catalog read, loaded live
preview, pagination and final selected-row preparation. The live input node is
preserved so typing does not close the keyboard. Matches are suggestions to
review: article names, identifiers and prices are not automatically corrected or
merged. Only confirmed selected matching rows enter the existing guarded v911
import. EK/VK mapping and all prior format/size/authorization limits remain.

Frontend-only release: no new SQL, schema, grants, invoice changes or account/data
migration. Existing historical records are not rewritten. Verification uses only
synthetic local catalogs and isolated browser/RPC fixtures; no claim of physical
iPhone testing or live-account/backend import is made.
