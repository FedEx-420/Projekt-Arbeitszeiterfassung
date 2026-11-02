# Prüfstand v961: Katalog prüfen und PDF-Auszug

Stand: 03.11.2026.

- In „Kataloge → Fachhändler Kataloge“ bietet jeder gespeicherte Katalog „Katalog prüfen / PDF-Auszug“. Die Übersicht liest den vorhandenen Suchindex einschließlich zusammengeführter Artikelstamm-/Preispflegeangaben. Sie ist keine identische Abbildung aller Zeichen oder Seiten der Originaldatei; diese bleibt separat herunterladbar und unverändert.
- Der Scan zählt alle gespeicherten Datensätze paketweise, zeigt Fortschritt und lässt sich abbrechen. Gesamtkatalog und aktuelle Filterauswahl haben getrennte Zahlen. Die Darstellung hält höchstens 200 Auszugsartikel im Speicher, zeigt jeweils 50 und kennzeichnet die Grenze ausdrücklich. Bei Suchbegriffen wird unter allen passenden Datensätzen bewertet, damit bessere Treffer hinter der ersten Seite berücksichtigt werden.
- Filter: Artikelname/-nummer, Hersteller, Kategorie, „EK fehlt oder ist ungeklärt“ und „Nur ungeklärte Artikel“. Änderungen allein lösen keinen erneuten Scan aus. „Auswahl prüfen“ startet die Prüfung; ein PDF der vorherigen Auswahl ist während geänderter Filter gesperrt.
- Geprüfte Werte aus dem gespeicherten normalisierten Datensatz werden als netto je Basiseinheit dargestellt. 0 bleibt ein bestätigter Nullpreis; leer bedeutet nicht kostenlos. Nicht bestätigte Rohangaben werden ausdrücklich als „Ungeklärt · Datei: …“ mit dem bestehenden Prüffehler angezeigt. Der ursprüngliche Preisfaktor steht separat dabei; keine erneute Preisumrechnung oder Vermischung von EK und VK.
- PDF: verständlicher A4-Bericht mit Katalog-/Dateinamen, Auswahl, vollständigen Zählwerten, ausgewiesener Auszugsgröße, vollständigen umbrochenen Artikelnamen, Kennung, Hersteller/Kategorie, Einheit, Preisfaktor, getrennten EK/VK und Prüffehlern sowie Seitenzahlen. Kein Import, keine Preisänderung, keine Bestellung. Zeichen außerhalb des Standard-PDF-Zeichensatzes erhalten einen kenntlich gemachten Ersatz; die App behält die ursprünglichen Texte.
- Zugriff und verspätete Antworten werden mit Konto-/Firmenkennung und Vorgangsnummer geprüft. Ein fremder Katalog wird vor dem Lesen der Artikel zurückgewiesen. Nach Kontowechsel oder Verlassen der Ansicht darf ein alter Scan/PDF kein Ergebnis mehr ausgeben. Es wird kein Katalog zu einem Server geschickt.

## Prüfung

- `catalog-review-v961.test.cjs`: bestätigter Nullpreis, fehlender EK, ungeklärte Rohpreise auch ohne gesetzten Fehlertext, getrennte Zählwerte, exakte Filter, unveränderte Quellzeilen und passende Offline-Cache-Adressen.
- `catalog-review-browser-v961.test.cjs`: vollständige App mit 1.205 isolierten Katalogartikeln. Alle Artikel gezählt, Auszug 200, Anzeige 50 je Seite, Preis-/Hersteller-/Suchfilter, deaktivierter veralteter Export, Rangfolge eines normalen Wechselschalters am Katalogende, echter PDF-Download, 320/390/1366 Pixel, fremder Katalog und verspäteter Scan nach Kontowechsel. Die Quelldaten bleiben bytegleich; keine Produktionsdaten verwendet.
- Erzeugten Beispiel-PDF-Auszug mit pypdf auf Zählwerte, fehlende/ungeklärte Preise und Preisfaktor geprüft. Mit Poppler gerendert und visuell auf lesbare Texte, Umbrüche, Abstände und Seitenfuß kontrolliert. Die Prüfdatei liegt außerhalb des Repositorys und enthält nur synthetische Daten.
- Bestehende Katalogseiten-, Artikel-/Favoriten- und verspätete Online-Suchtests bleiben erfolgreich. Weitere CI-Prüfungen schützen die bisherigen Rechnungs-, Lager- und Warenkorbfunktionen.

Cloudablage der Originalkataloge, OCR und die Vereinheitlichung aller Importkorrekturen bleiben offen. Diese Auswertung ändert daran nichts.
