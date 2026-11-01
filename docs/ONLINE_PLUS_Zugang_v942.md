# Direkter Onlinezugang für EFG und GC · Version 943

Bei der Prüfung eines Elektro-Zugangs führte die Übergabe von der bisherigen
GC-IDS-Adresse auf `efgonlineplus.de/?login=true`. Die automatische Anmeldung
funktionierte, anschließend erschien die EFG-Startseite und der geprüfte
Warenkorb enthielt keine Position. Auch ein lieferbarer Artikel wurde laut
Benutzertest nicht übernommen. Das ist ein konkreter Hinweis auf einen Verlust
des IDS-Kontexts beim Shopwechsel; der anschließende Echt-Test des direkten
EFG-Einstiegs ergab „Kundennummer falsch“. Deshalb ist diese Umleitung allein
kein bestätigter Grund für die leeren Warenkörbe und der Neugart-Standard bleibt
ab Version 943 wieder GC. Die Auswahl EFG ist nur für passende EFG-Kundennummern
vorgesehen. Die automatische Artikelübernahme für den geprüften Zugang bleibt offen.

Die App bietet jetzt im Einkauf **Dein Onlinezugang**:

- **EFG ONLINE PLUS · Elektro-Fachgroßhandel**
- **GC ONLINE PLUS · Haustechnik**

Für Fachhändlernamen mit EFG ist EFG voreingestellt. Für Neugart und andere
GC-Zuordnungen bleibt GC voreingestellt. Das ist eine Voreinstellung anhand des Fachhändlernamens,
keine Abfrage des persönlichen Shopkontos. Bei abweichendem Zugang kann die
Auswahl einmal geändert werden. Sie bleibt auf diesem Gerät getrennt nach
Benutzerkonto, Firma und Fachhändler erhalten, auch beim Wechsel zwischen
Einkaufsentwürfen. Zugangsdaten werden dabei nicht gespeichert. Beim Wechsel
des Onlinezugangs werden ausgefüllte Zugangsfelder geleert.

Die direkte EFG-Übergabe nutzt `https://efgonlineplus.de/ids.aspx` ohne `www`.
Die öffentliche `www`-Adresse leitet auf diese Adresse weiter. Der GC-Zugang
nutzt weiter `https://www.gconlineplus.de/ids.aspx`. Frei eingegebene Zieladressen
sind nicht möglich. Das Formular sendet weiterhin die ausgewählten Positionen
mit IDS-Aktion WKS, Version 2.5, UTF-8 und multipart/form-data. Es werden keine
Kunden-Verkaufspreise gesendet und keine Bestellungen automatisch abgeschlossen.
Auch der Datei-Upload öffnet jetzt die zum ausgewählten Zugang passende Seite.

Live geprüft am 01.11.2026: EFG `action=LI` und `action=SV` antworten an der
direkten Adresse mit HTTP 200 und bestätigen die erforderlichen Anmeldedaten
sowie Version 2.5. Das bestätigt die verfügbare Schnittstelle, noch keine
Annahme eines persönlichen Warenkorbs. Die Browser-Regression prüft die
richtige Zieladresse und den vollständigen Inhalt ohne echte Shop-Schreibzugriffe.

[EFG zu IDS und ONLINE PLUS](https://www.efg-gruppe.de/aktuelles/news/gruppe/2021/ids-25-update-suchen-finden-bestellen-aus-ihrer-fachhandwerkersoftware)
