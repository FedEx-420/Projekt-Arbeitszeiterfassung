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

v973 lädt beim Anmelden keine Materialseiten mehr. Materialabhängige Bereiche holen sie bei Bedarf über den bestehenden Primärindex per ID-Cursor. Der Browserlauf prüft die Anmeldung ohne Materialabruf sowie das Kundenformular bei absichtlich angehaltener Materialantwort. Der redundant aufgebaute Namensindex wurde in Supabase entfernt. Die Materialtabelle samt Indexen ging von 124813312 auf 106790912 Bytes zurück, der eindeutige Index ist gültig. Die Beobachtung der Drosselung unter realer Nutzung bleibt offen.

v974 nutzt im gespeicherten Neugart-Einkauf serverseitige Suche nach Artikelname, Hersteller, Kategorie und Artikelnummer. Verwaltung nutzt und verwaltet gespeicherte Neugart-Zugänge des ausgewählten Betriebs. Zugangsdaten bleiben serverseitig. 48 offizielle A.1-/C.1-Rahmenreferenzen waren bereits im Bildindex. Die Anzeige bevorzugt nun die exakte Herstellerzuordnung für bestätigte Serien. Originalkataloge, vollständige Materialbearbeitung für ausgewählte Mitarbeitende und Live-Händlergegenprobe bleiben offen.

v975 trennt die Favoriten von den Katalogtreffern und startet die Neugart-Suche beim Tippen. Für Hager waren im freigegebenen lokalen Neugart-Bestand keine Namens-/Herstellertreffer vorhanden. Ohne lokale Treffer greift die App deshalb auf den Onlinekatalog zu. Beim Hinzufügen ruft sie die Händlerdetails erneut ab und speichert einen geprüften Artikel per gesperrtem Server-RPC idempotent. Ein zurückgerollter Datenbanktest sowie die Browserprüfung mit getrennten Favoriten-/Katalogdaten sind bestanden. 12.097 weitere öffentliche Bildreferenzen wurden übernommen. Die Live-Suche mit dem tatsächlichen Händlerkonto bleibt zu prüfen.

v976 trennt die Neugart-Suche vom persönlichen Warenkorb-Menü. Der Warenkorb wird je Mitarbeiter, Betrieb und Händlerzugang in sessionStorage gesichert. Bestätigte Übertragungen behalten ihre Anforderungs-ID zum erneuten Öffnen. Das Handoff-Formular bleibt nach submit bestehen und verwendet das aktuelle Händlertoken. Der isolierte Browserlauf prüft zwei Mitarbeiter, erhaltene Mengen, getrennte Suche und POST-Navigation. Die produktive Händler-/iPhone-Gegenprobe bleibt offen.

v977 wertet den Anmeldeschlüssel aus direkten und umschlossenen Händlerantworten aus. Das Fehlen eines Schlüssels blockiert nicht mehr die Navigation zum bestätigten Warenkorb. Der klassische Einkauf erhält sein POST-Formular bis zur Navigation. Isolierte Server- und Browserprüfungen sind bestanden. Der Zugriff auf den tatsächlichen Firefox wurde vom Computer-Use-Werkzeug wegen fehlender URL-Policy-Unterstützung gestoppt, die produktive Händleranmeldung bleibt ungeprüft.

## Fortsetzung v979 – automatische Neugart-Anmeldung

Die offizielle GC-Anmeldung antwortet beim Wechsel zu EFG mit Status 11,
`successful: false` und einem `authenticationToken`. Die allgemeine
Ablehnungsprüfung darf diesen ausdrücklich bestätigten Weiterleitungsfall
nicht als fehlgeschlagene Anmeldung behandeln. `merchant.browserLogin`
prüft Status, EFG-Layout, Zielhost und Token getrennt. Der Schlüssel wird
erst nach dem Warenkorb-Rücklesen angefordert und ausschließlich für den
Browser-POST verwendet; Belege und Übertragungsprotokolle speichern ihn nicht.

Live geprüft: gespeicherter Zugang -> „Zugang prüfen“ -> angemeldeter EFG-Shop;
Kontomenü zeigt Benutzer und Logout. Vorhandener Warenkorb anschließend ohne
Anmeldeformular geöffnet. Kein Warenkorb angelegt, keine Position hinzugefügt
und keine Bestellung gesendet. Direkter Warenkorb-POST und Wiederholungen
sind mit isolierten Browser-/Serverfixtures geprüft. Ein echter iPhone-Test
über den vollständigen Bestellbutton steht weiterhin aus.

Temporäre IDS-Versuche und öffentliche Shop-Code-Diagnosen sind entfernt.
Weitere Angaben: [Prüfbericht v979](docs/Pruefstand_v979.md).

## v980 – Favoritenrechte und direkte Suche

Nur Administratoren und das zugehörige Geschäftskonto dürfen Favoriten
entfernen. Restriktive DELETE-Regeln schützen auch Mitarbeiter-Eigentum
und das Löschen ganzer Listen mit Kaskade. Identitätswechsel per UPDATE
sind für Mitarbeiter gesperrt. Lesen und Hinzufügen bleiben unverändert.

Die Favoritensuche nutzt ein gemeinsames Suchereignis: Neugart, Materialien
und lokale Einkaufskataloge starten sofort, löschen widersprüchliche
Merkmalsfilter, klappen die Favoriten zu und zeigen den Trefferbereich.
Datenbankrechte und alle drei Suchwege sind mit isolierten Fixtures geprüft.
Die Supabase-Migration wurde angewendet und die aktiven Regeln kontrolliert.

## v981 – Artikelpreise und Warenkorbwerte

Die gemeinsame Artikelanzeige zeigt EK und VK* netto je Basiseinheit.
VK* verwendet recommended_price_1, sonst unit_price bzw. den vorhandenen
Nettopreis. Fehlende Werte werden nicht zu Null umgedeutet. Favoriten
speichern weiterhin keine Preis-Snapshots; vorhandene Materialien werden
bei geöffneter Liste seitenweise nachgeladen. Neugart liefert lokale
Materialpreise in der Suche und liest Onlinepreise mit einer Sammelanfrage.
Bei mehreren Preisantworten wird ausschließlich anhand eindeutiger SKU
zugeordnet; weder Reihenfolge noch ähnliche Namen reichen aus.

Beide Warenkorbübersichten berechnen EK/VK netto, 19 % MwSt. und brutto
bei Mengenänderungen neu. Die Berechnung verwendet vier Dezimalstellen
beim Stückpreis, zwei bei Mengen und BigInt-Centrundung pro Position.
Bei fehlenden Preisen erscheinen ausdrücklich unvollständige Zwischenwerte.
Dies ist eine Übersicht mit hinterlegten Preisen, kein festgeschriebener
Händlerpreis. Angebote, Rechnungen und die übertragenen Bestellmengen
werden dadurch nicht geändert. Warenkorbtrennung und Anmelde-POST
sind weiterhin durch die Einkaufs-Browserprüfungen abgedeckt.

## v982 – bestätigte Katalogsuche und schnelle Angebotseingabe

Neugart- und allgemeine Einkaufskatalogsuche starten nach „Katalog durchsuchen“
oder Enter/Suchtaste. Tippen allein sendet keine Suche; alte Antworten werden
bei geänderter Eingabe verworfen. Favoriten und Suchvorschläge bleiben
explizite Suchaktionen. Die Materialliste behält ihre lokale Texteingrenzung.

Angebote erzeugen mit aktivierter bebilderter Artikelauswahl keine versteckte
vollständige Material-datalist mehr. Exakte Namens-/ID-Zuordnungen und die
Fotozuordnung verwenden Firmenindizes. Suchvorschläge werden erst nach
kurzer Tipp-Pause und in kooperativen, abbrechbaren Paketen verarbeitet.
Konto-/Firmenwechsel und geänderte Materialbestände verwerfen alte Ergebnisse.

Lokaler Edge-Test mit 30.000 Firmenartikeln: längster synchroner
Tastendruck 424 ms -> 3 ms; vollständige Trefferanzeige 1551 ms -> 846 ms
einschließlich kurzer Tipp-Pause. Vergleich mit 00a9471, synthetische Daten,
keine Aussage über jeden Livezugang oder jedes Endgerät. Lieferanten-/Preiswahl,
Angebotsentwurf-Wiederherstellung und mobile Angebotsansicht separat geprüft.
Ein historischer allgemeiner Einkaufstest erwartet noch den früheren XML-Export
und scheitert dort; die aktuellen Einkaufs-/Warenkorbprüfungen verwenden die
vereinfachte Übertragung und bestehen. Die alte XML-Erwartung gehört nicht
zur aktuellen Oberfläche und wurde in diesem Arbeitsblock nicht wieder eingebaut.

## v983 – Bilder ergänzen und Datenbankprüfungen entlasten

Der Herstellerparser erkennt explizit bestätigte Handelsreferenzen auch bei
internem numerischen Zusatz ohne Bindestrich. Sichtbare Referenz, Product-Name,
Produktpfad und eine gültige eindeutige EAN müssen zusammenpassen. Keine
Ableitung einer Herstellerartikelnummer aus einer Großhändlernummer.

160 öffentliche Hager-/Berker-Seiten geprüft, 37 Bildreferenzen bestätigt
(davon 27 neu), insgesamt 18.513 Einträge im öffentlichen Index. Alle
27 neuen Hager-Bildadressen antworteten mit HTTP 200 und einem Bildtyp.
Einträge ohne eindeutige Identität bleiben offen. Bereits ohne Bild
abgelegte Seiten werden mit dem neuen Parser einmal erneut geprüft.

Zwei RLS-Regeln verwenden jetzt die Identität der Anfrage als InitPlan statt
sie für jede Zeile erneut auszuwerten. Zeilenabhängige Firmen-/Auftragsrechte
bleiben bestehen. Die Migration ist live angewendet, die beiden entsprechenden
Supabase-Performance-Warnungen sind danach verschwunden. Gegenprobe mit sechs
Akteuren und 24 vorhandenen Teamdatenbankprüfungen in isolierten Datenbanken
bestanden. Weitere Hinweise zu Indizes und Vollabrufen sind damit nicht erledigt.

[Prüfbericht und Grenzen](docs/Pruefstand_v983.md).

## v984 – Artikelansicht, Admin-Menüs und Pauschalrechnung

Artikelvorschläge in Angeboten und Arbeitsscheinen belegen die volle Positionsbreite und stehen unter den Eingabefeldern. Foto, Favoritenstern, Netto-EK/VK und Artikelname bleiben lesbar. Der Einkauf stapelt auf kleinen Displays Bild-/Preisbereich und Artikelinhalt; der Hinzufügen-Button läuft nicht mehr über den Rand.

Katalogdekoration, Deutschland-Hinweise und Bestandsdarstellung überspringen fremde Menüs. Die bebilderte Auswahl benötigt keine versteckte Material-Komplettliste. Artikelindizes bleiben bis zum Wechsel von Konto, Firma oder Materialbestand erhalten; bestätigte Einkaufsimporte ersetzen den Material-Array, damit geänderte Einträge die Indizes zuverlässig verwerfen. Rechnungsgruppen werden pro Darstellung einmal berechnet.

Die Rechnungsprüfung bietet unter „Abrechnungsart“ eine Pauschalrechnung mit Leistungsbeschreibung und einem Netto-Festpreis. „Abrechnungsart übernehmen und Steuer prüfen“ lädt den bestätigten Serverstand und verlangt eine neue Steuerprüfung. Änderungen sperren die veraltete Vorschau und den Abschluss. Das PDF zeigt Pauschalleistung, Festpreis und Steuerzusammenfassung. Verwendete Artikel erscheinen in Prüfung und PDF mit Bezeichnung, Menge und Einheit. Bei Stundenrechnungen lassen sich Artikel-VK vor dem Abschluss ändern. Neue RPCs erhalten die bestehenden Rollen-, Firmen-, Quellen-, Sperr- und Wiederholungsprüfungen. Bestehende Rechnungen werden nicht umgeschrieben.

Die isolierten Prüfungen und Grenzen stehen in [Prüfstand v984](docs/Pruefstand_v984.md). Der produktive Admin-Datenbestand und die tatsächliche Netz-/Datenbanklatenz aller Menüs sind noch nicht vollständig gemessen.

Der Admin-Einkauf startet in v984 direkt mit dem gespeicherten Neugart-Zugang des ausgewählten Betriebs. Der bisherige allgemeine Einkaufsweg bleibt über den ausdrücklichen Moduswechsel zugänglich; seine Entwürfe bleiben erhalten. „Zum Großhändler übertragen und öffnen“ bezeichnet die Warenkorbübertragung klar und löst keine Bestellung aus. Admin- und Mitarbeiterweg, Firmenwechsel sowie Wiederöffnen mit derselben Vorgangskennung sind mit simulierten Händlerantworten geprüft. „Neugart-Konto öffnen“ prüft den gespeicherten Zugang unabhängig vom Warenkorb. Bei bestätigter Anmeldung ohne Weiterleitungsschlüssel öffnet die App den offiziellen Shop zur manuellen Anmeldung. Die produktive Gegenprobe für Geschäfts-, Mitarbeiter- und Adminkonten bleibt offen.

Die schreibgeschützte Liste „Fachhändler Kataloge“ wartet nicht mehr auf den gesamten Materialdownload. Originaldateien und Katalogprüfung bleiben so bei blockiertem Materialabruf erreichbar; der Importwechsel führt weiterhin in den materialabhängigen Katalogassistenten.

## v985 – Neugart bei Händlerfehlern

„Zugang prüfen“ meldet einen Anmeldefehler, wenn die Händler-Sitzung nicht aufgebaut werden kann. Bei einem vorübergehenden Server- oder Netzfehler wird der lesende Sitzungsabruf einmal wiederholt. Warenkorb-Schreibzugriffe werden nicht automatisch wiederholt. Die Händlerdiagnose protokolliert nur Shop, Anfragestufe und HTTP-Status.

„Neugart-Konto öffnen“ steht auch direkt im App-Warenkorb zur Verfügung und verwendet den gespeicherten Zugang getrennt von der Übertragung. Der direkte Link öffnet bei einer Händlerstörung die offizielle Anmeldeseite. Die App meldet Warenkorberfolg weiterhin erst nach bestätigter Rücklesung. Sitzungsfehler, erneuter Transfer mit derselben Vorgangskennung und unabhängige Browser-Anmeldung sind isoliert geprüft. Der Echtzugang bleibt gegenzuprüfen.

## v986 – Gefüllten Neugart-Warenkorb öffnen

Der Sitzungsabruf im Neugart-Händlerdienst wurde produktiv mit HTTP 401 abgewiesen. Beim ausdrücklich unangemeldeten Abruf lässt v986 den regulären Händlerlogin trotzdem zu. Die anschließende Händlerantwort muss die hinterlegte Kundennummer bestätigen. Artikel und Mengen werden über die bestehende protokollierte Übertragung geschrieben und zurückgelesen. Die Weiterleitung öffnet den gefüllten Händlerwarenkorb. Der Klick im Händlerportal schließt die Bestellung ab.

Der frühere produktive Transfer und die Rücklesung sind in [Einkauf v949](docs/Einkauf_v949.md) dokumentiert. Das neue Fixture prüft den vollständigen Transfer nach HTTP 401, den Anmeldeschlüssel sowie die Wiederöffnung ohne Duplikate. Ein HTTP 401 nach der Anmeldung blockiert den Schreibzugriff weiterhin. Der produktive Transfer nach der Änderung bleibt zu prüfen.

## v987 – Neugart-Verfügbarkeit und Gautzsch-Schnittstellen

Der Nutzer hat den Neugart-Warenkorb nach v986 als wieder funktionsfähig bestätigt. Die gemeinsame Artikelkarte nutzt v987 zusätzlich den freigegebenen Neugart-Zugang. Sie fragt sichtbare Treffer in begrenzten Gruppen ab, zeigt Händlertext und Lager und verwendet Grün, Grün/Gelb, Gelb oder Rot bei eindeutiger Antwort. Unklare Angaben bleiben grau. Der Neugart-Katalog kann bestätigte Nullbestände ausblenden. Die genaue Abdeckung der Portalzustände und nicht mit der gemeinsamen Karte gerenderter Artikelansichten bleibt offen.

Für Gautzsch dokumentiert der Hersteller DATANORM 4/5 über FiF unter Service → Datenservice sowie IDS 1.3 bis 2.3 mit automatischer Anmeldung und Artikel-Deep-Link. Die öffentliche OCI-Beschreibung belegt die Übergabe von FiF an die Handwerkersoftware. Die Gegenrichtung, der Rückleseweg und der maschinenlesbare Zugriff auf Suche, Bilder, Preise und Bestände müssen für den konkreten Zugang verifiziert werden. Zugangsdaten gehören ausschließlich in eine dafür freigegebene Einrichtung.

## v988 – Gautzsch-FiF-Datei aus dem Einkauf

FiF bestätigt den TXT-Import mit aufeinanderfolgenden Paaren aus HG-Artikelnummer und Menge. Der allgemeine Einkauf erzeugt für Gautzsch daraus eine TXT-Datei und verlinkt auf die FiF-Uploadseite. Die Artikelnummern werden aus dem aktuellen Firmenmaterial abgeglichen. Der Entwurf bleibt beim Export erhalten. Der Browser-Test prüft Dateiinhalte und Download. Ein produktiver Dateiimport wurde nicht ausgeführt.

Unter Service → DATANORM ist im FiF-Konto ein bereits bereitgestellter Export sichtbar. Der echte Export wurde vollständig lokal geprüft. Der Parser erkannte DATANORM 5 mit Artikelstamm und getrennter Preispflege. Die automatische Übergabe, Warenkorb-Rücklesung und Live-Artikeldaten bleiben offen. Die Anbindung soll ohne persönliche Kontaktaufnahme erfolgen.

## v989 – FiF-Artikelsuche aus der App

Gemeinsame Artikelkarten öffnen die FiF-Suche anhand der exakten Gautzsch-Händlernummer. Die Suche wurde im angemeldeten Portal am realen Geschäftszugang geprüft. Preise und Bestand erscheinen bei FiF. Der Link verwendet die FiF-Sitzung des Browsers. Automatischer Kontozugang, Artikelabruf in der App und direkte Warenkorbübergabe bleiben offen.

## v990 – Direkte FiF-IDS-Übergabe als Testweg

Am 07.11.2026 antwortete https://www.onlinesystem.de/IDS auf POST action=SV mit XML und den Versionen 1.3 bis 2.5. POST action=LI bestätigte Benutzername und Passwort als Pflichtfelder, Kundennummer als optional. GET an dieselbe Schnittstelle lieferte eine Fehlerseite.

Der allgemeine Gautzsch-Einkauf bietet deshalb eine ausdrücklich als neu zu prüfende direkte IDS-Übergabe per multipart/form-data im selben Tab. Die Anmeldung wird zusammen mit den geprüften Artikeln und Mengen an FiF gesendet. Zugangsdaten werden dafür vom anwesenden Benutzer eingegeben, nicht gespeichert oder an andere Konten verteilt. Der App-Entwurf bleibt erhalten. Erfolgreiche Warenkorbannahme wird erst im FiF-Portal geprüft. Wiederholtes Senden kann zusätzliche Händlerpositionen anlegen. Gespeicherte serverseitige Konten, Mitarbeiterdelegation und ein automatisches Rücklesen sind noch offen.

Bei der Prüfung wurde im angemeldeten FiF ein zusätzlicher leerer Testwarenkorb angelegt. Der TXT-Test lieferte keine bestätigte Position. Es wurde keine Bestellung abgeschickt.

## v991 – Einkaufszugang auswählen

Im Menü Einkauf wählt das Feld Einkaufszugang zwischen Neugart, Gautzsch · FiF und den weiteren bisherigen Fachhändlern. Neugart öffnet die gespeicherten freigegebenen Zugänge. Gautzsch öffnet im Geschäfts-/Adminkonto den FiF-Einkauf und schränkt die Material- und Katalogtreffer auf Gautzsch ein. Eigene Warenkörbe bleiben beim Wechsel erhalten. Konto-/Firmenwechsel verwirft die Auswahl. Mitarbeiter sehen für FiF den Hinweis auf die noch ausstehende Freigabe gespeicherter FiF-Zugänge.

## v992 – Favoriten je Einkaufszugang

Neugart und Gautzsch · FiF zeigen im Einkauf und bei vorhandenen Warenkörben eigene Favoritenansichten. Neue Listen werden mit dem Händlernamen gespeichert, sodass derselbe Listenname für beide Zugänge möglich ist. Bestehende Listen werden unverändert erhalten; in der Händleransicht erscheinen daraus ausschließlich passende Artikel. Die allgemeine Materialansicht behält die bisherige vollständige Favoritenverwaltung. Auch die Eingabevorschläge berücksichtigen den gewählten Händler. Firma, Benutzer und bisherige Datenbankberechtigungen bleiben maßgeblich. Favoriten speichern weiterhin keine Preise oder Bestandszusagen.

Browserprüfung mit synthetischen Daten: gleichnamige Listen beider Händler, getrennte Listenauswahl, Wiederwechsel samt Warenkörben und vorhandene Konto-/Firmen-/Mitarbeiterprüfungen bestanden. Automatische FiF-Verfügbarkeit in der App und weitere gespeicherte FiF-Kontofunktionen bleiben offen. Der vorhandene Artikellink öffnet Preis und Verfügbarkeit beim im FiF-Portal angemeldeten Konto. Ein automatischer Preisvergleich ist als nächster Schritt aufgenommen und noch nicht umgesetzt.

## FiF-403-Diagnose und v993 – Rückkehr zum App-Warenkorb

Am 07.11.2026 wurde die aktuelle direkte WKS-Übergabe aus der App mit einer einzelnen bestehenden Gautzsch-Position im Browser geprüft. FiF leitete auf /Error/Forbidden mit ReturnUrl=/IDS und sichtbarem Fehler 403 weiter. Das trat auch nach Beenden der vorherigen Händlersitzung auf. Eine reguläre Händleranmeldung wurde anschließend über die frische Shop-Startseite bestätigt. Das beweist weder eine bestimmte fehlende IDS-Kontoberechtigung noch einen Fehler im XML. Eine erfolgreiche Warenkorbannahme ist weiterhin nicht nachgewiesen. Es wurde keine Bestellung abgeschlossen und keine Kontoberechtigung geändert. Eine vorübergehende einzelne App-Testposition wurde entfernt. Zugangsdaten wurden nur über die sichere Browser-Anmeldung eingegeben und werden nicht im Repository gespeichert.

Beim Zurückkehren über den Browsercache blieb der FiF-Button bisher bis zum Ende eines 60-Sekunden-Timers gesperrt. v993 beendet diesen Zustand beim Wiederanzeigen der Seite, erhält Positionen und Mengen und löst keinen erneuten Transfer aus. Das temporäre Übertragungsformular wird beim Verlassen entfernt und seine Felder werden geleert. Ein Firmen-/Kontowechsel verwirft den ausstehenden Rückkehrzustand. Die isolierte Browserprüfung prüft diese Rückkehr einschließlich unveränderter Menge und anschließendem regulären Formular-POST. Diese Korrektur behebt nicht die externe 403-Antwort.
