# Invoice tax decisions and employee workweeks v905

## Invoice PDF

Every invoice preview now first requires an explicit price basis (net or gross), tax treatment and operator confirmation. Available treatments are 19% (§ 12(1) UStG), 7% (§ 12(2)), qualifying PV zero rating (§ 12(3)), small-business exemption (§ 19(1)), reverse-charge construction services (§ 13b(2) no. 4 and (5), invoice wording § 14a(5)), or another precisely stated exemption. Nonstandard treatments require a written explanation of eligibility/evidence; another exemption requires its exact legal basis. Per-position overrides support mixed invoices. Help contains official law links and the BMF PV FAQ. Eligibility is never inferred from customer/material names, subsidies or a selected dropdown.

Actual PDFs show net amount, tax amounts/rates, gross amount, per-rate net bases on mixed invoices and applicable legal wording/explanations. Net/gross entry is explicitly distinguished and rounded per position to cents. Existing source prices and invoice/work-order state are not changed by calculating, previewing or downloading. Each new PDF requires a new checked decision; existing downloaded documents are not rewritten. Work reports are explicitly identified as non-invoices. This is not individualized tax advice, a legal-compliance guarantee or an implementation of structured e-invoicing obligations. Legal references checked on 2026-10-16; laws/eligibility must be rechecked for the actual transaction.

Official references:

- https://www.gesetze-im-internet.de/ustg_1980/__12.html
- https://www.gesetze-im-internet.de/ustg_1980/__19.html
- https://www.gesetze-im-internet.de/ustg_1980/__13b.html
- https://www.gesetze-im-internet.de/ustg_1980/__14a.html
- https://www.gesetze-im-internet.de/ustg_1980/__14.html
- https://www.bundesfinanzministerium.de/Content/DE/FAQ/foerderung-photovoltaikanlagen

## Regular working days

The responsible business account can select Monday through Sunday for each employee in Settings, with an effective-from date. Administrators see the setting read-only; employees and foreign companies cannot change it. Prior schedules remain effective for prior periods. Without a schedule the default is Monday-Friday. This does not automatically convert annual leave allowance. Existing daily due hours are retained (8h, Friday 5h); selected weekend workdays use 8h.

Calendar, pending/approved leave badges, remaining leave, report absence totals and new leave requests use the same eligible dates: scheduled working days without NRW holidays or recorded sickness. Overlapping leave is deducted once, manual half-day values are preserved, and year boundaries are split. All NRW holidays remain visible for information; holiday sums count only scheduled working days. No empty day creates minus hours. Existing requests/dates are retained rather than deleted or rewritten. Changing a schedule recalculates the displayed account for its effective period.

The additive workweek table is protected by RLS and tenant-scoped write policies. A narrow authenticated summary RPC is SECURITY INVOKER, explicitly checks profile access and is unavailable anonymously. Existing calendar helpers remain date-based across years. Existing data rows in 35 original tables were hash-checked unchanged during activation. An encrypted private pre-change snapshot was round-trip verified. No authentication credentials were changed. Existing security-advisor warnings were unchanged (six before/after; no new warnings).

The vacation edge handler now uses the database summary instead of hardcoded 2026 weekdays/holidays; existing JWT verification remains enabled. Notification context is restricted to the employee's company. The new workweek table participates in the existing revision-based sync.

## Verification

Synthetic tests cover tax arithmetic, reasons/confirmation, mixed rates, direct PDF output, workweek/history/RLS, requests, calendar/report/remaining leave and edge-handler company checks, plus existing auth/device/navigation/report regressions. Six rendered tax-example PDFs (10 pages) passed text, totals, legal-note and page-bound checks and visual review. Mobile browser checks verified missing-field highlighting, PV help, PDF generation/download and Friday-Monday leave without weekend badges. The native confirmation used in an early isolated save test blocked browser automation; the redundant confirmation was removed, leaving the explicit Save button and explanatory text. Actual-device testing and a complete browser-driven schedule-save cycle were not verified. Production has not been used for synthetic leave or schedule inserts.
