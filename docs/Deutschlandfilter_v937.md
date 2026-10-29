# Automatische Länderauswahl ab v937

Die vorherige Pflicht zum Deutschland-Nachweis hat fast alle Katalogartikel ausgeblendet.
Diese Pflicht ist aufgehoben. Ein fehlendes Länderfeld, eine fehlende GTIN oder ein
fehlendes Zertifikat verhindert weder die Suche noch die Katalogübernahme.

Die App erkennt die Ausführung vorrangig über technische Merkmale statt über ein Länderfeld.
Sie wertet SCHUKO, Schutzkontaktstift (einschließlich Katalogkürzeln wie Schutzko.-Stift),
CEE-7-Typen, BS-1363-Normen sowie Schweizer T13-/Typ-23-Bezeichnungen aus.
Die App schließt damit technisch erkennbare fremde Länderausführungen aus,
zum Beispiel britische BS-1363-Steckdosen, Schweizer Stecksysteme und NEMA-Ausführungen.
Die Erkennung verwendet beide zusammengeführten DATANORM-Kurztexte und, soweit eindeutig zugeordnet,
öffentliche Hersteller-Produktdaten über die exakte GTIN oder Hersteller-Modellnummer.
Eine Großhändlernummer wird nicht als Hersteller-Modellnummer geraten.
Der bisherige öffentliche Produktindex liefert zusätzliche vollständige Herstellerbezeichnungen.
Die Herkunft des Herstellers ist kein Ausschlussgrund.

Das gilt für bereits gespeicherte Materialien, Vorschläge in Arbeitsscheinen und Angeboten
und für die Auswahl aus neuen oder gespeicherten Katalogdateien. Es gibt keine zusätzliche
Frage und keinen manuell einzuschaltenden Länderfilter. Die Suche wartet nicht auf das
Laden der optionalen öffentlichen Herstellerunterlagen.

An jeder sichtbaren Artikelkarte wird die erkannte Bauart oder eine unklare Zuordnung angegeben.
Die Erkennung ist ein Filter für erkennbare Länderausführungen, keine Zulassungsprüfung.
Ein fehlender Hinweis wird nicht als bestätigte Eignung für Deutschland ausgegeben.
Unvollständige Artikelbezeichnungen können dazu führen, dass eine fremde Ausführung
nicht automatisch erkannt wird. Herstellerunterlagen bleiben, sofern zugeordnet, als
separate Information verlinkt.

Vorhandene Artikel und Belege werden nicht gelöscht. Vollständige, auf diesem Gerät
bereits eingelesene Kataloge müssen nicht nochmals hochgeladen werden: Im Menü
„Fachhändler Kataloge“ den Katalog öffnen und mit den gewünschten Filtern erneut suchen.
Eine unterbrochene Auswahl aus einer älteren Version fordert diese erneute Suche an,
damit die zuvor ausgeblendeten Artikel wieder berücksichtigt werden. Bereits bestätigte
Speicherpakete bleiben erhalten. Artikel desselben Händlers werden über ihre Artikelnummer
wie bisher aktualisiert; die erneute Suche erzeugt keine zusätzlichen Kopien.

Keine Datenbankmigration und keine neue SQL-Datei erforderlich.
