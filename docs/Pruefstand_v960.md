# Prüfstand v960: automatische Gira-Bilder und Berker/Hager-Grundgeräte

Stand: 03.11.2026.

- Neue öffentliche Herstellerquelle: Gira. 40 zusätzliche Referenzen aus dem deutschen Produktkatalog. Der strukturierte Product-Datensatz muss Marke, gültige GTIN, identische `mpn`/`sku`, genaue Produkt-URL und ausdrücklich verlinktes Produktfoto gemeinsam bestätigen. Ähnliche oder verwandte Produkte im Datensatz werden nicht als Zuordnung verwendet.
- Gira-Fotos werden nur vom bestätigten Herstellerpfad `media.gira.de/katalog/zoom4/<Artikelnummer>.jpg` ohne Query/Fragment zugelassen. Produkt-URL und Bildnummer müssen dieselbe Herstellerartikelnummer enthalten. Die gedruckte Schreibweise „0106 00“ kann bei ausdrücklich vorhandener Gira-Herstellerkennung als „010600“ aufgelöst werden; führende Nullen bleiben erhalten. Eine Großhändlernummer ersetzt dieses Feld nicht.
- Berker/Hager um 53 Referenzen erweitert. Grundgeräte wie Wechsel-/Kreuzschalter und Taster sowie weitere Produktgruppen werden abwechselnd berücksichtigt, statt zunächst fast nur Steckdosenvarianten abzuarbeiten.
- Einige Herstellerseiten weisen eine interne SKU neben einer anderen ausdrücklichen Herstellerreferenz aus. Die Sammlung entfernt keine Kennungszusätze blind: Die sichtbare `product-commercial-ref`, der Product-Name, Produkt-URL und die eindeutige Seiten-EAN müssen die genaue Referenz gemeinsam bestätigen. Widersprüche oder mehrere Referenzen/GTINs verhindern eine Übernahme.
- Berker 3036 ist ausdrücklich auf der weiterhin öffentlichen Herstellerseite bestätigt, obwohl diese ältere Seite nicht mehr in der aktuellen Sitemap steht. Die Sammlung prüft diese bestätigte Quelladresse ebenfalls. Fotos bleiben der exakten Kennung/GTIN zugeordnet; das Hager-Nachfolgeprodukt WDE3036 behält seine andere Kennung und GTIN. Aus einem Foto folgt keine Lieferbarkeit.
- Frühere erfolglose Parserprüfungen ohne Bild können mit dem verbesserten Parser erneut geprüft werden. Danach gilt wieder das reguläre Aktualisierungsintervall, damit dieselben nicht verwertbaren Seiten nicht jeden Lauf blockieren.
- Insgesamt 2.204 öffentliche Bildreferenzen, 93 mehr als vorher (40 Gira, 53 Berker/Hager). Bestehende Artikel und alle gemeinsamen Artikelansichten verwenden den erweiterten Index automatisch bei exakter Kennung. Weitere Hersteller und eine flächendeckende Fotoabdeckung bleiben offen.
- GitHub-Aktualisierung um Gira erweitert; die begrenzten Abrufe halten Robots-Regeln und Abrufabstände ein. Das Laufzeitlimit berücksichtigt die zusätzliche Quelle. Private Kataloge, Geschäftskonten und Einkaufspreise werden nicht für diese Sammlung gelesen oder veröffentlicht.

## Prüfung

- `manufacturer-images-v960.test.py`: sieben isolierte Tests zu Gira-Identität/GTIN, falschen Varianten/Bildadressen, doppelten widersprüchlichen Product-Datensätzen, expliziter Berker-Referenz, fehlenden Bestätigungen, Auswahl unterschiedlicher Gruppen und erneuter Prüfung alter Parser-Misserfolge.
- `manufacturer-display-v960.test.cjs`: Client-Zulassung für Gira, gedruckte Nummernschreibweise, führende Nullen, kein Rückgriff auf Händlernummern, unveränderte Artikelnamen sowie tatsächlich gesammelte Gira-/Berker-Grundgeräte.
- Echte Bilddateien im isolierten Browser geladen/dekodiert: Gira 310600 mit 412 × 412 Pixeln und Berker 3036 mit 2.160 × 2.160 Pixeln. Nachweisbild liegt außerhalb des öffentlichen Repositorys; keine Geschäftsdaten verwendet.
- Bestehende WAGO-/JUNG-Extraktions- und Bildzuordnungstests bleiben erfolgreich; die CI führt auch die bisherigen Such-/Favoriten-/Lager-/Rechnungs-/Warenkorbfixtures aus. Keine realen Bestellungen, Produktionsrechnungen oder Geschäftsdatenänderungen für diese Arbeit.

Quellen: [Gira 310600](https://katalog.gira.de/de-DE/datenblatt/310600), [Gira 010600](https://katalog.gira.de/de-DE/datenblatt/010600), [Berker 3036](https://hager.com/de/katalog/produkt/3036-wechselschalter-10ax-250v), [Hager/Berker-Katalog](https://hager.com/de/katalog/).
