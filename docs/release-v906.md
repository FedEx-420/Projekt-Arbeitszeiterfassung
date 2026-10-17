# v906 · Auswahl und einfachere Standort-Einrichtung

- Rechnung: einzelne offene Arbeitsscheine pro Kunde vor der Steuerabfrage auswählen. Datum, Mitarbeiter und Stunden sind sichtbar. Alle/keine, Anzahl und Stundensumme, abbrechbar ohne Schreibzugriff. Aus einem einzelnen Arbeitsschein zunächst nur diesen vorauswählen.
- Abrechnung: gesonderte Auswahl mit ausdrücklicher Bestätigung des endgültigen Rechnungsabschlusses. Nur ausgewählte IDs werden markiert; PDF-Öffnen bleibt ohne Abschluss. Auswahl nur im Arbeitsspeicher und nach Profil/Firma getrennt; aktuelle offene Gruppe bei Bestätigung erneut prüfen.
- OwnTracks: dreiteilige Einrichtung, persönliche Importdatei teilen oder herunterladen; manuelle Zugangsdaten nur auf Wunsch anzeigen. Bereits vorhandene Verbindungen nicht automatisch erneuern. Wochentage, Zeitfenster, Kontozuordnung, Pause und Widerruf unverändert. Privates Gerätekennwort weder in öffentlichen URLs noch dauerhaftem Browserspeicher.
- Browser-GPS und iPhone-Kurzbefehle ausdrücklich als eingeklappte Alternativen. Importfreigabe und Betriebssystem-Berechtigungen bleiben bewusst durch den Geräteinhaber zu erteilen. iPhone-Hintergrundzustellung nicht garantiert.
- Unterlagen & Freigaben: Quellen-verknüpfter Betriebscheck benennt vorhandene Arbeitsverwaltung und offene Rechnungs-, E-Rechnungs-, Archivierungs- und DATEV-Funktionen. Keine vollständige Finanzbuchhaltung, GoBD-Zertifizierung oder vermeintlich aktive DATEV-Verbindung.

## Daten und Grenzen

Nur öffentliche Frontend- und Testdateien. Keine Schema-, Rollen-, Standortfreigabe- oder Bestandsdatenänderung durch das Update. Keine echten Testrechnungen, Standortmeldungen oder Mitarbeiteränderungen. Keine Übertragung an DATEV.

Der Betriebscheck ist eine technische Lückenübersicht, keine individuelle Steuer- oder Rechtsberatung. Insbesondere verbindlicher Nummernkreis, vollständige Rechnungsausstellerdaten im PDF, unveränderliches Rechnungsregister mit Korrektur/Storno, strukturierte E-Rechnung und geeignete Archivierung müssen vor Verwendung als alleinige Faktura/Buchhaltung ergänzt bzw. extern organisiert und fachlich geprüft werden.

## Prüfung

148 gezielte VM-/Komponenten-/In-Memory-Datenbankprüfungen bestanden, einschließlich Auswahl, PDF-Erzeugung, Authentifizierung, Navigation, Safe-Area, OwnTracks-Empfang, persönlichen Mehrkonten und Wochentagsfreigaben. Keine produktiven Datenzugriffe zum Testen.

Zusätzliche Browserprüfung mit ausschließlich synthetischen lokalen Daten bei 390 × 844 und 1280 × 900: leere Auswahl abgewiesen, Auswahl an Steuerabfrage/PDF übergeben, Vorschau ohne Buchung, getrennter Abschluss nur eines Arbeitsscheins; zwei weitere bleiben offen. Erzeugte PDF heruntergeladen und Text/Zeiträume geprüft. Standort-Einrichtung samt privater Importoption und eingeklappter manueller Hilfe sowie Betriebscheck dargestellt. Kein echter iPhone-Hintergrund-/Fahrtest und keine echte Standortfreigabe erteilt.

## Offizielle Quellen · geprüft 17.10.2026

- [§ 14 UStG](https://www.gesetze-im-internet.de/ustg_1980/__14.html)
- [BMF: E-Rechnung](https://www.bundesfinanzministerium.de/Content/DE/FAQ/e-rechnung.html)
- [BMF: GoBD-Änderung 14.07.2025](https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Weitere_Steuerthemen/Abgabenordnung/2025-07-14-GoBD-2-aenderung.html)
- [DATEV: Schnittstellenvorgaben](https://developer.datev.de/de/guides/interface-requirements)
- [OwnTracks: Import-Sicherheit](https://owntracks.org/booklet/features/security/)
