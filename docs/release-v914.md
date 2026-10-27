# v914 – Kataloge verständlich prüfen und auswählen

- Der Katalogimport steht vor den gespeicherten Materialien. Lange Artikelbezeichnungen wachsen als mehrzeilige Eingabefelder mit dem Text mit.
- Auswahlfelder erklären Einkaufs-/Verkaufspreis, Preis pro Anzahl, Umlaute und Spaltentrennung. Technische Quellfelder haben lesbare Bezeichnungen mit Beispielen.
- Hersteller und Kategorien werden aus eindeutigen Dateispalten gelesen; mehrere Werte können ausgewählt werden. DATANORM 4 liefert die Warengruppennummer, aber keinen daraus erfundenen Hersteller. BMEcat liefert MANUFACTURER_NAME sowie eine vorhandene Referenzgruppe. Fehlende Merkmale bleiben unbekannt.
- „Datei vollständig untersuchen“ liest innerhalb der vorhandenen Format-/Dateigrenzen alle Artikelzeilen und sammelt Gruppen und Preisindikatoren ohne Materialimport. Höchstens 1000 unterschiedliche Hersteller/Kategorien werden angeboten; eine Begrenzung wird angezeigt. Die anschließende gefilterte Artikelsuche durchläuft die Quelle, bevor der Ausschnitt auf 1000 Treffer begrenzt wird.
- Preisübersicht: Anzahl erkennbarer EK- und Listenpreiswerte; kein Rückschluss auf persönlichen EK aus Listenpreis oder Rabattgruppe. Eine nicht erkannte EK-Spalte kann über die vorhandene Zuordnung geprüft werden.
- Die Druckansicht zeigt unveränderte Quellwerte des geladenen Ausschnitts mit Dateiname und deutlicher Begrenzung. Über den Browserdruck ist „Als PDF speichern“ möglich. Sie ersetzt keine vollständige Originaldatei. Die aktuell ausgewählte Datei kann unverändert heruntergeladen werden.
- Originaldateien werden weiterhin nicht im Konto gespeichert. Eine frühere ElektroClemens-Datei kann deshalb ohne erneute Auswahl nicht untersucht werden. Kein neuer Datenbank-/Storage-Endpunkt; keine Datenbankmigration erforderlich.

Prüfung: lokale Parser-, Datenbank- und Browserregressionen; neue Browserfälle für Hersteller außerhalb des ersten 1000er-Ausschnitts, kombinierte Filter, EK-Zählung, vollständige lange Bezeichnungen, Druckansicht und Importposition. Keine echten Konten oder Materialdaten als Test verändert.
