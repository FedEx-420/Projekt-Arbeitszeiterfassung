# Artikelsuche und Händlerbestand – Version 948

Die Materialliste zeigt für sichtbare GC-/EFG-/Neugart-Artikel den Bestand des ausgewählten Lagers bzw. ABEX an. Die neue Suche bietet Vorschläge, Trefferzahlen und Filter für Artikelart, Serie, Farbe und weitere vorhandene Eigenschaften. Artikelnummern stehen bei exakter Übereinstimmung vorne. Die Filter beziehen sich auf die Materialien und Katalogdaten der eigenen Firma, nicht auf das vollständige Online-Sortiment des Händlers.

## Einrichtung

1. In der Materialliste „Verfügbarkeit beim Fachhändler“ öffnen.
2. Fachhändler und den passenden GC- oder EFG-Onlinezugang wählen, Kundennummer, Benutzername und Kennwort eingeben.
3. „Verbinden und Bestände automatisch anzeigen“ anklicken und das gewünschte Lager / ABEX wählen.

Das Kennwort wird ausschließlich für die Anmeldung verwendet und danach verworfen. Die App verwendet anschließend eine verschlüsselte Händlersitzung, die an App-Nutzer, Firma und Fachhändler gebunden ist und spätestens nach zwölf Stunden endet. Standardmäßig bleibt sie nur im Arbeitsspeicher der Seite. Nur bei ausdrücklich aktivierter Option wird die verschlüsselte Verbindung auf dem eigenen Gerät gespeichert. Der Händler kann auch vorher eine neue Anmeldung verlangen. „Verbindung entfernen“ löscht die lokale Verbindung.

## Bedeutung der Anzeige

- **Auf Lager:** Der Händler bestätigt einen positiven Bestand im gewählten Lager.
- **Kein Lagerbestand:** Der Händler meldet dort null Bestand; Bestellbarkeit und Liefertermin können davon abweichen.
- **Bestand nicht bestätigt:** Die Händlerantwort fehlt, ist unklar oder konnte nicht abgerufen werden. Das ist keine Aussage über Nichtverfügbarkeit.

Jede Antwort enthält Lager und Abfragezeit. Bestände sind keine Reservierung. Sichtbare Positionen werden in Gruppen von höchstens zwanzig Materialien abgefragt und nach fünf Minuten beim weiteren Nutzen der Materialliste erneuert. Pro Händleranfrage wird genau eine Artikelnummer abgefragt, damit Bestandsantworten eindeutig zugeordnet werden können. Andere Großhändler erhalten bis zu einer eigenen Anbindung keine erfundene Bestandsanzeige.

## Technische Prüfung

Die Edge Function `supplier-stock-v948` verlangt App-Anmeldung, prüft Rolle und Firmenzuordnung auf dem Server und liest Materialnummern unter den vorhandenen Datenbankrechten. Sie ändert weder Materialien noch Warenkörbe und speichert keine Händlerkennwörter. Sitzungen werden mit AES-GCM und einem aus der vorhandenen Serverkonfiguration abgeleiteten Schlüssel verschlüsselt. Die öffentliche App erhält keinen Serverschlüssel und keine lesbaren Shop-Cookies.

Die Tests prüfen Firmen- und Kontotrennung, Ablauf und Manipulation der verschlüsselten Sitzung, Lagerwechsel, genaue Artikelzuordnung, nicht bestätigte Antworten, Kennwortverwerfen und die Darstellung bei 320, 390 und 1366 Pixeln Breite. Separate Suchtests begrenzen wiederholte Katalogprüfungen, damit die Suche auch bei großen Materiallisten flüssiger bleibt.

Die Funktion wird serverseitig veröffentlicht. Für diese Version muss keine SQL-Datei manuell eingefügt werden.
