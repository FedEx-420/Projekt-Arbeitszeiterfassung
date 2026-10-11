# Persönliche Arbeitskonten mit einem Admin-Gerät

Version 873 ergänzt eine ausdrücklich gewählte persönliche Kontoliste. Sie
ändert weder die Administrator-Anmeldung noch vorhandene Mitarbeiterdaten,
Arbeitsstunden, Arbeitsscheine oder Unterschriften.

## Einmal auf dem eigenen iPhone einrichten

1. Als Haupt-Administrator **Einstellungen → Mein Arbeitskonto auf diesem Gerät**
   öffnen. Das Hauptarbeitskonto und die weiteren **eigenen** Konten prüfen und
   speichern. Pro Firma ist genau ein persönliches Konto erlaubt (maximal fünf).
2. Unter **OwnTracks** die Einrichtung öffnen. Beide Firmen müssen in der
   ausdrücklichen Standortfreigabe stehen. Zeitfenster wählen und eine **neue
   gemeinsame Verbindung** erstellen. Eine alte Ein-Firmen-Verbindung erkennt
   nicht automatisch auch die zweite Firma.
3. **OwnTracks-Konfiguration herunterladen** und die persönliche `.otrc`-Datei
   auf dem iPhone in OwnTracks importieren. Nur externe Konfiguration für diesen
   bewussten Import vorübergehend erlauben; anschließend wieder ausschalten.
   Fernbefehle bleiben aus. Standortzugriff **Immer** und **Genauer Standort**
   selbst am iPhone erlauben. Die Datei nicht weitergeben.
4. Eine Standortmeldung aus OwnTracks senden und in der App den Status prüfen.
   Ein Browser-Verbindungstest allein belegt noch keinen iPhone-Hintergrundtest.

## Zuordnung und Zeitprüfung

- Eine gemeinsame Gerätefreigabe berücksichtigt die vollständigen, bestätigten
  Kundenadressen aller ausdrücklich verknüpften Firmen. Es gibt kein 20-Orte-Limit
  in dieser Zuordnung.
- Genau ein eindeutig passender Standort ordnet eine neue Messung dem passenden
  persönlichen Mitarbeiterkonto und dessen Firma zu. Ein bereits laufender
  Timer wird nicht von einem zweiten Firmen-Timer überlagert. Bei überlappenden
  Adressen erfolgt keine automatische Zuordnung oder doppelte Buchung.
- Mehrere ausreichend genaue Meldungen und mindestens eine Minute Verweildauer
  sind erforderlich. An Feiertagen, Krankheitstagen und genehmigten Urlaubstagen
  dieses Kontos startet kein Timer. Die Tagesprüfung betrifft das tatsächlich
  zugeordnete Konto, nicht willkürlich das Hauptarbeitskonto.
- Messungen beider Firmen erscheinen auf der Admin-Übersicht mit Firmenname.
  Beim Übernehmen gelten das Konto und der Kunde der jeweiligen Messung.
  Fahrzeit, Viertelstunden, Pause, Korrekturen und Unterschrift werden wie bisher
  geprüft. Erst unterschriebenes Speichern bucht Arbeitsstunden; Wiederholen
  desselben Speichervorgangs erzeugt keine zweite Buchung.
- Das Hauptarbeitskonto gilt weiterhin für die manuelle Ankunft und Browser-GPS.
  Die reine Mitarbeiterauswahl zum Ansehen von Daten ändert keine Ortung.
- Persönliche Terminerinnerungen werden auf dem ausdrücklich verknüpften
  Admin-Push-Gerät für beide Arbeitskonten berücksichtigt. Dies schaltet weder
  Push-Berechtigungen automatisch ein noch implementiert es einen neuen
  Hintergrund-Timerstart-Push.

## Sicherheit und Grenzen

Konten und Firmen werden anhand ihrer IDs getrennt, nicht anhand gleicher
Benutzernamen. Private Gerätefreigaben speichern nur den SHA-256-Digest des
Gerätekennworts; der Klartext bleibt beim Erstellen im Arbeitsspeicher und in der
ausdrücklich heruntergeladenen persönlichen Datei. Kein Bewegungsverlauf wird
gespeichert. Eine Änderung der Kontoliste, Rollen, Firma oder Arbeitsscheinrechte
macht die bisherige gemeinsame Freigabe ungültig. Eine neue Verbindung ist dann
notwendig. Widerruf und Kontowechsel löschen keine vorhandenen Messungen.

iOS kann Hintergrundmeldungen verzögern. Ein ausgeschaltetes Telefon, ein leerer
Akku, fehlendes Netz oder eine bewusst beendete OwnTracks-App liefern keine
garantierte Ankunft/Abfahrt. Bereits übertragene Messungen bleiben korrigierbar.
Ein realer Standby-Test auf dem iPhone ist nach dem Import erforderlich.

## Veröffentlichung

Die additive Migration `20261011073844_admin_multi_work_accounts_v873.sql` muss
vor dem Frontend mit `adminMultiWork: true` aktiviert werden. Die bestehenden
Ein-Konto-RPCs bleiben kompatibel. Der native HTTPS-Empfänger nutzt weiterhin
denselben Endpunkt; der serverseitige Dispatcher prüft die gemeinsame,
ausdrücklich gespeicherte Kontoliste. Öffentliche RPC-Hüllen sind Security
Invoker; privilegierte Implementierungen und Freigabe-Digests bleiben privat.
Persönliche Konto-IDs und Aktivierungsskripte gehören nicht in öffentliche Assets.
