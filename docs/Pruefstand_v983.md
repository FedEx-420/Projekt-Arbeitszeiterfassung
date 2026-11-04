# v983 – weitere Hager-Bilder und konstante Anmeldeprüfungen

Stand: 04.11.2026.

## Bilder

- 160 öffentliche Herstellerseiten geprüft; 37 eindeutige Bildreferenzen
  bestätigt, davon 27 erstmals aufgenommen. Gesamtbestand 18.513.
- Neue Referenzen unter anderem MBN116, MBS116 und CDA440D. Alle 27 neuen
  Bildadressen antworten mit HTTP 200 und Content-Type image/*.
- Interne Kennungen wie HMW631NR20 werden nur bei ausdrücklich gleicher
  sichtbarer Handelsreferenz, Product-Name, Produktpfad und eindeutiger
  gültiger EAN der Handelsreferenz HMW631NR zugeordnet.
- 8 isolierte Parserprüfungen bestehen, einschließlich falscher EAN,
  widersprüchlicher Referenzen und unzulässiger Bild-/Seitenadressen.
- Herstellerfotoindex-Gegenprobe bestanden. Der Bildbestand ist weiterhin
  unvollständig; ähnlich klingende Namen oder Großhändlernummern werden
  nicht als Nachweis einer Herstellerreferenz verwendet.

## Datenbank

Die bestehenden Regeln „Assigned team can read planning“ und „Assigned team
can attach documents“ prüfen auth.uid() nun über SELECT-InitPlans. Die
Firmenzuordnung des angemeldeten Benutzers ist ebenfalls anfragekonstant.
Prüfungen des jeweiligen Auftrags bzw. Eigentümers bleiben zeilenabhängig.
Die Migration 20261104124139 wurde live angewendet. Supabase meldete danach
keinen auth_rls_initplan-Hinweis mehr (vorher zwei).

[Supabase: Hintergrund und Abhilfe](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan).

- Vorher/Nachher-Rechtevergleich für sechs Rollen in einer isolierten
  PostgreSQL-Datenbank identisch. Fremdfirma und vorgetäuschte Mitarbeiter
  bleiben abgewiesen; EXPLAIN bestätigt einen InitPlan.
- 24 bestehende Teamdatenbankprüfungen bestanden, ohne Produktionsbuchungen.
- Keine Geschäftsdaten, Dokumente, Preise oder Zugangsdaten gelöscht.
- Weitere Hinweise zu Fremdschlüsselindizes und mehreren erlaubenden
  Regeln bleiben offen. Ungenutzte Indizes wurden nicht pauschal entfernt.
- Diese Optimierung belegt keine bestimmte Verringerung des gesamten
  täglichen Disk-I/O-Verbrauchs. Dafür sind weitere Messungen und die
  Begrenzung verbleibender Material-Vollabrufe erforderlich.
