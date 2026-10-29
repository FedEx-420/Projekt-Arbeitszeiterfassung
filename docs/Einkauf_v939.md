# Einkauf mit vorhandenen Materialien und gespeicherten Katalogen · v939

Der Einkauf zeigte bisher nur den leeren Entwurf und verlangte eine vorherige
Katalogzuordnung. Zur Auswahl standen ausschließlich Fachhändler aus bereits
importierten Materialien. Ein gespeicherter, noch nicht importierter Katalog
konnte deshalb zu keiner Auswahl und zu keinem Artikel führen.

## Neuer Ablauf

1. Im Menü **Einkauf** direkt nach einem Artikel suchen. Materialien der aktiven
   Firma und die lokal gespeicherten Kataloge dieses Kontos werden berücksichtigt.
   Eindeutig erkannte fremde Länderausführungen bleiben ausgeblendet. Fehlende
   Länderangaben verhindern keine Treffer.
2. Bei Bedarf Hersteller, Kategorie, Fachhändler oder Produktmerkmale eingrenzen.
   Serien wie Berker S.1 werden getrennt von Integro behandelt. Unterscheidbare
   Merkmale der angezeigten Treffer, beispielsweise die Farbe, werden als Fragen
   angeboten. Vollständige verfügbare Namen und vorhandene Bildverweise erscheinen
   unmittelbar an den Artikeln.
3. **Zum Einkauf hinzufügen** übernimmt den Fachhändler und die Artikelnummer.
   Ein bisher nur im Katalog vorhandener Artikel wird dabei einzeln mit dem
   bestehenden Katalogimport gespeichert und danach in den Einkaufsentwurf gelegt.
   Es findet kein erneuter Import des vollständigen Katalogs statt.
4. Den Einkauf prüfen und im Neugart-/GC-Shop öffnen. Einkaufsentwürfe anderer
   Fachhändler bleiben getrennt erhalten. Artikelnummern werden nicht zwischen
   Großhändlern übertragen oder aus Produktnamen geraten.

Der Name eines in der Datei nicht erkennbaren Fachhändlers muss einmal angegeben
werden. Bereits gespeicherte Neugart-/GC-Zuordnungen werden direkt erkannt. Bei
abweichenden Handelsnamen kann die Zuordnung ausdrücklich bestätigt werden.
Andere Großhändler werden dadurch nicht automatisch an den GC-Endpunkt geschickt.

Originaldateien und Katalogindex bleiben auf diesem Gerät gespeichert. Auf einem
neuen Gerät oder nach dem Löschen der Browserdaten muss die Datei erneut gewählt
werden. Der Dateidialog ist direkt im Einkauf erreichbar. Nach dem Einlesen kehrt
die App automatisch zum Einkauf zurück. Eine Preisfrage oder ein vorheriger
Gesamtimport ist dafür nicht erforderlich.

## Große Kataloge und Eingaben

Exakte Artikelnummern werden über den bereits vorhandenen Artikelnummernindex
gesucht. So kann der Treffer erscheinen, ohne Millionen Beschreibungen zu lesen.
Weitere Texttreffer bleiben bei Bedarf abrufbar. Allgemeine Suchen lesen den
Katalog in kleinen Abschnitten; laufender Vorgang und Fortschritt werden angezeigt.
Eine neu eingegebene Suche verwirft das Ergebnis des vorherigen Suchlaufs.

Die Anzeige enthält höchstens 20 Artikel je Seite. Das begrenzt die gerenderte
Ansicht und ist keine Begrenzung des durchsuchbaren Katalogs. Fehlende Preise oder
unklare Bestelleinheiten werden am betroffenen Artikel angezeigt.

Mengen, Kommission und Lieferung/Abholung werden je Einkaufsentwurf gespeichert.
Die zuletzt festgelegte Bereitstellung bleibt erhalten; ein neuer Entwurf beginnt
sichtbar mit **Abholung**. IDS-Zugangsdaten werden nicht in der App gespeichert.

## Aktivierte Shop-Rückgabe · 30.10.2026

Die technische Empfangsstelle ist aktiviert. Die zuvor vorhandene
Supabase-Beispielvorlage wurde durch die geprüfte Empfangsfunktion ersetzt.
`ids-cart-return-v938` ist als Version 2 aktiv, mit eigener Einmaltoken-Prüfung und
`verify_jwt = false` für ausschließlich diese Funktion. Die erforderliche
SQL-Erweiterung war bereits installiert; direkte Tabellenzugriffe bleiben gesperrt.

Der Live-Check liefert HTTP 200 und `available: true`. Fehlende oder gefälschte
Tokens werden abgewiesen. Ein isolierter Browsercheck auf dem App-Ursprung mit
echter Verbindung zur Empfangsstelle bestätigt, dass der Übergabebutton bei gültigem
App-Status freigegeben wird. Die App einmal neu laden oder die Verbindung im Einkauf
erneut prüfen, um den neuen Bereitschaftsstatus zu übernehmen.

Der erste angemeldete Test im echten Großhandelsshop steht aus. Die endgültige
Bestellung wird im Shop geprüft und ausgelöst. Siehe das
[Aktivierungsprotokoll](IDS_Aktivierung_2026-10-30.md) und die
[Einrichtungsanleitung](Neugart_Einrichtung_v938.md).

## Prüfung

- Echter Browser: leerer Start, neuer Dateikatalog, automatische Rückkehr,
  Artikelsuche, Serien und Farben, Artikelübernahme, getrennte Händlerentwürfe,
  Suchindex, mehr als 1.000 Artikel, Seitenwechsel, Schreibfehler und Firmenwechsel.
- Echter Browser mit separater PostgreSQL-Datenbank: genau ein Material anlegen,
  EK und VK pro 100 Stück korrekt auf die Basiseinheit umrechnen, Hersteller,
  Kategorie, Merkmale und Bildlink speichern, wiederholte Auswahl ohne Duplikat
  und daraus einen gültigen IDS-Warenkorb exportieren.
- Vollständige App im Browser: Einkauf ohne vorherige Katalogzuordnung,
  Wiederverwendung bestehender Materialien und automatische Händlerübernahme.
- Bestehender Katalogimport samt Fortsetzen und Preiszuordnung, Produktfragen,
  Deutschlandfilter, IDS-Datenbank, Empfangsfunktion und isolierter Shop-POST geprüft.
- Ansicht bei 320, 390 und 1366 Pixeln sowie exakte Offline-Dateiliste geprüft.

Es wurden keine produktiven Materialdaten, Arbeitsscheine, Rechnungen oder echten
Bestellungen für die Tests verändert. Diese Version automatisiert den beschriebenen
Katalog- und Einkaufsablauf; sie behauptet keine vollständige Automatisierung aller
Geschäftsvorgänge der App.
