# Planungsfreigaben und Planungs-PDF - v854

Die vorhandene Wochenübersicht und Mehrpersonen-Aufträge bleiben erhalten.

## PDF herunterladen

In der Planungsübersicht öffnet **Planung als PDF herunterladen** die Auswahl
**Von / Bis**. Der Download erzeugt eine echte PDF-Datei, ohne die App zu verlassen.
Der Zeitraum umfasst höchstens 366 Kalendertage. Geschäfts- und Administratorkonto
exportieren die veröffentlichte Planung der ausgewählten Firma; Mitarbeiter sehen
ihre zugewiesenen Aufträge. Gemeinsame Aufträge stehen einmal mit allen Beteiligten
im Dokument. Unveröffentlichte Vorschläge und abgesagte Planungen sind ausgeschlossen.

Die PDF enthält einen Firmenlogo-Banner, Datum und Monatsüberschriften,
Kunden und Einsatzort, Zeiten, Team, Priorität, Status und Hinweise sowie
Abwesenheiten und NRW-Feiertage. Bei erledigten Aufträgen stehen auch die
tatsächlich erfassten Zeitabschnitte dabei. Kopfzeile und Seitenzahlen wiederholen
sich auf Folgeseiten. Schrift und Umbrüche werden anhand echter Schriftbreiten
berechnet. Ein fehlendes Logo verhindert den Download nicht.

## Vorschlag und Genehmigung

- Mitarbeiter, einschließlich Aushilfen, reichen über **Planung vorschlagen**
  einen eigenen Auftrag mit weiteren Mitarbeitern derselben Firma ein.
- Vorschläge stehen in einer separaten Liste **Zur Freigabe**. Andere beteiligte
  Mitarbeiter sehen sie noch nicht als veröffentlichte Planung.
- Die Geschäftsleitung erhält zusätzlich eine Postfachnachricht. Administrator
  und zuständiges Geschäftskonto können Kunde, Datum, Zeiten, Team und Hinweise
  vor der Freigabe bearbeiten. **Änderungen als Vorschlag speichern** veröffentlicht
  noch nichts. **Genehmigen und veröffentlichen** veröffentlicht ausdrücklich.
- Beim Genehmigen werden aktuelle Krankheit, Urlaub, Feiertage, Firmenzuordnung
  und Terminüberschneidungen erneut überprüft. Eine abgelehnte Anfrage kann
  bearbeitet und neu eingereicht werden; eigene offene Vorschläge lassen sich
  zurückziehen. Der Antragsteller erhält die Entscheidung im Postfach.
- Die Veröffentlichung erzeugt einen gemeinsamen Plan, keine Arbeitsstunden.
  Bestätigung und Abschluss des Arbeitsscheins funktionieren danach wie in v853.

## Datenbank und Sicherheit

Die additive Migration `20261004173800_planning_approval_v854.sql` ergänzt
`planning_requests`, ohne bestehende Aufträge, Zeiten oder Konten zu ändern.
RLS erlaubt ausschließlich den eigenen Antrag oder zuständige Geschäftsleitung.
Direkte Client-Schreibrechte fehlen; die zwei kontrollierten Workflow-Endpunkte
prüfen Person, Rolle, Firma und Version. Öffentlich aufrufbare Wrapper sind
SECURITY INVOKER; privilegierte Funktionen liegen in `app_private`, sind gegen
anonyme Aufrufe gesperrt und prüfen die echte angemeldete Person.

Versionsprüfung verhindert das Überschreiben zwischenzeitlicher Änderungen.
Genehmigung, Veröffentlichung und Benachrichtigungen laufen in einer Transaktion.
Gleichzeitige Genehmigungen für denselben Betrieb/Tag werden serialisiert;
Wiederholung einer schon erfolgreichen Genehmigung erzeugt keinen zweiten Auftrag.
Ein zusätzlicher Insert-Trigger verhindert, dass Mitarbeiter über einen direkten
REST-Aufruf die notwendige Freigabe umgehen. Alte Planungen bleiben erhalten.

## Abhängigkeit und Prüfung

PDF-Erzeugung verwendet die lokal mitgelieferte, festgelegte MIT-Bibliothek
`pdf-lib` 1.17.1 aus dem gebündelten Laufzeitsystem. Keine CDN-Laufzeitabhängigkeit,
keine zusätzliche kostenpflichtige Dienstleistung. Lizenz in `vendor/`.

`npm test` umfasst 87 isolierte Prüfungen: 29 bisherige Browserabläufe,
24 Team-Datenbanktests, 9 Team-Browserabläufe, 17 Freigabe-Datenbanktests und
8 neue Browser-/PDF-Abläufe. Testdaten sind synthetisch, nicht produktiv.
PDFs mit langen Notizen, Logo und Monatswechsel werden zusätzlich gerendert und
visuell überprüft. Produktionsprüfungen verwenden vollständig zurückgerollte
synthetische Transaktionen und eine verschlüsselte Sicherung außerhalb von Git.
