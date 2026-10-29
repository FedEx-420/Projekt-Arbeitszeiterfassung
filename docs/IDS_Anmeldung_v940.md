# Großhandels-Anmeldedaten eingeben · v940

Benutzername, Kennwort und Kundennummer waren bisher gesperrt, solange die
Empfangsstelle nicht bereit oder der Fachhändler noch nicht zugeordnet war.
Das betraf auch Administratoren und erweckte den Eindruck fehlender Rechte.

Die Zugangsdaten lassen sich jetzt für Firmenleitung und Administratoren bereits
vor Abschluss der technischen Einrichtung eingeben. Während einer laufenden
Verbindungsprüfung bleiben die Felder ausfüllbar; das Ergebnis der Prüfung
überschreibt den eingetragenen Benutzernamen und das Kennwort nicht.

Die Übertragung hat weiterhin eigene Voraussetzungen. Direkt neben dem Button
wird erklärt, ob die technische Prüfung läuft, die Empfangsstelle fehlt oder die
Händlerzuordnung noch offen ist. **Einrichtung anzeigen** öffnet den konkreten
Verbindungsfehler. Die Prüfung wird dadurch nicht umgangen.

Die Bezeichnungen nennen jetzt **Neugart / GC ONLINE PLUS**. Benutzername und
Kennwort sind als Pflichtangaben erkennbar. Die App speichert die Zugangsdaten
weiterhin nicht im Einkaufsentwurf oder in der Datenbank.

Geprüft mit einem echten Browser: Administrator, HTTP 401, fehlende SQL-Erweiterung,
offene Händlerzuordnung, laufende Prüfung, Erhalt der Eingaben, anschließend
erreichbare Verbindung, keine Übertragung bei fehlender Einrichtung, kein Passwort
im lokalen Speicher, Firmenwechsel und verborgene Anmeldung für Mitarbeiter.
Zusätzlich in der vollständigen App mit einem Admin-Profil sowie mit dem bestehenden
isolierten Shop-POST und der Katalog-/Einkaufssuche getestet.

Der öffentliche Check der Empfangsfunktion antwortete am 29.10.2026 weiterhin mit
HTTP 401 `UNAUTHORIZED_NO_AUTH_HEADER`. Diese Veröffentlichung behebt die
Eingabesperre. Sie bestätigt keine erfolgreiche Anmeldung beim echten Großhändler
und aktiviert keine Supabase-Einstellung.
