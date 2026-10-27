# v918–v920 – Einzel-Arbeitsscheine, Rechnungspreise und vollständige Katalogsuche

## Datenbank, noch separat zu aktivieren

Migration v918 ändert ausschließlich die vorhandene Überschneidungsprüfung zwischen Arbeitsscheinen: Sie greift nur noch bei mehr als einem unterschiedlichen Mitarbeiter im neuen/geänderten Arbeitsschein. Einzel-Arbeitsscheine dürfen sich überschneiden; ihre Stunden werden vollständig summiert. Bestehende Zugriffsregeln, Fehlzeitenprüfung, interne Periodengültigkeit und Rechnungssperren bleiben erhalten. Die Installation schreibt keine bisherigen Zeiten um und ändert keine Funktionsrechte. Bereits installierter Stand ist ein No-op; unbekannte Funktionsstruktur/Sicherheitskonfiguration wird abgewiesen.

Migration v919 ergänzt invoker-gesicherte Endpunkte für Materialpreise im Rechnungsentwurf. VK * ist der Standard, andernfalls der bisherige Preis. EK wird angezeigt; Materialpreise lassen sich nur für die jeweilige Rechnung ändern. Geprüfte Overrides, vollständige Quellen-Fingerprints und Steuersummen werden serverseitig vor dem unveränderlichen Abschluss erneut geprüft. Alte Endpunkte bleiben erhalten. Die Oberfläche fällt bei fehlendem neuen Endpunkt auf den bisherigen Ablauf zurück und zeigt den Preiseditor erst nach aktivierter Erweiterung.

Beide Migrationen sind mit PostgreSQL-/Browserfällen geprüft, aber nicht produktiv ausgeführt: Die verbundenen Supabase-Zugänge zeigen kein Projekt. SQL-Dateien und Anleitung werden lokal als Ausgaben bereitgestellt. Keine Behauptung produktiver Aktivierung.

## Katalogsuche v920

Konkreter Fehler behoben: Die Kategorie wurde beim Quellenfilter irrtümlich unter dem Optionsnamen categorys statt categories abgefragt. Dadurch wurde nur der alte Ausschnitt geladen und anschließend lokal leer gefiltert. Kategorie allein und fünf Kategorien außerhalb der ersten 1000 Zeilen sind jetzt abgedeckt.

Die vollständige Untersuchung zeigt direkt eine begrenzte Artikelvorschau. Reguläres Lesen durchsucht und prüft den gesamten Katalog, behält aber nur maximal 1000 Treffer im Arbeitsspeicher. Endesatz/CRC werden bei vollständigem Lesen geprüft; weitere Treffer sind Vorschauseiten, keine angeblich fehlenden Dateiinhalte. Fortschritt unterscheidet Artikel- und Preisdatei.

Suchfelder und Warengruppen starten nach kurzer Eingabepause automatisch eine neue vollständige Suche. Ein neuer Suchlauf ersetzt einen älteren; Fokus und Text bleiben erhalten. Die Schnellsuche und die getrennten Textfilter werden gegenseitig bereinigt, damit kein unsichtbarer fünfter Textfilter alle Treffer ausschließt. Eine Bestätigung zum Verwerfen erscheint nur bei tatsächlichen Änderungen an Artikeldaten/-auswahl, nicht wegen der voreingestellten Häkchen. Filter lassen sich vollständig zurücksetzen.

Verifikation: isolierte Datenbanktests inkl. tatsächlich geladenem Zeitkonto-Modell, Preisabschluss gegen originale und v909-erweiterte Rechnungsroutinen, bestehende Rechnungsansichten und neue Browserfälle. Der private Großhändlerkatalog wurde lokal vollständig gescannt; fünf konkret ausgewählte Warengruppen lieferten 123 passende Artikel. Keine privaten Katalogdaten werden veröffentlicht und keine echten Konten/Buchungen als Test verändert.
