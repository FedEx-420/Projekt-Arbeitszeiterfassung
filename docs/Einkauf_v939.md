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

## Noch offene Aktivierung der Shop-Rückgabe

Der öffentliche Check der vorhandenen Empfangsfunktion antwortete am 29.10.2026
mit HTTP 401 `UNAUTHORIZED_NO_AUTH_HEADER`. Der Benutzer hat SQL und Funktion
nach eigener Angabe eingefügt. Die verbundenen Supabase-Konten liefern weiterhin
keine Projekte; die Datenbankinstallation konnte daher nicht unabhängig bestätigt
und die Funktionseinstellung nicht über den verbundenen Zugang geändert werden.

Nur bei der Funktion **ids-cart-return-v938** muss die Dashboard-Einstellung
**Verify JWT** ausgeschaltet werden. Die Funktion behält ihre eigene Prüfung des
zufälligen, befristeten Einmaltokens. Bis die Empfangsstelle erreichbar ist, bleiben
Artikelsuche, Einzelübernahme, Einkaufsentwurf und XML-Export nutzbar. Die direkte
Übergabe mit geschützter Rückmeldung bleibt deaktiviert.

Der erste angemeldete Test im echten Großhandelsshop steht aus. Die endgültige
Bestellung wird im Shop geprüft und ausgelöst. Siehe die
[IDS-2.5-Spezifikation, Abschnitt 5.2](https://pabu-itek-dev.k8s-hh.amcloud.io/api/download/file/1526)
und die [Einrichtungsanleitung](Neugart_Einrichtung_v938.md).

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
