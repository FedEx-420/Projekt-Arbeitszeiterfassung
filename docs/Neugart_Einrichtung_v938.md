# Neugart / GC ONLINE PLUS: Einrichtung und Videoauswertung (v938)

## Was bereits vorbereitet ist

- Eigenes App-Menü „Einkauf“ für Firmenleitung und Administrator.
- Vorhandene Händlerartikel aus der Materialsuche über „Zum Einkauf“ auswählen.
- Neugart-/GC-Katalog zuordnen, Mengen, Artikelnummern, Einheiten und Kommission prüfen.
- IDS-2.5-Warenkorb als XML exportieren. Keine EK- oder Kundenverkaufspreise übertragen.
- Direkte Übergabe per POST mit multipart/form-data und UTF-8 an den GC-IDS-Endpunkt.
- Geschützte Rückgabe mit zufälligem Einmaltoken, einer Stunde Gültigkeit und Bindung an Benutzer/Firma.
- Shop-Rückmeldung als Vorschau prüfen. Keine automatische Änderung von Artikeln, Rechnungen oder Arbeitsscheinen.

Einkaufsentwürfe sind lokal auf diesem Gerät nach Benutzer und Firma getrennt gespeichert.
IDS-Benutzername und Passwort werden weder lokal noch in der Datenbank gespeichert.
Die Zugangsdaten werden erst beim selbst ausgelösten Übergabeklick an GC gesendet.

## Was noch NICHT live aktiviert ist

Die verbundenen Supabase-Konten liefern keine Projekte. Auch die lokale CLI hat keine
Anmeldung. Daher sind Datenbankerweiterung und Empfangsfunktion getestet und vorbereitet,
aber im Projekt noch nicht installiert. Neugart-Kontofreischaltung und ein echter
angemeldeter Shop-Test sind ebenfalls offen. OMD, die Rückübernahme in Materialstammdaten
und zusätzliche Shopfunktionen sind noch nicht integriert. Es wurde keine echte Bestellung
angelegt oder ausgelöst.

## Einrichtung – zwei Dateien und danach der erste Shop-Test

1. Im [SQL-Editor des App-Projekts](https://supabase.com/dashboard/project/yzlnfrljlknazywskylb/sql/new)
   den vollständigen Inhalt von **09_IDS_Warenkorb_Rueckgabe.txt** ausführen. Die Datei
   legt ausschließlich neue Funktionen und eine private Tabelle für Rückgabevorgänge an.
   Alte Materialien und Belege werden nicht verändert.
2. Im selben Projekt unter **Edge Functions** eine Funktion über den Editor anlegen.
   Name exakt **ids-cart-return-v938**. Den vollständigen Inhalt von
   **10_IDS_Empfangsfunktion.txt** als Quelltext einsetzen und veröffentlichen.
   Für genau diese neue Webhook-Funktion die vorgelagerte JWT-Prüfung ausschalten:
   Der Großhandel kann keinen Supabase-Benutzer-JWT mitsenden. Die Funktion prüft
   stattdessen einen kurzlebigen Einmaltoken gegen den privaten Datenbankvorgang.
   Die JWT-Einstellungen bestehender Funktionen nicht ändern. SUPABASE_URL und
   SUPABASE_SERVICE_ROLE_KEY sind serverseitige Supabase-Umgebungsvariablen; diese
   Werte niemals in die App-Konfiguration oder in einen Chat kopieren.
3. App mit Strg+F5 neu laden. Im Menü **Einkauf** auf **Technische Voraussetzungen prüfen**
   klicken. Danach den passenden gespeicherten Neugart-/GC-Katalog zuordnen. In der
   Materialsuche beim gewünschten Händlerangebot **Zum Einkauf** wählen. Im Einkauf
   eine kleine echte Artikelauswahl und ihre Bestelleinheiten sorgfältig prüfen.
   Die eigenen IDS-Anmeldedaten selbst eingeben und an den Warenkorb übergeben.
   Anschließend im Shop Artikel, Verpackungsmengen, Lieferart, Preise und Verfügbarkeit prüfen.
   Eine endgültige Bestellung dort nur bei eigenem Bestellwunsch auslösen.

Ein erfolgreicher technischer Status bestätigt Datenbank und Empfangsfunktion, nicht die
Neugart-Anmeldedaten oder die Annahme eines Warenkorbs. Fehlende Shop-Rückmeldungen
werden nicht als Erfolg dargestellt. Einmaltoken können nur einmal und innerhalb einer
Stunde verwendet werden. Neue eigene Vorgänge bereinigen alte eigene Rückgabevorgänge,
die seit mehr als einem Tag abgelaufen sind; es gibt derzeit keinen unabhängigen Bereinigungslauf.

Alternativ für angemeldete Entwickler: `supabase functions deploy ids-cart-return-v938 --project-ref yzlnfrljlknazywskylb --no-verify-jwt --use-api`.

## Was die Videos tatsächlich belegen

Die Playlist enthält 15 Einträge; 14 Videos sind öffentlich sichtbar, ein Video ist nicht
verfügbar. Ausgewertet wurden die sichtbaren Titel/Beschreibungen aller 14 Videos und
vollständige verfügbare Transkripte für die Videos zu Alternativartikeln, IDS und
„Mein ONLINE PLUS“. Bei den übrigen elf Videos blieb das YouTube-Transkript im Ladezustand.
Deren gesprochener Inhalt wurde deshalb nicht als vollständig analysiert ausgegeben.
Die technischen Implementierungsdetails stammen zusätzlich aus der offiziellen ITEK-Spezifikation.

| Video | Auswertung und Bedeutung für unsere Anbindung |
|---|---|
| [OMD: Alternativartikel](https://www.youtube.com/watch?v=uWRE458wudA) | Transkript gelesen. Vergleich und Übernahme von Alternativen über OMD; eigener Artikeldatendienst, keine Voraussetzung für reines Warenkorbsenden. |
| [IDS: Warenkorb mit Vorgangsbezug](https://www.youtube.com/watch?v=bZFR8KuSVYA) | Titel/Beschreibung gelesen, Transkript nicht geladen. Vorgangsbezug ist Thema; konkrete technische Felder anhand der Spezifikation umgesetzt. |
| [OMD/IDS: Stammdaten ohne DATANORM](https://www.youtube.com/watch?v=U6CXYtyKzdM) | Titel/Beschreibung gelesen. Datenübernahme als zusätzliche Ausbaustufe, noch nicht integriert. |
| [Mein ONLINE PLUS](https://www.youtube.com/watch?v=c9u1RFHdkq0) | Transkript gelesen. Persönliche Startseitenfavoriten für Desktop/Handy; keine technische Freischaltung für IDS und deshalb nicht geändert. |
| [OMD: Artikelbilder](https://www.youtube.com/watch?v=HDi1tl4eIOc) | Beschreibung gelesen. Bilder über OMD; kann die frühere Bildsuche ergänzen, benötigt eine gesonderte OMD-Anbindung. |
| [IDS-Schnittstelle](https://www.youtube.com/watch?v=E4NbyVQ6snA) | Transkript gelesen. Artikelsuche, Warenkorb empfangen, Artikeldetails und Warenkorb senden. Bei ca. 3:05–3:32 Übergabe von Bestell-/Kommissionsnummern und Positionen, anschließender Abschluss im Shop. Bei ca. 3:40 Unterstützung des Großhändlers zur Einrichtung. |
| [Warenkörbe weiterleiten und empfangen](https://www.youtube.com/watch?v=PMEGzPgx-_I) | Beschreibung gelesen. Interne Weiterleitung von Bestellanforderungen; nicht mit IDS-Übertragung gleichgesetzt. |
| [Bestelltabellen](https://www.youtube.com/watch?v=iKeWMcmGSSs) | Beschreibung gelesen. Wiederkehrende Bestellungen; optionaler Shopablauf. |
| [Artikel-Konfiguratoren](https://www.youtube.com/watch?v=T9Bl3Syyjhw) | Beschreibung gelesen. Produktauswahl im Shop; keine notwendige Freischaltung für den XML-Export. |
| [Rechnungen und Belege](https://www.youtube.com/watch?v=yaSyJkeQoa0) | Beschreibung gelesen. Separater Finanz-/Belegbereich, keine Änderung daran vorgenommen. |
| [Etiketten erstellen](https://www.youtube.com/watch?v=Ji2uudWGDqM) | Beschreibung gelesen. Barcode-/QR-Funktionen des Shops; keine Voraussetzung für IDS-Warenkorbsenden. |
| [Warenkorb retournieren](https://www.youtube.com/watch?v=fGp3nBCzA4c) | Thema anhand Titel erfasst; kein geladenes Transkript. Keine Retoure ausgelöst oder eingerichtet. |
| [Prospekte/Kataloge erstellen](https://www.youtube.com/watch?v=hK2r__N6Ojo) | Beschreibung gelesen. Clippingfunktion, keine technische Voraussetzung für IDS. |
| [Bestellung aus Katalog](https://www.youtube.com/watch?v=jmpTaRrej6g) | Beschreibung gelesen. Shopinterner Bestellweg, keine zusätzliche Schnittstelle daraus abgeleitet. |

## Technische Quellen und Grenzen

- [Offizieller IDS-Standard einschließlich Schema](https://itek.de/wissen/verzeichnis-branchenstandards/ids-connect).
- [GC-Gruppe zu IDS und OMD](https://www.gc-gruppe.de/service/schnittstellen).
- GC-Endpunkt `https://www.gconlineplus.de/ids.aspx`: öffentlich ohne Anmeldung erreichbar;
  antwortet ohne Parameter mit dem Hinweis auf fehlenden Benutzernamen und fehlendes Passwort.
  Das bestätigt den Einstiegspunkt, nicht die Funktionsfähigkeit eines konkreten Kundenkontos.
- Die offiziellen XML-Beispiele wurden nicht ungeprüft kopiert. Das erzeugte XML wurde
  lokal mit dem originalen XSD für „Warenkorb senden 2.5“ validiert, einschließlich
  Versandart, Positionsreferenzen, Dezimalmengen und Feldlängen.
- Der Test der Übergabe erfolgte gegen abgefangene, isolierte Browseranfragen. Es wurden
  keine echten Zugangsdaten verwendet und keine Daten an den echten Warenkorb gesendet.
- Die Rückmeldung wird nicht direkt von einer statischen GitHub-Seite entgegengenommen.
  Die Empfangsfunktion speichert sie geschützt und leitet ohne XML und ohne Token in der
  Weiterleitungsadresse zur App zurück. Bei unterdrückter Fensterkommunikation bleibt
  der Link „Zur Arbeitszeit-App“ sowie „Letzte Shop-Rückmeldung prüfen“ verfügbar.
