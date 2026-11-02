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

## Auf dem neuen Laptop

1. Diese Seite als Lesezeichen speichern. Für die Nutzung der Arbeitszeit-App genügt der App-Link und die gewohnte Anmeldung.
2. Für die Weiterentwicklung mit demselben GitHub- und ChatGPT-Konto anmelden und dieses Repository in Codex öffnen oder in einer Codex-Cloud-Arbeitsumgebung auswählen.
3. Im neuen Chat sagen: „Arbeite am Projekt FedEx-420/Projekt-Arbeitszeiterfassung weiter. Lies zuerst AGENTS.md, PROJEKT_START.md und CHECKLISTE_Arbeitszeiterfassung.txt. Priorität haben eindeutige Artikelbilder und schnelle Artikel-/Katalogsuche.“
4. Nur falls erforderlich die GitHub-/Supabase-Verbindung erneut freigeben. Kennwörter gehören in die jeweiligen Anmeldeformulare, niemals in Projektdateien oder den Chat.

## Was bereits online liegt – und was separat gesichert werden muss

| Inhalt | Speicherort / Umzug |
| --- | --- |
| Veröffentlichter Programmcode, Migrationen, öffentliche Bildzuordnungen, Tests, Checkliste und Prüfberichte | Dieses GitHub-Repository mit Versionsgeschichte |
| Geschäftsdaten, die erfolgreich in der App gespeichert wurden | Bestehendes Supabase-Projekt; auf dem neuen Gerät mit dem richtigen App-Konto anmelden |
| Originaldateien gespeicherter Fachhändlerkataloge und deren lokaler Suchindex | Bisher im jeweiligen Browserprofil. Im alten Browser unter „Kataloge → Fachhändler Kataloge → Originaldateien herunterladen“ sichern und auf dem neuen Gerät wieder einlesen. Eine gemeinsame Cloudablage ist noch offen. |
| Noch nicht übernommene Eingaben, einzelne Entwürfe, Downloads und Screenshots | Können ausschließlich auf dem bisherigen Gerät liegen; vor dessen Zurücksetzen separat sichern |
| Vollständiger bisheriger Chatverlauf | Ist nicht Bestandteil des GitHub-Projekts. Chat-Synchronisierung und Dateizugriff sind unterschiedliche Funktionen; ein neuer Cloud-Chat übernimmt den alten lokalen Chat nicht automatisch. |

Private Kataloge, Einkaufspreise, Kundendaten, Chatprotokolle und Zugangsdaten werden nicht in dieses Repository hochgeladen. Für den Gerätewechsel genügt für die Weiterentwicklung die hier gepflegte fachliche/technische Übergabe; sie ist kein vollständiger Export aller privaten Inhalte.

## Aktueller Schwerpunkt

Stand der Arbeit an v957:

- Herstellerbilder werden über eindeutige GTIN oder bestätigte Herstellerartikelnummer zugeordnet. Großhändlernummern und ähnlich klingende Namen reichen dafür nicht aus.
- Zusätzlich zu Hager/Berker/Elcom wurde der öffentliche JUNG-Katalog als weitere Bildquelle angebunden. Die erste Ergänzung umfasst 40 geprüfte Produktreferenzen; der geplante Aktualisierungslauf ergänzt weitere.
- Der lokale Bildindex wird sofort geladen; die aktuelle Onlinefassung folgt im Hintergrund.
- Kataloge werden paketweise aus IndexedDB gelesen. Die Einkaufssuche baut und sortiert die Trefferliste nicht mehr bei jedem geprüften Katalogartikel erneut auf.
- Die Checkliste trennt umgesetzte, geprüfte Punkte von teilweise erledigten und offenen Wünschen. Eine vollständig schnelle App oder Bilder für jeden Artikel sind noch nicht nachgewiesen.

## Für die nächste Codex-Sitzung

`AGENTS.md` enthält die verbindlichen Projektregeln. Firmen-/Mitarbeitergrenzen, abgeschlossene Dokumente, exakte Preise und Artikelidentität erhalten. Keine echten Bestellungen oder Produktionsrechnungen für Tests auslösen. Die relevante Prüfung steht in `.github/workflows/app-review-checks.yml`; sie nutzt isolierte Datenbank- und Händlerfixtures.

Neue Wünsche in `CHECKLISTE_Arbeitszeiterfassung.txt` ergänzen. Erst nach Umsetzung und passender Prüfung abhaken. Nach einem abgeschlossenen Arbeitsblock Änderungen prüfen und im GitHub-Projekt sichern; veröffentlichte App-Dateien anschließend gegen den zusammengeführten Commit prüfen. Ungespeicherte lokale Änderungen werden nicht allein durch die Existenz des GitHub-Projekts gesichert.

Eine zusätzliche Codex-Cloud-Arbeitsumgebung wurde angefragt. Sie darf erst als eingerichtet gelten, wenn sie im Konto veröffentlicht und startbar ist. Die vorbereitete Übergabe hier funktioniert unabhängig davon.

Offizielle Hinweise: [Codex-Cloud-Arbeitsumgebungen](https://learn.chatgpt.com/docs/environments/cloud-environments), [Projekte, Chats und Dateizugriff](https://learn.chatgpt.com/docs/projects).
