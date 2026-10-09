# v864 · Push-Versand und eigene Gerätefreigaben

- Ursache des fehlgeschlagenen Versands: Der vorhandene P-256-Privatschlüssel wurde ohne sein führendes Nullbyte exportiert. `web-push` erwartet 32 Byte und brach vor der Übertragung ab. Die Normalisierung stellt dieselbe Schlüssellänge wieder her; keine Schlüsselrotation, keine neuen Konten und keine Datenmigration.
- Ein gezielter Test an ein bereits freigegebenes Apple-Gerät wurde vom Push-Dienst mit HTTP 201 angenommen. Die tatsächliche Anzeige auf dem Endgerät ist separat zu bestätigen.
- Einstellungen enthalten getrennte Push- und Standortkarten für das angemeldete eigene Konto auf diesem Gerät. Mitteilungsberechtigung und erfolgreiche Serverregistrierung werden getrennt behandelt; die Testnachricht adressiert nur das aktuelle Gerät.
- Öffentlicher Push-Schlüssel und Service Worker werden vor dem Freigabe-Klick vorbereitet. Berechtigung und neues Geräteabonnement entstehen ausschließlich durch einen Benutzer-Klick. Abgelaufene Registrierungen lassen sich erneuern.
- Push-Fehler zeigen einen verständlichen Status statt einer pauschalen Erfolgsmeldung. Der private Operator-Test erfordert das bestehende Cron-Geheimnis und genau eine Geräte-ID. Normale Konten können ausschließlich ihre eigenen Geräte testen. Private Schlüssel, Geräteadressen und Zugangsdaten werden nicht an normale Konten zurückgegeben.
- Standortfreigabe ist freiwillig, konto-/gerätespezifisch und ausschaltbar. Die Einstellungsprüfung speichert keine Koordinaten. Ankunftserkennung betrifft ausschließlich den eigenen geöffneten Arbeitsschein von heute bei sichtbarer App und hinterlegtem Kundenstandort. Keine Hintergrundüberwachung, kein Bewegungsverlauf, keine Änderung von Arbeitszeiten.
- Beim Verlassen des Auftrags, Ausschalten, Abmelden oder Hintergrundwechsel stoppt GPS. Bereits wartende Standortantworten werden nach Widerruf oder Kontowechsel verworfen.
- Offline-Cache und Gerätefunktionsdateien verwenden v864. Bestehende Arbeitszeiten, Dokumente, Mitarbeiter und Firmen bleiben unverändert.

Prüfungen: vorhandene Regressionstests für Anmeldung, Teamaufträge, Planung, Angebote, PDF, Belegscanner und RLS; zusätzliche simulierte Geräteberechtigungs-Tests und kryptografischer Nachweis, dass das Auffüllen des Schlüssels denselben öffentlichen Schlüssel erhält. Gerätetests verwenden ausschließlich synthetische Konten und Standorte.
