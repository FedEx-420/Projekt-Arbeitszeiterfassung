# v866 · Persönliches Arbeitskonto im Admin-Zugang

Additive Erweiterung, kein Neuaufbau, keine Konten-/Passwortänderung und keine Datenlöschung.

## Nutzung

Im Admin-Zugang unter Einstellungen → Gerätefreigaben das eigene Arbeitskonto unter „Mein Arbeitskonto auf diesem Gerät“ auswählen und speichern. Push und Standort anschließend freiwillig auf diesem Gerät erlauben. Anmeldung und Admin-Einsichten bleiben unverändert. Die Auswahl eines anderen Mitarbeiters oder einer anderen Firma zur Ansicht ändert die persönliche Gerätezuordnung nicht.

Der eigene Timer in der Übersicht zeigt ausdrücklich das verknüpfte Arbeitskonto. Geplante heutige Aufträge dieses Kontos werden auch bei einer anderen Mitarbeiterauswahl für die freiwillige GPS-Ankunft berücksichtigt. Kunden anderer Firmen erscheinen nicht in der Timer-Auswahl. Antippen → Fahrzeit → bearbeitbarer Arbeitsschein → unterschrieben speichern bucht für das persönliche Arbeitskonto, nicht für das Administratorprofil. Bereits gestartete normale Mitarbeiter-Timer können so fortgesetzt werden.

## Schutz

- Geräte-Push-Abonnements bleiben dem tatsächlichen Login zugeordnet und sind nicht für andere Mitarbeiter lesbar.
- Neue Geräteverknüpfungen sind nur für den einen live geprüften Administrator möglich, nur für vorhandene Firmen-/Mitarbeiterprofile und nur mit seinem eigenen aktiven Push-Abonnement.
- Jede Timer-/Ankunftsoperation prüft die Gerätezuordnung, den aktuellen Adminstatus, das lebende Arbeitskonto und dessen Firma erneut. Kein Austausch der JWT-Identität, keine `user_metadata`-Autorisierung.
- Kunden-, Termin-, Urlaubs-, Krankheits- und Feiertagsprüfungen bleiben aktiv. Team-Speichern übernimmt unverändert die bestehende Transaktions-/Unterschrifts-/Überlappungsprüfung. Wiederholung bucht nicht doppelt.
- Tabelle mit RLS, nur eigene Bindungen lesbar; keine direkten Client-Schreibrechte. Invoker-RPCs delegieren an begründete private Definer-Implementierungen mit festem Suchpfad.
- Ein anderes Arbeitskonto verlangt neue Standortfreigabe. Trennen löscht ausschließlich die Geräteverknüpfung, niemals gemessene Timer oder Stunden. Gelöschte Arbeitskonten/Firmen entfernen die Zuordnung automatisch.

## Bewusst nicht aktiviert

GPS bei vollständig geschlossener Web-App ist technisch nicht möglich. Für Hintergrund-Geofencing ist eine native Handy-App erforderlich. Ein gestarteter Timer läuft geschlossen weiter; Web-Push bleibt unabhängig davon möglich.

Automatisches Geocoding aus Kundenadressen wartet auf einen geeigneten Anbieterzugang und die Entscheidung zur Adressübermittlung. Keine Kundenadressen wurden für diese Veröffentlichung an einen öffentlichen Kartendienst geschickt. Die vorhandene Standortübernahme am Kunden und manuelle Standortpflege bleiben bis dahin erhalten.

Die reale Push-Anzeige und GPS-Messung auf dem Benutzergerät müssen dort mit dessen Freigaben geprüft werden; lokale Browserprüfungen verwenden ausschließlich simulierte Geräte/synthetische Daten.

## Prüfungen

371 lokale Regressionstests bestanden, einschließlich der abschließenden Wiederholung mit 22 Timer-/Browserprüfungen. Geprüft wurden unter anderem echte Admin-Identität bei persönlichem Arbeitskonto, firmengetrennte Timer, eigene Push-Gerätezuordnung, mobile Darstellung, GPS-Freigabe, Teamzeiten, Unterschrift, einmalige Stundenbuchung und Fortsetzung gespeicherter Timer. Kein Test hat reale Nutzer angemeldet oder Push-Mitteilungen an deren Geräte gesendet.

Nach Aktivierung bestanden 14 synthetische Serverprüfungen in einer vollständig zurückgerollten Transaktion. Verschlüsselte Vorher-/Nachher-Sicherungen zeigen die unveränderten vorhandenen Datensätze in allen 25 geprüften Geschäfts-/Gerätetabellen. Die Sicherheitsberater melden dieselben sechs bereits vorhandenen Warnungen wie vorher, keine zusätzlichen. Diese Prüfung ist keine Garantie für Fehlerfreiheit oder für die Zustellung durch ein konkretes Handy.
