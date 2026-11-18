// CSV-Import/-Export für Themen. Akzeptiert Semikolon-, Komma- und Tab-getrennte Dateien
// (Excel-Export mit UTF-8 oder Windows-1252) und erkennt die Spalten über die Überschriften.
import { TOPIC_FIELDS, statusId } from './data/seed.js';

export async function readFileText(file) {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

export function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delim = ['\t', ';', ','].map((d) => [d, firstLine.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9äöüß]/g, '');

// Reihenfolge wichtig: "Kommentar Jira-Link" soll als Jira-Link erkannt werden
const MATCHERS = [
  ['jira', (h) => h.includes('jira')],
  ['bedarf', (h) => h.startsWith('bedarf') || h.includes('capex')],
  ['anmerkung', (h) => h.startsWith('anmerkung')],
  ['details', (h) => h.startsWith('weiteredetails') || h.startsWith('details')],
  ['apCss', (h) => h.startsWith('apcss') || h === 'ap'],
  ['prio', (h) => h.startsWith('prio')],
  ['status', (h) => h.startsWith('status') || h === 'stand' || h.startsWith('umsetzung')],
  ['benefits', (h) => h.startsWith('benefit')],
  ['beschreibung', (h) => h.startsWith('beschreibung')],
  ['kommentar', (h) => h.startsWith('kommentar')],
  ['thema', (h) => h === 'thema' || h.startsWith('thema') || h === 'titel'],
];

export function mapColumns(header) {
  const map = {};
  header.forEach((raw, idx) => {
    const h = norm(raw);
    const hit = MATCHERS.find(([key, test]) => !(key in map) && test(h));
    if (hit) map[hit[0]] = idx;
  });
  return map;
}

export function parseMoney(s) {
  let v = String(s ?? '').replace(/[^\d,.-]/g, '');
  if (!v) return 0;
  if (v.includes(',') && v.includes('.')) v = v.replace(/\./g, '').replace(',', '.');
  else if (v.includes(',')) v = v.replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, '');
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : NaN;
}

// Ergebnis: { rows, columns, warnings }
export function topicsFromCsv(text) {
  const table = parseCsv(text);
  if (table.length < 2) return { rows: [], columns: {}, warnings: ['Die Datei enthält keine Datenzeilen.'] };
  const columns = mapColumns(table[0]);
  const warnings = [];
  if (!('thema' in columns)) return { rows: [], columns, warnings: ['Spalte „Thema“ wurde nicht gefunden.'] };
  const rows = [];
  table.slice(1).forEach((r, i) => {
    const rec = {};
    for (const f of TOPIC_FIELDS) {
      if (!(f.key in columns)) continue;
      const v = (r[columns[f.key]] ?? '').trim();
      rec[f.key] = f.money ? parseMoney(v) : f.options ? statusId(v) : v;
    }
    if (!rec.thema) { warnings.push(`Zeile ${i + 2}: kein Thema – übersprungen`); return; }
    if (Number.isNaN(rec.bedarf)) { warnings.push(`Zeile ${i + 2}: Bedarf nicht lesbar – als 0 übernommen`); rec.bedarf = 0; }
    rows.push(rec);
  });
  return { rows, columns, warnings };
}

const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export function toCsv(header, rows) {
  return `﻿${[header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n')}`;
}
