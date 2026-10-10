# v868 – kundenspezifische Stundensätze

Geschäfts- und Administratorkonten können unter **Kunden → Kunde auswählen → Stundensätze** eigene Netto-Eurobeträge pro Stunde für Meister, Monteur und Auszubildender speichern. Ein leeres Feld verwendet den Firmenstandard aus der Materialliste; eine eingetragene Null bedeutet ausdrücklich 0,00 €. Mitarbeiter dürfen weiterhin Kundenkontaktdaten bearbeiten, jedoch keine Kundensätze ändern. Die Arbeitskraft „Meister“ allein verleiht keine Verwaltungsrechte.

In den Mitarbeitereinstellungen ist zusätzlich „Auszubildender“ auswählbar. Die vorhandene Kategorie Aushilfe bleibt erhalten. Die geschützte Materialposition Auszubildendenstunde kann über die Materialliste eingerichtet und bepreist, aber nicht gelöscht werden. Vorhandene Katalogdaten werden bei der Veröffentlichung nicht umgeschrieben.

Die hinterlegte Arbeitskraft steuert die Stundenposition beim Abschließen von Einzel-, Mehrpersonen- und Timer-Aufträgen. Kundensätze werden serverseitig angewendet, nicht aus übermittelten Preisen übernommen. Offene Arbeitsnachweise und Rechnungen verwenden aktuelle Kundensätze. Beim Abrechnen speichert der Server den aktuellen Stundensatz; spätere Preisänderungen ändern die abgeschlossene Rechnung nicht.

## Sicherung und Prüfung

- Separate Kundensatztabelle mit RLS, ausschließlich firmenbezogenen Leserechten. Schreibzugriffe nur über eine live autorisierte Verwaltungsfunktion. Kein anonymer Zugriff, keine zusätzlichen Administratoren, kein Vertrauen in vom Client übermittelte Firmen- oder Rollenangaben.
- Additive Aktivierung mit Vergleich bestehender Geschäftsdaten innerhalb der Transaktion, verschlüsselter Sicherung außerhalb des öffentlichen Repositorys und ausschließlich zurückgerollten Testkonten.
- 451 lokale Prüfungen über 34 Befehle bestanden. Darunter 20 neue PostgreSQL-Prüfungen und 13 Browserprüfungen mit echtem lokalem PostgreSQL für Speicherung, Rechte, Rechnungsdarstellung, explizite Null, Rückfall auf Firmenpreise und mehrere Bildschirmgrößen.
- 13 zusätzliche Prüfungen auf dem tatsächlichen Supabase-Schema vor und nach Aktivierung bestanden; keine bleibenden Testdaten und keine echten Benutzeranmeldungen.

Geoapify-Geocoding ist in dieser Version noch nicht aktiviert. Die erreichbaren Browser-Tabs zeigten weiterhin die Anmeldung. Vorhandene manuelle Kundenstandorte, Gerätefreigaben, Push-Erinnerungen und Timer bleiben erhalten. Ein bereits gestarteter Timer läuft über seinen gespeicherten Startzeitpunkt weiter; eine geschlossene Web-App kann keinen neuen GPS-Ankunftstimer starten.
