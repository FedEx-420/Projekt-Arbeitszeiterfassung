# Wochentage für die OwnTracks-Erkennung (v874)

Unter **Einstellungen → OwnTracks-Einrichtung öffnen** lassen sich Montag bis
Sonntag einzeln auswählen. Neue und bestehende Verbindungen sind zunächst auf
Montag bis Freitag beschränkt; Wochenenden werden nicht automatisch freigegeben.

Bei einer vorhandenen Verbindung unter **Freigaben dieses Geräts** die Tage
auswählen und **Wochentage speichern** drücken. Die Einstellung wird auf dem
Server gespeichert. Das Gerätekennwort bleibt gleich; ein erneuter Import der
OwnTracks-Datei auf dem iPhone ist dafür nicht nötig. Bei mehreren persönlichen
Arbeitskonten gilt dieselbe Auswahl für diese gemeinsame Verbindung.

Die Prüfung verwendet den aktuellen Tag in **Europe/Berlin** und das tägliche
Zeitfenster. Ein abgewählter Tag startet oder beendet keine automatische
Messung. Bereits gespeicherte Messungen und laufende Timer werden durch das
Ändern der Tage nicht gelöscht oder künstlich beendet. Fehlende Endzeiten sind
weiterhin manuell korrigierbar.

Feiertage in NRW, Krankheit und genehmigter Urlaub bleiben gesperrt. Pause,
Widerruf, Ablauf, Standortgenauigkeit, Verweildauer, Berechtigungen und die
Trennung zwischen Firmen gelten unverändert. Nur der angemeldete Eigentümer
der persönlichen Geräteverbindung kann ihre Wochentage ändern. Ein Chef kann
damit keine Standortfreigabe eines Mitarbeiters erweitern.

Wichtig: Die Einstellung begrenzt die **serverseitige Ankunfts- und
Abfahrtserkennung**, nicht den Hintergrundbetrieb der separaten OwnTracks-App.
OwnTracks kann weiterhin Meldungen senden; außerhalb der Arbeit kann sie auf
**Ruhe / Quiet** gestellt werden. Es wird weiterhin kein Bewegungsverlauf in
der Arbeitszeit-Datenbank gespeichert. iOS kann Standortmeldungen verzögern.
Die manuelle Zeiterfassung wird durch diese Auswahl nicht eingeschränkt.

Prüfungen: bestehende Datensätze und alte vierparametrige APIs, leere/ungültige
Tagesauswahl, Berliner Tagesgrenze, Samstag/Sonntag, Sperren, gemeinsame
Admin-Verbindung, Eigentümerprüfung, Wiederholen bei Netzwerkfehlern sowie
Darstellung in Hochformat, Querformat und am PC. Ein physischer iPhone-Test
ist separat notwendig; Browser-/Datenbanktests sind kein Nachweis dafür.
