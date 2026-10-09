# Locally served PDF.js runtime

PDF.js 6.4.299, Mozilla's pinned stable release, Apache-2.0. Legacy browser
build and matching worker, CMaps, standard fonts and image-decoding support.
The npm archive's SHA-512 integrity was verified before extraction.

Source: https://github.com/mozilla/pdf.js/releases/tag/v6.4.299
Package: https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-6.4.299.tgz
Integrity: sha512-AVl138zALtfaAPvADulE0PZThbYzCBS79nL4pOSL/6Sm/4AH5A21BD9VHt97OlCuzJuCpmeZtAtkinisF4Vb1g==

Receipt PDFs are read locally. Embedded text is extracted, and scanned pages
are rendered locally for existing Tesseract OCR. No PDF scripting or external
OCR provider is used. The original is uploaded privately only on explicit Save.
Support files load on demand, not at login or service-worker installation.
