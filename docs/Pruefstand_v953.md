# Pruefstand vom 02.11.2026

## Jetzt im Live-Projekt aktiviert

Die vorherige Oberflaeche war vorhanden, aber vier Serverfunktionen fehlten. Die gemeinsame, atomare Migration v953 aktiviert:

- Ueberlappende Arbeitsscheine fuer genau einen Mitarbeiter ohne Konflikthinweis; vollstaendige Stundenzaehlung. Mehrere Mitarbeiter im selben Schein, Abwesenheiten, Firmenrechte und Rechnungssperren bleiben geprueft.
- Individuelle Material-Nettopreise im Rechnungsentwurf, VK* als Vorgabe und EK zur Kontrolle. Geaenderte Preise erfordern eine neue Vorschau mit passenden Steuerbetraegen.
- Auswahl des passenden Haendlerangebots in Rechnungen mit getrennten EK/VK und unveraenderlicher Preis-/Haendlerkopie im abgeschlossenen Beleg.
- Automatische RE-JJJJ-000001- und ST-JJJJ-000001-Nummern je Firma/Jahr. Vorschauen vergeben keine Nummer. Wiederholungen behalten dieselbe Rechnung/Nummer.

Die Live-Statusabfrage bestaetigt alle zwoelf bislang erfassten Installationsmerkmale. Das ist ein Installationsnachweis; echte Rechnungen und Arbeitsscheine wurden zum Testen weder erzeugt noch geloescht. Die neuen Rechnungsfunktionen verwenden Aufruferrechte und sind fuer anonyme Nutzer gesperrt. Die Metadaten der vorhandenen Arbeitsscheinfunktion bleiben durch die Migration unveraendert.

Eine Windows-Zeilenenden-Unvertraeglichkeit in der alten v918-Installationsdatei wurde behoben. Der Sicherheitsvergleich arbeitet nun fuer LF und CRLF gleich. Die TXT-Kopie 11 dient der Sicherung; die Aktivierung wurde bereits ausgefuehrt und darf nicht blind wiederholt werden.

## Bereits vorhanden und in passenden isolierten Tests abgedeckt

DATANORM 4/5, Artikelstamm mit separater Preispflege, automatische eindeutige VK-Zuordnung, Filterauswahl vor Suchstart, komplette Katalogauswahl ohne 1000er-Importgrenze, Fehlerkorrektur am betroffenen Artikel, Fortschrittsanzeige und lokale Originaldateien. Hersteller/Kategorien werden aus eindeutigen Daten oder erkennbaren Bezeichnungen abgeleitet. Die Materialsuche zeigt hoechstens 20 Treffer je Seite und stellt Serie, Funktion und Farbe getrennt dar.

Haendlerartikel werden bei erneutem Import ueber Haendler/Artikelnummer aktualisiert. Eindeutige GTINs oder ausdrueckliche Zuordnungen bilden gemeinsame Produktkarten. Aehnliche Namen allein sind kein verlaesslicher Identitaetsnachweis. Angebote und Rechnungen behalten ihre ausgewaehlte Bezugsquelle.

Offene Arbeitsscheine koennen gemeinsam markiert oder nach konkreter Bestaetigung entfernt werden. Abgerechnete und fremde Scheine bleiben ausgeschlossen. Angebotspreise und Materialpreise sind netto mit separater Bruttodarstellung. Die automatische Einkaufsuebertragung und der Rueckvergleich des Haendlerwarenkorbs bleiben unveraendert.

## Code Review

Ein Pull Request enthaelt die Aktivierung, ihre Tests und den aktualisierten Pruefstand. AGENTS.md beschreibt drei projektspezifische Review-Regeln fuer Firmenrechte, Rechnungen/Preise und eindeutige Produkt-/Bestandszuordnung. Ein eigener GitHub-Check fuehrt die zugehoerigen Datenbank- und Browserfixtures bei Pull Requests und Aenderungen an main aus. Er verwendet keine Produktionszugangsdaten und keine echten Bestellungen. Das ist von der optionalen automatischen Codex-Cloud-Review-Einstellung zu unterscheiden.

## Verbleibende Grenzen

- Echte Bilder fuer jeden beliebigen Artikel sind ohne eindeutige Hersteller-/Haendler-Bildquelle nicht vollstaendig moeglich. Vorhandene echte Bildverweise und der oeffentliche Herstellerindex werden automatisch verwendet; fehlende Bilder werden nicht erfunden.
- Der automatische Deutschlandfilter erkennt bekannte fremde Ausfuehrungen auch ohne Laenderfeld. Fehlende Produktangaben belegen keine rechtliche Zulassung; es gibt keine verlaessliche pauschale Zulassungspruefung jedes Katalogartikels.
- Originalkataloge sind weiterhin an Browserprofil, Konto und Firma gebunden. Eine gemeinsame geraeteuebergreifende Cloud-Katalogablage wurde nicht eingerichtet.
- Automatische Warenkorbuebertragung und Live-Bestand sind fuer die bereits angebundene GC-/EFG-Gruppe umgesetzt. Andere Grosshaendler benoetigen ihre eigene unterstuetzte Schnittstelle und Anmeldung.

Die Sicherheitsberater melden unveraendert bestehende Hinweise auf bewusst serverseitig gekapselte Tabellen, fuenf alte SECURITY-DEFINER-Endpunkte und deaktivierte Pruefung kompromittierter Kennwoerter. Die Aktivierung erzeugt keine neue Warnung. Hinweise: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable und https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
