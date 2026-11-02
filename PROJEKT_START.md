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

## Aktueller Schwerpunkt

Stand der Arbeit an v959:

- Herstellerbilder werden über eindeutige GTIN oder bestätigte Herstellerartikelnummer zugeordnet. Großhändlernummern und ähnlich klingende Namen reichen dafür nicht aus.
- Zusätzlich zu Hager/Berker/Elcom wurde der öffentliche JUNG-Katalog als weitere Bildquelle angebunden. Die erste Ergänzung umfasst 40 geprüfte Produktreferenzen; der geplante Aktualisierungslauf ergänzt weitere.
- WAGO ist als weitere eindeutige Bildquelle integriert: erste 26 Referenzen, darunter 221-412. JUNG umfasst inzwischen 80 geprüfte Referenzen; häufige Standardartikel und unterschiedliche Produktgruppen werden bevorzugt gesammelt. Der gesamte Bildindex enthält bei dieser Veröffentlichung 2.111 Einträge.
- Der lokale Bildindex wird sofort geladen; die aktuelle Onlinefassung folgt im Hintergrund.
- Kataloge werden paketweise aus IndexedDB gelesen. Die Einkaufssuche baut und sortiert die Trefferliste nicht mehr bei jedem geprüften Katalogartikel erneut auf.
- Suchvorschläge vermeiden wiederholte Textnormalisierung und doppelte technische Filterung. Gleiche Kennungen, strenge Serie/Farbe und geänderte Artikeltexte sind gesondert geprüft; die Messung im Prüfbericht betrifft nur den konkreten lokalen Ablauf.
- v959 verwendet gemeinsame Artikelbild-/Sternanzeigen und persönliche Cloud-Favoritenlisten je Benutzer/Firma. Favoriten übernehmen keine Preise oder Bestandsversprechen. Normale Schalterfunktionen stehen vor nicht angefragten Sondervarianten; lokale Funktionssuchen prüfen den ganzen Katalog. Bei aktiver Online-Suche bleibt das frühzeitige Beenden unabhängiger lokaler Scans erhalten.
- Die Checkliste trennt umgesetzte, geprüfte Punkte von teilweise erledigten und offenen Wünschen. Eine vollständig schnelle App oder Bilder für jeden Artikel sind noch nicht nachgewiesen.

## Für die nächste Codex-Sitzung

`AGENTS.md` enthält die verbindlichen Projektregeln. Firmen-/Mitarbeitergrenzen, abgeschlossene Dokumente, exakte Preise und Artikelidentität erhalten. Keine echten Bestellungen oder Produktionsrechnungen für Tests auslösen. Die relevante Prüfung steht in `.github/workflows/app-review-checks.yml`; sie nutzt isolierte Datenbank- und Händlerfixtures.

Neue Wünsche in `CHECKLISTE_Arbeitszeiterfassung.txt` ergänzen. Erst nach Umsetzung und passender Prüfung abhaken. Nach einem abgeschlossenen Arbeitsblock Änderungen prüfen und im GitHub-Projekt sichern; veröffentlichte App-Dateien anschließend gegen den zusammengeführten Commit prüfen. Ungespeicherte lokale Änderungen werden nicht allein durch die Existenz des GitHub-Projekts gesichert.

Die private Codex-Cloud-Umgebung „Projekt-Arbeitszeiterfassung“ ist veröffentlicht und wird im Konto als startbar angezeigt. Repository, installierte Node-Abhängigkeiten, Git-Zugriff und lokaler HTTP-Start wurden in der Einrichtung geprüft; 12 nicht-browserbasierte CI-Prüfläufe und die drei Python-Tests bestanden. Die zehn Browser-Testbefehle bleiben bis zu einem erfolgreichen Lauf in der frischen Cloud-Instanz offen: Der gepinnte Chromium-Download war in der Einrichtungsinstanz durch die dort noch aktive Netzwerkpolicy blockiert. Die veröffentlichte Konfiguration enthält die gezielten Download-Domains. Es wurden keine Produktionszugänge oder echten Bestellungen/Rechnungen für die Einrichtung benutzt.

Ein neuer Cloud-Chat startet mit dem veröffentlichten Stand der Umgebung. Änderungen am Programm nach Prüfung committen und auf GitHub sichern; mehrere bestehende Chats teilen nicht automatisch denselben laufenden Arbeitsordner. Für den aktuellen Entwicklungsstand immer den tatsächlichen Repository-Commit prüfen. Das ChatGPT-Projekt enthält dauerhafte Anweisungen, die auf die jeweils aktuellen Projektdateien verweisen.

Offizielle Hinweise: [Codex-Cloud-Arbeitsumgebungen](https://learn.chatgpt.com/docs/environments/cloud-environments), [Projekte, Chats und Dateizugriff](https://learn.chatgpt.com/docs/projects).
