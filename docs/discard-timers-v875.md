# v875 · Irrtümliche Standortmessungen verwerfen

In der Übersicht steht neben jedem persönlichen, noch nicht gebuchten Baustellen-Timer ein Button **Standortmessung löschen**. Er funktioniert für laufende und pausierte Messungen, auch für explizit verknüpfte persönliche Arbeitskonten des Administrators. Erst nach Bestätigung wird die Messung verworfen und sofort ausgeblendet. Bei einem Netzwerkfehler bleibt sie sichtbar und erneut löschbar.

Bereits abgeschlossene Arbeitsscheine, gebuchte Stunden, Kunden und echte geplante Aufträge werden nicht über diesen Button gelöscht. Dafür bleiben ihre bestehenden Bearbeitungs-/Löschfunktionen zuständig. Eine interne Verwerf-Markierung verhindert, dass dieselbe automatische Standorterkennung die Messung am selben Tag wieder anlegt; ein späterer echter Besuch kann manuell erfasst werden. Am nächsten Tag bleibt die automatische Erkennung verfügbar.

Der Firmenbanner mit Name und hinterlegtem Logo steht jetzt vor dem Timer ganz oben in der Übersicht. Anmeldung und wiederhergestellte Anmeldung öffnen die Übersicht und springen an ihren Anfang. Die bestehende Firmenauswahl des Administrators und die Firmenzuordnung von Mitarbeitern bleiben unverändert.

## Sicherheit und Prüfung

- Neue public-RPC ist Security Invoker; die private Funktion prüft das aktuell bestehende Profil, Firmenzuständigkeit und den Buchungsstatus unter Zeilensperren.
- Keine direkte UPDATE-/DELETE-Berechtigung auf Timer für Mitarbeiter; anonyme und Service-Aufrufe der Verwerf-RPC sind gesperrt.
- Eine Datenbankbedingung verhindert die nachträgliche Buchung einer verworfenen Messung, auch über eine bereits geöffnete ältere Ansicht. Der gesamte Buchungsvorgang wird atomar zurückgerollt.
- Bestehende Konten, Stunden, Arbeitsscheine, Standortfreigaben und Wochentage werden bei der Migration nicht verändert.
- Tests verwenden ausschließlich synthetische Konten und eine wegwerfbare Datenbank, einschließlich Handy-Hoch-/Querformat und Desktop. Sie ersetzen keinen realen iPhone-OwnTracks-Test.

Gezielte Tests: `npm run test:discard-timers`.
