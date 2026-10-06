# Arbeitszeit · Team

Installierbare Web-App für Android und iPhone mit gemeinsamer, geschützter Arbeitszeiterfassung.

- Anmeldung für Chef und Mitarbeiter
- getrennte Daten je Mitarbeiter; der Chef kann alle Daten einsehen und bearbeiten
- Kundenverwaltung inklusive Löschen und Jahresstunden
- Arbeitsscheine mit Material, Menge und Euro-Beträgen
- NRW-Feiertage, Urlaubs- und Krankheitstage sowie automatische Stundenberechnung
- veröffentlichte Tagesplanungen stehen vor den Eingabeformularen in Zeiterfassung und Arbeitsscheinen; ein Klick öffnet den gemeinsamen vorausgefüllten Auftrag
- passende Kundennamen lösen einen Hinweis aus, bevor ein separater zusätzlicher Eintrag gespeichert wird; abgebrochene Eingaben bleiben erhalten
- die PDF aus den Einstellungen enthält Arbeitszeiten, NRW-Feiertage, Urlaub (genehmigt/beantragt) und Krankheitstage; chronologisch nach Jahr und Monat, auch ohne Zeiteintrag am jeweiligen Tag
- direkter PDF-Gerätedownload der Jahresübersicht mit Jahresauswahl in Einstellungen; der vorhandene Druckbericht bleibt verfügbar
- direkter PDF-Gerätedownload der Planungsübersicht mit frei gewähltem Zeitraum
- Angebote ausschließlich für Geschäfts- und Administratorkonten: Kundenadresse automatisch übernehmen, Material und Arbeitsstunden mit Preisen hinzufügen, Entwurf speichern/bearbeiten/löschen und als PDF herunterladen

Die App benötigt eine Internetverbindung, damit alle Mitarbeiter mit dem aktuellen gemeinsamen Datenstand arbeiten.

Neben jedem manuell eingebbaren Material steht eine Einheitenauswahl: Stk (Stück), M (Meter), H (Stunden), Pau (Pauschale). Dies gilt für die Materialliste, neue/bearbeitete Arbeitsscheine und Angebote. Neue Positionen übernehmen zunächst die Einheit der Materialliste; eine eigene Auswahl wird pro Position gespeichert und bleibt bei späteren Änderungen der Materialliste erhalten. Arbeitsnachweise, Rechnungen und Angebots-PDFs zeigen die Einheit. Es erfolgt keine automatische Umrechnung von Menge, Preis oder Arbeitszeit. Bestehende Einträge werden nicht geändert; bisherige Materialpositionen erscheinen als Stk und automatische Arbeitszeitpositionen als H.

Die Tagesplanungen werden auf diesen Seiten alle 20 Sekunden und beim erneuten Öffnen aktualisiert, ohne ungespeicherte Formularfelder, Unterschriften oder ausgewählte Dateien zurückzusetzen. Noch nicht genehmigte Vorschläge und abgesagte Termine erscheinen nicht als Arbeitsschein-Entwurf.

Angebote sind firmengebunden und serverseitig durch RLS abgesichert. Sie buchen keine Arbeitszeiten, erzeugen keine Arbeitsscheine und ändern keine Rechnungen. Preise/Adressen werden als Angebotsstand gespeichert und können im Angebot bearbeitet werden; spätere Änderungen der Materialliste verändern gespeicherte Angebote nicht. Bei gleichzeitigem Bearbeiten verhindert eine Revisionsprüfung das Überschreiben eines neueren Stands. Neue freie Angebotspositionen legen keine globalen Artikel oder Kunden an. MwSt. wird pro Angebot ausdrücklich eingestellt (anfangs 0 %). Nach dem Speichern enthält die PDF den gespeicherten Stand.

Die Angebots-PDF nummeriert jede Material-/Arbeitsposition fortlaufend über alle Seiten. Einzelpreise und Positionssummen sind rechtsbündig. Der hervorgehobene Abschlussblock zeigt Netto, Mehrwertsteuer und Gesamtbetrag inkl. MwSt. mit derselben rechten Kante wie die Positionssummen; die letzte Position und der vollständige Summenblock bleiben zusammen.

Anmeldungen werden vor geschützten Anfragen automatisch erneuert, auch nach längeren Artikel-Rückfragen. Gleichzeitige Erneuerungen werden zusammengefasst und zwischen Browser-Tabs koordiniert. Nur eine ausdrücklich wegen JWT-Ablaufs zurückgewiesene Anfrage wird einmal erneut gesendet; Verbindungsfehler und Serverfehler lösen keine automatische Wiederholung einer möglicherweise bereits gespeicherten Änderung aus.

Ungespeicherte Angebotseingaben und bestätigte Artikel-Auswahlen werden im jeweiligen Browser-Tab pro Benutzer und Firma zwischengesichert. Nach Neuladen oder erneuter Anmeldung können sie unter Angebote fortgesetzt werden. Die Zwischensicherung ist kein serverseitig gespeichertes Angebot und endet mit dem Schließen des Tabs; erfolgreiches Speichern, bewusstes Schließen des Editors oder ein neues Angebot entfernt/ersetzt sie. Bei fehlendem Browser-Speicher bleiben Eingaben im offenen Formular erhalten.

