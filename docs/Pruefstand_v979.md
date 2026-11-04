# v979 – automatische Anmeldung nach Neugart-Übertragung

Stand: 04.11.2026.

## Ursache und Änderung

GC liefert für den Layoutwechsel zu EFG eine offizielle Weiterleitungsantwort
mit Status 11 und `authenticationToken`, obwohl `successful` false ist.
Der normale direkte EFG-Login ist erfolgreich, liefert aber keinen solchen
Schlüssel; `getauthkeylocalapp` lieferte beim geprüften Zugang authKey=null.
Deshalb öffnete der Browser bislang den Warenkorb ohne eigene Shop-Sitzung.

Die Serverfunktion meldet sich zum Prüfen von Konto und Warenkorb weiterhin
direkt bei EFG an. Nach dem protokollierten Rücklesen fordert sie separat
den offiziellen GC-zu-EFG-Anmeldeschlüssel an. Nur Status 11, EFG-Layout,
die genaue EFG-Origin ohne fremden Pfad/Query und ein gültiger Schlüssel
werden akzeptiert. Die App sendet ihn per POST an den bestätigten
Warenkorb. Kennwort, Cookies und Anmeldeschlüssel landen nicht im
Übertragungsprotokoll. Bei einer Wiederholung wird der vorhandene Warenkorb
weiterhin nur gelesen und kein Artikel doppelt hinzugefügt.

## Prüfungen

- Serverfixture: offizieller Redirect trotz successful=false, unzulässige
  Hosts/Pfade/Status/Token abgewiesen; Warenkorb-Rücklesen, Freigaben und
  Firmen-/Benutzergrenzen; keine Zugangsdaten oder Token im Protokoll.
- Browserfixture: persönliches Warenkorbmenü, unabhängige Suche, gleiche
  Browserseite beim POST, Mengen, Wiederholungen, Gerätebreiten.
- Vollständige Einkaufs-Browserprüfung und Login-Startprüfung bestanden.
- Live: gespeicherter Neugart-Zugang über „Zugang prüfen“ automatisch zum
  angemeldeten EFG-Shop weitergeleitet. Benutzer und Logout im Kontomenü
  sichtbar. Vorhandene Warenkorbliste und ein bestehender Warenkorb ohne
  erneute Anmeldung geöffnet. Keine Händlerdaten verändert.
- GitHub Pages liefert Version 979; supplier-cart-v949 wurde aktualisiert.

## Noch offen

Der vollständige Bestellbutton-Ablauf auf einem echten iPhone wurde in
diesem Arbeitsblock nicht geprüft. Die direkte Warenkorb-POST-Weiterleitung
ist im isolierten Browser geprüft; live wurde die automatische Anmeldung
und der anschließende Zugriff auf einen vorhandenen Warenkorb geprüft.
