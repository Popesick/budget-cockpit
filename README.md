# Budget-Cockpit (POC)

Ressourcen-/Budget-Dashboard: Ein Baseline-Budget wird auf Budgettöpfe verteilt, je Topf werden geplante
Themen gepflegt. **Proof of Concept mit Fakedaten und simuliertem Login** – keine echten Daten eingeben.

## Funktionen

| Bereich | Admin | Nutzer |
|---|---|---|
| Dashboard (Baseline, Kennzahlen, Budget je Topf, Tabelle) | alles, plus „Ansicht als …“-Vorschau | nur freigegebene Töpfe und Bereiche |
| Budgettöpfe anlegen, bearbeiten, archivieren | ✓ | – |
| Neues Kalenderjahr anlegen (startet leer) | ✓ | – |
| Baseline je Jahr festlegen und auf Töpfe verteilen | ✓ | – |
| Topf-Zugriff vergeben (Lesen / Bearbeiten) | ✓ | – |
| Sichtbarkeit je Person: Dashboard-Bereiche und Budgettöpfe | ✓ | – |
| Kalenderjahr wechseln (auch Vorjahre) | ✓ | ✓ |
| Themen anlegen, ändern (inkl. Bedarf und Status), per CSV importieren | ✓ | mit Recht „Bearbeiten“ |
| Kommentieren | ✓ | mit Recht „Lesen“ oder „Bearbeiten“ |
| Ist-Kosten eintragen, Themen löschen | ✓ | – |
| Benefit-Reporting (Backlog / Geplant / Umgesetzt mit Ansprechpartnern) | ✓ | – |
| Protokoll aller Änderungen, JSON-Export | ✓ | – |

### Kalenderjahre

Töpfe, Rechte und Sichtbarkeiten gelten jahresübergreifend; Baseline, Topfbudgets und Themen werden je
Kalenderjahr geführt. Ein neu angelegtes Jahr enthält noch keine Daten (Baseline optional, keine Topfbudgets,
keine Themen). Die Jahresauswahl steht oben in der Kopfzeile; voreingestellt ist das aktuelle Jahr.

**Simuliertes Datum (nur POC):** Auf dem Login-Screen lässt sich ein Datum setzen, z. B. 15.01.2027, um die
Ansicht im Folgejahr zu testen. Es bestimmt das voreingestellte Jahr und die Zeitstempel neuer Einträge und
wird im Hinweisbalken oben angezeigt. Ist für das aktuelle Jahr noch nichts angelegt, weist das Dashboard
darauf hin (Admins können das Jahr direkt anlegen).

### Topf-Ansicht

- Budget für das Kalenderjahr insgesamt, davon verplant, davon ausgegeben, übriges Budget
- Balken: ausgegeben (rot), verplant (gelb), frei (grün); Überplanung wird markiert
- Themenliste mit den Feldern Thema, Beschreibung, Bedarf (CAPEX, Euro), Benefits, Anmerkung zu Bedarf und
  Benefits, Weitere Details/Infos, Prio, AP CSS, Kommentar, Jira-Link
- Kommentarverlauf mit Zeitstempel und Loginname; Feldänderungen werden automatisch mit Alt/Neu eingetragen:
  `[Update 12.11.26 durch m.brandt]: Benefits wurde geändert. Alt: … / Neu: …`

**Status:** Jedes Thema hat einen Umsetzungsstand – *Backlog* (noch nicht eingeplant), *Geplant* oder
*Umgesetzt*. Wer im Topf „Bearbeiten“ darf, pflegt Status und Bedarf; Änderungen landen mit Alt/Neu im Verlauf.

**Rechenlogik:** Ein Thema mit Status *Geplant* oder *Umgesetzt* zählt als *verplant* mit seinem Bedarf, bis ein
Admin die Ist-Kosten einträgt (nachdem die realen Kosten von der Kostenstelle abgezogen wurden). Danach zählt es
als *ausgegeben* mit den Ist-Kosten. *Backlog*-Themen zählen nicht ins Budget und werden in der Topf-Ansicht
separat ausgewiesen. *Übrig* = Budget − verplant − ausgegeben.

### Benefit-Reporting (Admins)

Menüpunkt „Reporting“: Benefits aller Themen des gewählten Jahres, gruppiert nach Backlog / Geplant / Umgesetzt
und darin nach Budgettopf, mit Topf-Verantwortlichen und Ansprechpartner (AP CSS), Prio und Betrag. Dazu ein
Überblick je Topf, ein Filter auf einzelne Töpfe, CSV-Export und eine Druckansicht (auch als PDF).

### CSV-Import

Semikolon, Komma oder Tab als Trennzeichen; UTF-8 oder Windows-1252 (Excel). Spalten werden über die Überschrift
erkannt, nur „Thema“ ist Pflicht. Beträge dürfen deutsch formatiert sein (`12.500,00 €`). Eine Vorlage gibt es
im Import-Dialog.

## Lokal starten

Reine statische Seite ohne Build-Schritt und ohne externe Bibliotheken/CDNs:

```bash
python3 -m http.server 8765
```

Dann http://localhost:8765 öffnen. Daten liegen im `localStorage` des Browsers („Demo-Daten zurücksetzen“
auf der Login-Seite oder im Protokoll).

## Aufbau

```
index.html
css/app.css
js/clock.js             Zeitquelle inkl. simuliertem Datum (nur POC)
js/config.js            Rahmenparameter: Datenbackend (local/api), Auth-Modus (simulated/entra)
js/auth.js              Login-Simulation  → später MSAL / Entra ID
js/permissions.js       Rollen- und Rechte-Regeln (zentral, muss im Backend gespiegelt werden)
js/store.js             Fachliche Kommandos inkl. Rechteprüfung und Protokoll
js/metrics.js           Kennzahlen je Topf (verplant / ausgegeben / frei)
js/data/repository.js   Persistenz: LocalRepository (POC) | ApiRepository (Ziel)
js/data/seed.js         Fakedaten, Felddefinitionen, Dashboard-Bereiche
js/csv.js               CSV-Import/-Export
js/charts.js            Diagramme (HTML/SVG, ohne Bibliothek)
js/app.js               Oberfläche und Routing
```

## Weg in den internen Betrieb (Azure o. ä.)

Der POC läuft auf GitHub Pages. Für echte Daten ist er **nicht** geeignet: Rechte werden nur im Browser geprüft,
Daten liegen unverschlüsselt im Browser. Vorgesehener Pfad:

1. **Hosting:** statisches Frontend auf Azure Static Web Apps oder App Service im Firmen-Tenant (Region EU).
2. **Anmeldung:** `authMode: 'entra'` – Microsoft Entra ID per MSAL.js; Rollen über App-Rollen
   (z. B. `Budget.Admin`, `Budget.User`) oder Gruppen. Login-Simulation und Nutzerverwaltung entfallen bzw.
   lesen aus dem Verzeichnis.
3. **Backend:** REST-API (z. B. Azure Functions / App Service) mit Azure SQL. Die Methoden aus `js/store.js`
   werden zu Endpunkten; `js/permissions.js` wird serverseitig durchgesetzt. `dataBackend: 'api'`.
4. **Datenmodell:** Tabellen `users`, `pots`, `years`, `pot_budgets` (Topf × Jahr), `pot_access`,
   `widget_visibility`, `topics` (mit Jahr), `topic_log`, `audit` – entspricht 1:1 den Objekten in `seed.js`.
5. **Betrieb:** Protokoll unveränderbar speichern, Backups, Berechtigungskonzept und Datenschutz-Freigabe
   mit Informationssicherheit/Datenschutz abstimmen. Optional: Ist-Kosten automatisch aus dem
   Kostenstellen-Reporting (SAP o. ä.) übernehmen.

Alle Personen, Kostenstellen, Themen und Beträge im POC sind frei erfunden.
