# Browser-only receipt OCR

Pinned, locally served runtime assets: Tesseract.js 6.0.1 (Apache-2.0),
Tesseract.js-core 6.0.0 (Apache-2.0), German and English trained data from
@tesseract.js-data/deu and /eng 1.0.0 (MIT packages / Tesseract model data).
Sources: https://github.com/naptha/tesseract.js and
https://github.com/naptha/tesseract.js-core and
https://github.com/naptha/tessdata . See LICENSE-tesseract.txt.

Assets are downloaded from exact-version jsDelivr npm URLs during preparation,
not from a floating "latest" version. Recognition and image processing run
locally in a worker. No image is sent to an OCR provider. Only explicit receipt
save uploads the original to the user's private Supabase storage. OCR estimates
must be reviewed; no recognized item creates a material catalog entry.

The runtime loads only when requested, not at login or service-worker install.
