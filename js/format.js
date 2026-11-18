import { CONFIG } from './config.js';

const eurFmt = new Intl.NumberFormat(CONFIG.locale, { style: 'currency', currency: CONFIG.currency, maximumFractionDigits: 0 });
const eurCompact = new Intl.NumberFormat(CONFIG.locale, { style: 'currency', currency: CONFIG.currency, notation: 'compact', maximumFractionDigits: 2 });
const pctFmt = new Intl.NumberFormat(CONFIG.locale, { style: 'percent', maximumFractionDigits: 0 });
const dateFmt = new Intl.DateTimeFormat(CONFIG.locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
const tsFmt = new Intl.DateTimeFormat(CONFIG.locale, { dateStyle: 'short', timeStyle: 'short' });

export const eur = (v) => eurFmt.format(v || 0);
export const eurC = (v) => eurCompact.format(v || 0);
export const pct = (v) => (Number.isFinite(v) ? pctFmt.format(v) : '–');
export const date = (iso) => dateFmt.format(new Date(`${iso}T12:00:00`));
export const ts = (iso) => tsFmt.format(new Date(iso));

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

// Tooltip-Daten als Attribut (wird vom globalen Hover-Handler gelesen)
export const tip = (title, rows) => `data-tip="${esc(JSON.stringify({ title, rows }))}"`;
