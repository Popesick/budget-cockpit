// Fakedaten für den POC. Alle Namen, Kostenstellen, Themen und Beträge sind frei erfunden.

export const SCHEMA_VERSION = 4;

export const WIDGETS = [
  { id: 'baseline', label: 'Gesamtbudget & Reserve', hint: 'Baseline, unverteilter Rest und Aufteilung auf alle Töpfe' },
  { id: 'kpis', label: 'Kennzahlen', hint: 'Summen über die sichtbaren Töpfe' },
  { id: 'potBars', label: 'Budgetbalken je Topf', hint: 'Frei / verplant / ausgegeben je Topf' },
  { id: 'potTable', label: 'Topf-Tabelle', hint: 'Detailwerte je Topf' },
  { id: 'topics', label: 'Themen in Töpfen', hint: 'Themenliste inkl. Kommentaren in der Topf-Ansicht' },
];

// Umsetzungsstand eines Themas. Backlog zählt nicht ins Budget, Geplant/Umgesetzt zählen als verplant
// (bzw. ausgegeben, sobald Ist-Kosten eingetragen sind).
export const STATUSES = [
  { id: 'backlog', label: 'Backlog', hint: 'Noch nicht eingeplant – zählt nicht ins Budget' },
  { id: 'geplant', label: 'Geplant', hint: 'Im Budget eingeplant, Umsetzung steht bevor oder läuft' },
  { id: 'umgesetzt', label: 'Umgesetzt', hint: 'Abgeschlossen' },
];
export const DEFAULT_STATUS = 'geplant';
export const statusLabel = (id) => STATUSES.find((s) => s.id === id)?.label ?? id;

// Freitext (z. B. aus CSV) auf einen Status abbilden; Unbekanntes wird „Geplant“
export function statusId(value) {
  const v = String(value ?? '').trim().toLowerCase();
  if (STATUSES.some((s) => s.id === v)) return v;
  if (/backlog|idee|offen|neu/.test(v)) return 'backlog';
  if (/umgesetzt|erledigt|abgeschlossen|fertig|done|live/.test(v)) return 'umgesetzt';
  return DEFAULT_STATUS;
}

// Felder eines Themas – Reihenfolge = Spalten in CSV-Import/-Export
export const TOPIC_FIELDS = [
  { key: 'thema', label: 'Thema', required: true },
  { key: 'beschreibung', label: 'Beschreibung', long: true },
  { key: 'bedarf', label: 'Bedarf (CAPEX, Euro)', money: true },
  { key: 'benefits', label: 'Benefits', long: true },
  { key: 'anmerkung', label: 'Anmerkung zu Bedarf und Benefits', long: true },
  { key: 'details', label: 'Weitere Details/Infos', long: true },
  { key: 'prio', label: 'Prio' },
  { key: 'status', label: 'Status', options: STATUSES },
  { key: 'apCss', label: 'AP CSS' },
  { key: 'kommentar', label: 'Kommentar', importOnly: true },
  { key: 'jira', label: 'Jira-Link' },
];

export function createSeed() {
  const year = 2026;
  const users = [
    { id: 'u1', login: 'k.albers', name: 'Dr. Katrin Albers', email: 'k.albers@example.org', role: 'admin', unit: 'Bereichsleitung' },
    { id: 'u2', login: 'm.brandt', name: 'Michael Brandt', email: 'm.brandt@example.org', role: 'admin', unit: 'Controlling' },
    { id: 'u3', login: 's.yilmaz', name: 'Sabine Yilmaz', email: 's.yilmaz@example.org', role: 'user', unit: 'Infrastruktur & Betrieb' },
    { id: 'u4', login: 'j.weber', name: 'Jonas Weber', email: 'j.weber@example.org', role: 'user', unit: 'Digitalisierung' },
    { id: 'u5', login: 'l.hoffmann', name: 'Lea Hoffmann', email: 'l.hoffmann@example.org', role: 'user', unit: 'Applikationen' },
    { id: 'u6', login: 't.kranz', name: 'Tobias Kranz', email: 't.kranz@example.org', role: 'user', unit: 'Einkauf' },
    { id: 'u7', login: 'n.petrovic', name: 'Nina Petrović', email: 'n.petrovic@example.org', role: 'user', unit: 'Informationssicherheit' },
  ];

  const pots = [
    ['p1', 'Infrastruktur & Betrieb', 'Rechenzentrum, Netzwerk, Betrieb', '4711-100', 'u3', 620000],
    ['p2', 'Softwarelizenzen', 'Subskriptionen und Wartung', '4711-200', 'u5', 380000],
    ['p3', 'Digitalisierungsprojekte', 'Projektportfolio', '4711-300', 'u4', 540000],
    ['p4', 'Informationssicherheit', 'Audits, Tools, Awareness', '4711-400', 'u7', 260000],
    ['p5', 'Customer Experience', 'Sales- und Omnichannel-Vorhaben', '4711-500', 'u4', 300000],
    ['p6', 'Weiterbildung', 'Schulungen und Zertifizierungen', '4711-600', 'u5', 90000],
    ['p7', 'Hardware-Arbeitsplätze', 'Notebooks, Monitore, Peripherie', '4711-700', 'u3', 150000],
  ].map(([id, name, description, costCenter, ownerId, allocated], i) => ({
    id, name, description, costCenter, ownerId, colorSlot: i, archived: false, createdAt: `${year - 1}-01-02T09:00:00.000Z`,
    // Budget je Kalenderjahr
    budgets: { [year - 1]: Math.round((allocated * 0.9) / 1000) * 1000, [year]: allocated },
  }));

  // [potId, Thema, Beschreibung, Bedarf, Ist (null = noch nicht abgerechnet), Benefits, Prio, AP CSS, Ersteller, Kommentare]
  const T = [
    ['p1', 'Erneuerung Core-Switches', 'Austausch der End-of-Life-Switches im RZ Nord', 185000, 179400, 'Ausfallrisiko sinkt, 10G-Anbindung', '1', 'S. Yilmaz', 'u3',
      [['2026-02-03', 'u3', 'Angebot von zwei Lieferanten liegt vor'], ['2026-06-20', 'u2', 'Ist-Kosten wurden geändert. Alt: – / Neu: 179.400 €']]],
    ['p1', 'Storage-Erweiterung', 'Zusätzliche 200 TB für Backup', 140000, null, 'Backup-Fenster halbiert', '1', 'S. Yilmaz', 'u3', [['2026-03-11', 'u3', 'Kapazitätsplanung abgeschlossen']]],
    ['p1', 'Monitoring-Plattform', 'Konsolidierung von drei Monitoring-Tools', 95000, 88000, 'Weniger Lizenzkosten ab 2027', '2', 'M. Fuchs', 'u3', []],
    ['p1', 'USV-Batterietausch', 'Turnusmäßiger Tausch nach 5 Jahren', 48000, null, 'Pflicht laut Wartungsvertrag', '1', 'S. Yilmaz', 'u3', []],
    ['p1', 'Netzwerk-Segmentierung', 'Mikrosegmentierung Produktionsnetz', 120000, null, 'Reduziert Angriffsfläche', '2', 'P. Lang', 'u3',
      [['2026-09-02', 'u3', 'Abstimmung mit Informationssicherheit läuft']]],
    ['p2', 'Office-Subskription', 'Verlängerung für 1.200 Arbeitsplätze', 210000, 208500, 'Pflicht', '1', 'L. Hoffmann', 'u5', []],
    ['p2', 'Datenbank-Wartung', 'Wartungsvertrag Datenbanken', 72000, 72000, 'Herstellersupport', '1', 'L. Hoffmann', 'u5', []],
    ['p2', 'Entwicklerwerkzeuge', 'IDE- und Testlizenzen', 38000, null, 'Produktivität Entwicklung', '2', 'R. Sommer', 'u5', [['2026-07-14', 'u5', 'Bedarf aus drei Teams gemeldet']]],
    ['p2', 'Ticketsystem Upgrade', 'Wechsel auf Cloud-Edition', 45000, null, 'Kein Eigenbetrieb mehr', '3', 'L. Hoffmann', 'u5', []],
    ['p3', 'Kundenportal Relaunch', 'Neuentwicklung Self-Service-Portal', 260000, 140000, 'Weniger Anrufe im Service-Center', '1', 'J. Weber', 'u4',
      [['2026-01-20', 'u4', 'Thema ist wichtig für Sales'], ['2026-11-10', 'u4', 'Auch Omnichannel hat Bedarf angemeldet']]],
    ['p3', 'Prozessautomatisierung Einkauf', 'Digitaler Bestellfreigabe-Workflow', 120000, null, 'Durchlaufzeit -40 %', '2', 'T. Kranz', 'u4', []],
    ['p3', 'Data-Platform Pilot', 'Pilot für zentrale Datenplattform', 95000, null, 'Grundlage für Reporting', '2', 'J. Weber', 'u4', []],
    ['p4', 'Penetrationstest Portal', 'Externer Pentest vor Go-live', 42000, 42000, 'Compliance', '1', 'N. Petrović', 'u7', []],
    ['p4', 'SIEM-Betrieb', 'Managed SIEM 12 Monate', 130000, 97500, 'Erkennung von Angriffen 24/7', '1', 'N. Petrović', 'u7', []],
    ['p4', 'Awareness-Kampagne', 'Phishing-Simulation und E-Learning', 35000, null, 'Weniger Sicherheitsvorfälle', '2', 'N. Petrović', 'u7', []],
    ['p4', 'ISO-27001-Audit', 'Überwachungsaudit', 28000, null, 'Zertifikat bleibt gültig', '1', 'N. Petrović', 'u7', []],
    ['p5', 'Omnichannel-Kontaktcenter', 'Chat und Messenger im Kontaktcenter', 160000, null, 'Erreichbarkeit über alle Kanäle', '1', 'C. Neumann', 'u4',
      [['2026-04-08', 'u4', 'Thema ist wichtig für Sales']]],
    ['p5', 'CRM-Erweiterung Sales', 'Lead-Scoring-Modul', 85000, 82000, 'Höhere Abschlussquote', '2', 'C. Neumann', 'u4', []],
    ['p6', 'Cloud-Zertifizierungen', '12 Mitarbeitende, Prüfungsgebühren inkl.', 30000, 18000, 'Kompetenzaufbau Cloud', '2', 'L. Hoffmann', 'u5', []],
    ['p6', 'Agile Schulung', 'Teamtrainings für 4 Teams', 22000, null, 'Bessere Planbarkeit', '3', 'L. Hoffmann', 'u5', []],
    ['p7', 'Notebook-Rollout', 'Austausch von 80 Altgeräten', 104000, 104000, 'Sicherheitsupdates, Akkulaufzeit', '1', 'S. Yilmaz', 'u3', []],
    ['p7', 'Monitore & Docking', 'Ergonomie-Ausstattung neue Flächen', 58000, null, 'Arbeitsschutz', '2', 'S. Yilmaz', 'u3', []],
    ['p4', 'Passwortlose Anmeldung', 'FIDO2-Schlüssel für Admin-Konten', 60000, null, 'Phishing-resistente Anmeldung, weniger Passwort-Resets', '2', 'N. Petrović', 'u7', []],
    ['p5', 'KI-gestützte Feedback-Analyse', 'Auswertung von Freitext-Kundenfeedback', 70000, null, 'Schnellere Reaktion auf Beschwerden', '3', 'C. Neumann', 'u4',
      [['2026-10-05', 'u4', 'Idee aus dem Sales-Workshop']]],
  ];
  const SEED_STATUS = {
    umgesetzt: ['Erneuerung Core-Switches', 'Monitoring-Plattform', 'Office-Subskription', 'Datenbank-Wartung', 'Penetrationstest Portal', 'CRM-Erweiterung Sales', 'Notebook-Rollout'],
    backlog: ['Netzwerk-Segmentierung', 'Ticketsystem Upgrade', 'Data-Platform Pilot', 'Agile Schulung', 'Passwortlose Anmeldung', 'KI-gestützte Feedback-Analyse'],
  };

  const topics = T.map(([potId, thema, beschreibung, bedarf, ist, benefits, prio, apCss, createdBy, comments], i) => ({
    id: `t${i + 1}`, potId, year, thema, beschreibung, bedarf, ist, benefits,
    anmerkung: '', details: '', prio, apCss,
    status: Object.keys(SEED_STATUS).find((k) => SEED_STATUS[k].includes(thema)) ?? 'geplant',
    jira: `https://jira.example.org/browse/BUD-${101 + i}`,
    createdBy, createdAt: `${year}-01-${String(10 + (i % 18)).padStart(2, '0')}T08:30:00.000Z`,
    log: comments.map(([d, userId, text], k) => ({ ts: `${d}T10:00:00.000Z`, userId, text, kind: k === 0 && !text.includes('geändert') ? 'comment' : 'update' })),
  }));
  // Vorjahr: abgeschlossene Themen (alle abgerechnet)
  pots.forEach((p, i) => {
    [0.55, 0.4].forEach((share, k) => {
      const bedarf = Math.round((p.budgets[year - 1] * share) / 1000) * 1000;
      topics.push({
        id: `t${year - 1}-${i}-${k}`, potId: p.id, year: year - 1,
        thema: k === 0 ? `${p.name} – Hauptvorhaben ${year - 1}` : `${p.name} – Laufende Kosten ${year - 1}`,
        beschreibung: k === 0 ? 'Abgeschlossenes Vorhaben aus dem Vorjahr' : 'Wiederkehrende Kosten',
        bedarf, ist: Math.round(bedarf * (0.92 + ((i + k) % 3) * 0.04)), benefits: '', anmerkung: '', details: '',
        prio: String(k + 1), status: 'umgesetzt', apCss: '', jira: '', createdBy: p.ownerId, createdAt: `${year - 1}-02-01T08:00:00.000Z`,
        log: [{ ts: `${year - 1}-12-15T10:00:00.000Z`, userId: 'u2', kind: 'update', text: 'Abgerechnet, Ist-Kosten eingetragen' }],
      });
    });
  });

  // Beispiel aus der Anforderung: Änderungseintrag mit Alt/Neu
  topics[9].log.push({ ts: `${year}-11-12T14:05:00.000Z`, userId: 'u2', kind: 'update', text: 'Benefits wurde geändert. Alt: Entlastung Service-Center / Neu: Weniger Anrufe im Service-Center' });

  const access = [
    { potId: 'p1', userId: 'u3', level: 'write' },
    { potId: 'p7', userId: 'u3', level: 'write' },
    { potId: 'p2', userId: 'u3', level: 'read' },
    { potId: 'p3', userId: 'u4', level: 'write' },
    { potId: 'p5', userId: 'u4', level: 'write' },
    { potId: 'p2', userId: 'u5', level: 'write' },
    { potId: 'p6', userId: 'u5', level: 'write' },
    { potId: 'p4', userId: 'u7', level: 'write' },
    ...['p1', 'p2', 'p3', 'p5', 'p6', 'p7'].map((potId) => ({ potId, userId: 'u6', level: 'read' })),
  ];

  const widgetVisibility = {};
  for (const u of users.filter((x) => x.role === 'user')) {
    widgetVisibility[u.id] = { baseline: false, kpis: true, potBars: true, potTable: true, topics: true };
  }
  widgetVisibility.u6 = { baseline: true, kpis: true, potBars: true, potTable: true, topics: false };

  return {
    schemaVersion: SCHEMA_VERSION,
    settings: { orgName: 'Bereich IT (Demo)' },
    years: [{ year: year - 1, baseline: 2200000 }, { year, baseline: 2400000 }],
    users,
    pots,
    access,
    widgetVisibility,
    topics,
    audit: [{ id: 'a1', ts: `${year}-01-02T09:00:00.000Z`, userId: 'u1', action: 'Initialisierung', detail: 'Demo-Datenbestand angelegt' }],
  };
}
