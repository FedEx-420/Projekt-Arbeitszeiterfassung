# v870 · Freiwillige iPhone-Ankunftsautomation

Zusätzlicher Einrichtungsbereich in Einstellungen, unter den bisherigen Gerätefreigaben. Bestehende Konten, Zeiten, Kunden, Arbeitsscheine und Preise bleiben unverändert. Keine kostenpflichtige native App oder Anmeldung zu einem neuen Tarif.

## Auf dem iPhone

1. Als Administrator zuerst das **eigene Arbeitskonto auf diesem Gerät** verknüpfen. Die Mitarbeiterauswahl oben ist keine persönliche Gerätezuordnung.
2. **iPhone-Einrichtung öffnen**, einen Kunden mit bestätigtem Standort auswählen und der persönlichen Freigabe zustimmen.
3. Die Anleitung in der App verwenden: Kurzbefehle → Automation → Ankunft → Sofort ausführen; URL per POST mit persönlichem Header-Code und JSON `event: arrival` aufrufen.
4. Für eine Mitteilung nur bei Antwort `status: started` die Kurzbefehle-Aktion **Mitteilung anzeigen** verwenden. Diese lokale Mitteilung benötigt nicht die Web-Push-Freigabe.
5. Zuerst **Verbindung prüfen**; dabei startet kein Timer. Danach eine echte Ankunft mit eigener heutiger Planung und gesperrtem iPhone prüfen.

Für jeden Kunden muss die Ankunftsautomation persönlich auf dem iPhone angelegt werden. Die Web-App kann weder iOS-Berechtigungen erteilen noch eine Automation zentral installieren. Es wird keine ungeprüfte oder unsignierte `.shortcut`-Datei angeboten.

## Datenschutz und Grenzen

Der zufällige persönliche Freigabecode wird nur einmal im Arbeitsspeicher der App angezeigt; in der Datenbank liegt nur sein SHA-256-Hash. Er ist kein Passwort oder Supabase-Schlüssel. Er erlaubt nur einen Timerstart für das persönlich zugeordnete Arbeitskonto und einen einzelnen Kunden. Er kann keine Konten, Kundendaten, Dokumente oder Rechnungen abrufen. Nicht weitergeben; verlorene Codes neu erstellen, wodurch der bisherige Code ungültig wird. Auf dem iPhone kann der Code in der eigenen Automation gespeichert sein.

Freigaben bleiben 90 Tage unabhängig von der Web-Anmeldung gültig und sind in den Einstellungen widerrufbar. Gelöschte Konten, geänderte Rollen/Firmen/Arbeitskonto-Zuordnungen, gesperrte Arbeitsschein-Berechtigungen, geänderte Kundenadressen oder Standorte werden bei jedem Aufruf geprüft. Der neue separate Endpunkt benötigt keine Supabase-Benutzer-JWT, prüft aber zwingend die eigene eng begrenzte Freigabe. Bestehende Endpunkte und ihre JWT-Prüfung ändern sich nicht.

Nur heutige eigene oder zugeordnete Team-Planungen im Status geplant/bestätigt ohne bereits vorhandenen zugehörigen Arbeitsschein dürfen starten. Krankheit, gewährter Urlaub und NRW-Feiertage sperren den Start. Wiederholte Meldungen starten keinen zweiten Timer. Nach einem Timer für diesen Kunden am selben Tag ist kein weiterer automatischer Start möglich. Es entstehen beim Start keine Stundenbuchungen. Beenden, Fahrzeit, Signatur und Speichern bleiben unverändert.

Die Startzeit ist der Eingang der Meldung beim Server; es werden keine GPS-Koordinaten oder Bewegungsverläufe übertragen. Netzwerk, iOS-Freigaben, Fokus-/Energiespareinstellungen und verzögerte Ortsauslösung können die Ausführung beeinflussen. Dies ist **kein Hintergrund-GPS der Web-App und keine garantierte minutengenaue Ortung**. Backend-/Browser-Tests ersetzen keinen Test mit dem tatsächlichen gesperrten iPhone. Die Freigabe ist optional; vorhandener manueller und sichtbarer GPS-Timer bleiben nutzbar.

Apple-Anleitungen: [Ankunft](https://support.apple.com/de-de/guide/shortcuts/apd8ebfc4e8e/ios), [automatisch ausführen](https://support.apple.com/de-de/guide/shortcuts/apd602971e63/ios).

## Prüfung und Aktivierung

Die bestehenden Regressionstests sowie `node tests/team/iphone-shortcuts.test.cjs` ausführen. Die iPhone-Tests verwenden ausschließlich synthetische Konten, Schlüssel und einen isolierten Postgres. Vier Bildschirmgrößen, eigene Firmenzuordnung, fehlende Einwilligung, Hash-Speicherung, Widerruf, Abwesenheiten, Wiederholungen, Gerätebindung und der vorhandene Timer-/Fahrzeit-/Signaturpfad sind abgedeckt. Es werden keine realen Benutzer angemeldet oder deren Timer gestartet.

Release-Prüfung: 521 Tests über 41 Befehle bestanden; die finalen iPhone-Tests anschließend erneut bestanden. Im tatsächlichen Datenbankschema vor und nach Aktivierung jeweils 14 synthetische Prüfungen vollständig zurückgerollt. Alle 28 bestehenden Datentabellen im verschlüsselten Vorher-/Nachher-Vergleich unverändert; keine neuen Sicherheitsberater-Warnungen. Ein echter Hintergrundtest auf dem gesperrten iPhone steht noch aus.

Migration: `supabase/migrations/20261011023813_iphone_shortcut_arrivals_v870.sql`. Neue Edge Function: `iphone-arrival`, mit eigener Freigabeprüfung statt JWT-Gateway-Prüfung. Eine Aktivierung darf nur im vorhandenen Projekt `yzlnfrljlknazywskylb` erfolgen, nach Rollback-Probe und unverändertem Bestandsdatenvergleich. Es müssen weiterhin die Limits des kostenlosen Supabase-Tarifs beachtet werden; dies verspricht keine unbegrenzte kostenlose Skalierung.
