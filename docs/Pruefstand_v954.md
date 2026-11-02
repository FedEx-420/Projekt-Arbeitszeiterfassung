# Prüfstand v954 · Online-Artikelsuche und Hersteller-Artikelnummern

## Verhalten

- Einkauf durchsucht automatisch auch das Sortiment des verbundenen Neugart-/GC-/EFG-Kontos. Ein importierter Artikelstamm ist dafür nicht erforderlich.
- Online-Treffer werden erst mit eindeutig zugeordneter Bestellnummer, Einheit und Euro-Nettopreis auswählbar. Preis je 100 Einheiten wird auf die Materialeinheit umgerechnet. Der Händlerlistenpreis wird als VK * vorgeschlagen; der persönliche Einkaufspreis bleibt separat.
- Der Lagerbestand erscheint vor dem Hinzufügen. Bestätigte Lagerartikel stehen vorn; bestätigte Nullbestände sind standardmäßig ausgeblendet. Unklare Bestände werden nicht als verfügbar bezeichnet.
- Hersteller, Kategorie, Serie, Farbe und die übrigen Produktfragen filtern auch Online-Treffer. Alle Händlerseiten können schrittweise nachgeladen werden; größere Händlerseiten werden verlustfrei in App-Seiten aufgeteilt.
- Erst „Zum Einkauf hinzufügen“ übernimmt einen Online-Artikel in die Firmenmaterialien und anschließend in den Einkaufsentwurf. Suche und Vorschau speichern keine Materialien und lösen keine Bestellung aus. Die bereits geprüfte Warenkorbübertragung bleibt erhalten.
- Explizite Hersteller-Artikelnummern werden aus DATANORM 5, benannten CSV-/Tabellenspalten und BMEcat übernommen. Eine Großhandelsnummer ist keine Hersteller-Artikelnummer.
- Gleicher ausdrücklich angegebener Hersteller, gleiche Hersteller-Artikelnummer und gleiche Einheit erweitern die vorhandene GTIN-/manuelle Zuordnung. Widersprüchliche GTINs oder bekannte technische Ausführungsmerkmale verhindern die automatische Zuordnung im gesamten Artikelstamm, auch bei gefilterter Ansicht. Nur aus Namen vermutete Hersteller reichen dafür nicht aus.
- Händlerangebote und deren Preise bleiben als eigene Datensätze erhalten. Die gemeinsame Artikelansicht sowie die vorhandene Lieferantenauswahl verwenden diese Zuordnung; historische Rechnungen werden nicht verändert.

## Serverstand

- Migration `20261102070541_manufacturer_article_identity_v954.sql` installiert; identische Textkopie `12_Hersteller_Artikelnummern_v954.txt`.
- `supplier-stock-v948` Version 4 mit JWT-Prüfung installiert. Die Erweiterung nutzt dieselbe Anmeldung wie die Bestandsfunktion. Kennwörter werden nicht gespeichert. Händler-JWT und Sitzungscookies bleiben innerhalb der verschlüsselten, konto-/firmen-/händlergebundenen Verbindung.
- Suchtreffer und Preisbestätigungen sind zusätzlich zeitlich begrenzt und an Konto, Firma, Händler und Lager gebunden. Der Server übernimmt ausschließlich die von ihm geprüften Preise. Abweichende oder abgelaufene Zuordnungen werden abgelehnt.
- Die Migration verändert bei Installation keine bestehenden Materialdatensätze. Bereits importierte Artikel ohne explizite Hersteller-Artikelnummer erhalten diese beim erneuten Katalogimport; sie werden nicht aus Großhandelsnummern geraten.

## Prüfung

Neue isolierte Datenbank-, Server- und vollständige Browserprüfungen umfassen: Gruppierung ohne GTIN, Preisunterschiede, Konflikte außerhalb der sichtbaren Auswahl, führende Nullen, Einheiten, manuelle Zuordnung, Firmen-/Rollenrechte, idempotente Importe, Händler-Authentifizierung, verlustfreies Nachladen, sichere Preisübernahme, Suche bei leerem Artikelstamm, strikte S.1-/Farbfilter, Bestände vor Auswahl und Darstellung bei 320/390/1366 Pixeln.

Bestehende Prüfungen für DATANORM 4/5, BMEcat, Katalogimport mit mehr als 1000 Artikeln und Fortsetzung nach Fehlern, Artikel-/Seriensuche, Bestandspriorisierung, Rechnungs-Lieferanten und geprüfte Warenkorbübertragung wurden ebenfalls ausgeführt. Tests verwenden ausschließlich isolierte Konten und Datenbanken; sie erzeugen keine echten Bestellungen oder Rechnungen.

**Noch separat am echten Händlerkonto zu bestätigen:** Form und Preisbasis der aktuellen ONLINE-PLUS-Such-/Detailantwort sowie die vollständige Suche und Auswahl mit dem persönlichen Konto. Die öffentlichen Shopprogramme belegen die Endpunkte; die neuen Abläufe sind bis zu diesem Live-Test mit kontrollierten Antworten geprüft. Ein vom Händler nicht eindeutig gelieferter Preis führt zu einer verständlichen Fehlermeldung und keiner stillen Übernahme.

Die Sicherheitsprüfung zeigt dieselben bereits dokumentierten Althinweise (private Tabellen ohne Client-Richtlinien, absichtlich berechtigte bestehende Verwaltungsfunktionen und deaktivierter Schutz vor kompromittierten Kennwörtern). Neue Funktionen laufen mit den Rechten des angemeldeten Kontos; anonym ist der neue Import gesperrt.
