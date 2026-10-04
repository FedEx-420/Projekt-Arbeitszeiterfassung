# Mehrpersonen-Aufträge – vorbereitete Erweiterung v853

Die Veröffentlichung in der laufenden App ist noch nicht erfolgt. Zuerst muss
die Datenbank-Erweiterung im Supabase-Projekt aktiviert und geprüft werden.
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
- Datenbank-/RLS-/Transaktionsprüfungen: 18 Fälle.
- Browserabläufe gegen diese echte isolierte PostgreSQL-Instanz: 9 Fälle.
- JavaScript-Syntaxprüfung und Prüfung auf fehlerhafte Patch-Formatierung.

Die Testquellen liegen in `tests/team/`. Mit Node.js: `npm install`, anschließend
`npx playwright install chromium` (unter Windows wird vorhandenes Microsoft
Edge verwendet) und `npm test`. Die Testbibliotheken sind nur
Entwicklungsabhängigkeiten; die veröffentlichte Web-App benötigt sie nicht.

Produktions-Schema und Live-Buchung sind ausdrücklich noch nicht bestätigt.
