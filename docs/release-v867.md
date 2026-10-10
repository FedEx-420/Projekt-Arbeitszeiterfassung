# v867 · Sparsamere Planungssynchronisierung

Die Ansicht und vorhandenen Funktionen bleiben unverändert. Die kostenlose Web-App prüft bei den bestehenden 20-Sekunden-Planungsabgleichen zunächst einen kleinen Änderungsstempel. Wenn nichts geändert wurde, werden die großen Datenlisten nicht erneut übertragen und aktive Eingabefelder nicht neu aufgebaut.

Änderungen und Löschungen an Planungen, Vorschlägen, Kunden, Zeiteinträgen, Arbeitsscheinen, Urlaub und Krankheit werden firmenbezogen erfasst. Profiländerungen invalidieren die Abgleiche vorsorglich ebenfalls. Bei einer Änderung wird weiterhin die vollständige zugängliche Historie mit allen Ergebnisseiten geladen. Explizite Aktualisierungen/Speicheraktionen bleiben vollständige Abgleiche.

Ein Änderungsstempel gilt erst nach einem erfolgreichen, vollständigen Download als übernommen. Verbindungsfehler löschen keine bereits verifizierten Daten. Fehlt die neue Serverfunktion, bleibt der bisherige vollständige Abgleich aktiv. Eine zwischenzeitliche Konto-/Firmenänderung oder neue vollständige Aktualisierung verhindert die Übernahme veralteter Hintergrundantworten.

Die additive Migration enthält ausschließlich private Änderungszähler, Trigger und eine authentifizierte, parameterlose Abfrage. Sie ändert keine bestehenden Benutzer-, Auftrags-, Stunden-, Urlaubs- oder Kundendaten. Die vorhandenen Datenberechtigungen bleiben unverändert; Zähler können nicht direkt von Nutzern gelesen oder geändert werden. Private Daten werden nicht im gemeinsamen Offline-Cache gespeichert.

Diese Optimierung reduziert unnötige Datenübertragung. Sie garantiert keine unbegrenzte Kapazität oder dauerhaft unveränderliche Gratis-Kontingente. Es wird kein kostenpflichtiger Tarif aktiviert.

GPS bei vollständig geschlossener Web-App bleibt technisch ausgeschlossen. Bereits gestartete Timer bleiben bestehen. Die automatische Adressauflösung ist in dieser Version noch nicht aktiviert: dafür fehlt der bestätigte kostenlose Geoapify-Zugang. Keine Kundenadresse wird durch diese Version an einen externen Anbieter übertragen.
