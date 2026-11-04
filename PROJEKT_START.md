# Arbeitszeiterfassung – hier weiterarbeiten

Diese Seite ist der zentrale Einstieg für einen neuen Laptop oder einen neuen Codex-Chat.
Code, Checkliste und geprüfte Änderungen werden im bestehenden GitHub-Projekt gespeichert.
Nach einer Veröffentlichung liefert GitHub Pages den neuen Stand automatisch aus.

- [Arbeitszeit-App öffnen](https://fedex-420.github.io/Projekt-Arbeitszeiterfassung/)
- [Zentrale Checkliste öffnen](https://fedex-420.github.io/Projekt-Arbeitszeiterfassung/CHECKLISTE_Arbeitszeiterfassung.txt)
- [Programmcode und Versionsgeschichte](https://github.com/FedEx-420/Projekt-Arbeitszeiterfassung)
- [Aktuelle Änderungen und Code Reviews](https://github.com/FedEx-420/Projekt-Arbeitszeiterfassung/pulls?q=is%3Apr)
- [Automatische Prüfungen und Veröffentlichungen](https://github.com/FedEx-420/Projekt-Arbeitszeiterfassung/actions)
- [Letzter Prüfbericht zu Bildern und Suchgeschwindigkeit](docs/Pruefstand_v957.md)
- [Erweiterung: WAGO-Bilder, zusätzliche JUNG-Artikel und Suchvorschläge](docs/Pruefstand_v958.md)

## Auf dem neuen Laptop

1. Diese Seite als Lesezeichen speichern. Für die Nutzung der Arbeitszeit-App genügt der App-Link und die gewohnte Anmeldung.
2. Für die Weiterentwicklung mit demselben GitHub- und ChatGPT-Konto anmelden. Das angeheftete ChatGPT-Projekt heißt „Arbeitszeiterfassung“ und enthält den Chat „Projektübergabe Arbeitszeiterfassung“. Für Codearbeit in Codex „Ausführen in → Cloud“ und die private Umgebung „Projekt-Arbeitszeiterfassung“ auswählen; das bestehende Repository ist dort hinterlegt.
3. Im neuen Chat sagen: „Arbeite am Projekt FedEx-420/Projekt-Arbeitszeiterfassung weiter. Lies zuerst AGENTS.md, PROJEKT_START.md und CHECKLISTE_Arbeitszeiterfassung.txt. Priorität haben eindeutige Artikelbilder und schnelle Artikel-/Katalogsuche.“
4. Nur falls erforderlich die GitHub-/Supabase-Verbindung erneut freigeben. Kennwörter gehören in die jeweiligen Anmeldeformulare, niemals in Projektdateien oder den Chat.

## Was bereits online liegt – und was separat gesichert werden muss

| Inhalt | Speicherort / Umzug |
| --- | --- |
| Veröffentlichter Programmcode, Migrationen, öffentliche Bildzuordnungen, Tests, Checkliste und Prüfberichte | Dieses GitHub-Repository mit Versionsgeschichte |
| Geschäftsdaten, die erfolgreich in der App gespeichert wurden | Bestehendes Supabase-Projekt; auf dem neuen Gerät mit dem richtigen App-Konto anmelden |
| Originaldateien gespeicherter Fachhändlerkataloge und deren lokaler Suchindex | Bisher im jeweiligen Browserprofil. Im alten Browser unter „Kataloge → Fachhändler Kataloge → Originaldateien herunterladen“ sichern und auf dem neuen Gerät wieder einlesen. Eine gemeinsame Cloudablage ist noch offen. |
| Noch nicht übernommene Eingaben, einzelne Entwürfe, Downloads und Screenshots | Können ausschließlich auf dem bisherigen Gerät liegen; vor dessen Zurücksetzen separat sichern |
| Historische Chattexte | Ein Textarchiv der im bisherigen lokalen Chatprotokoll verfügbaren Nutzertexte und sichtbaren Antworten liegt im privaten ChatGPT-Projekt im Chat „Projektübergabe Arbeitszeiterfassung“. Es ist eine Momentaufnahme vom 02.11.2026, enthält keine Bilddateien/Tool-Rohdaten/Originalkataloge und ersetzt keine laufende Gesprächssynchronisierung. Der ursprüngliche lokale Codex-Chat wurde nicht in eine native Cloud-Konversation umgewandelt. |

Private Kataloge, Einkaufspreise, Kundendaten, Chatprotokolle und Zugangsdaten werden nicht in dieses Repository hochgeladen. Das Chat-Textarchiv bleibt im eigenen privaten ChatGPT-Projekt. Die hier gepflegte fachliche/technische Übergabe und der Repository-Stand ermöglichen die Weiterentwicklung; lokale Originaldateien und ungesicherte Eingaben müssen separat gesichert werden.

- [Prüfbericht: gemeinsame Artikelbilder, Funktionssuche und Favoriten](docs/Pruefstand_v959.md)
- [Neue Bildquelle Gira und weitere Berker/Hager-Grundgeräte](docs/Pruefstand_v960.md)
- [Lesbare Katalogprüfung und PDF-Auszüge](docs/Pruefstand_v961.md)

- [Reaktionsfähige Suche mit 30.000 Testartikeln](docs/Pruefstand_v962.md)

## Aktueller Schwerpunkt

Stand der Arbeit an v967:

- Herstellerbilder werden über eindeutige GTIN oder bestätigte Herstellerartikelnummer zugeordnet. Großhändlernummern und ähnlich klingende Namen reichen dafür nicht aus.
- Zusätzlich zu Hager/Berker/Elcom wurde der öffentliche JUNG-Katalog als weitere Bildquelle angebunden. Die erste Ergänzung umfasst 40 geprüfte Produktreferenzen; der geplante Aktualisierungslauf ergänzt weitere.
- WAGO ist als weitere eindeutige Bildquelle integriert: erste 26 Referenzen, darunter 221-412. JUNG umfasst inzwischen 80 geprüfte Referenzen; häufige Standardartikel und unterschiedliche Produktgruppen werden bevorzugt gesammelt. Der gesamte Bildindex enthielt beim Stand v958 2.111 Einträge.
- Der lokale Bildindex wird sofort geladen; die aktuelle Onlinefassung folgt im Hintergrund.
- Kataloge werden paketweise aus IndexedDB gelesen. Die Einkaufssuche baut und sortiert die Trefferliste nicht mehr bei jedem geprüften Katalogartikel erneut auf.
- Suchvorschläge vermeiden wiederholte Textnormalisierung und doppelte technische Filterung. Gleiche Kennungen, strenge Serie/Farbe und geänderte Artikeltexte sind gesondert geprüft; die Messung im Prüfbericht betrifft nur den konkreten lokalen Ablauf.
- v959 verwendet gemeinsame Artikelbild-/Sternanzeigen und persönliche Cloud-Favoritenlisten je Benutzer/Firma. Favoriten übernehmen keine Preise oder Bestandsversprechen. Normale Schalterfunktionen stehen vor nicht angefragten Sondervarianten; lokale Funktionssuchen prüfen den ganzen Katalog. Bei aktiver Online-Suche bleibt das frühzeitige Beenden unabhängiger lokaler Scans erhalten.
- v960 ergänzt Gira mit zunächst 40 eindeutigen Bildreferenzen und weitere 53 Berker/Hager-Referenzen, darunter den alten Wechselschalter 3036. Der öffentliche Bildindex umfasst damit 2.204 Einträge. Die automatische Sammlung berücksichtigt jetzt mehrere Grundgeräte-/Produktgruppen; interner SKU-Zusatz und ausdrücklich angegebene Herstellerreferenz werden getrennt geprüft.
- v961 ergänzt unter „Kataloge → Fachhändler Kataloge → Katalog prüfen / PDF-Auszug“ eine schreibgeschützte Auswertung aller gespeicherten Datensätze mit Preisübersicht, Filtern und einem ausdrücklich auf 200 Treffer begrenzten PDF-Auszug. Originaldateien und Materialpreise werden dadurch nicht geändert.
- v962 entfernt wiederholte Vollsuchen und Neuberechnungen bei Händlerantworten, verarbeitet Einkaufssuchen in kurzen Paketen und reduziert die Vollsuchen für Stundenpositionen. Der vollständige Test mit 30.000 synthetischen Artikeln ergibt lokal im Einkauf ca. 1,4 s statt 3,1 s und bei 20 simulierten Händlerantworten ca. 0,8 s statt 17,2 s. Die Materialliste benötigt nach der Stundenpositionskorrektur ca. 0,7 s statt 1,3 s. Details, Messgrenzen und der noch offene direkte Firefox-Test stehen im Prüfbericht v962. Keine Änderung an Produktionsdaten oder Datenbankschemata.
- Die Checkliste trennt umgesetzte, geprüfte Punkte von teilweise erledigten und offenen Wünschen. Eine vollständig schnelle App oder Bilder für jeden Artikel sind noch nicht nachgewiesen.

v963 verwendet die Texttreffer der Materialliste für die technischen Filter gemeinsam. Der GitHub-Test mit 30.000 Artikeln bestand in Firefox 153 unter Linux. Die längste gemessene Verarbeitungspause der Materialliste betrug in diesem Lauf 0,60 Sekunden. Der lokale Firefox-Start unter Windows meldet eine fehlende mozglue-Assemblierung.

Die historische Planungssuite prüft wieder die aktuelle Oberfläche und den PDF-Dialog. 36 Szenarien sowie sieben Prüfungen der gemeinsamen Stammdatenfunktionen liefen lokal und auf GitHub erfolgreich. Weitere historische Browserprüfungen bleiben offen.

v964 hält den Abschnitt zur Standortfreigabe bei Aktualisierungen offen. Der Browser-Test prüft die sichtbare Rückmeldung, Widerruf und Trennung zwischen Konten mit simulierten Berechtigungen.

Die Angebotsmaske wurde bei 320, 390, 844, 1366 und 1920 Pixeln Browserbreite geprüft. Die PLZ ist per Tab erreichbar und behält führende Nullen. Die 12 isolierten Prüffälle sind in die GitHub-Prüfung aufgenommen.

Die Angebotsprüfung deckt auch Wiederherstellung und Speicherung nach Sitzungsablauf ab. Sieben Browserfälle verwenden den aktuellen Steuerdialog und die echte Angebotsfunktion in einer isolierten Testdatenbank.

Der modernisierte Zeitkonto-Test prüft die aktuelle PDF-Vorschau und den Download. Die 13 isolierten Fälle umfassen Kontotrennung, Abwesenheiten und einen mehrseitigen Bericht mit 60 Arbeitsperioden und Firmenlogo.

Die aktualisierte Browserprüfung für den Produkt-Assistenten umfasst 19 Fälle. Sie prüft die aktuelle Artikelsuche, die sichtbare Bildanzeige und das geführte Eingrenzen von Schaltern, Schutzgeräten, Leitungen und Patchkabeln mit isolierten Beispieldaten.

v965 erklärt im Katalogassistenten fehlende Mengeneinheiten und Nettoverkaufspreise am betroffenen Artikel. Der isolierte Browserlauf prüft CSV, Korrektur, Auslassen und einen ausdrücklich eingegebenen Nullpreis. Weitere Importwege bleiben auf der Checkliste.

v966 zeigt numerische Katalogpreise im Korrekturdialog im erwarteten Dezimalformat. Der JSON-Browsertest prüft fehlende Werte, einen bestätigten Nullpreis und die Umrechnung eines Preises je 100 Einheiten bis zum isolierten Import.

Der Katalog-Browsertest deckt nun auch BMEcat und DATANORM 4 und 5 ab. Er prüft Korrektur und bestätigte Übernahme einschließlich exakter Artikelnummern, Preisbasis je 100 und Trennung von BMEcat-Bruttoempfehlung und Nettoverkaufspreis.

Der Bildindex enthält 40 weitere Gira-Produktbilder und insgesamt 2.622 Referenzen. Alle neuen Zuordnungen wurden über die exakte GTIN und Gira-Herstellerartikelnummer geprüft.

v967 entfernt den zweiten vollständigen Datenabruf nach dem Login. Die App zeigt nach der Profilprüfung die Startansicht mit Ladehinweis. Vorübergehende Verbindungsfehler lassen eine gespeicherte Anmeldung bestehen. Der Team-Arbeitsschein wird nach Bestätigung über gezielte Lesezugriffe aktualisiert. Der echte Admin-Bestand wurde nicht gemessen.

Der öffentliche Bildindex enthält 2.756 Referenzen. Die Ergänzung umfasst 134 eindeutige Zuordnungen aus den Herstellerkatalogen von Gira, JUNG und WAGO.

## Für die nächste Codex-Sitzung

`AGENTS.md` enthält die verbindlichen Projektregeln. Firmen-/Mitarbeitergrenzen, abgeschlossene Dokumente, exakte Preise und Artikelidentität erhalten. Keine echten Bestellungen oder Produktionsrechnungen für Tests auslösen. Die relevante Prüfung steht in `.github/workflows/app-review-checks.yml`; sie nutzt isolierte Datenbank- und Händlerfixtures.

Neue Wünsche in `CHECKLISTE_Arbeitszeiterfassung.txt` ergänzen. Erst nach Umsetzung und passender Prüfung abhaken. Nach einem abgeschlossenen Arbeitsblock Änderungen prüfen und im GitHub-Projekt sichern; veröffentlichte App-Dateien anschließend gegen den zusammengeführten Commit prüfen. Ungespeicherte lokale Änderungen werden nicht allein durch die Existenz des GitHub-Projekts gesichert.

Die private Codex-Cloud-Umgebung „Projekt-Arbeitszeiterfassung“ ist veröffentlicht und wird im Konto als startbar angezeigt. Repository, installierte Node-Abhängigkeiten, Git-Zugriff und lokaler HTTP-Start wurden in der Einrichtung geprüft; 12 nicht-browserbasierte CI-Prüfläufe und die drei Python-Tests bestanden. Die zehn Browser-Testbefehle bleiben bis zu einem erfolgreichen Lauf in der frischen Cloud-Instanz offen: Der gepinnte Chromium-Download war in der Einrichtungsinstanz durch die dort noch aktive Netzwerkpolicy blockiert. Die veröffentlichte Konfiguration enthält die gezielten Download-Domains. Es wurden keine Produktionszugänge oder echten Bestellungen/Rechnungen für die Einrichtung benutzt.

Ein neuer Cloud-Chat startet mit dem veröffentlichten Stand der Umgebung. Änderungen am Programm nach Prüfung committen und auf GitHub sichern; mehrere bestehende Chats teilen nicht automatisch denselben laufenden Arbeitsordner. Für den aktuellen Entwicklungsstand immer den tatsächlichen Repository-Commit prüfen. Das ChatGPT-Projekt enthält dauerhafte Anweisungen, die auf die jeweils aktuellen Projektdateien verweisen.

Offizielle Hinweise: [Codex-Cloud-Arbeitsumgebungen](https://learn.chatgpt.com/docs/environments/cloud-environments), [Projekte, Chats und Dateizugriff](https://learn.chatgpt.com/docs/projects).

Am 04.11.2026 wurde der Bild-Zwischenstand in v968 veröffentlicht und live geprüft: 1.974 Berker-, 1.508 Hager- und 2.229 DEHN-Zuordnungen. Der vollständige Abgleich bleibt offen.

v970 zeigt die App nach bestätigtem Profil und gibt Übersicht und Zeiterfassung nach den erforderlichen Arbeitsdaten frei. Der Materialabruf hält die Übersicht nicht auf. Der isolierte Browserlauf mit blockierter Materialantwort und gespeicherter Anmeldung ist bestanden.

Für Neugart ist der frei wählbare Warenkorbname vorbereitet. Der Name geht beim Anlegen an den Händler und ist Teil der Wiederholungsprüfung. Die Freigabe gespeicherter Konten und die Veröffentlichung sind offen.

v971 ergänzt Neugart-Zugänge für Geschäftskonten. Supabase Vault schützt die Zugangsdaten. Mitarbeiter erhalten im Einkauf ausschließlich die freigegebenen Konten. Übergabe und Widerruf sind isoliert geprüft. Die abschließende Bestellung erfolgt im Händlerportal. Der Test mit realen Zugangsdaten bleibt offen.

v972 entkoppelt das Öffnen der Menüs vom gesamten Startabruf und teilt betriebliche Favoriten im Neugart-Einkauf. Supabase meldet knappes Disk-I/O-Budget. Eine aggregierte Messung ergab 176 MB Datenbank, davon rund 119 MB Materialtabelle inklusive Indexen und rund 17 MB für einen zum eindeutigen Namensindex redundanten Suchindex. Originalkataloge und die gemeldete Bildverwechslung bleiben offen.
