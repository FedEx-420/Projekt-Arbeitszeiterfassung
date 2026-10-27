# Produktfragen, echte Artikelbilder und gemeinsame Schrittführung

## Produktassistent

Die geführte Materialsuche stellt abhängig von der Kategorie nacheinander passende Fragen. Es werden nur Merkmale angeboten, die in der aktuellen Artikelauswahl erfasst sind. Zurückgehen, Überspringen, Antworten entfernen und direkter Wechsel zu Treffern bleiben möglich. Standardmäßig gelten fehlende oder widersprüchliche Merkmale nicht als passende Übereinstimmung; eine ausdrückliche Auswahl kann unvollständige Artikel einbeziehen.

Schutzgeräte: Geräteart FI/RCD, LS/MCB, FI/LS/RCBO, Überspannungsschutz und Schmelzsicherung; LS-Kennlinie, Bemessungsstrom A, Bemessungsfehlerstrom mA, FI-Typ, Pole, Bemessungsschaltvermögen kA, Ableiter-Typ, Spannung, Montage sowie bei Schmelzsicherungen Baugröße/Betriebsklasse. Diese getrennten Herstellermerkmale werden nicht zu einem unbestimmten „Abschaltstrom“ vermischt. Der Assistent filtert vorhandene Daten; er dimensioniert keine Anlage und setzt keine Schutzwerte automatisch fest.

Schaltermaterial: Artikelart, Serie, Farbe, Oberfläche, erhöhter Berührungsschutz, Montage und Rahmenplätze. Mehrere in einer Bezeichnung genannte kompatible Serien bleiben als mehrere Werte auffindbar. „Ohne erhöhten Berührungsschutz“ wird nicht als positive Eigenschaft gewertet. Weitere Kategorien haben Fragen zu Kabeltyp/Adern/Querschnitt/Länge, Werkzeugart/Schraubprofil, Sockel/Leistung/Lichtfarbe/Schutzart/Dimmbarkeit und Netzwerkkategorie/Länge.

Eine lokale konservative Extraktion liest erkennbare Angaben aus den Artikelbezeichnungen. Diese sind als „aus Text“ gekennzeichnet. Strukturierte benannte CSV-/BMEcat-Felder werden zusätzlich übernommen. Gegensätzliche Angaben erhalten ein Konfliktmerkmal und sind standardmäßig keine eindeutigen technischen Treffer. FI-Typ B wird nicht zur LS-Kennlinie B, Ampere werden nicht zu Milliampere oder Kiloampere umgedeutet. Mehrdeutige Strombereiche und Polkonfigurationen bleiben offen. Die Regeln sind begrenzt; Datenqualität und Herstellerprüfung bleiben maßgeblich.

Herstellerquellen zur Trennung der elektrischen Merkmale:
- https://assets.hager.com/step-content/P/HA_22838863/Document/std.lang.all/22DE0001-TECHNIK-FI-LS-SCHALTER.pdf
- https://www.hager.de/files/download/0/24101279_1/0/DE_20DE0001_TECHNIK_FI_LS.PDF

## Artikelbilder

Die App übernimmt echte HTTPS-Bildverweise aus passenden CSV-/Tabellenspalten und BMEcat-MIME-Einträgen mit gültiger Quelle/Basisadresse. Ein Bildlink ist vor dem Import unter weiteren Artikelangaben ergänzbar. Bilder erscheinen in Materialtreffern sowie bei eindeutig ausgewählten Artikeln in Angeboten, Arbeitsscheinen und Rechnungsentwürfen. Unklare Namenszuordnung löst keine Bildvermutung aus. Fehlende oder nicht ladbare Fotos sind ausdrücklich gekennzeichnet. Keine erfundenen Produktbilder, kein automatisches Scraping fremder Bildkataloge, keine Veränderung bestehender Originalbelege/PDFs.

Die bereitgestellte private DATANORM-ZIP enthält nur DATANORM.001 und DATPREIS.001 und keine Fotos. Daher kann dieses Release nicht für jeden dieser Artikel ein echtes Foto bereitstellen. Dafür wird eine passende Bildquelle des Herstellers/Großhändlers benötigt. Private Kataloge und Bilder werden nicht in GitHub abgelegt. Bildverweise werden beim Speichern nicht serverseitig abgerufen; die Anzeige verwendet Lazy Loading und keine Referrer-Übermittlung.

## Gemeinsame Bedienführung

Die Hauptbereiche der App erhalten eine aufklappbare, zunächst sichtbare Drei-Schritt-Anleitung. „Zur nächsten Eingabe führen“ springt zur nächsten erforderlichen Eingabe im aktiven Formular beziehungsweise zum passenden Beginn der Materialsuche. Erforderliche Zusatzbereiche werden geöffnet, die Eingabe wird fokussiert und hervorgehoben. Sind die Angaben ausgefüllt, kann zum bestehenden Bestätigungsbutton geführt werden; es wird nichts automatisch abgesendet. Speichern, Senden, Löschen, Steuerprüfung und Rechnungsabschluss bleiben in den vorhandenen Verfahren und Berechtigungen. Die Anleitungen umfassen Arbeitsscheine, Zeiten, Belege, Kunden, Planung, Kalender, Angebote, Rechnungen, Materialien, Postfach, Einstellungen, Unterlagen, DATEV und Administration.

## Datenbank und Aktivierung

Migration `20261027215806_product_features_photos_v928.sql` setzt v925 voraus, ergänzt technische JSON-Metadaten und Bildlinks sowie einen invoker-gesicherten Importendpunkt. Datenform, Herkunft und Unternehmensberechtigung werden serverseitig geprüft. Manuelle Angaben werden durch bloße Textvermutungen nicht überschrieben. Bestehende Belege, Stunden und Stammpreise ändern sich durch diese Erweiterung nicht. Frühere Importendpunkte bleiben verwendbar. Die Oberfläche verwendet den neuen Endpunkt erst bei vorhandenen Spalten.

Die verbundenen Supabase-Zugänge zeigen weiterhin keine Projekte. Die Migration wurde lokal mit PostgreSQL geprüft und nicht produktiv ausgeführt. Für Nutzer steht eine TXT-Kopie mit Anleitung bereit. Produktfragen aus vorhandenen Beschreibungen und die allgemeine Bedienführung funktionieren bereits ohne diese zusätzliche Aktivierung; dauerhaft gespeicherte technische Katalogfelder und Bildlinks benötigen die Erweiterung.

## Prüfungen

PostgreSQL-/Logiktests: getrennte technische Dimensionen, FI-Typ/LS-Kennlinie, Strombereiche, Pole, Serienkompatibilität, Farben/Berührungsschutz, fehlende und widersprüchliche Daten, Schmelzsicherungen, Spannungsangaben, sichere Bildverweise, lokale CSV-/BMEcat-Auswertung, persistente Features/Fotos, idempotenter Import, Vorrang manueller Angaben, ungültige Daten, Mitarbeiter-/Firmengrenzen.

Browsertests: automatische Fragefolge für Schutzgeräte und Schaltermaterial, Ausschluss falscher Varianten, tatsächlicher Bildverweis und fehlende Fotos, gemeinsame Eingabeführung ohne Formularabsendung, drei Schritte in allen Hauptbereichen, 320/390/1366 Pixel. Vorhandene Tests für Materialsuche/Dateistatus, Fehlernavigation, Hersteller/Kategorien, Angebots-Händlerwahl und Rechnungspreise bleiben erfolgreich. Keine Produktionsdaten wurden für diese Tests geschrieben.
