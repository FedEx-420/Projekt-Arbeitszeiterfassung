# Kataloge ab Version 933

Kataloge ist ein eigener Bereich im Hauptmenü. Unter Fachhändler Kataloge bleiben Originaldateien und der vollständige lokale Suchindex verfügbar.

1. Artikelstamm und optional Preispflege auswählen. Auch ein gespeicherter Artikelstamm kann mit einer neuen Preispflege kombiniert werden.
2. Die App bereitet einmal den lokalen Index auf. VK* und VK** aus eindeutig benannten Nettofeldern haben Vorrang. Fehlt VK*, wird der eindeutige Listenpreis als VK* verwendet. EK und Bruttoempfehlungen werden nicht als VK geraten.
3. Beliebig viele Hersteller und Kategorien wählen. Häkchen starten keine Suche. Erst Mit ausgewählten Filtern durchsuchen beginnt den Abgleich.
4. Fortschrittsbalken und geschätzte Restzeit erscheinen. Sehr frühe Schätzungen sind noch unsicher. Alle passenden Datensätze werden lokal ausgewählt, ohne 1000er-Grenze.
5. Bei vollständigen Angaben genügt der Fachhändlername und eine Bestätigung. Unklare Pflichtangaben müssen korrigiert oder ausdrücklich ausgelassen werden. Auslassen gilt nur für diese Auswahl.
6. Kleine atomare Speicherpakete halten die bisherige Servervalidierung, Preise, Revisionen und Firmenrechte ein. Ein bekannter Statement-Timeout reduziert das Paket. Verbindungsfehler werden nicht blind wiederholt. Bestätigte Pakete sind lokal markiert und können über die Katalogbibliothek fortgesetzt werden.
7. Nach erfolgreicher Übernahme erscheint die Dateiauswahl. Original-ZIPs werden nicht auf GitHub oder einen neuen Cloud-Dienst hochgeladen. Die lokale Ablage ist an dieses Browserprofil, Konto und Firma gebunden. Das Löschen von Browserdaten entfernt diese lokale Bibliothek. Bereits in Supabase gespeicherte Materialien bleiben davon unberührt.

In der Materialliste durchsucht die normale Suche nur bestehende Materialien. Die normalerweise ausgeschaltete Option Aus Katalogdatei entnehmen öffnet die Auswahl eines gespeicherten oder neuen Katalogs.

Verfügbare echte Bildreferenzen aus dem Katalog oder dem öffentlichen Herstellerindex werden beim Übernehmen zugeordnet. Eindeutige EAN bzw. ausdrücklich gelieferte Hersteller-Artikelnummer und Hersteller dienen zur Zuordnung. Für Artikel ohne verifizierte Bildquelle wird kein Bild geraten. Eine sofortige Vollabdeckung aller Hersteller ist nicht gewährleistet.

Diese Version benötigt keine neue Datenbankmigration. Falls die Datenbank noch auf gerundete Standardpreise beschränkt ist, bleibt die zuvor bereitgestellte Reparatur 07 erforderlich.
