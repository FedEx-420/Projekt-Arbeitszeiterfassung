# GC-Warenkorb übernehmen · Version 941

Wenn sich der Shop öffnet, du dich erneut anmelden musst und anschließend keine
Artikel im Warenkorb erscheinen, kannst du deine Auswahl über den Datei-Upload
übernehmen. Die Auswahl in der Arbeitszeit-App bleibt dabei erhalten.

1. In der Arbeitszeit-App **Einkauf** öffnen und die gewünschten Artikel und Mengen
   prüfen. Unter dem Anmeldebereich **Erneute Anmeldung nötig oder Warenkorb leer?**
   öffnen. Nach einer direkten Übergabe ist dieser Bereich automatisch aufgeklappt.
2. **Artikelliste herunterladen und GC-Upload öffnen** anklicken. Die App erstellt
   `GC_Warenkorb_….csv` aus dem angezeigten Einkaufsentwurf und öffnet die
   Upload-Seite von GC ONLINE PLUS. Für diesen Weg braucht die App keine Shop-Zugangsdaten.
3. Im Shop bei Bedarf anmelden. Falls du danach auf der Startseite landest, dort
   **Upload (Daten zum Händler senden)** aufrufen. Alternativ den Link
   **GC-Upload erneut öffnen** in der App verwenden.
4. Die gerade heruntergeladene Datei aus dem Download-Ordner auswählen,
   **Hochladen** anklicken und den gewünschten Warenkorb auswählen. Reihenfolge
   von Bestätigung und Warenkorbauswahl kann je nach Shopansicht abweichen.
5. Artikel, Mengen, Einheiten, Verpackungsgrößen, Konditionen und Lieferart im Shop
   prüfen. Den Kauf schließt du dort selbst ab.

Die Dateiauswahl im Shop musst du einmal selbst durchführen: Webseiten dürfen
Dateien auf deinem Rechner nicht ohne deine Auswahl in eine fremde Seite einsetzen.
Es wird keine Bestellung automatisch abgesendet. Die App wiederholt eine direkte
Übertragung nicht automatisch, damit keine doppelten Warenkörbe entstehen.

## Technischer Stand und Prüfung

Der öffentliche GC-Shopcode bietet `PageOnlinePlusUpload` und den CSV-Import an.
Die deutsche Sprachdatei nennt ausdrücklich **CSV (Artikelnummer;Menge)**. Die
App erzeugt zwei Spalten mit Semikolon, Dezimalkomma und CRLF-Zeilenenden, ohne
Kopfzeile. Führende Nullen der Artikelnummern bleiben erhalten. Die Datei enthält
keine Namen, Zugangsdaten oder Preise. Nicht sicher abbildbare Artikelnummern
mit Trennzeichen, Anführungszeichen oder einem Formelpräfix werden abgewiesen.
Mengen gelten im Shop in dessen Artikeleinheit; unterschiedliche Verpackungsgrößen
werden nicht durch die App geraten.

Die Importdatei wird nach einem Klick aus dem aktuellen Entwurf erstellt; alte
Dateien werden nicht automatisch erneut hochgeladen. Der Export bleibt auch bei
ausgefallener Supabase-Empfangsstelle verfügbar. Konten- und Firmenprüfung sowie
die Prüfung auf denselben Fachhändler gelten weiter. Kundennummer, Benutzername
und Kennwort sind bei der direkten IDS-Übergabe Pflichtangaben; sie werden weiter
weder im lokalen Speicher noch in der App-Datenbank abgelegt.

Die direkte IDS-Übergabe ist weiterhin vorhanden. Gültiges XML und ein abgesendetes
Formular bestätigen noch keine Annahme durch den Shop. Im veröffentlichten
GC-Shopcode gibt es bei manueller Anmeldung einen Pfad, der die IDS-Aktionsparameter
entfernt. Das ist ein möglicher Zusammenhang mit der beobachteten erneuten Anmeldung,
keine bestätigte Diagnose für einen konkreten Benutzerzugang.

Geprüft: Exportinhalt, genaue Artikelnummern/Mengen, Download und Zielseite im
isolierten Browser, fehlende Kundennummer, unveränderte IDS-Übertragung,
Firmenwechsel und mobile Darstellung. Kein Zugriff auf einen persönlichen
Großhandelszugang und kein realer Shop-Upload oder Kauf im Rahmen dieser Tests.
Die Übernahme deiner konkreten Datei durch deinen Shop ist daher noch zu bestätigen.

Quellen (am 01.11.2026 geprüft):

- [Öffentliche deutsche GC-Sprachdatei mit CSV-Format](https://www.gconlineplus.de/api/i18n?locale=DE)
- [Öffentlicher Shopcode mit Upload und IDS-Anmeldeablauf](https://www.gconlineplus.de/entry/js/GPAIHZWK.js)
- [GC-Upload](https://www.gconlineplus.de/?page=PageOnlinePlusUpload)
- [GC-Informationen zum Warenkorbaustausch](https://www.gc-gruppe.de/service/schnittstellen)
- [Offizieller IDS-Standard](https://itek.de/wissen/verzeichnis-branchenstandards/ids-connect)
