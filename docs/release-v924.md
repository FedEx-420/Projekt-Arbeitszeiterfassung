# Fehlerhaften Katalogartikel direkt anzeigen

Bei einem lokalen Validierungsfehler übermittelt die Katalogprüfung jetzt einen strukturierten Zeilenindex und, soweit erkennbar, das betroffene Feld. Die Oberfläche übersetzt den Index der ausgewählten Artikel zurück in die tatsächliche Trefferliste. Abgewählte Artikel und gesetzte Filter dürfen diese Zuordnung nicht verschieben.

Die App öffnet die richtige Vorschauseite, klappt erforderliche Zusatzbereiche auf, hebt den Artikel hervor und zeigt dessen Artikelnummer und Fehlermeldung direkt am Artikel. Das betroffene Eingabefeld erhält Fokus; der Artikel wird in den sichtbaren Bereich gescrollt. Das gilt insbesondere für doppelte Bezeichnungen, ungeklärte Einheiten und fehlenden VK *. Änderungen entfernen die rote Markierung; alle anderen Eingaben und die Auswahl bleiben erhalten. Nicht zuordenbare Server-/Netzwerkfehler werden keinem beliebigen Artikel zugewiesen.

Lokaler Browsertest: 47 Treffer mit einer abgewählten SET-Position, doppelter Bezeichnung auf Seite 2 und fehlendem VK * auf Seite 3. Beide Fehler werden beim richtigen Artikel sichtbar; nach Korrektur lässt sich eine Vorschau mit 46 ausgewählten Artikeln erstellen. Kein Backend-Schreibzugriff vor der abschließenden Bestätigung. Bestehende Einheiten-/Ansichtstests werden zusätzlich ausgeführt. Keine Datenbankmigration erforderlich.
