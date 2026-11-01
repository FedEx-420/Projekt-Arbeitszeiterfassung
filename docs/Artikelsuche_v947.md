# Artikelsuche · Version 947

Die Suche in der Materialliste beginnt jetzt mit einem direkten Suchfeld.
Materialanlage, Stundenpreise und Gruppenverwaltung sind darunter einklappbar.
Die zusätzliche Schritt-für-Schritt-Hilfe ist zunächst eingeklappt.

- Vorschläge für Artikel, Hersteller und Kategorien während der Eingabe.
- Suche nach Name, Großhandelsnummer, Herstellerartikelnummer und EAN/GTIN.
- Exakte Nummern vor bloßen Erwähnungen einer Nummer im Beschreibungstext.
- Kategorie, Hersteller und Händler mit Trefferzahlen und einzeln entfernbaren Filtern.
- Direkte Ausführungsfilter für Artikelart, Steckdosenfunktion, Serie, Farbe,
  Oberfläche und Montage, soweit passende Merkmale vorhanden sind.
- Weiterhin geführte Detailfragen für Schutzgeräte, Schalter, Kabel und andere Artikel.
- Gemeinsame Suchlogik auch im Einkauf. Artikel und Händlerpreise bleiben getrennt gespeichert.

Die lokale Suche verwendet den Materialstamm der ausgewählten Firma und im Einkauf
zusätzlich die Kataloge dieses Kontos auf diesem Gerät. Vorschläge aus gespeicherten
Katalogen berücksichtigen die bereits eingelesenen Suchtreffer. Das ist keine Suche
im gesamten Live-Sortiment des Großhandels.

## Analyse von ONLINE PLUS

Am 01.11.2026 wurden die Suche und die Artikelansicht im angemeldeten ONLINE-PLUS-
Zugang geprüft. Die Oberfläche bietet Suchvorschläge, Filter mit Trefferzahlen,
Produktserien, Hersteller, Artikelarten sowie Varianten und Lagerauswahl.
Die offiziellen Hilfen beschreiben denselben Ablauf:

- https://www.gconlineplus.de/images/data/Zentral/Allgemein/help/GC.pdf
- https://www.gc-gruppe.de/service/schnittstellen

## Verfügbarkeit: gesonderte Anbindung erforderlich

Aktuelle Bestände gehören zu einem Händler und Lager/ABEX. Für ihre Anzeige sind
Großhandelsartikelnummer, Lager, Einheit, Abfragezeitpunkt und eine echte Händlerantwort
nötig. Fehlende Daten sind keine Aussage, dass ein Produkt lieferbar oder ausverkauft ist.
Diese Suchversion enthält noch keine aktive automatische Bestandsanbindung.
Der serverseitige Händlerabruf wird separat geprüft; Kennwörter, Cookies und
kundenspezifische Händlerpreise gehören nicht in öffentliche Dateien oder Protokolle.

## Prüfungen

Isolierte Tests der vollständigen App prüfen Nummern/EAN, Vorschläge, Serie/Farbe,
Filterentfernung, Original-Artikelzuordnung und Ansichten mit 320, 390 und 1366 Pixeln.
Die bestehenden Produktassistenten- und Einkaufstests bleiben erhalten.
Die Testläufe schreiben weder in die Produktivdatenbank noch in reale Shopwarenkörbe.
