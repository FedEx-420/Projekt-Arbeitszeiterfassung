# v1000 – Klarwerk-Gestaltung und zusätzlicher Finanzbereich

Die Arbeitszeiterfassungs-App erhält die gewünschte helle Klarwerk-Gestaltung und die dort vorhandenen ergänzenden Finanzwerkzeuge. Sie bleibt eine eigene App mit eigenem GitHub-Projekt, bestehender Supabase-Anmeldung und eigenen Geschäftsdaten. Es gibt keine automatische Übernahme oder gemeinsame Speicherung mit Klarwerk.

## Oberfläche und Anmeldung

- Helle Karten, grüne Akzente, auf großen Bildschirmen eine dauerhaft sichtbare linke Navigation; auf kleinen Bildschirmen bleibt das bisherige Menü erreichbar.
- Die vorhandenen Firmen-, Mitarbeiter-, Auswahl- und Formularaktionen bleiben bestehen. Info-Buttons erklären die Eingaben, ohne deren Werte zu verändern.
- Die bestehende direkte Firmen-/Benutzernamen-Anmeldung bleibt erhalten. Keine ChatGPT-Anmeldung und keine Übernahme des Klarwerk-Admin-Passworts.
- Neue Geschäfts- und Mitarbeiterkonten darf nur der bestehende Administrator anlegen. Andere bestehende Firmen-/Mitarbeiterberechtigungen werden nicht pauschal erweitert.

## Buchhaltung & Finanzen

Der neue Menüpunkt ist für Administrator und Geschäftskonto verfügbar. Administratoren wählen den betreffenden Betrieb wie bisher über die Firmenauswahl. Mitarbeiter erhalten keinen Finanzzugriff.

Der ergänzende Bereich bietet Zahlungsübersicht, Rechnungs- und Angebotsentwürfe mit Positionen, Zahlungen und Teilzahlungen, eigene Vorlagen mit Logo und A4-Briefpapier als Bild, Vorlagenimport/-export, Originalbelege, manuelle Ausgaben, Bank-CSV-Import und Zuordnung, Rücklagenplanung, Steuer-Vorbereitungslisten, Wissensartikel, CSV- und vollständige JSON-Sicherungen mit Wiederherstellung. Der Nummernkreis der Zusatzdokumente beginnt mit ZF beziehungsweise ZA.

Das bestehende verbindliche Rechnungsregister und die bisherigen Angebote sind weiterhin direkt erreichbar. Die bewusste Übernahme aus dem Register erzeugt keine neue Originalrechnung und verändert keine Arbeitsscheine. Sie übernimmt die Originalnummer und die bereits feststehenden Nettobeträge, Steuer und Gesamtsumme für die Zahlungszuordnung. Die Original-PDF und Stornierung bleiben im bisherigen Register. Bereits erfasste Zahlungen müssen bei der erstmaligen Übernahme gegebenenfalls manuell ergänzt werden.

## Daten- und Dateigrenzen

- Zusatzdaten liegen in `finance_workspaces_v1000`, getrennt nach dem autoritativ ausgewählten Geschäftskonto. Originalrechnungen und Arbeitsdaten werden durch die Installation nicht verändert.
- Tabellenzugriff und das versionierte Speichern unterliegen RLS. Die Freigabe prüft die aktuelle Profilrolle über `auth.uid()`, keine editierbaren Benutzer-Metadaten.
- Originalbelege und Vorlagenbilder liegen im privaten Storage-Bucket `finance-v1000`, getrennt nach Betrieb.
- Die eingebettete Finanzansicht erhält keine Zugangsschlüssel oder Anmeldetokens. Die Haupt-App erlaubt nur festgelegte Nachrichtenoperationen aus genau ihrer aktuellen Finanzansicht und prüft Firma und angemeldetes Profil auch bei verspäteten Antworten.
- Ein Server-Versionskonflikt verhindert Überschreiben. Ungesendete Änderungen bleiben in einem nach Benutzer und Betrieb getrennten lokalen Wiederherstellungspuffer.
- Bestehende Rechnungs-, Materialpreis-, Händler- und Mitarbeitergrenzen bleiben bestehen. Keine echten Bestellungen oder Produktionsrechnungen für Tests.

## Prüfung und Grenzen

Isolierte Datenbanktests prüfen Admin-/Firmen-/Mitarbeiter-/Anonymous-Abgrenzung, Revisionen, ungültige JSON-Schlüssel, privaten Dateispeicher und das nicht frei beschreibbare Revisionsprotokoll. Die vorhandenen 18 Sitzungsprüfungen bestehen. Eine produktive schreibgeschützte Gegenprobe bestätigte, dass eine nicht zugehörige Identität keine Finanzdaten lesen kann.

Die neue vollständige Browser-Fixture ist in die bestehende GitHub-Prüfung aufgenommen. Sie nutzt ausschließlich synthetische Firmen, Kunden, Dokumente und Bilder; sie prüft Haupt-App, Finanzansicht, Firmenwechsel, Dateiablage und mobiles Layout. Der lokale Windows-Browserstart war durch die Testumgebung blockiert; maßgeblich ist der tatsächliche GitHub-Prüflauf des veröffentlichten Commits.

ELSTER, automatische Bankabfragen und strukturierte E-Rechnungen sind auch in der Klarwerk-Ausgangsversion nicht angebunden und werden hier nicht als verfügbar dargestellt. Zahlungsübersicht und Rücklagenziel sind keine vollständige Steuerberechnung, kein revisionssicheres Archiv und keine Zusicherung der Rechtssicherheit.

Die vollständige Finanz-Browser-Fixture bestand im GitHub-Lauf am 08.11.2026 nach Anpassung der eingebetteten Navigation und Dialoghöhe. Die bestehende Startprüfung unterstützt nun sowohl das mobile Klappmenü als auch die feste Desktop-Navigation.
