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

## Nachtrag · 30.10.2026

Die Empfangsstelle wurde inzwischen separat in Supabase aktiviert. Die dort noch
vorhandene Beispielvorlage wurde durch die geprüfte App-Funktion ersetzt und die
zusätzliche JWT-Prüfung für diese eine Funktion ausgeschaltet. Die eigene
Einmaltoken-Prüfung bleibt aktiv. Der Live-Check liefert HTTP 200 mit `available: true`.

Nach dem Neuladen kann die App die Bereitschaft erkennen und den Übergabebutton
freigeben. Der erfolgreiche Login beim echten Großhändler wurde noch nicht getestet;
dafür werden die persönlichen Neugart-/GC-Zugangsdaten benötigt.
