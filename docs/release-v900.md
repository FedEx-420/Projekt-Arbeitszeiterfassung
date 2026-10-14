# v900: new presentation, original data backend

## Preservation strategy

Keep the existing GitHub Pages URL/origin, Supabase project, Auth identities,
profile IDs, database records and Storage objects. No private test-Site data or
synthetic identities replace production accounts. Do not upload backup archives,
CLI profiles, authentication/session information or other private task outputs
to the public repository.

The old application workflow and API contracts remain in place. The change adds
the new dark/mint presentation, responsive company identity, field-level help,
founder price administration and company-scoped legal drafts.

## Additive backend changes

- Creator policy migration: applied and verified separately. One pinned existing
  administrator is the free founder. Existing firms are protected at zero EUR.
  Future firms receive a fixed price snapshot. No automatic billing is enabled.
- Company documents migration: activated for the requested production release.
  Two additional tables, RLS, invoker write RPCs, bounded versioned content and
  append-only document history. Employees see only the current released version
  of their own company. Private form data and drafts stay manager-only.
  All 33 checked pre-existing tables stayed unchanged. The provided private
  operator information and six unreviewed drafts were initialized; no legal
  approval or contract was fabricated. Real-role tests were rolled back.
  Operator contact details remain in authenticated documents, not public source.
- The narrow non-exposed latest-release lookup is SECURITY DEFINER because an
  employee must not gain SELECT access to drafts or private form data. It checks
  auth.uid and employee/company membership, has a fixed empty search_path, and
  exposes only a boolean. It is not a public Data API endpoint.

These changes do not modify passwords, recreate accounts or migrate original
working records. Legal drafts are not signed agreements, a certified archive,
GoBD certification or an automatic legal/production approval.

## Release gate and rollback

1. Confirm that remote main still matches the candidate's parent before commit.
2. Capture an encrypted current database snapshot and verify the file inventory.
3. Apply only authorized additive schemas using a before/after original-content
   guard inside one transaction, then verify real-role isolation and advisors.
4. Verify source/session/team/planning/offer/device regressions and mobile UI.
5. Keep the exact original parent commit as the reversible frontend baseline.
6. Publish only reviewed source files, never private task tools or data.
7. Confirm the Pages deployment and actual public assets before providing a
   completed-release link.

Release evidence: refreshed encrypted logical backup covering 74 tables and all
13 Auth users; typed recovery of 2,003 rows and 350 constraints passed; all ten
original files encrypted and content-hash verified. Security advisors retained
the same six pre-existing warnings with zero new warnings from either addition.
Backups and detailed private manifests are not part of this public repository.

Rollback is a normal reviewed revert of the v900 frontend commit, with a fresh
service-worker cache version. Never use git reset --hard, force-push, delete
original records or drop the new tables as a frontend rollback. The previous
frontend ignores these additive tables and continues using original contracts.
New legal drafts and founder/free-account protections are retained.

## Verification limits

Synthetic tests and typed snapshot/constraint recovery are not a full restored
Supabase-service/Edge-Function/external-device drill. Push, OwnTracks and actual
iPhone permissions require device-side testing; browser viewport checks do not
replace that. Existing security advisor warnings must be reported separately,
not hidden or called a clean security audit.
