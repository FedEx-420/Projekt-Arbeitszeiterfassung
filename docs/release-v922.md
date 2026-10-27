# Gemeinsame Artikel mit Händlerangeboten – v921/v922

Die Materialliste zeigt einen gemeinsamen Artikel mit den getrennten Händlerangeboten darunter. Lieferant, Lieferantenartikelnummer, EK, VK * und VK ** bleiben je Angebot erhalten. Derselbe Lieferant und dieselbe Artikelnummer aktualisieren weiterhin dieselbe Material-ID; ein weiterer Katalog erzeugt dafür keinen zweiten Artikel. Die Importvorschau überträgt EAN/GTIN aus DATANORM und eindeutig bezeichneten Tabellenspalten.

Automatisch zusammengefasst wird nur eine gültige GTIN mit identischer Basiseinheit innerhalb derselben Firma. GTIN-8/12/13 werden auf 14 Stellen normalisiert, Prüfziffer und Null-Platzhalter werden geprüft. Ungültige oder fehlende Nummern führen zu keiner Namensvermutung. Für diese Artikel gibt es eine ausdrückliche manuelle Zuordnung. Unterschiedliche gültige GTIN oder Einheiten werden dabei abgewiesen. Alte Materialien haben zunächst keine gespeicherte GTIN: Sie erhalten diese beim erneuten Import derselben Händlerartikelnummer oder werden manuell zugeordnet.

Intern bleiben die vorhandenen Materialzeilen als Händlerangebote erhalten. Gemeinsame Karten sind eine Gruppierung und keine Löschung historischer IDs. Stabile interne Namen ermöglichen gleichlautende Händlertexte trotz der bestehenden Namenseindeutigkeit; der Originaltext wird separat gespeichert. Ältere App-Versionen verwenden ihre bisherigen Endpunkte. Der neue Import schaltet sich erst bei vorhandenen Datenbankspalten ein und verwendet weiterhin die bestätigten, kleinen Importblöcke.

Angebote zeigen pro Artikel die Händlerauswahl mit EK und VK *. Die ausgewählte Material-ID und deren Preis bleiben beim erneuten Rendern und beim Speichern erhalten. Rechnungen bieten dieselbe Auswahl im Materialpreiseditor; ausgewählte Händlerpreise und individuelle Nettoänderungen werden erneut vorbereitet und steuerlich bestätigt. Die Rechnung friert Händler, Einkaufspreis, Preisvorgaben und endgültigen Verkaufspreis ein. Die Serverprüfung erfasst auch zwischenzeitlich geänderte Händlerangebote. Stunden und Materialstammpreise werden durch die Auswahl nicht verändert.

## Installation

Noch nicht in der produktiven Datenbank ausgeführt. Die verbundenen Supabase-Zugänge zeigen kein Projekt. Für Artikelgruppen ist Migration `20261027050822_catalog_supplier_variants_v921.sql` erforderlich. Die Rechnungs-Händlerauswahl benötigt zusätzlich die vorhandene v919-Erweiterung und danach `20261027060443_invoice_supplier_selection_v922.sql`. Die Oberfläche fällt bei fehlenden Rechnungsendpunkten auf v919 beziehungsweise v908 zurück; andere Fehler werden nicht verschluckt.

## Geprüft

Isolierte PostgreSQL-Tests: GTIN-Prüfung, gemeinsame Artikel, unterschiedliche Händlerpreise, idempotente Wiederholung, Preisaktualisierung derselben ID, manuelle Zuordnung, fehlende EAN in einem späteren Preisimport, Einheiten- und Firmenabgrenzung, Mitarbeiterrechte. Rechnungsabschluss: Auswahlgültigkeit, VK-*Vorgabe, individuelle Preise, unveränderte Stunden/Stammpreise, eingefrorene Händlerdaten und Wiederholungsschutz.

Lokale Browsertests: EAN-Übernahme mit gleichlautenden Artikeltexten, gruppierte Karten und Suche, manuelle Auswahl, Händlerauswahl im Angebot und Rechnungsentwurf, erhaltene Auswahl beim Rendern, erneute Preis-/Steuerprüfung, Abschluss-Payload, Ansichten bei 320/390/1366 Pixeln. Bestehende vollständige Katalogsuche und Importprüfung bleiben getestet. Kein privater Großhändlerkatalog wird im Repository abgelegt.
