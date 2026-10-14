const topics={
 company:['Firma','Die Firmenbezeichnung, mit der dein Geschäftskonto eingerichtet wurde. Gleiche Benutzernamen können in verschiedenen Firmen vorkommen.','Sie ordnet die Anmeldung dem richtigen Betrieb zu. Nur der Administrator kann sich ohne Firma anmelden.','Bei deiner Geschäftsleitung.'],
 username:['Benutzername','Den für dieses Konto vergebenen Benutzernamen eingeben. Leerzeichen sind erlaubt.','Er identifiziert dein Konto innerhalb der gewählten Firma.','Bei der Geschäftsleitung oder dem Administrator.'],
 password:['Passwort','Das Passwort ausschließlich in dieses Passwortfeld eingeben. Ein leeres Feld bei „Neues Passwort“ bedeutet: nicht ändern.','Es schützt dein Konto. Keine Passwörter in Notizen oder Nachrichten eintragen.','Bei der zuständigen Kontoverwaltung; bei einer Anmeldung gegebenenfalls „Passwort vergessen?“ verwenden.'],
 allowance:['Urlaubsanspruch','Die für das jeweilige Jahr vereinbarte Anzahl der Urlaubstage, zum Beispiel 30. Nicht den Resturlaub oder Arbeitsstunden eintragen.','Daraus und den genehmigten Abwesenheiten berechnet sich der verbleibende Urlaub.','Im Arbeitsvertrag oder bei der Personal-/Geschäftsleitung.'],
 taxId:['Steuernummer','Die für deinen Betrieb verwendete Steuernummer, wenn sie für deinen Rechnungsfall benötigt wird. Nicht mit der persönlichen Steuer-ID verwechseln.','Die Rechnung muss die zum jeweiligen Fall passende steuerliche Kennung enthalten.','Im Schreiben des Finanzamts oder bei deiner Steuerberatung.','https://www.gesetze-im-internet.de/ustg_1980/__14.html'],
 vatId:['Umsatzsteuer-Identifikationsnummer','Deine vom BZSt erteilte USt-IdNr., falls vorhanden, beispielsweise DE123456789. Keine Nummer erfinden.','Sie identifiziert Unternehmen für umsatzsteuerliche Zwecke. Sie ist nicht die Steuernummer.','Im Vergabeschreiben des BZSt oder bei deiner Steuerberatung.','https://www.bzst.de/DE/Unternehmen/Identifikationsnummern/Umsatzsteuer-Identifikationsnummer/umsatzsteuer-identifikationsnummer_node.html'],
 taxMode:['Steuerfall','Nur den für deinen Betrieb und die Leistung fachlich bestätigten Steuerfall auswählen. Bei Unsicherheit nicht raten.','Regelbesteuerung, Kleinunternehmerregelung und § 13b werden unterschiedlich behandelt. Die App erteilt keine steuerliche Freigabe.','Bei deiner Steuerberatung oder dem Finanzamt.'],
 legalForm:['Rechtsform','Die tatsächliche Rechtsform des Betriebs, zum Beispiel Einzelunternehmen, GmbH oder GbR.','Sie hilft, den richtigen rechtlichen Vertragspartner zu benennen.','In den Gründungs-/Registerunterlagen oder bei Rechts- beziehungsweise Steuerberatung.'],
 register:['Registerangaben','Falls zutreffend: Registerart, Registernummer und Registergericht. Unklarheiten erst prüfen.','Die Angaben können zur eindeutigen Benennung des rechtlichen Anbieters erforderlich sein.','Im Registerauszug oder Registerportal der Länder.','https://www.handelsregister.de/'],
 reviewer:['Geprüft von','Name der Fachperson, die genau diese Dokumentversion tatsächlich geprüft hat. Nicht die App oder eine erfundene Person eintragen.','Der Prüfvermerk soll nachvollziehbar sein. Ein Häkchen allein ist keine rechtliche Freigabe.','Bei der tatsächlich prüfenden Rechts-, Datenschutz- oder Steuerberatung.'],
 reviewDate:['Prüfdatum','Das tatsächliche Datum der dokumentierten Prüfung, nicht ein gewünschtes Datum.','Es gehört zu einer konkreten Dokumentversion und deren Nachweis.','Aus dem schriftlichen Prüfvermerk.'],
 evidence:['Nachweis / Fundstelle','Beschreibe, wo der tatsächliche schriftliche Prüfvermerk zu genau dieser Dokumentversion liegt. Einen Dateinamen oder eine Fundstelle angeben, keine erfundene Freigabe.','So kann die dokumentierte Prüfung nachvollzogen werden. Die App überprüft nicht die fachliche Qualifikation oder den Inhalt dieses Nachweises.','Bei der prüfenden Fachperson oder im geschützten Firmenarchiv.'],
 customer:['Kunde','Den Kunden eingeben oder einen passenden vorhandenen Kunden auswählen. Bei ähnlichen Namen bitte bewusst die richtige Variante bestätigen.','Der Kunde wird dem Eintrag und der firmeneigenen Kundendatenbank zugeordnet.','Aus dem Auftrag oder deiner Kundenliste.'],
 start:['Arbeitsbeginn','Die tatsächliche Uhrzeit des Arbeitsbeginns. Die App arbeitet in Viertelstunden.','Beginn, Ende, Pause und Stunden werden gemeinsam berechnet.','Aus dem Arbeitsablauf oder einer geprüften Zeitmessung.'],
 end:['Arbeitsende','Die tatsächliche Enduhrzeit eingeben und die daraus berechneten Arbeitsstunden prüfen.','Aus Beginn, Ende und Pause entstehen die ausgeführten Arbeitsstunden.','Aus dem Arbeitsablauf oder einer geprüften Zeitmessung.'],
 pause:['Pause in Stunden','Die Pausendauer als Stundenwert, etwa 0,25 für 15 Minuten oder 0,50 für 30 Minuten.','Pausen zählen nicht zur ausgeführten Arbeitszeit.','Aus dem tatsächlichen Arbeitsablauf.'],
 hours:['Arbeitsstunden','Ausgeführte Stunden, etwa 1,50 für eineinhalb Stunden. Die Enduhrzeit wird entsprechend angepasst.','Die Zeit wird in 0,25-Stunden-Schritten verarbeitet.','Aus dem tatsächlichen Arbeitsablauf.'],
 unit:['Einheit','Stk = Stück, M = Meter, H = Stunden, Pau = Pauschale, Kg = Kilogramm.','Menge und Einzelpreis müssen dieselbe Einheit verwenden; es erfolgt keine automatische Umrechnung.','Aus der Material-/Leistungsbeschreibung.'],
 monthly_price:['Preis für neue Geschäftskonten','Den monatlichen Gesamtpreis in Euro, etwa 39,00. Auch 0,00 ist möglich.','Nur neu angelegte Firmen erhalten diesen Preisstand. Bestehende Firmen und das Erfinderkonto bleiben kostenlos. Es wird keine Zahlung ausgelöst.','Du bestimmst den Preis als Anbieter. Steuerliche und vertragliche Preisangaben vor dem Verkauf fachlich prüfen lassen.'],
 plan_name:['Tarifname','Eine kurze verständliche Bezeichnung für den Preisplan, beispielsweise Standard.','Sie wird zusammen mit dem Preisstand beim Anlegen einer neuen Firma festgehalten.','Du legst den Namen als Anbieter fest.']
};
export function helpTopic(name,label=''){
 let topic=topics[String(name||'').split('.').at(-1)];
 if(!topic&&/Steuernummer/i.test(label))topic=topics.taxId;
 if(!topic&&/USt.*Id|Umsatzsteuer.*nummer/i.test(label))topic=topics.vatId;
 if(!topic&&/Steuerfall|Besteuerung/i.test(label))topic=topics.taxMode;
 if(!topic&&/Rechtsform/i.test(label))topic=topics.legalForm;
 if(!topic&&/Register/i.test(label))topic=topics.register;
 if(!topic&&/Prüfdatum/i.test(label))topic=topics.reviewDate;
 if(!topic&&/Geprüft von|Prüfperson/i.test(label))topic=topics.reviewer;
 if(!topic&&/Urlaubsanspruch/i.test(label))topic=topics.allowance;
 topic||=[label||'Eingabe','Die zum geöffneten Eintrag passende Angabe eintragen. Vor dem Speichern bitte prüfen.','Sie wird für diesen Auftrag, Kunden oder dieses Konto verwendet. Speichern ist keine automatische rechtliche Freigabe.','Bei der zuständigen Geschäftsleitung oder in den Unterlagen zum Eintrag.'];
 return {title:topic[0],what:topic[1],why:topic[2],where:topic[3],source:topic[4]||null};
}
