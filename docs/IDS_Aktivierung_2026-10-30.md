# IDS-Empfangsstelle aktiviert · 30.10.2026

Die technische Vorbereitung für die Neugart-/GC-Übergabe ist im bestehenden
Supabase-Projekt `yzlnfrljlknazywskylb` aktiviert.

## Ursache und Änderung

Unter `ids-cart-return-v938` war die Standard-Beispielfunktion von Supabase
gespeichert. Die JWT-Prüfung des Gateways war eingeschaltet. Die von der App
benötigte SQL-Erweiterung 09 war bereits installiert.

Die Funktion wurde durch die vorbereitete und getestete App-Empfangsfunktion
ersetzt. Die veröffentlichte Funktionsversion ist **2**, Status **ACTIVE**.
`verify_jwt` ist für ausschließlich diese Funktion **false**. Die eigene
Authentifizierung über einen zufälligen, befristeten und nur einmal verwendbaren
Rückgabetoken bleibt bestehen. Andere Edge Functions wurden nicht verändert.

Die Datenbankprüfung bestätigt die vorhandenen IDS-Funktionen, aktiviertes RLS der
privaten Auftragstabelle, gesperrte direkte Tabellenzugriffe und die vorgesehenen
Ausführungsrechte für angemeldete Benutzer beziehungsweise den Serverdienst.
Es war keine Änderung der Datenbank erforderlich.

## Live-Prüfung

| Prüfung | Ergebnis |
| --- | --- |
| Gesundheitscheck ohne Supabase-Login | HTTP 200, `receiver: 938`, `available: true` |
| GET ohne Gesundheitscheck | HTTP 405 |
| Rückmeldung ohne Token | HTTP 400 |
| Rückmeldung mit sicher ungültigem Token | HTTP 409 |
| Browserzugriff vom App-Ursprung | CORS erfolgreich |
| Übergabebutton bei gültigem App-Status | freigegeben |
| Benutzername und Kennwort | ausfüllbar |

Der Browsercheck verwendet einen isolierten synthetischen Admin- und
Materialbestand und den echten öffentlichen Gesundheitscheck. Er sendet keine
Anmeldedaten und keinen Warenkorb an den Großhandel. Die Live-Prüfung bestätigt die
technische Empfangsbereitschaft; sie ersetzt keinen angemeldeten Neugart-Shop-Test.

## Verwendung

1. Die [Arbeitszeit-App](https://fedex-420.github.io/Projekt-Arbeitszeiterfassung/)
   neu laden; auf dem Laptop bei Bedarf mit **Strg + F5**.
2. Im Menü **Einkauf** Artikel hinzufügen und Mengen prüfen.
3. Die persönlichen Neugart-/GC-ONLINE-PLUS-Zugangsdaten eingeben.
4. **Mengen übernehmen und im Großhandel öffnen** wählen.

Die endgültige Bestellung erfolgt im Großhandelsshop. Es wurde bei der Aktivierung
keine echte Bestellung ausgelöst. Bestehende Materialien, Arbeitsscheine und
Rechnungen wurden nicht verändert.
