# v1003 – Klarwerk-Zusatzbereich entfernt

Die Arbeitszeiterfassung soll übersichtlicher werden. Entfernt wurden der zusätzliche Menüpunkt Buchhaltung & Finanzen, die eingebettete Finanzoberfläche, Nachrichten-/Datenbrücke und die frontendseitigen Rechnungsentwürfe, Ausgaben, Bank-CSV-, Vorlagen- und Steuer-Vorbereitungswerkzeuge dieses Zusatzbereichs. Die zugehörigen Dateien sind nicht mehr Bestandteil der Website und des Offline-Caches.

Die ursprünglichen Arbeitszeit-, Arbeitsschein-, Kunden-, Angebots-, Rechnungsregister-, Einkaufs- und Verwaltungsfunktionen sowie die neutrale Gestaltung bleiben bestehen. Klarwerk bleibt eine eigene, unveränderte App.

Keine Löschung bereits gespeicherter Finanzdaten oder Belege. Historische Migration, RLS-Regeln und Daten bleiben unangetastet. Aus der Arbeitszeit-App werden diese Finanzendpunkte nicht mehr aufgerufen. Frühere eigene App-Caches werden bei Aktivierung durch den neuen Cache ersetzt.

Prüfung: vollständige App mit synthetischen Admin-/Geschäfts-/Mitarbeiterrollen ohne Finance-Menü, iframe, Finanzaufrufe oder ausgelieferte Altdateien; ursprüngliche Angebots-/Rechnungsnavigation; vorhandene Navigationstests und vollständige Regression. Keine Produktionsdaten für Tests.
