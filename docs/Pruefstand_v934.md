Arbeitszeit-App: Pruefstand und Verbesserungen vom 29.10.2026, Version 934

NEU UMGESETZT
- Offene Kunden-Arbeitsscheine koennen in Auftraegen und Abrechnungen gemeinsam ausgewaehlt und geloescht oder als abgerechnet markiert werden.
- Die Auswahl beginnt leer. Datum, Kunde, Titel, Mitarbeiter und Stunden helfen bei der Kontrolle. Loeschen erfordert eine ausdrueckliche Bestaetigung und schliesst abgerechnete/andere Firmen aus.
- Alte und gemeinsame Arbeitsscheine werden ueber die vorhandene atomare Server-Loeschfunktion entfernt. Anhang-Dateien werden erst nach deren Erfolg bereinigt. Bei einem Serverfehler bleiben Dateien erhalten.
- Materialvorschlaege im Arbeitsschein sind auf die ausgewaehlte Firma begrenzt. Bei ausgewaehlten Materialien erscheinen vollstaendiger Name, EK und Katalog-VK.
- Automatische Rechnungs- und Stornonummern sind vorbereitet: RE-JJJJ-000001 und ST-JJJJ-000001, getrennt je Firma/Jahr. Server-Sperre und bestehende Eindeutigkeitspruefung schuetzen die Vergabe. Vorschau vergibt keine Nummer. Wiederholungen desselben bestaetigten Vorgangs behalten ihre Nummer.

BEREITS IM CODE VORHANDEN UND ERNEUT MIT ISOLIERTEN TESTDATEN GEPRUEFT
- Rechnungserstellung mit alten/neuen Arbeitsscheinen, Preis- und Steuerpruefung, unveraenderliche abgeschlossene Rechnungen.
- VK* als Vorgabe, individuelle Nettopreise bei Rechnungen, getrennte EK/VK**, Haendlerauswahl und gespeicherte Rechnungspreise.
- Ueberlappende Einzel-Arbeitsscheine mit voller Stundenzaehlung; Konfliktpruefung bleibt bei mehreren Mitarbeitern erhalten.
- DATANORM 4/5, separate Preispflege, Katalogfilter ohne automatischen Neustart, mehr als 1000 passende Artikel, lokale Katalogbibliothek und Fortsetzen bestaetigter Pakete.
- Gefuehrte Artikelsuche mit technischen Merkmalen, Farbe und Serie; verifizierte Produktbilder und vollstaendige Lesefassung der Namen.
- Handyansichten wurden fuer die betroffenen Dialoge/Preisbereiche bei 320 und 390 Pixeln sowie auf dem Desktop geprueft.

NOCH IM LIVE-PROJEKT ZU PRUEFEN/AKTIVIEREN
Beide verbundenen Supabase-Konten liefern weiterhin keine Projekte. Daher wurden keine Live-Daten geaendert, keine echten Arbeitsscheine geloescht und keine echten Rechnungen erstellt. Installationsstatus der frueheren SQL-Erweiterungen ist unbekannt.
Die Datei 00_Nur_Status_pruefen.txt zeigt vorhandene Funktionen. Sie aendert nichts. true bedeutet vorhanden; die Abfrage ersetzt keinen fachlichen Funktionstest.
Fuer die NEUE automatische Nummerierung ist 08_Automatische_Rechnungsnummern.txt einmal im passenden Supabase-Projekt auszufuehren. Danach App neu laden. Ergebnis: automatic_invoice_numbers_enabled = true. Bis zur Freischaltung bleibt die manuelle Nummerneingabe verfuegbar.
Bereits installierte Erweiterungen nicht blind erneut installieren. Die Dateien 00A/00B sind bestehende gezielte Rechnungsreparaturen. 01 bis 07 betreffen fruehere Wuensche und sind als TXT wieder vollstaendig beigefuegt.

BEKANNTE GRENZEN
- Originalkataloge sind derzeit lokal an dieses Browserprofil/Geraet gebunden. Eine gemeinsame Cloud-Katalogablage ist noch nicht eingerichtet.
- Bilder koennen automatisch zugeordnet werden, wenn ein echter Bildlink oder eine eindeutige Herstellerquelle vorhanden ist. Vollstaendige Bildabdeckung fuer alle Hersteller und Artikel ist nicht gegeben.
- OCR-Ergebnisse und unklare Einheiten/Preise muessen weiterhin kontrolliert werden. Fehlende Informationen werden nicht als verlaessliche Werte erfunden.
- Einige historische End-to-End-Tests verwenden veraltete Menue-, Steuerdialog- oder PDF-Ablaufe. Fuer die neuen Aenderungen wurden eigene aktuelle Browser-/Datenbanktests sowie passende bestehende Rechnungs- und Rechtepruefungen ausgefuehrt. Eine vollstaendig gruene historische Gesamttestsuite wird nicht behauptet.
