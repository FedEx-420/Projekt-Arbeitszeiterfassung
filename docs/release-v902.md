# iPhone header safe area v902

CSS-only correction for the header hidden behind the Dynamic Island in an installed iPhone PWA.

The existing viewport-fit=cover/black-translucent setup stays intact. Header top padding now adds env(safe-area-inset-top) to the original spacing. Left/right padding respects landscape insets; the banner background still fills the status bar. No body-level padding is added, avoiding a double inset. Keyboard focus scroll and the last menu controls also respect safe zones.

Existing menu, application scripts, backend, records and login/session storage are unchanged. Static cache advances to v902 and includes the last-loaded safe-area stylesheet. No backend requests or migrations.

Reference: https://webkit.org/blog/7929/designing-websites-for-iphone-x/

Validation: safe-area CSS contracts/arithmetic for portrait, landscape and zero-inset devices; existing navigation and presentation tests. No enabled browser/iPhone was available for a visual device test.
