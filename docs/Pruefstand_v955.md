# Prüfstand v955 · Korrekturen aus Code Review #3

Die vier konkreten Review-Hinweise werden mit folgenden Änderungen und Regressionstests behandelt:

1. **Widersprüchliche technische Merkmale:** Die automatische Hersteller-Artikelnummer-Zuordnung prüft sämtliche gespeicherten Merkmalschlüssel und Konfliktmarkierungen. Dazu gehören auch FI-Typ, Aderzahl, Leitungstyp und Serie. Client und SQL verwenden dieselbe konservative Regel. Der Datenbanktest durchläuft alle speicherbaren Merkmalschlüssel mit widersprüchlichen Werten im gesamten Bestand.
2. **Abgelaufene Angebote:** Beim Hinzufügen prüft die App ein abgelaufenes Angebot automatisch neu. Ist auch die Trefferreferenz abgelaufen, sucht sie gezielt dieselbe Bestellnummer im selben Händlerkonto/Lager erneut. Bei geänderten Artikelangaben oder weggefallenem bestätigtem Lagerbestand werden zunächst die aktuellen Angaben angezeigt; die Übernahme erfolgt erst nach erneuter Auswahl. Unveränderte Angebote können unmittelbar übernommen werden. Der Browsertest lässt die Preisbestätigung ablaufen, ohne Suchtext oder Filter zu ändern.
3. **Ungültiger RPC-Datensatz:** Der Online-Import nutzt eine ausdrückliche Liste erlaubter RPC-Felder. Metadaten wie die Quell-Preiseinheit und fehlende optionale Preise gelangen nicht als unbekanntes Feld beziehungsweise JSON-null in den alten, strengen Katalogimport. Das gilt auch für kurz zuvor ausgestellte signierte Vorschauen. Ein neuer Test führt die tatsächlich normalisierten Online-Daten durch die vollständige SQL-Kette v954 → v928 → v925 → v921 → v911 → v908 in einer isolierten Datenbank. Er prüft außerdem Preise je 100 Einheiten, fehlenden EK und identische Wiederholungen.
4. **Verspätetes Nachladen:** Der Klickablauf prüft nach dem Online-Nachladen nochmals Suchgeneration, Konto und Suchsignatur, bevor er die Seite verändert. Der vollständige Browsertest hält eine alte Nachladeantwort zurück, startet eine neue Suche mit 40 passenden Firmenmaterialien und prüft danach unveränderte Treffer auf Seite 1.

Zusätzlich öffnet eine abgelaufene Händleranmeldung wieder das Anmeldeformular. Kennwörter werden weiterhin nicht gespeichert.

Server: Konfliktprüfung durch Migration `20261102073320_manufacturer_identity_conflicts_v955.sql` installiert. Identische Textkopie: `13_Artikelmerkmale_Konfliktpruefung_v955.txt`. Die Migration ändert keine Materialdatensätze oder Dokumente. `supplier-stock-v948` Version 5 mit JWT-Prüfung installiert.

Die neue Suche ist bis zum persönlichen Händler-Live-Test mit kontrollierten Antworten sowie der echten SQL-Importkette geprüft. Der Test am echten Konto muss noch die derzeitige Preis-/Detailantwort von ONLINE PLUS bestätigen. Keine echten Bestellungen oder Rechnungen wurden durch Tests erzeugt.
