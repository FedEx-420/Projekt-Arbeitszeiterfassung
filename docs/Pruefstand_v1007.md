# v1007 – Klarwerk mit einem freigegebenen Betrieb verbinden

Die Apps bleiben getrennt. Arbeitszeiterfassung erhält ausschließlich unter Einstellungen die widerrufbare Betriebsfreigabe und unter Belege den Originaldatei-Eingang für Geschäftskonto und Mitarbeiter. Die Buchhaltung bleibt in Klarwerk.

## Bedienung

1. Geschäftsleitung/Administration: Einstellungen → Klarwerk verknüpfen. Umfang bestätigen und zehn Minuten gültigen Einmalcode erzeugen.
2. Im gewünschten Klarwerk-Konto: Arbeitszeiterfassung → Code einfügen.
3. Offene Arbeitsscheine desselben Kunden auswählen. Originalverfahren für Preise, Lieferantenwahl, Festpreis, Steuerprüfung und verbindlichen Rechnungsabschluss verwenden.
4. Kunden über Quell-ID abgleichen; Namenskonflikte werden nicht automatisch zusammengeführt. Betriebsdaten werden vor Übernahme angezeigt. Freigegebene Dokumente bleiben eingefroren.
5. Geschäftskonto/Mitarbeiter laden Originalrechnungen in Arbeitszeiterfassung → Belege hoch. Klarwerk übernimmt PDF/XML/Bilder nach manueller Betrags-/Steuerprüfung als Ausgabe mit Originaldatei. Gemischte Steuersätze werden als Teilbeträge desselben Belegs erfasst.
6. Widerruf unter Einstellungen oder in Klarwerk. Bereits übernommene Originale bleiben erhalten.

## Daten- und Berechtigungsgrenzen

- Primary Supabase: Migration `20261108220420_klarwerk_bridge_v1007.sql`, Edge `klarwerk-bridge-v1007`.
- `verify_jwt=false` ist absichtlich gewählt: Benutzeraktionen prüfen den echten Auth-Bearer über Auth/getUser; Connectoraktionen benötigen eine zufällige, gehashte Betriebsfreigabe. Öffentliche RPC-Wrapper sind SECURITY INVOKER und ausschließlich service_role ausführbar; Definer liegen privat.
- Rechte aus aktuellen Profilen und auth.users, niemals aus Client-Metadaten. Gebundene Firma überschreibt vom Client gewünschte Firmen-IDs; Storno prüft zusätzlich die Originalfirma.
- Einmalcode wird nur als Hash gespeichert. Klarwerk hält die Betriebsfreigabe AES-GCM-verschlüsselt im eigenen Konto; geheimer Schlüssel nur im Sites-Runtime-Secret `WORKTIME_CONNECTOR_KEY`. Kein Passwortaustausch und keine Dienstschlüssel im Browser.
- Uploads privat, höchstens 10 MB, genau einem Mitarbeiter/Betrieb zugeordnet. Erst bestätigtes Storage-Objekt gilt als verfügbar. Kein anonymer Dateizugriff, kein Überschreiben bestehender Originale.
- Native Rechnungs-RPCs bleiben maßgeblich: exakte Preise/Fingerprints, Nummern, atomare Sperren und idempotente Wiederholungen. Korrektur über Originalregister, kein lokales Umschreiben importierter Originale.
- Neue direkt in Klarwerk erstellte Rechnungen wechseln bei bisherigem RE/ST-Präfix sichtbar zu KW. Bestehende Nummernkreise sind vor parallelem Betrieb abzugleichen; widersprüchliche vorhandene Nummern werden bei Übernahme abgewiesen.
- Abgleich beim Öffnen/manuell sowie alle 60 Sekunden auf der geöffneten Verbindungsseite, ausgenommen laufende Vorschau/Dialog. Keine Hintergrundsynchronisierung bei geschlossener App.

## Nachweise

Sieben isolierte Datenbankfälle bestanden: fremde Firmen/Mitarbeiter dürfen nicht freigeben; einmaliger Austausch; Quellfirma bleibt bindend; nativer Abschluss/gleiche Wiederholung/Doppelabrechnungssperre; privater Mitarbeiterbeleg erst nach bestätigtem Upload; gewöhnliche RPC-Rollen und entzogene Berechtigung; Widerruf sperrt Lesen/Schreiben.

Edge-Originalquelle mit gemockten Upstreams: echte Auth-Prüfung vor Service-RPC, abgeleitete Identität, CORS, Hashes und signierte private Dateipfade. Browser: Geschäftsfreigabe, Mitarbeiterupload/-download, Wechsel der Firma entfernt Code. Vollständige App: keine zusätzliche Finanznavigation/kein iFrame, drei Rollen und mobiles Menü erhalten. Navigation: 20 Fälle bestanden.

Klarwerk prüft mit echten SQLite-Migrationen und Worker-Routing Konto-/Leserechte, verschlüsselte Freigabe, feste Backend-/Datei-URLs und Widerruf. Browser durchläuft Verknüpfung, Kunden/Betriebsdaten, Original-Steuerdialog, nativen Abschluss mit exakten Centbeträgen/Fingerprints, wiederholte Übernahme, PDF-Anhang mit exakt gespeicherten Bytes, Mitarbeiter-XML als Ausgabe, gemischte Steuer mit Originalbetrag, Metadaten nach Kundenbearbeitung und widerrufene Quelle. 390/1366-Pixel-Layout ohne Seitenüberlauf. Bestehende MIME-/PDF-Mailtests bestanden.

Keine produktiven Testnutzer, Rechnungen, Bestellungen oder Kopplungen angelegt. Produktiv wurden nur Schema/Edge bereitgestellt und Rechte/Fehlanfragen gelesen. Supabase-Sicherheitshinweise unverändert gegenüber dem Ausgangsstand: keine neuen Hinweise durch die Erweiterung.

## Offen / Grenzen

- Nutzer verfügt derzeit nur über Neugart-/FiF-Webportale, nicht über freigeschaltete Rechnungs-Schnittstellen. Automatischer Portalrechnungsabruf ist NICHT umgesetzt. Originale aus dem Portal herunterladen und über Belege hochladen. Warenkorb-/IDS-Übertragung gilt nicht als Eingangsrechnung.
- Keine OCR, automatische steuerliche Anerkennung, ELSTER-Anbindung oder vollständige GoBD-/E-Rechnungskonformitätsgarantie. Native Fachprüfungen und Originalaufbewahrung bleiben erforderlich.
- Historische Shopping-Menüprüfung v946 erwartet die vor v1005 entfernte kombinierte Such-/Checkout-Oberfläche und bleibt überholt. Die gezielten neuen Prüfungen und der aktuelle CI-Workflow bilden den Nachweis dieser Änderung; keine Behauptung einer vollständig grünen historischen Gesamtsuite.
