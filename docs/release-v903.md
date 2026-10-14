# Document preview controls v903

Replaces two overlapping preview toolbars with a single fixed, viewport-wide, safe-area-aware toolbar. On phones, two large back/print buttons appear above the explanatory text. The popup receives a mobile viewport. Actual toolbar height is measured, including rotation or status text changes; the paper gets matching screen-only spacing. Print media hides the controls and removes that spacing.

Invoice preview no longer overwrites window.print with a no-op. A print click focuses the preview, then calls the browser's native print method synchronously, preserving the user gesture. Repeated setup cannot capture a no-op or attach duplicate controls. Errors and unavailable printing show an iPhone Safari/Share/Print fallback instead of failing silently.

Invoice HTML, prices, execution details and PDF document layout remain unchanged. Preview/printing does not mark any work order as invoiced. No backend requests or data/account changes.

Checks: isolated synthetic preview controller/CSS tests, previous navigation/safe-area/presentation tests, auth and time-account model regressions. Physical iPhone/AirPrint verification was unavailable because no enabled browser/device was connected.
