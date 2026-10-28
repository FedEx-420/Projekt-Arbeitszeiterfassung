# Schaltermaterial nach Funktion statt durch HDMI-/Strom-Mischlisten suchen

Nach der Artikelart Steckdose folgt jetzt zuerst die Funktion: Strom/SCHUKO, HDMI/Video, VGA, Netzwerk/RJ45, Telefon/TAE, TV/Radio/SAT, USB-Laden, Audio oder CEE/Drehstrom, soweit in den Bezeichnungen erkennbar. Die Auswahl Strom/SCHUKO schließt reine HDMI-/USB-/Datenanschlüsse aus. Eine SCHUKO/USB-Kombination bleibt eine Stromsteckdose und kann über eine zusätzliche USB-Frage eingegrenzt werden. Eine allgemeine, nicht näher bezeichnete Steckdose wird nicht allein durch fehlende HDMI-Angaben zu einer behaupteten SCHUKO-Steckdose.

Weitere Fragen berücksichtigen Schaltfunktion, USB-Ladefunktion, Klappdeckel, Beleuchtung, Steck-/Schraubklemmen, Werkstoff, IP-Schutzart, Montage, Bemessungsstrom sowie vorhandene Serien-, Farb-, Oberflächen- und Berührungsschutzangaben. Die Fragen richten sich nach vorhandenen Daten; fehlende Eigenschaften werden nicht als Nein interpretiert. Zubehör wird besser abgegrenzt: Eine Zentralplatte für eine Steckdose ist nicht automatisch eine komplette Steckdose.

Beginnt die Suche bei einem Hersteller/Großhändler mit verschiedenen Produktkategorien, fragt der Assistent zuerst nach der Artikelkategorie. Das vermeidet den bisherigen Fall einer Herstellerliste ohne passende technische Fragefolge. Alte lediglich aus Beschreibungen gespeicherte Vermutungen übersteuern die verbesserte aktuelle Erkennung nicht; explizite Katalog- und manuelle Merkmale bleiben maßgeblich.

Die Strom-/SCHUKO-Auswahl setzt keine Nennspannung von 230 V als zwingenden Gleichheitsfilter. Auch Herstellerprodukte mit 250-V-Bemessungsangabe bleiben in dieser Funktionsgruppe auffindbar; die tatsächliche Herstellerangabe wird weiterhin angezeigt. Beispiel-Herstellerdaten:
https://assets.hager.com/step-content/P/PDS_156369540101DE/Document/std.lang.all/47229909_0101_de-DE.pdf
https://hager.com/de/katalog/produkt/3315421404-hdmi-steckdose-b-7-alu-matt

Keine neue SQL-Erweiterung erforderlich. Die zusätzlichen Namensmerkmale werden lokal abgeleitet; an bestehende v928-Importendpunkte werden nur deren bereits unterstützte Felder übermittelt. Vorhandene Preise, Bilder und Belege ändern sich dadurch nicht. Es werden keine Produktbezeichnungen des privaten Katalogs ins Repository übernommen.

Prüfungen: HDMI und High-Definition gegenüber SCHUKO, USB-Laden gegenüber SCHUKO/USB-Kombination, Netzwerkanschlüsse, Zubehör, negative USB-Angabe, Klappdeckel, Klemmen und Werkstoff, Frage-Reihenfolge und v928-Speicherkompatibilität. Vollständiger App-Browsertest mit einer zuerst einsortierten HDMI-Steckdose: Auswahl Berker → Kategorie → Steckdose → Strom/SCHUKO zeigt nur die vier vorgesehenen Stromartikel. Weitere bestehende Produktfragen-, Bild-, Schrittführungs- und 320/390/1366-Pixel-Tests bleiben erfolgreich.
