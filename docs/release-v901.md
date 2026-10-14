# Navigation v901

UI-only follow-up to v900, inspired by the private prototype's compact right-hand menu.

- Related destinations are grouped into Aufträge & Zeiten, Planung & Kalender and Büro.
- Every previously allowed route remains available. Existing menu permissions determine the links; grouping grants no access.
- Company and employee selectors sit below the header, with the actual signed-in identity always shown above.
- The menu opens without replacing the page: unsaved form values, signatures and search focus are not reset.
- Active destination, large touch targets, native expandable sections, Escape/outside-click closing and focus return.
- Dropdown is anchored to the right-hand button, bounded by viewport width and available height.
- Same Supabase project, auth/session storage, profiles, records, attachments and existing API/RPCs. No migrations or production data writes.
- Offline release cache advances to v901. Missing navigation bundle falls back to the existing menu for old cached HTML.

Checks: isolated JavaScript/DOM-controller tests, actual production role/menu integration tests and existing auth/report regression suites. Browser/mobile layout verification requires a connected browser; no enabled browser was available during this release.
