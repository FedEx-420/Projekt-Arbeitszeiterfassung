# Prüfstand v957: Artikelbilder und Suchgeschwindigkeit

## Umsetzung

- Öffentliche JUNG-Produktseiten werden anhand des Hersteller-Sitemaps gelesen. Die genaue Variante im Seitentitel muss zur URL passen; zusätzlich ist eine gültige GTIN erforderlich. Die Bildadresse muss aus dem Bildfeld derselben Produktseite und vom erlaubten Herstellerpfad stammen. Kein Zugriff auf private Kataloge oder Händlerkonten.
- Erste Ergänzung: 40 eindeutige JUNG-Produktreferenzen. Der öffentliche Index enthält damit 2.045 Einträge. Der bestehende automatische Aktualisierungslauf ergänzt künftig bis zu 60 weitere JUNG-Seiten pro Durchlauf, unter Beachtung der robots-Regeln und mindestens fünf Sekunden Abstand.
- Der Browser lädt den mitgelieferten Bildindex sofort und aktualisiert im Hintergrund. Eine verspätete lokale Antwort überschreibt keine bereits geladene Onlinefassung. Bereits vorhandene Materialkarten werden nach neuer Bildzuordnung aktualisiert.
- Bei fehlender GTIN ist für JUNG eine bestätigte Herstellerartikelnummer erforderlich. Leerzeichen in dieser Nummer dürfen unterschiedlich formatiert sein. Eine Großhändler-Bestellnummer wird nicht als Herstellerkennung interpretiert. Ungültige GTIN, widersprüchliche Kennungen und fremde Varianten liefern kein geratenes Bild.
- Lokale Artikelpakete werden mit einem begrenzten IndexedDB-`getAll` gelesen. Reihenfolge, Kataloggrenze, Fortsetzungsposition und Paketgröße bleiben erhalten. Kein Löschen oder Neuaufbau bestehender Kataloge nötig.
- Beim Einkauf wird die Trefferliste nur an relevanten Grenzen aufgebaut statt für jeden geprüften Katalogdatensatz. Metadaten und Merkmale werden während einer Suche wiederverwendet. Während der Eingabe verhindert die App unnötige vollständige Neuzeichnungen und deaktiviert alte Hinzufügen-Schaltflächen bis zur neuen Suche.

## Prüfungen

- `catalog-store-speed-v957.test.cjs`: 20.000 synthetische Artikel in echter Browser-IndexedDB; identische Reihenfolge und Anzahl, Katalogtrennung, Fortsetzung gespeicherter Auswahlen, ungültige Paketgrößen. Auf dem bisherigen Windows-Testgerät dauerte ein Vergleichslauf etwa 539 ms mit Einzel-Cursoraufrufen und 231 ms mit Paketabruf. Das ist eine Messung des reinen Lesens, keine Zusage für die gesamte App oder Händlerantwortzeiten.
- `image-sources-v957.test.cjs`: exakte JUNG-Zuordnung, falsche Variante/GTIN, nicht vertrauenswürdige Quelle, doppelte Kennung, sofortige lokale Bilder und verspätete Antworten.
- `jung-image-extractor-v957.test.py`: Hersteller-HTML mit exakten/abweichenden Kennungen, widersprüchlichen Metadaten und fremden Bildhosts; vollständig ohne Netzwerk.
- `purchase-catalog-pages-v952.test.cjs`: zusätzlich eine vollständige erfolglose Katalogsuche, die weniger als 20 Sortieraufrufe benötigt; keine erneute Sortierung für jeden gescannten Datensatz.
- Bestehende vollständige Browserabläufe für Online-Suche, Lagerbestände vor Auswahl, strenge Serie/Farbe, Katalogimport aller passenden Artikel, Wiederaufnahme und Kontotrennung sowie Ansichten bei 320/390/1366 Pixeln.

Es wurden keine echten Bestellungen oder Produktionsrechnungen für diese Prüfungen erstellt. Fotos für weitere Hersteller, messbare Verbesserungen anderer App-Bereiche, ein aktueller vollständiger iPhone-Live-Test sowie die Cloudablage privater Originalkataloge bleiben offen.
