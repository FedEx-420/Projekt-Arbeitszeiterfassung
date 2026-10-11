# v872 · Persönlicher OwnTracks-Import

Die freiwillige OwnTracks-Einrichtung kann jetzt eine persönliche Datei `owntracks-arbeitszeit.otrc` auf dem eigenen Gerät erzeugen. Einstellungen → persönliches Arbeitskonto verknüpfen → OwnTracks-Einrichtung öffnen → Zeitfenster und Einwilligung → persönliche Verbindung erstellen → **OwnTracks-Konfiguration herunterladen**. Der Hauptadministrator bleibt angemeldet. Kein Mitarbeiter-/Admin-Passwort ist erforderlich.

## Bewusste Einrichtung auf dem iPhone

In OwnTracks unter Einstellungen → Fernsteuerung / Remote Control ausschließlich externe Konfiguration / External Configuration vorübergehend erlauben. Die heruntergeladene Datei aus Dateien / Downloads in OwnTracks öffnen oder über Teilen → OwnTracks importieren. Änderungen prüfen und bestätigen, danach externe Konfiguration wieder deaktivieren. Fernbefehle und Intent-Steuerung müssen nicht aktiviert werden. Je Version kann der Menütext abweichen; die manuelle HTTP-Einrichtung bleibt verfügbar.

Am iPhone selbst Standort Immer und Genauer Standort für OwnTracks erlauben. Eine Standortmeldung senden; in der Web-App Status aktualisieren und die letzte Verbindung prüfen. Der Browser-Verbindungstest bestätigt nicht die native App. Ein tatsächlicher Test mit gesperrtem iPhone steht noch aus. Kein Zugriff des Agenten auf das iPhone, kein echter Login oder Standortversand durch Agent-Tests.

## Dateiinhalte und Schutz

Das dokumentierte JSON-Format setzt HTTP-Modus 3, `url` auf den bestehenden HTTPS-Empfänger, Basic-Benutzer `worktime` und ausschließlich den zufälligen persönlichen Gerätecode. Move-Modus, 30 Sekunden und 25 Meter sind Einstellungen, keine garantierten iOS-Meldetakte. Fernbefehle, externe Standortanforderungen und serverseitige Konfiguration werden ausdrücklich ausgeschaltet; TLS-Zertifikatsprüfung bleibt eingeschaltet. Alte benutzerdefinierte HTTP-Header und Nutzlastverschlüsselung werden geleert, damit die freigegebene HTTP-Verbindung authentifiziert unveränderte Standortmeldungen senden kann. Keine Wegpunkte, Kundenlisten, Firmen-/Mitarbeiter-IDs oder Änderungen an vorhandenen lokalen Standortarchiven werden importiert.

Die Datei ist vertraulich: Der Gerätecode ist darin im Klartext enthalten, wie es OwnTracks zur Authentifizierung benötigt. Nicht weitergeben, nicht im Chat senden, nicht veröffentlichen; nach erfolgreichem Import kann die Download-Datei gelöscht werden. OwnTracks behält die benötigte Verbindungskonfiguration selbst. Nur ein SHA-256-Hash wird wie bisher serverseitig gespeichert. Erstellung ausschließlich nach Benutzeraktion, lokaler Blob-Download; kein öffentlicher Konfigurationslink, keine Konfiguration in Browser-Storage/Cache. Der kurzlebige Blob-Link wird entfernt und freigegeben. Nur die aktive, gültige, persönlich zugeordnete Verbindung ist exportierbar. Gerätecode geht beim Abmelden/Kontowechsel verloren; eine neue Freigabe ersetzt die alte Verbindung dieses Geräts. Bei Widerruf bleiben gemessene Zeiten bestehen.

## Unveränderte Grenzen

Ein persönliches Arbeitskonto pro aktiver OwnTracks-Verbindung. Zwei Felix-Konten in verschiedenen Firmen können nicht gleichzeitig automatisch zugeordnet werden. Bei Wechsel muss das persönliche Arbeitskonto ausdrücklich umgestellt und eine neue Verbindung importiert werden. Eine Mehrfirmen-Zuordnung braucht eine zusätzliche, separat geprüfte Erweiterung; identische Namen sind keine sichere Kontozuordnung.

Kein Datenbank-/Edge-Function-Deployment, keine Änderung an Konten, vorhandenen Zeiten, Rechnungen oder der v871-Ankunftserkennung. Keine bezahlten Dienste aktiviert. Standortmeldungen benötigen Berechtigungen, Netz und Akku; außerhalb der Arbeit Quiet verwenden. Der Server wertet wie bisher nur im freigegebenen Zeitfenster an Werktagen aus. Keine neue Zusage zusätzlicher nativer Timer-Push oder unbegrenzt kostenloser Serverkapazität.

## Quellen und Prüfung

Importformat: [OwnTracks-Konfigurationsdateien](https://owntracks.org/booklet/features/remoteconfig/) und [JSON-Einstellungen](https://owntracks.org/booklet/tech/json/). Tatsächliche iOS-Schlüssel gegen [Settings.m](https://github.com/owntracks/ios/blob/master/OwnTracks/OwnTracks/Settings.m) geprüft, insbesondere `url` statt `httpURL`. Aktuelle Import-Sicherheitsabfragen: [OwnTracks App-Store-Versionsverlauf](https://apps.apple.com/de/app/owntracks/id692424691).

Synthetische Tests prüfen Schema, HTTPS, fehlende/geänderte Codes, deaktivierte Fernsteuerung, lokalen Download ohne weiteren Serveraufruf, Zurückweisung einer pausierten Verbindung, Kontotrennung und vier Bildschirmgrößen. Bestehende Regressionen laufen zusätzlich; keine realen Standortmeldungen oder Kontopasswörter in Testdateien.

Release-Prüfung: 567 Prüfungen über 47 Befehle bestanden, davon 6 Konfigurations-, 19 Datenbank-, 7 Server- und 14 Browserprüfungen für OwnTracks. Keine Schreibzugriffe auf Produktionsdaten, keine echten Benutzerlogins. Der tatsächliche iPhone-Import und Standby-Test bleiben menschliche Prüfschritte.
