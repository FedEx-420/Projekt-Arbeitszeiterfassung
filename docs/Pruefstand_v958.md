# Prüfstand v958: WAGO-Bilder, breitere JUNG-Auswahl und schnellere Suchvorschläge

## Artikelbilder

- WAGO als zusätzliche öffentliche Herstellerquelle angebunden. Die genaue Herstellerartikelnummer muss in `mpn`, `sku`, Produkt-URL und dem strukturierten Produktdatensatz derselben Seite übereinstimmen. Zusätzlich ist eine gültige GTIN erforderlich.
- Nur ausdrücklich im Produktdatensatz verlinkte Bilder vom WAGO-Medienpfad werden übernommen. Dessen öffentlicher `context`-Parameter wird unterstützt; fremde Hosts, zusätzliche Parameter, widersprüchliche Produktblöcke und ungültige Kennungen werden abgewiesen. Keine Ableitung von Herstellerkennungen aus Großhändlernummern.
- Erste Ergänzung: 26 WAGO-Produktreferenzen, darunter 221-412. Das echte Bild von 221-412 wurde mit dem gleichen Referrer-Verhalten wie in der App im Browser geladen und dekodiert (200 × 200 Pixel).
- JUNG-Sammlung um 40 weitere geprüfte Referenzen erweitert; insgesamt 80 JUNG-Einträge. Häufige Standardartikel wie LS 1520 WW, LS 1520 SW, AS 1520 WW und A 1520 WW werden bevorzugt. Anschließend werden unterschiedliche Produktgruppen abwechselnd berücksichtigt, damit nicht zuerst ausschließlich Steckdosenvarianten gesammelt werden.
- Öffentlicher Bildindex nach dieser Ergänzung: 2.111 Einträge. Das ist keine Zusage, dass jeder private Katalogartikel bereits ein Foto hat: Die Kennungen müssen eindeutig passen. Vorhandene Artikel und Online-Treffer verwenden denselben Bildindex.
- Ein unbrauchbarer eigener Bildlink blockiert kein eindeutig zugeordnetes Herstellerbild mehr. Gültige, ausdrücklich gespeicherte Materialbilder behalten Vorrang.
- Automatische Hersteller-Aktualisierung um WAGO und die breitere JUNG-Auswahl ergänzt. Robots-Regeln und festgelegte Abrufabstände werden berücksichtigt. Fehlende Fotos werden nicht durch ähnliche Artikel ersetzt.

## Suchgeschwindigkeit

- Wiederholte Normalisierung identischer Suchtexte/Herstellerangaben wird durch einen begrenzten Cache vermieden. Es werden ausschließlich reine Textumwandlungen zwischengespeichert, keine Artikel- oder Kontotreffer. Lange Texte werden nicht im Cache gehalten; geänderte Artikelnamen werden erneut ausgewertet.
- Eine bisher ungenutzte vollständige Textnormalisierung vor dem technischen Abgleich entfällt.
- Bereits durch Suchtext, Serie, Farbe und andere aktive Merkmale gefilterte Vorschläge müssen nicht erneut denselben technischen Filter durchlaufen. Die öffentliche Hilfsfunktion filtert ungeprüfte Eingaben weiterhin standardmäßig. Die Einkaufsansicht prüft ergänzte Katalog-/Online-Vorschläge vor diesem verkürzten Weg ausdrücklich erneut.
- Lokaler Vergleich mit 6.000 synthetischen Artikeln und drei Vorschlagsdurchläufen: bisher etwa 1.902 ms, optimiert etwa 747 ms; beide Läufe ergaben 4.500 passende Artikel. Das ist eine Messung dieses Such-/Vorschlagsablaufs und keine Garantie für die gesamte App oder Händlerantwortzeiten.

## Prüfung

- `wago-images-v958.test.py`: exakte Herstelleridentität/GTIN, abweichende Varianten, widersprüchliche Produktblöcke, Bild-Hosts/-Parameter sowie die bevorzugte und gemischte Quellenauswahl.
- `wago-display-v958.test.cjs`: neue Bildquelle im Client, GTIN/Herstellerartikelnummer, keine Großhandelsnummern-Heuristik, fehlende/ungültige Daten, doppelte Bilder und tatsächlich gesammelte Referenz 221-412.
- `search-speed-v958.test.cjs`: ausdrücklich erwartete Treffergruppen bei 1.200 Testartikeln, Rangfolge/Suchvorschläge, technische Filter, genaue Kennungen, Unicode, Cache-Verdrängung und geänderte Artikelnamen. Keine Git-Historie oder Produktionsdaten erforderlich.
- Bestehende vollständige Browserprüfungen: Material-/Online-Suche mit strenger S.1-/Farbauswahl, Lagerbestand vor Übernahme, Katalogseiten über 1.000 Artikel und verspätete Antworten. Kleine und große Ansichten bei 320/390/1366 Pixeln bleiben geprüft.

Keine Produktionszugänge, echten Bestellungen oder Produktionsrechnungen für diese Tests verwendet. Zusätzliche Hersteller, weitere Produktgruppen und die vollständige Browserprüfung der neuen Cloud-Instanz bleiben offen.
