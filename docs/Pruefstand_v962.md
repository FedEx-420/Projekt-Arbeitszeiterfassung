# Prüfstand v962: Reaktionsfähige Artikel- und Einkaufssuche

Stand: 03.11.2026. Vergleichsbasis: v961, Commit `882d5f679278c1e9443ba0106255dc5156ab3355`.

## Änderungen

- Die Einkaufssuche prüft den gespeicherten Artikelstamm einmal je Suchlauf. Filterauswahl, Vorschläge und eintreffende Händlerdetails verwenden die vorbereiteten Treffer weiter. Händlerdetails werden gebündelt dargestellt. Kurze Verarbeitungspakete geben dem Browser Gelegenheit, Eingaben und Darstellung zu bearbeiten; überholte Suchläufe veröffentlichen keine Ergebnisse.
- Textnormalisierung und Suchbegriffe werden begrenzt zwischengespeichert. Artikelobjekt und tatsächliche Textfelder bestimmen den Cache, niemals eine kontenübergreifend als eindeutig angenommene Material-ID. Änderungen an Namen, Kennungen und technischen Merkmalen bleiben wirksam. Preise, Zugriffsrechte und Bestandsaussagen werden nicht als Suchtreffer zwischengespeichert.
- Beim Tippen werden alte Treffer sofort entfernt bzw. ausgeblendet und die Suche nach einer kurzen Eingabepause gestartet. Ein einzelnes Zeichen sucht nur eine genaue Artikelkennung; der Hinweis erklärt die Mindestlänge für Namen. Konto-, Ansichts- und Suchwechsel verwerfen verspätete Ergebnisse. Bereits eingegebene Fachhändlernamen lokaler Katalogtreffer bleiben bei Aktualisierungen erhalten.
- Der Bestandsabgleich baut seinen Materialindex nicht bei jeder Verbindungsprüfung erneut auf. Konto-/Firmenwechsel, ersetzte Materiallisten und explizite Artikelübernahmen machen den Index ungültig. Aktueller Händler, Lager, Ablaufzeit und Bestandsstatus bestimmen weiterhin jede Priorisierung. Unbekannter Bestand wird nicht zu bestätigtem Lagerbestand.
- Die Materialseite sucht ihre vier geschützten Stundenpositionen in einem Durchlauf. Groß-/Kleinschreibung, umgebende Leerzeichen und die erste passende Position samt Preis bleiben erhalten. Die langwierigen wiederholten Vollsuchen entfallen.
- Versionsadressen und Offline-Cache werden für alle sechs geänderten App-Module gemeinsam aktualisiert.

## Messungen

Vollständige App im lokalen Headless-Edge-Browser mit 30.000 synthetischen Artikeln. Externe Netzwerkanfragen blockiert; keine realen Konten, Preise, Bestellungen oder Rechnungen. Zeiten schwanken mit Gerät und Browser. Die zweite Zeile verwendet 20 simulierte Händlerdetailantworten und misst deren Verarbeitung in der App, nicht die Internet-/Händlerantwortzeit.

| Ablauf | v961 | v962 | Längste gemessene Verarbeitungspause vorher / nachher |
| --- | ---: | ---: | ---: |
| Einkauf: lokale Suche „Berker Wechselschalter“ bis 20 sichtbare Treffer | 3.091 ms | ca. 1.410–1.434 ms | 2.771 ms / ca. 145–150 ms |
| Einkauf: 20 eintreffende Händlerdetails bei 30.000 gespeicherten Artikeln | 17.212 ms | ca. 757–768 ms | 2.657 ms / ca. 72–77 ms |
| Materialliste: „Berker Wechselschalter“ nach Ansichtswechsel | ca. 1.331 ms vor der zusätzlichen Stundenpositionskorrektur | ca. 680–697 ms | ca. 1.129 ms / ca. 481–498 ms |

Die Materiallisten-Vergleichszeile isoliert die zusätzliche Stundenpositionskorrektur innerhalb dieses Arbeitsblocks; sie ist kein separater vollständiger v961-Benchmark. Beim Einkauf sinken die gemeinsamen Textprüfungen von 90.000 auf 30.000 bzw. bei den Händlerantworten von 750.460 auf 30.100.

## Prüfung und Grenzen

- `search-responsive-v962.test.cjs`: synthetischer, auf v961 festgehaltener Treffer-/Rangfolgevertrag; genaue Kennungen, normale Produktfunktion, strenge Serien, Zubehör, veränderte Namen/Merkmale, deutsche Zeichen, kooperative Verarbeitung und Abbruch.
- `search-latency-browser-v962.test.cjs`: vollständige App, 30.000 Artikel, Ereignisschleifenmessung, 20 Händlerantworten, begrenzte Textprüfungen, unveränderter Materialindex bei 50 Verbindungsprüfungen, sofortiges Entfernen alter Treffer, genaue SKU nach Suchabbruch, Navigation während ausstehender Suche und Wiederaufnahme sowie geschützte Stundenpreise mit Schreibweisen-/Duplikatfixture. Optionaler Vergleich gegen den genannten Basiscommit: `SEARCH_BASELINE=1`.
- Bestehende Browserprüfungen schützen Serien-/Farbfilter, echte Katalogseiten und normale Schalter hinter 1.200 Varianten, Bilder/Favoriten, Lagerpriorität und Lagertrennung, Online-Suche, verifizierte Warenkorbübernahme, Rechnungsnummern/-preise und Arbeitsschein-Sammelaktionen. Alle verwenden isolierte Fixtures.
- Firefox wurde zusätzlich angefordert (`SEARCH_BROWSER=firefox`), konnte hier jedoch wegen `browserType.launch: spawn UNKNOWN` nicht gestartet werden. Ein erfolgreicher direkter Firefox-Lauf ist offen. Die Browserprüfung in CI nutzt Chromium; die lokale Messung nutzt Edge.
- Dies belegt die genannten Abläufe. Vollständige Beschleunigung sämtlicher Menüs, reale Internetlaufzeiten und das Verhalten jedes Endgeräts sind damit nicht nachgewiesen. Die Materialliste hat noch eine messbare synchrone Darstellungsphase; weitere Verbesserung bleibt auf der Checkliste. Keine Datenbankmigration und keine geänderte Händlerbestellung in diesem Arbeitsblock.
