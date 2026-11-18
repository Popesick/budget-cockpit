// Diagramme ohne externe Bibliotheken (keine CDN-Abhängigkeit – wichtig für internes Hosting).
import { esc, eur, eurC, pct, tip } from './format.js';

const SLOTS = 8;
export const slotColor = (slot) => (slot < SLOTS ? `var(--s${slot + 1})` : 'var(--muted)');

// Gestapelter Balken: Aufteilung der Baseline auf die Töpfe
export function stackBar(segments, baseline) {
  const allocated = segments.reduce((a, s) => a + s.value, 0);
  const rest = baseline - allocated;
  const total = Math.max(baseline, allocated) || 1;
  const parts = segments
    .filter((s) => s.value > 0)
    .map((s) => `<div style="flex:0 0 calc(${(s.value / total) * 100}% - 2px);background:${slotColor(s.slot)}"
      ${tip(s.name, [['Zugeteilt', eur(s.value)], ['Anteil Baseline', pct(s.value / (baseline || 1))]])}></div>`);
  if (rest > 0) {
    parts.push(`<div class="rest" style="flex:1 1 0"
      ${tip('Nicht verteilt (Reserve)', [['Betrag', eur(rest)], ['Anteil Baseline', pct(rest / (baseline || 1))]])}></div>`);
  }
  const legend = segments
    .map((s) => `<div><span class="swatch" style="background:${slotColor(s.slot)}"></span><span class="name">${esc(s.name)}</span><span class="val">${eur(s.value)}</span></div>`)
    .join('');
  const restLegend = `<div><span class="swatch" style="background:repeating-linear-gradient(135deg,var(--axis) 0 2px,transparent 2px 4px);border:1px solid var(--axis)"></span><span class="name">${rest >= 0 ? 'Nicht verteilt' : 'Überverteilt'}</span><span class="val" style="${rest < 0 ? 'color:var(--critical-ink)' : ''}">${eur(rest)}</span></div>`;
  return `<div class="stack" role="img" aria-label="Aufteilung der Baseline: ${segments.length} Töpfe, ${eur(rest)} nicht verteilt">${parts.join('')}</div>
    <div class="stack-legend">${legend}${restLegend}</div>`;
}

// Budgetbalken eines Topfs: ausgegeben (rot) · verplant (gelb) · frei (grün)
export function budgetBar(m, { legend = true, height = 'lg' } = {}) {
  const used = m.planned + m.spent;
  const total = Math.max(m.allocated, used) || 1;
  const over = used > m.allocated;
  const seg = (cls, value, label) => (value > 0
    ? `<div class="${cls}" style="flex:0 0 calc(${(value / total) * 100}% - 2px)" ${tip(m.name, [[label, eur(value)], ['Anteil Budget', pct(value / (m.allocated || 1))]])}></div>`
    : '');
  const bar = `<div class="bbar ${height}${over ? ' over' : ''}" role="img"
      aria-label="${esc(m.name)}: Budget ${eur(m.allocated)}, ausgegeben ${eur(m.spent)}, verplant ${eur(m.planned)}, frei ${eur(m.free)}">
    ${seg('spent', m.spent, 'Ausgegeben')}${seg('planned', m.planned, 'Verplant')}${seg('free', Math.max(m.free, 0), 'Frei')}
    ${over ? `<div class="limit" style="left:${(m.allocated / total) * 100}%" title="Budgetgrenze"></div>` : ''}
  </div>`;
  if (!legend) return bar;
  return `${bar}<div class="legend bbar-legend">
    <span><span class="swatch" style="background:var(--spent)"></span>Ausgegeben <strong>${eur(m.spent)}</strong></span>
    <span><span class="swatch" style="background:var(--planned)"></span>Verplant <strong>${eur(m.planned)}</strong></span>
    <span>${over ? '⚠ Überplant' : '<span class="swatch" style="background:var(--free)"></span>Frei'} <strong${over ? ' style="color:var(--critical-ink)"' : ''}>${eur(m.free)}</strong></span>
  </div>`;
}

export function budgetBarRows(list) {
  return `<div class="bars">${list.map((m) => `<div class="bar-row">
    <a class="name" href="#/topf/${m.id}" title="${esc(m.name)}">${esc(m.name)}</a>
    ${budgetBar(m, { legend: false, height: 'sm' })}
    <div class="pct ${m.free < 0 ? 'bad' : ''}">${m.free < 0 ? '⚠ ' : ''}${eurC(m.free)}</div>
  </div>`).join('')}</div>`;
}

export function showTip(el, title, rows, cx, cy) {
  el.innerHTML = `<div class="t">${esc(title)}</div>${rows.map(([k, v]) => `<div class="r"><span class="muted">${esc(k)}</span><span>${esc(v)}</span></div>`).join('')}`;
  el.hidden = false;
  const { width, height } = el.getBoundingClientRect();
  let left = cx + 14;
  let top = cy + 14;
  if (left + width > window.innerWidth - 8) left = cx - width - 14;
  if (top + height > window.innerHeight - 8) top = cy - height - 14;
  el.style.left = `${Math.max(8, left)}px`;
  el.style.top = `${Math.max(8, top)}px`;
}
