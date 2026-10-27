# Hersteller erkennen, Kategorien benennen und Artikelgruppen verwalten

Ein lokales Regelwerk ergänzt fehlende beziehungsweise nicht aussagekräftige Hersteller aus der Artikelbezeichnung. Bekannte Markennamen werden mit Wortgrenzen erkannt; mehrere gefundene Marken oder reine Kompatibilitätshinweise führen nicht zu einer behaupteten eindeutigen Herstellerzuordnung. Vorschläge tragen die Kennzeichnung „aus Bezeichnung erkannt“. Eindeutige Katalogangaben haben Vorrang. Hersteller und Kategorie sind im Artikel unter weiteren Angaben korrigierbar.

Numerische Warengruppen werden nicht als universelle Klassifizierung interpretiert. Stattdessen ordnet die Artikelbeschreibung passende verständliche Kategorien zu, etwa Werkzeug, Schaltermaterial, Kabel und Leitungen, Mess- und Prüfgeräte, Verteilung und Schutzgeräte, Beleuchtung und Netzwerk und Datentechnik. Ohne ausreichende Information erscheint „Sonstiges / noch nicht zugeordnet“. Der ursprüngliche Warengruppencode bleibt als Quellenangabe erhalten. Bestehende verständliche Katalogkategorien bleiben erhalten. Das Regelwerk ist begrenzt und kann unbekannte Hersteller nicht zuverlässig erraten.

Die vollständige Kataloganalyse und Filterung verwenden dieselbe Zuordnung wie die Vorschau. Bei installierter Datenbankerweiterung überträgt der Import Hersteller, Kategorie und Herkunft der Zuordnung. Eine manuelle Herstellerzuordnung bleibt bei einem späteren bloßen Vorschlag erhalten. Manuelle Kategorien werden ebenfalls nicht durch automatische Vorschläge überschrieben. Die gespeicherte Materialliste zeigt Hersteller und Kategorie und kann über diese Begriffe durchsucht werden; auch bestehende Materialien können aus ihrer Bezeichnung eingeordnet werden.

Unter „Artikelgruppen verwalten“ stehen Kategorie, Hersteller und Großhändler zur Auswahl. Vor der Löschung zeigt die Oberfläche eine konkrete Artikelauswahl mit Gesamtzahl und anschließender Bestätigung. Entfernt werden nur die geprüften IDs und Revisionen innerhalb der aktiven Firma. Maximal 200 Artikel je bestätigtem Serverpaket; unsichere oder fehlgeschlagene Pakete werden nicht automatisch wiederholt. Änderungen an der Auswahl führen serverseitig zum Abbruch des betroffenen Pakets. Bereits bestätigte Pakete werden als Teilfortschritt angezeigt.

Löschung entfernt die Händlerartikel aus der aktiven Materialliste und behält ihre IDs für bestehende Belege. Sie löscht keine Stunden, Auftragspositionen, Angebote oder Rechnungen. Geschützte Stundenpositionen und fremde Firmen sind ausgeschlossen. Ein bewusst erneuter Katalogimport derselben Händlerartikelnummer kann so entfernte Artikel wieder aktivieren, ohne eine zweite Händlerposition anzulegen.

## Aktivierung

Die neue Migration `20261027194452_catalog_classification_v925.sql` setzt die Händleridentität v921 voraus. Sie ergänzt nullable Metadaten und invoker-gesicherte Endpunkte, ohne bestehende Belege umzuschreiben oder RLS aufzuweichen. Die Oberfläche schaltet die gespeicherten Metadaten erst bei vorhandenen Spalten zu und verwendet sonst den bisherigen Import. Die Sammellöschung bleibt bis zur Installation deaktiviert. Beide verbundenen Supabase-Zugänge zeigen weiterhin keine Projekte; die Migration wurde lokal geprüft, aber nicht produktiv ausgeführt.

## Prüfungen

Isolierter PostgreSQL-Test: Herstellerregeln, explizite Angaben, mehrdeutige Namen, Kompatibilitätstexte, Kategorien statt Nummern, Metadaten/Quellcode und Herkunft, idempotenter Import, Vorrang manueller Angaben, Mitarbeiter- und Firmenschutz, veraltete Revision, geschützte Stundenpositionen, unveränderte historische Daten bei Entfernung einer tatsächlich referenzierten Material-ID sowie Wiederaktivierung ohne Duplikat.

Browsertest: sichtbare Vorschläge und Textkategorien, vollständige Importmetadaten, Prüfung der Löschmenge für Kategorie/Hersteller/Großhändler, exakt geprüfte IDs und Revisionen, bestätigte Entfernung aus den aktiven Gruppen sowie Ansichten bei 320/390/1366 Pixeln. Bestehende Fehlernavigation und Einheitenprüfungen bleiben erfolgreich. Private Großhändlerdateien gehören nicht zum Release.
