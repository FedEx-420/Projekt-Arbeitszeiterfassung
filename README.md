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

Unter Einstellungen → Gerätefreigaben kann jedes Konto Push-Mitteilungen und die freiwillige Standort-/Ankunftserkennung für sich auf diesem Gerät erlauben oder ausschalten. Push prüft zusätzlich die Serverregistrierung; ein bloß vorhandenes Browser-Abonnement gilt nicht als erfolgreiche Freigabe. Die Testnachricht wird nur an das aktuelle Gerät geschickt. Der Status unterscheidet Annahme durch den Push-Dienst von der tatsächlichen Anzeige auf dem Gerät (Fokus-/Systemeinstellungen können diese unterdrücken). Auf iPhone/iPad erfordert Web-Push ab iOS 16.4 eine über Safari zum Home-Bildschirm hinzugefügte Web-App. Bei explizitem Abmelden wird das Geräteabonnement deaktiviert; nach erneuter Anmeldung kann es ohne erneute Systemfreigabe wieder registriert werden.

Die Standortfreigabe wird pro Konto und Browser gespeichert, ohne Koordinaten im Browser abzulegen. Der Freigabetest in den Einstellungen lädt keinen Standort hoch. Bei geöffnetem eigenem Arbeitsschein von heute und hinterlegtem Kundenstandort kann die erste Ankunft erkannt werden. Die Prüfung stoppt beim Verlassen des Auftrags, Abmelden, Ausschalten oder Wechsel der App in den Hintergrund. Es gibt keine Hintergrundverfolgung, keine Speicherung eines Bewegungsverlaufs und keine automatische Änderung von Arbeitszeiten. Die serverseitigen Firmen- und Mitarbeitergrenzen bleiben erhalten.

Neben jedem manuell eingebbaren Material steht eine Einheitenauswahl: Stk (Stück), M (Meter), H (Stunden), Pau (Pauschale), Kg (Kilogramm). Dies gilt für die Materialliste, neue/bearbeitete Arbeitsscheine und Angebote. Neue Positionen übernehmen zunächst die Einheit der Materialliste; eine eigene Auswahl wird pro Position gespeichert und bleibt bei späteren Änderungen der Materialliste erhalten. Arbeitsnachweise, Rechnungen und Angebots-PDFs zeigen die Einheit. Es erfolgt keine automatische Umrechnung von Menge, Preis oder Arbeitszeit. Bestehende Einträge werden nicht geändert; bisherige Materialpositionen erscheinen als Stk und automatische Arbeitszeitpositionen als H.

Die Tagesplanungen werden auf diesen Seiten alle 20 Sekunden und beim erneuten Öffnen aktualisiert, ohne ungespeicherte Formularfelder, Unterschriften oder ausgewählte Dateien zurückzusetzen. Noch nicht genehmigte Vorschläge und abgesagte Termine erscheinen nicht als Arbeitsschein-Entwurf.

Angebote sind firmengebunden und serverseitig durch RLS abgesichert. Sie buchen keine Arbeitszeiten, erzeugen keine Arbeitsscheine und ändern keine Rechnungen. Preise/Adressen werden als Angebotsstand gespeichert und können im Angebot bearbeitet werden; spätere Änderungen der Materialliste verändern gespeicherte Angebote nicht. Bei gleichzeitigem Bearbeiten verhindert eine Revisionsprüfung das Überschreiben eines neueren Stands. Neue, vom Benutzer bestätigte Kunden und Artikel werden beim Speichern eines Angebots atomar im firmengebundenen Kunden-/Materialstamm angelegt. Neue Artikel übernehmen Angebots-Einheit und Einzelpreis (auch 0 €); bestehende Stammdaten werden nicht überschrieben. Ähnliche abgelehnte Vorschläge werden nicht automatisch zusammengeführt. Bei Speicherfehlern werden Angebot und neue Stammdaten gemeinsam zurückgerollt. Die Migration verändert keine vorhandenen Dokumente; beim erneuten Speichern eines bestehenden Angebots werden freie Namen ebenfalls registriert. MwSt. wird pro Angebot ausdrücklich eingestellt (anfangs 0 %). Nach dem Speichern enthält die PDF den gespeicherten Stand.

Die Angebots-PDF nummeriert jede Material-/Arbeitsposition fortlaufend über alle Seiten. Einzelpreise und Positionssummen sind rechtsbündig. Der hervorgehobene Abschlussblock zeigt Netto, Mehrwertsteuer und Gesamtbetrag inkl. MwSt. mit derselben rechten Kante wie die Positionssummen; die letzte Position und der vollständige Summenblock bleiben zusammen.

Anmeldungen werden vor geschützten Anfragen automatisch erneuert, auch nach längeren Artikel-Rückfragen. Gleichzeitige Erneuerungen werden zusammengefasst und zwischen Browser-Tabs koordiniert. Nur eine ausdrücklich wegen JWT-Ablaufs zurückgewiesene Anfrage wird einmal erneut gesendet; Verbindungsfehler und Serverfehler lösen keine automatische Wiederholung einer möglicherweise bereits gespeicherten Änderung aus.

Ungespeicherte Angebotseingaben und bestätigte Artikel-Auswahlen werden im jeweiligen Browser-Tab pro Benutzer und Firma zwischengesichert. Nach Neuladen oder erneuter Anmeldung können sie unter Angebote fortgesetzt werden. Die Zwischensicherung ist kein serverseitig gespeichertes Angebot und endet mit dem Schließen des Tabs; erfolgreiches Speichern, bewusstes Schließen des Editors oder ein neues Angebot entfernt/ersetzt sie. Bei fehlendem Browser-Speicher bleiben Eingaben im offenen Formular erhalten.

