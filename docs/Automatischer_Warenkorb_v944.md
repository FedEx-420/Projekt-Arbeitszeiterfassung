# Artikel automatisch in ONLINE PLUS übernehmen · Version 944

Die App kann die ausgewählten Artikel und Mengen direkt als CSV an einen
verknüpften ONLINE-PLUS-Warenkorb übertragen. Die Datei entsteht im Browser;
es ist kein Download und keine Dateiauswahl im Shop erforderlich. Der Weg nutzt
die Upload-Funktion des Shops und benötigt keinen Kontakt mit einem Betreuer.

## Einmal einrichten

1. Im selben Browser bei deinem Großhandel anmelden und einen Warenkorb öffnen.
   Öffne dessen Produktansicht, in der du Artikel hinzufügen kannst.
2. Den vollständigen Link aus der Adressleiste kopieren. Er enthält
   `/p/cart/…/positions`. Die reine Warenkorbübersicht `/p/carts` genügt nicht.
3. In der Arbeitszeit-App **Einkauf** öffnen, einen Artikel des Fachhändlers
   hinzufügen und den Link bei **Zielwarenkorb** einfügen.

Die App speichert die Zuordnung auf diesem Gerät, getrennt nach angemeldetem
Appkonto, Firma und Fachhändler. Der Link bestimmt automatisch den passenden
GC- oder EFG-Upload. Es werden keine Shopkennwörter oder Sitzungstoken gespeichert.

## Danach

Artikel und Mengen auswählen und **Artikel hinzufügen und Shop öffnen** anklicken.
Die App überträgt die Datei, wartet auf die Shop-Rückmeldung und öffnet den
verknüpften Warenkorb. Bestätigt der Shop die vollständige Positionszahl, werden
die bestätigten Positionen aus dem Einkaufsentwurf entfernt. Die Bestätigung
bleibt sichtbar. Das Hinzufügen zum Warenkorb ist noch keine Bestellung.

Lieferart, Kommission, Verpackungseinheiten, Preise und Bestellung werden im
Shop geprüft. Die zweispaltige CSV überträgt Artikelnummern und Mengen, keine
App-Verkaufspreise oder Liefer-/Kommissionsangaben.

Nach einer Bestellung, einem gelöschten Warenkorb oder einem Wechsel des
Shopkontos muss gegebenenfalls der Link eines passenden Warenkorbs neu
hinterlegt werden. Der Shop muss die Anmeldung im selben Browser für den
Upload bereitstellen. Wird sie vom Browser nicht bereitgestellt, bleibt die
Übernahme unbestätigt; die App umgeht keine Browserschutzfunktion. Der bereits
vorhandene Datei-Download und die IDS-Anmeldung stehen weiter zur Verfügung.
Auf anderen Geräten ist die Zuordnung ebenfalls einmal einzurichten.

## Schutz gegen doppelte Übernahmen

Vor dem Absenden wird der Übernahmeversuch lokal gespeichert. Solange keine
vollständige Bestätigung vorliegt, wird dieselbe Auswahl nicht einfach erneut
gesendet, auch nicht nach einem Neuladen. Bei einer fehlenden, unlesbaren,
verspäteten oder unvollständigen Antwort bleibt die Auswahl erhalten. Eine
Wiederholung muss nach Prüfung des Shops ausdrücklich freigegeben werden.

## Verifikation

Am 01.11.2026 hat ein nativer, automatisch erzeugter Datei-POST aus einer
separaten Testseite in einem angemeldeten Browser die Position SKM816 mit Menge
1 in einen eigens gekennzeichneten Testwarenkorb übertragen. Der Shop antwortete
mit `Successful=true`, `AntwortStatus=true` und einer hinzugefügten Position.
Ein vollständiger Warenkorb-Link ist nötig; ohne die Warenkorbreferenz hat der
Shop den Upload nicht bestätigt. Dieser Test bestätigt den technischen Weg in
diesem Browser, keine pauschale Kompatibilität mit jeder Cookie-/Sitzungsregel
auf allen Geräten.

Die App akzeptiert nur HTTPS-Warenkorb-Links der fest hinterlegten GC-/EFG-
Domains. Die Rückmeldung muss aus dem tatsächlichen Uploadfenster, von dessen
Shop-Origin und mit der korrekten numerischen MessageId kommen. Eine positive
Antwort ohne passende vollständige Positionszahl gilt nicht als Bestätigung.
Keine Bestellschaltfläche wird durch diesen Ablauf betätigt.

## iOS mit Chrome und leere Fenster

Der automatische Dateiweg öffnet beim Klick eine eigene, sichtbare
Weiterleitungsseite mit Fortschrittsanzeige und einem Warenkorb-Link.
Nach der Shopantwort wird diese durch die echte Warenkorbseite ersetzt.
Auch bei einem Fehler oder einer fehlenden Bestätigung bleibt kein leeres
`about:blank`-Fenster zurück. Die bisherige IDS-Anmeldung verwendet auf
iPhone und iPad jetzt den vorhandenen Tab für den POST; sie muss kein
asynchron geöffnetes, benanntes Fenster mehr wiederfinden. Auf dem Desktop
wird das Formular im bereits geöffneten Shopfenster selbst abgesendet.

Geprüft: iPhone-Erkennung und vollständiger Formular-POST im selben Tab in
Chromium mit iPhone-/CriOS-Kennung und Touch-Konfiguration. Das prüft die
Verzweigung und die Formularübertragung, noch nicht WebKits Cookieverhalten
auf einem echten iPhone. Eine App-Bestätigung wird nur bei passender positiver
Shopantwort gezeigt.
