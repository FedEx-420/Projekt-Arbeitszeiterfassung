# Automatischer Deutschlandfilter

Der Filter ist fest aktiv. Er gilt für die bestehende Materialsuche, Produktvorschläge
in Arbeitsscheinen und Angeboten sowie für neue Suchauswahlen aus gespeicherten oder
neu gelesenen Katalogen. Es gibt keine Rückfrage und keinen Schalter zum Einblenden
ungeprüfter Produkte. Die Herstellerherkunft ist kein Auswahlkriterium.

Ein Produkt erscheint nur, wenn es anhand einer gültigen GTIN oder einer eindeutigen
Hersteller-Modellnummer samt Hersteller einem aktuellen öffentlichen Nachweisregister
zugeordnet werden kann. Großhändlernummern, Namen, 230 V, SCHUKO, CE, VDE im Freitext
oder ein Artikelbild allein sind kein Nachweis. Mehrdeutige und abgelaufene Nachweise
sowie erkennbare fremde Länderausführungen werden ausgeschlossen.

Die erste Datenquelle ist der öffentliche deutsche Herstellerkatalog von Hager/Berker.
Der automatische Leser vergleicht die konkrete Artikelidentität auf der Produktseite
mit einer dort verlinkten EU-Konformitätserklärung. Die Modellnummer muss als eigene
Tabellenzeile in der PDF stehen; eine Erklärung allein zu RoHS wird nicht akzeptiert.
Aktuell werden Erklärungen mit Niederspannungs- oder Funkanlagenrichtlinie und einer
angeführten EN-/IEC-Norm erfasst. Dokumentquelle, Abrufdatum und SHA-256 bleiben im
öffentlichen Register nachvollziehbar. Nachweise werden nach 90 Tagen ausgeblendet;
der bestehende öffentliche Aktualisierungslauf prüft Quellen nach 30 Tagen erneut.

Das ist ein konservativer Filter nach Herstellerunterlagen, keine amtliche Zulassung,
keine unabhängige Sicherheitsprüfung und keine Bestätigung für jeden Einbauort.
Insbesondere normale Haushaltssteckdosen ohne passende Unterlagen in dieser Datenquelle
bleiben zunächst ausgeblendet, obwohl sie geeignet sein können. Für weitere Hersteller
und Produktarten fehlen derzeit Quellenadapter und zugeordnete Nachweise.

Beim ersten Prüflauf wurden 106 öffentliche Modellseiten gelesen. Vier Modelle hatten
eine im unterstützten Verfahren auswertbare Erklärung mit dem geforderten Umfang.
**Die Abdeckung ist deshalb noch sehr klein. Ein leerer Suchtreffer bedeutet nicht,
dass ein Artikel unzulässig ist, sondern dass kein ausreichender Nachweis zugeordnet ist.**

Vorhandene Materialien, vollständige Originalkataloge und Belege werden nicht gelöscht
oder nachträglich umgeschrieben. Historische Rechnungen und vorhandene Positionen
bleiben lesbar. Eine ältere unterbrochene Importauswahl muss vor dem Fortsetzen erneut
nach den neuen Vorgaben gesucht werden; bereits bestätigte Speicherpakete bleiben erhalten.

Kein Standort des Nutzers wird ermittelt. Keine private Materialliste wird an externe
Dienste übermittelt. Die automatischen Abrufe betreffen ausschließlich öffentliche
Herstellerartikel und deren Unterlagen. Keine Datenbankmigration ist erforderlich.

Hintergrund: [VDE zu Prüfzeichen und CE](https://www.vde.com/tic-de/zeichen-und-zertifikate/pruefzeichen-und-bescheinigungen?view=DEFAULT).
