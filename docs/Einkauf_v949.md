# Einfacher Einkauf, Lagerfilter und Produktsuche – Version 949

## Einkauf

Artikel auswählen, Menge festlegen, Händlerzugang eingeben und „Artikel übertragen und Warenkorb öffnen“ anklicken. Es gibt in der Einkaufsoberfläche keinen Datei-Upload, Datei-Export, einzufügenden Warenkorb-Link oder auswählbaren technischen Übertragungsweg mehr. Bestehende Einkaufsentwürfe bleiben nach Firma, Konto und Fachhändler erhalten.

Die serverseitige Funktion `supplier-cart-v949` meldet sich mit den eingegebenen Kontodaten beim Fachhändler an, erstellt einen eigenen Warenkorb, überträgt die Artikelnummern und Mengen und liest anschließend die tatsächlichen Positionen zurück. Erst vollständig bestätigte Artikel und Mengen lösen die Weiterleitung aus. Bei fehlender oder abweichender Bestätigung bleibt der Einkauf erhalten. Die App löst keine Bestellung aus.

Übertragungsversuche werden unter einer eindeutigen Kennung serverseitig protokolliert. Wiederholte Anfragen lesen denselben Warenkorb und senden keine Positionen erneut. Ein nach dem Absenden verlorener Antworttext wird nicht mit einer automatischen Wiederholung beantwortet. Die Zuordnung der Materialien wird unter den Rechten des angemeldeten App-Kontos geprüft. Nur die Edge Function darf das Übertragungsprotokoll schreiben. Kennwörter, Cookies, Händler-Anmeldetokens und Preise werden nicht darin gespeichert.

Die Shopweiterleitung erfolgt im selben Tab. Damit ist kein Popup und kein leeres `about:blank`-Fenster notwendig. Die Händleranmeldung für die Weiterleitung wird nur vorübergehend übergeben. Die Browserprüfung mit iPhone-/Chrome-Kennung ersetzt keinen Test auf einem echten iPhone mit dessen konkreten Cookieeinstellungen.

Die automatische Anbindung besteht für Neugart und GC-/EFG-ONLINE-PLUS-Zugänge. Andere Händler werden nicht stillschweigend auf GC umgeleitet. Dort bleibt der Entwurf erhalten und die fehlende Anbindung wird verständlich genannt.

## Lagerfilter

„Nicht lagernde Artikel ausblenden“ ist in der Materialliste standardmäßig aktiv. Bestätigte Nullbestände des ausgewählten Lagers / ABEX werden ausgeblendet. Noch ungeprüfte oder nicht bestätigte Bestände bleiben als solche sichtbar. Der Filter verwendet dieselbe konten-, firmen-, händler- und lagerbezogene Bestandsabfrage wie Version 948. Er lässt sich ausschalten und gilt auch für bereits gespeicherte Materialien.

## Produktsuche

Die gemeinsame Suche in Materialliste und Einkauf berücksichtigt die gesuchte Produktart. Bei „Steckdose“ werden CEE-, HDMI-, Daten- und reine USB-Anschlüsse sowie Zubehör nicht als normale Stromsteckdose ausgegeben. Ein ausdrücklicher Suchbegriff wie „CEE Steckdose“, „HDMI Steckdose“ oder „Abdeckung“ findet weiterhin diese Artikel. Eine Stromsteckdose mit zusätzlichem USB-Lader bleibt eine Stromsteckdose.

Die Erkennung von Zubehör, Ersatzteilen und Beschreibungen „für …“ gilt auch für andere Artikelbezeichnungen. Hersteller- und Serienabfragen behalten passende Zubehörartikel bei; exakte Artikelnummern haben immer Vorrang. Unveränderte Grenzen: Suchergebnisse hängen von den vorhandenen Artikelinformationen ab. Die Suchlogik gilt für die App und die darin verfügbaren Katalogdaten; sie verändert nicht die eigene Website-Suche eines Großhändlers.

## Prüfung

Isolierte Tests prüfen den vollständigen Appablauf, vorhandene Entwürfe, den einzigen Übertragungsbutton, Teilantworten und falsche Mengen, wiederholte Anfragen, Kontowechsel, Kennwortverwerfen und Ansichten von 320 bis 1366 Pixeln. Die Servertests schließen Bestell- und Löschaufrufe aus und prüfen die Eindeutigkeit der zurückgelesenen Positionen. Ein Händlerzugang und ein Warenkorb sind erst nach einem echten Test als praktisch bestätigt zu betrachten.
