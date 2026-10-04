# Mehrpersonen-Aufträge – Version v853

Die Datenbank-Erweiterung wurde am 4. Oktober 2026 im bestehenden Supabase-
Projekt aktiviert und vor sowie nach der Aktivierung geprüft. Die Webversion
und ihr Offline-Cache sind auf v853 eingestellt.
Die bestehende Planungsdarstellung bleibt erhalten.

## Verhalten

- Planung: Weitere Mitarbeiter derselben Firma per Mehrfachauswahl hinzufügen.
  Ein gemeinsamer Auftrag erscheint in den Wochenplänen aller Beteiligten.
- Arbeitsschein: Dieselbe Mehrfachauswahl auch für manuelle Aufträge.
  Jeder Mitarbeiter besitzt eigene Zeitabschnitte mit Beginn, Ende, Pause und
  Stunden. Weitere Abschnitte können beliebig bis zum Sicherheitslimit ergänzt
  werden. Zeitangaben werden auf Viertelstunden gerundet.
- Abschluss: Ein Arbeitsschein, separate Stundenkonten. Die Zeiten, die
  Materialpositionen und der Status der Planung werden in einer Datenbank-
  Transaktion gespeichert. Ein Fehler führt nicht zu einer Teilbuchung.
- Stundenpositionen: Die Arbeitskraftart jedes Mitarbeiters bestimmt automatisch
  Monteur-, Meister- oder Aushilfsstunden mit dem jeweiligen Firmenpreis.
  Allgemeines Material wird nicht pro Mitarbeiter vervielfacht.
- Bearbeitung: Die gespeicherten Zeitabschnitte ersetzen ihre bisherigen
  Verknüpfungen. Entfernte Beteiligte behalten keine Stunden aus diesem Auftrag.
- Löschen: Entfernt den gemeinsamen Auftrag und alle daraus erzeugten Zeiten.
  Ein noch geöffneter alter Editor darf einen gelöschten Auftrag nicht wieder
  anlegen. Bereits abgerechnete gemeinsame Arbeitsscheine sind geschützt.
- Kalender, Übersicht und PDFs berücksichtigen alle beteiligten Mitarbeiter.
  Exakte historische manuelle Duplikate werden nicht doppelt gezählt; die
  ursprünglichen manuellen Datensätze werden nicht gelöscht.

## Sichere Aktivierung

1. Das tatsächliche Schema und die bestehenden RLS-Regeln des Projekts prüfen:
   `profiles`, `appointments`, `work_orders`, `time_entries`, `customers`,
   `materials`, `work_order_items`, `work_order_documents` und `storage.objects`.
   Insbesondere den bestehenden Synchronisationstrigger zwischen Arbeitsschein
   und Zeiterfassung mit der vorbereiteten Migration vergleichen.
2. Wiederherstellungsmöglichkeit des Produktionsprojekts prüfen. Keine Tabellen
   leeren und keine Mitarbeiterkonten oder alten Aufträge neu anlegen.
3. `supabase/release853_team_work_orders.sql` in einer Transaktion anwenden.
   Die Migration ist additiv und verändert die historischen Einzelaufträge
   nicht. Sie entfernt keine bestehende Zugriffsregel.
4. Mit freigegebenen Testkonten derselben Firma sowie einer zweiten Firma prüfen:
   Anlage, Bestätigung, Abschluss, Änderungen, Krankheit/Urlaub/Feiertag,
   Abrechnung, mehrere Zeitabschnitte, Löschung und Mandantentrennung.
   Keine echten Mitarbeiterdaten zu Testzwecken ändern.
5. Erst danach die Webversion und ihren Service-Worker auf v853 umstellen und
   den geprüften Stand über den bisherigen GitHub-Pages-Weg veröffentlichen.

Die Web-App fragt eine schmale Team-Kontext-Funktion ab. Ohne installierte
Migration bleibt das bisherige Einzelmitarbeiter-Verhalten erhalten. Es werden
keine zusätzlichen Passwörter oder privaten Profildaten an Mitarbeiter
ausgegeben. Nur ausdrücklich Beteiligte erhalten Zugriff auf den gemeinsamen
Arbeitsschein; die einzelnen Stundenkonten bleiben auf die Person beschränkt.

## Lokale Prüfungen

Die Tests verwenden ausschließlich synthetische Daten und eine wegwerfbare
PostgreSQL-Instanz (PGlite), keinen Produktionszugang.

- Bisherige Browser-Regressionsprüfungen: 29 Fälle.
- Datenbank-/RLS-/Transaktionsprüfungen: 24 Fälle, einschließlich unveränderter
  historischer Datensätze, anonymer Zugriffssperre, Teilnehmer-Anhängen und
  Schutz abgerechneter Aufträge und firmenbezogener alter Dateizugriffsregeln.
- Browserabläufe gegen diese echte isolierte PostgreSQL-Instanz: 9 Fälle.
- JavaScript-Syntaxprüfung und Prüfung auf fehlerhafte Patch-Formatierung.

Die Testquellen liegen in `tests/team/`. Mit Node.js: `npm install`, anschließend
`npx playwright install chromium` (unter Windows wird vorhandenes Microsoft
Edge verwendet) und `npm test`. Die Testbibliotheken sind nur
Entwicklungsabhängigkeiten; die veröffentlichte Web-App benötigt sie nicht.

## Produktionsprüfung und Aktivierung (4. Oktober 2026)

- Das bestehende Projekt `yzlnfrljlknazywskylb` wurde geprüft. Migration
  `20261004124237_team_work_orders_v853` ist installiert und in der
  Migrationshistorie eingetragen. Die neue Mitarbeiterauswahl wird dadurch
  serverseitig freigeschaltet.
- Die Kundentabelle hat keine eigene `business_id`-Spalte. Die isolierte
  Testdatenbank bildet dies jetzt ebenfalls ab; die Firmenprüfung erfolgt über
  das zugeordnete Mitarbeiterprofil.
- Der bestehende Synchronisationstrigger entspricht der getesteten Definition.
  Auch der vorhandene Löschtrigger wird in der Testdatenbank berücksichtigt.
- Die 15 vorhandenen App-Tabellen haben RLS aktiviert. Die privaten Rollen-/
  Firmen-Hilfsfunktionen und die Zugriffsregeln wurden geprüft. Drei alte
  Dateiregeln wurden auf die eigene Firma begrenzt; ausdrücklich beteiligte
  Mitarbeiter erhalten Zugriff über den gemeinsamen Auftrag.
- Alle 15 App-Tabellen wurden vor der Änderung lokal außerhalb dieses
  Repositorys gesichert. Die Sicherung ist mit Windows-DPAPI für das lokale
  Benutzerkonto verschlüsselt; ihre Entschlüsselung wurde geprüft. Sie enthält
  keine exportierten Auth-Passwörter und ersetzt kein vollständiges Supabase-
  Infrastruktur-/Storage-Backup. Es wurden keine Auth- oder Storage-Dateien
  dauerhaft verändert.
- Nach Aktivierung wurden sämtliche vorhandenen Datensätze mit der Sicherung
  verglichen (neue, leere Team-Spalten ausgenommen): alle unverändert,
  einschließlich 305 Arbeitsscheinen, 308 Zeiten und 13 Profilen.
- Im echten Produktionsschema wurden vor und nach Aktivierung je 15
  synthetische Funktionsprüfungen erfolgreich ausgeführt. Die gesamte jeweilige
  Testtransaktion endete in ROLLBACK; es verbleiben keine Testkonten oder
  Testaufträge. Geprüft wurden Team-Auswahl, Bestätigung, mehrere Zeitabschnitte,
  eigene Stundenkonten, Firmenpreise, Abschlussstatus, Mandantentrennung und
  vollständige Auftragslöschung.
- Die fünf öffentlichen Team-Funktionen sind nur für angemeldete Benutzer
  aufrufbar; jede privilegierte Funktion prüft zusätzlich Person, Firma und
  Auftragszuordnung. Die Supabase-Hinweise auf bewusst freigegebene
  SECURITY-DEFINER-Funktionen wurden überprüft. Der bereits zuvor vorhandene
  Hinweis zur deaktivierten Prüfung kompromittierter Passwörter bleibt offen;
  Auth-Einstellungen wurden nicht verändert.

Alle 62 isolierten Prüfungen sowie die zurückgerollten Prüfungen im echten
Schema waren erfolgreich. Bestehende Konten und ihre Zugangsdaten bleiben
unverändert. Die Veröffentlichung erfolgt über den bisherigen GitHub-Pages-Weg.
