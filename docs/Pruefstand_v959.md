# Prüfstand v959: Artikelbilder, passende Funktionssuche und Favoriten

## Verhalten

- Gemeinsame Bild-/Sternkomponente in Materialtreffern, Vorschlägen, Materialeditor, Katalogvorschau und Katalogkorrekturen, Einkaufstreffern/Warenkorb sowie ausgewählten Materialpositionen in Arbeitsscheinen, Angeboten und Rechnungsentwürfen. Artikelauswahl per Texteingabe erhält zusätzlich bebilderte Treffer. Keine Artikelbilder für Arbeitsleistungen und keine Änderungen an ausgegebenen PDF-Dokumenten.
- Vorhandene eindeutige Hersteller-/Materialbilder werden verwendet. Ohne bestätigte Zuordnung erscheint „Kein Bild hinterlegt“; bei Ladefehlern „Kein Bild verfügbar“. Es werden keine Fotos aus ähnlichen Namen oder Großhändlernummern geraten. Die Anforderung flächendeckender echter Fotos bleibt von der Erweiterung des Bildindex abhängig.
- Normale Wechselschalter-, Kreuzschalter-, Serienschalter- und Taster-Einsätze stehen vor nicht angefragten Kontroll-/Beleuchtungs-/Sondervarianten. Exakte Artikelnummern und ausdrücklich gesuchte Sondervarianten bleiben erhalten. Diese Rangfolge beschreibt funktionelle Passung, keine behaupteten GC-Verkaufsstatistiken.
- Bei lokaler Funktionssuche werden Kataloge vor der Rangfolge vollständig paketweise geprüft. Ein normaler Einsatz hinter den ersten 1.200 Kontrollvarianten kann somit auf Seite 1 stehen. Die Seite zeigt weiter 20 Treffer. Bei aktiver Online-Suche bleiben begrenzte lokale Scans und die bisherigen Anbieter-/Lagerprüfungen erhalten; nicht gelieferte Händlerseiten werden nicht als vollständig durchsucht behauptet.
- Persönliche Favoritenlisten sind unter „Meine Favoritenlisten“ in Materialliste und Einkauf erreichbar. Sterne neben Artikeln öffnen die Listenauswahl oder legen eine benannte Liste an. Katalogartikel können ohne Materialimport gespeichert werden. Favoriten bieten eine Suche nach dem Artikel und das Entfernen aus der Liste. Auch Favoriten sind seitenweise dargestellt.
- Speicherung in zwei neuen Supabase-Tabellen mit RLS: authentifizierter Eigentümer und authoritative Firma bzw. bestehende Administratorprüfung. Zusammengesetzter Fremdschlüssel verhindert Zuordnung zu fremden Listen. Kein anonymer Zugriff, keine neue privilegierte RPC. Favoriten sind pro Benutzer/Firma auf anderen Geräten nach Anmeldung verfügbar; Originalkataloge werden dadurch nicht in die Cloud übertragen.
- Favoriten speichern nur Anzeige-/Identitätsangaben, keine Preise, Bestände oder Zugangsdaten. Eine erneute Suche/Übernahme nutzt weiter aktuelle Preise, Händler und Bestand. Eine fehlgeschlagene Speicherung wird nicht als erfolgreicher Stern ausgegeben.

## Prüfung

- `article-intent-v959.test.cjs`: normale Funktion vor Kontroll-/Beleuchtungsvarianten, ausdrückliche Sonderwünsche und exakte SKU behalten Vorrang.
- `favorites-database-v959.test.cjs`: isolierte PostgreSQL-Datenbank; Eigentümer-/Firmenwechsel, gefälschte Eigentümer, fremde Listen, Wiederholungen, persönliche Administratorlisten und anonyme Zugriffe geprüft.
- `article-tools-browser-v959.test.cjs`: vollständige App mit isolierten API-/Bildfixtures. Materialsuche, Bild/Stern, Anlegen und Lesen einer Cloud-Liste, Katalogartikel ohne Import, Suche nach gespeichertem Artikel, keine Preiskopie, Kontoänderung und 320/390/1366 Pixel. Ausgewählte Arbeitsschein-/Angebots-/Rechnungspositionen und bebilderte Eingabetreffer geprüft. Normaler Einsatz auf Platz 1 nach 1.200 Kontrollvarianten.
- Bestehende Tests für strenge Serie/Farbe, Online-Suche, Katalogseiten, verspätete Online-Antworten, Rechnungspreise und Warenkorbübertragung werden weiter ausgeführt. Keine echten Bestellungen oder Produktionsrechnungen für die Tests.
- Neue Tabellen im Projekt eingerichtet; RLS, Policies und fehlende anonyme Leserechte anschließend per Metadaten bestätigt. Sicherheitsprüfung nennt keine neuen Favoritenobjekte; ältere Hinweise bestehen unabhängig davon weiter.

Weitere Produktgruppen und echte Herstellerbilder bleiben laufende Arbeit; es gibt keine Garantie, dass ein Artikel ohne eindeutige Quelldaten bereits ein Foto besitzt.

## Korrekturen aus dem Code Review

- Bebilderte Angebotsauswahl übergibt die genaue Materialkennung und die sichtbare Katalogbezeichnung an die bestehende Auswahl. Geprüft mit zwei gleich bezeichneten Händlerartikeln, internen Namenszusätzen, unterschiedlichen VK-* und Einheiten: der angeklickte zweite Händler bleibt ausgewählt; ein nachträglich bearbeiteter Nettopreis wird beim erneuten Verlassen des Namensfelds erhalten.
- HTML fordert die neuen Bild-/Favoriten-Dateien mit genau den vom Service Worker vorgeladenen URLs an. Ein isolierter Test vergleicht die tatsächlichen Seitenadressen mit der ausgeführten Cacheliste, einschließlich der korrigierten Angebotsdatei.
