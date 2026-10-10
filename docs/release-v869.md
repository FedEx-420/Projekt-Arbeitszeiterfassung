# Version 869 · Kundenadressen sicher erkennen

## Bedienung

Geschäftsleitung oder Administrator: **Kunden → Kunde auswählen → Adresse automatisch ermitteln**.
Zuerst Änderungen an Straße, Hausnummer, Postleitzahl oder Ort speichern. Die Suche verwendet die gespeicherte deutsche Kundenadresse, nicht den Kundennamen. Den passenden Standort aus den Treffern auswählen; ungefähre Treffer sind gekennzeichnet und müssen besonders geprüft werden. Koordinaten müssen nicht abgetippt werden.

Ein vorhandener manueller Baustellenstandort wird nur nach ausdrücklicher Bestätigung ersetzt. Nach einer Adressänderung wird ein daraus ermittelter Standort ungültig und muss neu bestätigt werden. Manuell gesetzte Baustellenstandorte bleiben erhalten und sollten dann geprüft werden.

Alle Mitarbeiter der Firma nutzen den bestätigten Kundenstandort für ihre bestehende Ankunftserkennung. Die persönliche Standortfreigabe bleibt freiwillig und wird in den eigenen Einstellungen aktiviert. Ein neuer GPS-Timer kann in dieser Web-App nur bei sichtbarer App starten. Ein bereits gestarteter Timer zählt anhand seiner gespeicherten Startzeit weiter; diese Erweiterung erzeugt keinen Hintergrund-Standortdienst.

## Datenschutz und kostenloser Betrieb

- Geoapify-Projekt im Free-Tarif eingerichtet. Kein bezahltes Abonnement gebucht.
- Schlüssel ausschließlich in Supabase Edge Secrets; keine Schlüssel in Browser, öffentlichem Repository oder Chat.
- Der Server übermittelt nur Straße, Hausnummer, PLZ, Ort und Land. Keine Namen, E-Mail-Adressen, Telefonnummern, Arbeitsdaten oder GPS-Bewegungsverläufe.
- Nur tatsächlich bestehende zuständige Geschäfts-/Administratorkonten können Adressermittlung starten. Kunden- und Firmenzugehörigkeit werden serverseitig geprüft, nicht aus übergebenen Firmen-IDs oder veränderbaren Nutzer-Metadaten übernommen.
- Treffer werden firmenbezogen für dieselbe unveränderte Adresse wiederverwendet. Gleichzeitige Anfragen erhalten nur eine Abrufreservierung.
- Höchstens 2.500 neue Abrufreservierungen pro UTC-Tag insgesamt, 150 pro Firma und Tag sowie 4 pro Sekunde. Fehler verbrauchen eine Reservierung; bei erreichtem Limit werden weitere Abrufe abgewiesen. Kein automatisches Upgrade. Andere direkt im Geoapify-Projekt ausgeführte Abrufe zählen ebenfalls zu dessen Anbieterlimit. Kostenlos ist nicht unbegrenzt.
- Geoapify-/OpenStreetMap-Quellenhinweise sind in der Standortansicht vorhanden.

## Schutz bestehender Funktionen

Additive Datenbankerweiterung, keine Konten-/Passwortänderungen und kein Neuaufbau bestehender Aufträge. Der Aktivierungsvorgang vergleicht 28 bestehende Datentabellen einschließlich Auth-Konten und Kundensätzen innerhalb seiner Transaktion. Neue Standort-Metadaten werden beim Vergleich berücksichtigt, ohne bisherige Standortwerte umzuschreiben.

Die bestehende Zeit-, Planungs-, Rechnungs-, Material-, Postfach-, PDF-, Push- und Geräteverknüpfungslogik bleibt erhalten. Die neue Serverfunktion verwendet eine fest gepinnte Supabase-Bibliothek und validiert Benutzer über Supabase Auth; die Plattform-JWT-Prüfung bleibt eingeschaltet.

## Verifikation

Neue lokale Datenbanktests: Firmentrennung, Managerrechte, private Cache-/Quota-Rechte, parallele Abrufe, veraltete Ergebnisse, manuelle Standorte und Adressänderungen. Servertests: gültige Anmeldung, feste Anbieteradresse, Datenminimierung, Cache, begrenzte Treffer, Providerfehler ohne Geheimnisoffenlegung. Browsertests: vollständiger Ermitteln-/Bestätigen-Ablauf mit isoliertem PostgreSQL, erhaltene Formulareingaben und vier Bildschirmgrößen.

Zusätzlich jeweils 14 Prüfungen am echten Datenbankschema mit synthetischen Identitäten, ausschließlich in zurückgerollten Transaktionen. Dabei keine echten Anmeldungen und keine Kundendaten an den Anbieter. Ein unabhängiger öffentlicher Berliner Adresstest bestätigt den privaten Anbieter-Schlüssel.

Der vollständige lokale Regressionstest besteht mit 484 Prüfungen über 37 Befehle. Er umfasst auch die bestehenden Zeit-, Planungs-, Angebots-, Rechnungs-, PDF-/Belegscanner-, Geräte-, Push- und Timerfunktionen; keine Produktionsschreibvorgänge. Die Testuhr des bisherigen Timer-Browsertests ist nun deterministisch, damit Fahrzeitprüfungen nicht vom Ausführungszeitpunkt kurz vor Mitternacht abhängen. Die Schutzregel gegen tagübergreifende Timerzeiten bleibt unverändert.

Der unabhängige Vergleich verschlüsselter Vorher-/Nachher-Sicherungen bestätigt unveränderte bestehende Daten in allen 28 geprüften Tabellen. Sicherheitsberater zeigen dieselben sechs bereits vorher vorhandenen Warnungen, keine neu hinzugekommenen. Diese Prüfungen sind keine Garantie für vollständige Fehlerfreiheit oder unbegrenzten kostenlosen Betrieb.
