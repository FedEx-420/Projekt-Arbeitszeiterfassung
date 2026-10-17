# v907 · DATEV-Dateiübergabe je Betrieb

## Tatsächlich verfügbar

- Neuer Verwaltungsbereich **Steuer & DATEV** im bestehenden Dropdown-Menü, ausschließlich für das verantwortliche Geschäftskonto und den Administrator im gewählten Betrieb.
- Einmalige, geräteübergreifend gespeicherte Einrichtung: tatsächliche DATEV-Berater-/Mandantennummer, Wirtschaftsjahr, Sachkontenlänge, Kontenrahmen und ausdrückliche Festschreibungsentscheidung. Erklärungen nennen Bedeutung, Zweck und Ansprechpartner; ohne diese Angaben kein Export.
- Geprüfte Basisbuchungen manuell erfassen und bearbeiten, monatlich auswählen und als DATEV-Buchungsstapel EXTF 700 / Version 13 herunterladen. Keine automatische Umdeutung von Arbeitsstunden in steuerliche Buchungen und keine geratenen Kontierungen.
- 31 Headerfelder und 125 Buchungsfelder, Windows-1252 ohne BOM, CRLF, ganzzahlige Cent-Beträge. Original-Belegnummer bleibt als Zusatzinformation erhalten; separater DATEV-konformer Belegschlüssel. Ungeeignete Zeichen, ungültige Daten, Konten, Beträge und fehlende Bestätigungen werden abgewiesen.
- Servergeprüfte Auswahl, Versionskonflikte, idempotente Wiederholung und Schutz vor versehentlichem Mehrfachexport. Exportierte Buchungsentwürfe können in der App nicht nachträglich überschrieben oder gelöscht werden; Korrekturen sind getrennt zu erfassen.
- Gespeicherter Datenstand plus serverseitig erzeugte tatsächliche CSV-Datei mit PostgreSQL-SHA-256. Erneuter Download verwendet dieselben Bytes, nicht aktuelle Preise oder eine spätere Formatierungsimplementierung. Prüfprotokoll separat herunterladbar; Dateifreigabe auf unterstützten Geräten.
- Vier additive RLS-geschützte Tabellen und eine neue authentifizierte Edge Function. Keine Änderung bestehender Konten, Zeiten, Aufträge, Berechtigungen oder Rechnungen. Keine Testbuchungen in der Produktion. Kein DATEV-Netzwerkversand.

## Bewusste Grenzen und offene Online-Anbindung

Der CSV-Basisexport ist keine vollständige Finanzbuchhaltung, Lohnabrechnung, E-Rechnung, GoBD-Zertifizierung oder steuerliche Beratung. Fremdwährungen, Anzahlungen und Fälle mit zusätzlichen EU-/§-13b-Angaben bzw. BU 49 sind nicht abgebildet. Kontierung, Automatik-/BU-Schlüssel, Soll/Haben, Wirtschaftsjahr und Festschreibung müssen fachlich abgestimmt sein. Ein echter DATEV-Import wurde nicht durchgeführt. Vor produktiver Übergabe muss der Empfänger den Import und die Inhalte prüfen. Die App-Historie ersetzt kein geeignetes revisionssicheres Belegarchiv; Originalbelege, CSV und Prüfprotokoll extern aufbewahren. Die bestehende Firmenlöschung ist keine gesetzliche Archivierungsfunktion.

**Online ist noch nicht implementiert oder verbunden.** Der Online-Reiter zeigt diesen Status und verlinkt die offiziellen Voraussetzungen. Benötigt werden eine DATEV-Anbieterorganisation, registrierte Entwickler-App, API-Produktzugänge, Sandbox-Integration und technische Freigabe sowie je Betrieb passende Datenservices und Bestandsrechte. OAuth/PKCE, sichere serverseitige Tokenhaltung, Widerruf und überwachte Übertragung sind weitere Implementierungsarbeit nach Bereitstellung dieser Zugänge. Es werden keine Zugangsdaten vorgetäuscht, Verträge akzeptiert, Produkte bestellt oder Daten an DATEV übertragen. Der Ideengeber muss selbst keine Steuerkanzlei haben; die spätere Zuordnung erfolgt je Betrieb.

## Prüfung

45 neue isolierte Format-/Datenbank-/Edge-Handler-/Arbeitsbereich-Prüfungen, darunter RLS/Firmentrennung, ungültige Datentypen, unveränderte Altbestände, Versionskonflikte, unveränderliche Übergaben, gespeicherte Dateibytes, verspätete Antworten nach einem Firmenwechsel und abgewiesene falsche Prüfsummen. Alle 125 Spaltennamen und Positionen wurden mit dem offiziellen DATEV-Prüfprogramm-Schema 2.2.3.0 abgeglichen. Dessen Windows-GUI wurde nicht ausgeführt; kein offizieller Import-/Zertifizierungsnachweis.

141 zusätzliche bestehende Regressionstests für Authentifizierung, Rechnungs-Auswahl, Kalender/Arbeitswoche, Navigation, Safe Area, Jahresstunden und Standortfreigaben: insgesamt 186 gezielte Prüfungen bestanden. Browserprüfung ausschließlich mit lokalen synthetischen Daten bei 390 × 844 und 1280 × 900: Pflichtfelder, Einrichtung, Feldhilfe, Belegerfassung, Auswahl, tatsächlicher CSV-Download, Prüfsumme nach erneutem Laden, Firmenwechsel und verweigerter Mitarbeiterzugriff. CSV zusätzlich unabhängig mit Python gelesen und SHA-256 abgeglichen. Keine physische iPhone-Prüfung und kein DATEV-Login oder Datentransfer.

## Offizielle Quellen · geprüft 17.10.2026

- [DATEV-Header](https://developer.datev.de/de/file-formats/details/datev-format/format-description/header)
- [DATEV-Buchungsstapel](https://developer.datev.de/de/file-formats/details/datev-format/format-description/booking-batch)
- [DATEV-Prüfwerkzeuge](https://developer.datev.de/de/file-formats/details/datev-format/tools)
- [Online-Schnittstellenvorgaben](https://developer.datev.de/de/guides/interface-requirements)
- [Online-Dateiübertragung und Dateiprüfung](https://developer.datev.de/de/product-detail/accounting-extf-files/2.0/documentation/interface-requirements-file)
- [DATEV Developer Portal](https://developer.datev.de/de/)
