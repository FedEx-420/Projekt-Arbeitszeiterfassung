# Prüfstand v984 – Artikelansicht, Admin-Menüs und Festpreisrechnung

Stand: 05.11.2026. Ausgangsstand: `3b6d46c` (v983).

## Änderungen

- Angebots-/Arbeitsscheinvorschläge belegen die vollständige Positionsbreite unter den Eingabefeldern. Foto, Stern, Netto-EK/VK und vollständiger Name erhalten eigene Bereiche. Keine Ersatzbilder oder veränderten Preisquellen.
- Kleine Einkaufsansichten stapeln Bild-/Preisbereich und Artikelbeschreibung. Der Hinzufügen-Button bleibt innerhalb der Karte.
- Katalogdekoration, Deutschland-Hinweise und Bestandsdarstellung laufen nur in passenden Ansichten. Versteckte native Material-Komplettlisten entfallen bei vorhandener bebilderter Auswahl. Deren Länderfilter bleibt aktiv.
- Artikelindizes werden bei Konto-, Firmen- oder Materialwechsel verworfen, nicht bei jedem Rendern. Bestätigte Einzelimporte ersetzen den Materialbestand als Array. Abrechnungsgruppen werden einmal pro Darstellung aufgebaut.
- Neue Abrechnungsart „Pauschalrechnung mit Festpreis“: Leistungsbeschreibung und Netto-Festpreis übernehmen, Steuer neu prüfen, Vorschau prüfen, anschließend ausdrücklich abschließen. Änderungen sperren veraltete Vorschau und Abschluss.
- Neue additive RPCs bereiten den Festpreis serverseitig vor, erhalten Quellstände intern und nutzen die bestehenden Abschlussprüfungen einschließlich Rollen/Firma, Sperren, Quellenfingerprints, Cent-Steuerprüfung und Wiederholungsschutz. Nummernkreis und Storno bleiben kompatibel. Keine bestehenden Belege werden migriert oder überschrieben.

## Isoliert erfolgreich geprüft

- `admin-view-v984.test.cjs`: 30.000 künstliche Artikel, Admin-Kontext, jeweils fünf Darstellungen von Übersicht, Kunden, Einstellungen und Angeboten. Ohne sichtbare Artikelauswahl entstehen in diesen vier Menüs keine Materialdurchläufe mehr. Im Vergleichsstand waren es bei Kunden, Einstellungen und Angeboten jeweils 750.025 instrumentierte Artikelzugriffe für fünf Darstellungen. Die Instrumentierung beeinflusst die Laufzeit; keine pauschale Live-Geschwindigkeitsangabe.
- Derselbe Browserlauf: Trefferbreite und kein horizontaler Überlauf bei 320, 390, 844, 1366 und 1920 Pixeln. Exakte Auswahl des gefundenen Artikels und VK*-Übernahme; Fremdfirmenartikel ausgeschlossen.
- `invoice-fixed-v984.test.cjs`: neun Prüfungen in einer wegwerfbaren PGlite-Datenbank. Vorschau ohne Buchung, Eingabevalidierung, manipulierte Steuer und Bruttobasis abgewiesen, Festpreis im Fingerprint, exakter Abschluss/Nummer, Wiederholung und abweichender Wiederholungsinhalt, Fremdfirma/Mitarbeiter abgewiesen, Storno und erhaltenes Original/Arbeitszeiten.
- `invoice-fixed-browser-v984.test.cjs`: vier Prüfungen der tatsächlichen Oberfläche mit abgefangenen APIs. Geänderte Werte sperren alte Vorschau, bestätigter Festpreis/Steuerbetrag im PDF-Modell, responsive Eingabe und exakter Abschluss-Request.
- `invoice-fixed-pdf-v984.test.cjs`: tatsächliches einseitiges PDF; Leistungsbeschreibung und Beträge 1.234,56 € netto / 1.469,13 € brutto enthalten. Der verwendete Artikel erscheint mit Menge und Einheit. Stunden und Einzelpreise fehlen. PDF-Inhalte werden aus den erzeugten Streams geprüft.
- Bestehende Rechnungsregister-Oberfläche (17), Steuerprüfungen (7), Rechnungs-/Angebots-PDFs (2), automatische Nummern (7), Lieferanten-Datenbankfälle (5), Rechnungspreis-Browserfälle (8), Lieferanten-Browserfälle (9), Angebotssteuerung/responsive Felder (12), Start-/Sitzungsprüfung und gemeinsamer Artikel-/Favoriten-Browserlauf erfolgreich.
- Deutschland-Erkennung mit dem bestehenden nicht-browserbasierten Test erfolgreich. Keine echten Bestellungen, Produktionsrechnungen oder privaten Daten für Tests verwendet.

Lokale Browserläufe verwenden Chromium 138 aus einem separaten temporären Testpaket, da der reguläre Download des gepinnten Chromium in dieser Instanz kein gültiges ZIP lieferte. Diese Hilfsinstallation ist kein App-Bestandteil. Die GitHub-Prüfung verwendet weiterhin die gepinnten Repository-Abhängigkeiten und installiert ihre eigenen Browser.

## Grenzen und offene Punkte

Der echte Admin-Bestand, Netzwerklatenz und alle Datenbank-Vollabrufe sind noch nicht umfassend gemessen. Weitere Datenbank-Hinweise zu vorhandenen Indizes und mehrfachen Policies bleiben offen; v984 ändert keine bestehende RLS-Regel oder Indexstruktur. Die Fixpreisfunktion reduziert nicht automatisch die Kosten aller Rechnungsvorbereitungen.

Die historischen zusätzlichen Browserfälle `german-products-browser-v936.test.cjs` und `supplier-stock-browser-v948.test.cjs` scheitern lokal an ihren früheren Treffer-/Bestandskartenerwartungen auch im unveränderten Ausgangsstand. Sie werden nicht als bestanden bezeichnet. Der zuvor ebenfalls vorhandene mobile Überlauf im gemeinsamen Artikel-Browsertest wurde in v984 behoben; dieser aktuelle Ablauf besteht.

Die v984-Prüfdateien sind in `app-review-checks.yml` eingebunden. Eine reale Rechnung wird ausschließlich nach ausdrücklicher Abschlussbestätigung des Betriebs erstellt.

## Serverinstallation

Die additive Migration wurde am 05.11.2026 erfolgreich angewendet. Die drei neuen Funktionen sind als SECURITY INVOKER mit leerem search_path installiert, für anonyme Aufrufe gesperrt und für authentifizierte Aufrufe freigegeben. Die bestehenden Rollen-/Firmenprüfungen bleiben im aufgerufenen Rechnungsalgorithmus. Die anschließenden Security-Advisors zeigen dieselben Kategorien und Anzahlen wie vor der Installation, keine neue Warnung durch diese Funktionen. Es wurde keine produktive Rechnung vorbereitet oder abgeschlossen.

## Ergänzung: Admin-Einkauf

Der Admin startete bislang wie ein Geschäftskonto in der allgemeinen Suche mit einem separaten Einkaufsentwurf. Mitarbeiter starteten dagegen im gespeicherten Neugart-Zugang. Die Auswahl des Betriebs aktiviert für Administratoren jetzt direkt diesen gespeicherten Zugang. Der allgemeine Einkauf und dessen bestehende Entwürfe bleiben über den Moduswechsel erhalten. Die Schaltfläche nennt ausdrücklich die Übertragung in den Großhandelswarenkorb; Hinzufügen in der App allein ist keine Übertragungsbestätigung und keine Bestellung.

`admin-neugart-v984.test.cjs` prüft im vollständigen App-Browser: automatischer Admin-Einstieg, richtige Firma/Zugangskennung und Menge im Transfer, Anmelde-POST mit ausschließlich temporärem Token, Wiederöffnen mit derselben Vorgangskennung, leerer eigener Kontext beim Firmenwechsel und den weiterhin funktionierenden Mitarbeiterweg. Bestehender Mitarbeiter-/Neugart-Browserlauf und vollständiger Händler-Edge-Fixturetest bestehen. Keine Händlerkontakte, Übertragungen oder Bestellungen mit realen Daten für diese Prüfung. Die produktive Admin-Gegenprobe bleibt ausdrücklich offen.

Die GitHub-Prüfung fand außerdem eine späte Cache-Überschreibung: ältere Versionsschleifen hinter dem Install-Handler überschrieben die neuen URLs. Die v984-Zuordnung steht nun nach sämtlichen historischen Schleifen. Die bestehende Prüfung der exakten Seiten-/Offline-URLs besteht damit.

Die vollständige CI-Prüfung deckte zudem den blockierten Einstieg in die schreibgeschützte Katalogbibliothek ohne Materialbestand auf. „Fachhändler Kataloge“ benötigt keinen Materialvollabruf mehr. Die vorhandene Prüfung liest alle 1.205 Katalogzeilen, erzeugt den PDF-Auszug und prüft Konto-/Katalogtrennung; der Importassistent behält seine Materialabhängigkeit.

Die Katalogprüfung ist auch bei 320 Pixeln ohne seitlichen Überlauf geprüft; Schaltflächen umbrechen und Artikelbereiche werden auf kleinen Displays gestapelt. Die bestehende Produkt-Assistent-Prüfung wartet jetzt ausdrücklich auf den realen verzögerten Materialabruf, bevor sie künstliche Artikel ergänzt. Damit können die Prüfdaten nicht durch dessen spätere Antwort ersetzt werden; sämtliche 19 fachlichen Prüfungen bleiben unverändert und bestehen.

Die Händler-Fixtures prüfen zusätzlich die Anmeldung ohne Lagerauswahl, absolute Händler-Weiterleitungen und den temporären Schlüssel aus der verifizierten Sitzung. Die produktive Händleranmeldung und exakte Warenkorbübernahme bleiben offen.
