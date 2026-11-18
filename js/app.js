import { CONFIG } from './config.js';
import { Store } from './store.js';
import { auth } from './auth.js';
import { WIDGETS, TOPIC_FIELDS, STATUSES, statusLabel } from './data/seed.js';
import { isAdmin, visiblePots, canEditTopics, canComment, canSeeWidget, accessLevel } from './permissions.js';
import { potMetrics, sumMetrics } from './metrics.js';
import { stackBar, budgetBar, budgetBarRows, slotColor, showTip } from './charts.js';
import { readFileText, topicsFromCsv, toCsv } from './csv.js';
import { eur, eurC, pct, ts, esc } from './format.js';
import { clock } from './clock.js';

const store = new Store();
const app = document.getElementById('app');
const ui = {
  year: null, // ausgewähltes Kalenderjahr
  previewUserId: null, // Admin-Vorschau: Dashboard aus Sicht eines Nutzers
  rightsTab: 'pots',
  allocDraft: null,
  openTopics: new Set(),
  topicQuery: '',
  reportPot: '', // Reporting: Filter auf einen Topf
};

const LEVEL_LABEL = { read: 'Lesen', write: 'Bearbeiten', admin: 'Admin' };

// ---------- Hilfen ----------
const me = () => store.user(auth.currentUserId());

function toast(msg, bad = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast${bad ? ' bad' : ''}`;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.hidden = true; }, 3000);
}

async function run(fn, okMsg) {
  try {
    await fn();
    if (okMsg) toast(okMsg);
  } catch (e) {
    toast(e.message, true);
  }
}

function statusOf(m) {
  if (m.free < 0) return '<span class="status crit"><span class="dot"></span>Überplant</span>';
  if (m.util >= 0.9) return '<span class="status warn"><span class="dot"></span>Knapp</span>';
  return '<span class="status ok"><span class="dot"></span>Im Rahmen</span>';
}

const shortDate = (iso) => new Date(iso).toLocaleDateString(CONFIG.locale, { day: '2-digit', month: '2-digit', year: '2-digit' });
const loginOf = (id) => store.user(id)?.login ?? id;
const safeUrl = (u) => (/^https?:\/\//i.test(u) ? u : '');
const statusTag = (id) => `<span class="tag-status ${esc(id)}">${esc(statusLabel(id))}</span>`;
const fieldText = (f, v) => (f.money ? eur(v) : f.options ? statusLabel(v) : v || '–');

const YEAR_KEY = 'budget-cockpit.year';

function updateBanner() {
  const sim = clock.simulated();
  document.querySelector('.poc-banner').textContent = `POC mit Fakedaten · Login simuliert · keine echten Daten eingeben${sim ? ` · Simuliertes Datum: ${clock.now().toLocaleDateString(CONFIG.locale, { day: '2-digit', month: '2-digit', year: 'numeric' })}` : ''}`;
}

function pickYear(preferred) {
  const years = store.state.years.map((y) => y.year);
  const now = clock.now().getFullYear();
  ui.year = [preferred, ui.year, now].find((y) => years.includes(y)) ?? years[years.length - 1];
  try { sessionStorage.setItem(YEAR_KEY, String(ui.year)); } catch { /* nur im Speicher */ }
}

const routes = {
  dashboard: { label: 'Dashboard', nav: true, show: () => true, render: renderDashboard },
  toepfe: { label: 'Budgettöpfe', nav: true, show: () => true, render: renderPots },
  reporting: { label: 'Reporting', nav: true, show: isAdmin, render: renderReporting },
  topf: { label: 'Topf', nav: false, show: () => true, render: renderPot },
  verteilung: { label: 'Verteilung', nav: true, show: isAdmin, render: renderAllocation },
  rechte: { label: 'Berechtigungen', nav: true, show: isAdmin, render: renderRights },
  nutzer: { label: 'Nutzer', nav: true, show: isAdmin, render: renderUsers },
  protokoll: { label: 'Protokoll', nav: true, show: isAdmin, render: renderAudit },
};

function currentRoute() {
  const [r, param] = location.hash.replace(/^#\/?/, '').split('/');
  return routes[r] ? { id: r, param } : { id: 'dashboard' };
}

// ---------- Rahmen ----------
function render() {
  const user = me();
  if (!user) { renderLogin(); return; }
  const state = store.state;
  if (!store.yearEntry(ui.year)) pickYear();
  let route = currentRoute();
  if (!routes[route.id].show(user, state)) route = { id: 'dashboard' };
  const active = route.id === 'topf' ? 'toepfe' : route.id;

  const nav = Object.entries(routes)
    .filter(([, r]) => r.nav && r.show(user, state))
    .map(([id, r]) => `<a href="#/${id}" ${id === active ? 'aria-current="page"' : ''}>${r.label}</a>`).join('');

  app.innerHTML = `
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 16 16"><rect x="1" y="8" width="3" height="7" rx="1" fill="#fff"/><rect x="6.5" y="4" width="3" height="11" rx="1" fill="#fff"/><rect x="12" y="1" width="3" height="14" rx="1" fill="#fff"/></svg></div>
        <div>${CONFIG.appName}<small>${esc(state.settings.orgName)}</small></div>
      </div>
      <label class="year-pick">Kalenderjahr
        <select data-action="year">${state.years.map((y) => `<option value="${y.year}" ${y.year === ui.year ? 'selected' : ''}>${y.year}</option>`).join('')}</select>
      </label>
      <nav class="nav" aria-label="Hauptnavigation">${nav}</nav>
      <div class="userbox">
        <div class="who">${esc(user.name)}<small>${isAdmin(user) ? 'Admin' : 'Nutzer'} · ${esc(user.login)}</small></div>
        <button class="btn icon" data-action="theme" title="Hell/Dunkel umschalten" aria-label="Hell/Dunkel umschalten"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 1.5a6.5 6.5 0 0 1 0 13z" fill="currentColor"/></svg></button>
        <button class="btn small" data-action="logout">Abmelden</button>
      </div>
    </header>
    <main id="main"></main>`;
  routes[route.id].render(document.getElementById('main'), user, state, route.param);
}

function renderLogin() {
  const users = store.state.users;
  const card = (u) => `<button class="card login-card" data-action="login" data-id="${u.id}">
      <span class="n">${esc(u.name)}</span><span class="u">${esc(u.unit)} · ${esc(u.login)}</span>
      <span>${isAdmin(u) ? '<span class="badge admin">Admin</span>' : '<span class="badge">Nutzer</span>'}</span>
    </button>`;
  app.innerHTML = `<div class="login">
    <div class="intro">
      <h1>${CONFIG.appName}</h1>
      <p>Anmeldung simuliert – wählen Sie eine Demo-Person. Im Zielsystem erfolgt die Anmeldung per Single Sign-on (z. B. Microsoft Entra ID), die Rolle kommt aus dem Unternehmensverzeichnis.</p>
    </div>
    <div class="card sim-date">
      <label class="field">Simuliertes Datum (nur POC)
        <input type="date" data-simdate value="${clock.simulated() ?? ''}" min="2000-01-01" max="2100-12-31"></label>
      <div class="ink-2">Heute für die App: <strong>${clock.now().toLocaleDateString(CONFIG.locale, { day: '2-digit', month: '2-digit', year: 'numeric' })}</strong>${clock.simulated() ? ' (simuliert)' : ''}<br>
        <small class="muted">Bestimmt das voreingestellte Kalenderjahr und die Zeitstempel neuer Einträge.</small></div>
      ${clock.simulated() ? '<button class="btn small" data-action="simdate-clear">Auf echtes Datum zurücksetzen</button>' : ''}
    </div>
    <h2>Admins</h2><div class="login-grid">${users.filter(isAdmin).map(card).join('')}</div>
    <h2>Nutzer</h2><div class="login-grid">${users.filter((u) => !isAdmin(u)).map(card).join('')}</div>
    <p class="note">Alle Personen, Beträge, Themen und Kostenstellen sind frei erfunden. Änderungen werden nur in diesem Browser gespeichert.
      <button class="btn small" data-action="reset">Demo-Daten zurücksetzen</button></p>
  </div>`;
}

// ---------- Dashboard ----------
function renderDashboard(el, user, state) {
  const viewer = (isAdmin(user) && ui.previewUserId && store.user(ui.previewUserId)) || user;
  const year = ui.year;
  const pots = visiblePots(state, viewer).map((p) => potMetrics(state, p, year));
  const can = (w) => canSeeWidget(state, viewer, w);
  const total = sumMetrics(pots);
  const allPots = state.pots.filter((p) => !p.archived);
  const totalAllocated = allPots.reduce((a, p) => a + (p.budgets[year] ?? 0), 0);
  const baseline = store.yearEntry(year).baseline;
  const overCount = pots.filter((p) => p.free < 0).length;
  const isPreview = viewer !== user;

  const preview = isAdmin(user) ? `<label class="field" style="min-width:240px">Ansicht als
      <select data-action="preview">
        <option value="">Mich selbst (Admin – alles)</option>
        ${state.users.filter((u) => !isAdmin(u)).map((u) => `<option value="${u.id}" ${u.id === ui.previewUserId ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}
      </select></label>` : '';

  const blocks = [];
  const todayYear = clock.now().getFullYear();
  if (!store.yearEntry(todayYear)) {
    blocks.push(`<div class="card span-12" style="border-color:var(--warning)">⚠ Für das aktuelle Kalenderjahr ${todayYear} ist noch kein Budget angelegt. Angezeigt wird ${year}.
      ${isAdmin(user) ? '<button class="btn small primary" data-action="new-year" style="margin-left:8px">Jahr anlegen</button>' : 'Bitte wenden Sie sich an einen Admin.'}</div>`);
  } else if (year !== todayYear) {
    blocks.push(`<div class="card span-12">Sie sehen das Kalenderjahr <strong>${year}</strong> (aktuell: ${todayYear}).</div>`);
  }
  if (!total.allocated && store.yearEntry(year) && pots.length) {
    blocks.push(`<div class="card span-12 empty">Für ${year} sind noch keine Budgets auf Töpfe verteilt.${isAdmin(user) ? ' <a href="#/verteilung">Jetzt verteilen →</a>' : ''}</div>`);
  }
  if (isPreview) {
    blocks.push(`<div class="card span-12" style="border-color:var(--accent)">Vorschau: So sieht <strong>${esc(viewer.name)}</strong> das Dashboard – ${pots.length} von ${allPots.length} Töpfen, ${WIDGETS.filter((w) => can(w.id)).length} von ${WIDGETS.length} Bereichen freigegeben.</div>`);
  }
  if (!pots.length && !can('baseline')) {
    blocks.push('<div class="card span-12 empty">Für Sie sind noch keine Budgettöpfe freigegeben. Bitte wenden Sie sich an einen Admin.</div>');
  }

  if (can('baseline')) {
    blocks.push(`<section class="card span-12">
      <div class="card-head"><div><h2>Baseline-Budget ${year}: ${eur(baseline)}</h2><p>Verteilt auf Töpfe ${eur(totalAllocated)} (${pct(totalAllocated / (baseline || 1))}) · nicht verteilt ${eur(baseline - totalAllocated)}</p></div>${isAdmin(viewer) ? '<a href="#/verteilung">Verteilung ändern →</a>' : ''}</div>
      ${stackBar(allPots.map((p) => ({ name: p.name, value: p.budgets[year] ?? 0, slot: p.colorSlot })), baseline)}
    </section>`);
  }

  if (can('kpis') && pots.length) {
    const tiles = [
      ['total', `Budget ${year} insgesamt`, eurC(total.allocated), `${pots.length} ${pots.length === 1 ? 'Topf' : 'Töpfe'}`],
      ['planned', 'Davon verplant', eurC(total.planned), `${pct(total.planned / (total.allocated || 1))} – Themen ohne Ist-Kosten`],
      ['spent', 'Davon ausgegeben', eurC(total.spent), `${pct(total.spent / (total.allocated || 1))} – abgerechnete Themen`],
      ['free', 'Übriges Budget', eurC(total.free), overCount ? `⚠ ${overCount} ${overCount === 1 ? 'Topf' : 'Töpfe'} überplant` : 'kein Topf überplant', overCount > 0],
    ];
    blocks.push(`<div class="span-12 kpis">${tiles.map(([cls, l, v, s, bad]) => `<div class="card kpi accent-${cls}"><div class="label">${l}</div><div class="value">${v}</div><div class="sub ${bad ? 'bad' : ''}">${esc(s)}</div></div>`).join('')}</div>`);
  }

  if (can('potBars') && pots.length) {
    blocks.push(`<section class="card span-12">
      <div class="card-head"><div><h2>Budget je Topf</h2><p>Rechts: übriges Budget. Topfname anklicken für Details und Themen.</p></div>
        <div class="legend"><span><span class="swatch" style="background:var(--spent)"></span>Ausgegeben</span><span><span class="swatch" style="background:var(--planned)"></span>Verplant</span><span><span class="swatch" style="background:var(--free)"></span>Frei</span></div></div>
      ${budgetBarRows([...pots].sort((a, b) => b.allocated - a.allocated))}
    </section>`);
  }

  if (can('potTable') && pots.length) {
    const showRight = !isPreview && !isAdmin(user);
    const rows = pots.map((p) => `<tr>
      <td><a href="#/topf/${p.id}"><span class="swatch" style="background:${slotColor(p.colorSlot)}"></span>${esc(p.name)}</a><div class="muted" style="font-size:12px;margin-left:18px">KST ${esc(p.costCenter)} · ${esc(store.user(p.ownerId)?.name ?? '–')}</div></td>
      <td class="num">${eur(p.allocated)}</td><td class="num">${eur(p.planned)}</td><td class="num">${eur(p.spent)}</td>
      <td class="num" style="${p.free < 0 ? 'color:var(--critical-ink)' : ''}">${eur(p.free)}</td>
      <td class="num">${p.topicCount}</td><td>${statusOf(p)}</td>
      ${showRight ? `<td><span class="badge">${LEVEL_LABEL[accessLevel(state, user, p.id)]}</span></td>` : ''}
    </tr>`).join('');
    blocks.push(`<section class="card span-12">
      <div class="card-head"><div><h2>Budgettöpfe im Detail</h2></div><button class="btn small" data-action="csv-pots">CSV exportieren</button></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Topf</th><th class="num">Budget</th><th class="num">Verplant</th><th class="num">Ausgegeben</th><th class="num">Übrig</th><th class="num">Themen</th><th>Status</th>${showRight ? '<th>Ihr Recht</th>' : ''}</tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td>Summe</td><td class="num">${eur(total.allocated)}</td><td class="num">${eur(total.planned)}</td><td class="num">${eur(total.spent)}</td><td class="num">${eur(total.free)}</td><td class="num">${pots.reduce((a, p) => a + p.topicCount, 0)}</td><td></td>${showRight ? '<td></td>' : ''}</tr></tfoot>
      </table></div>
    </section>`);
  }

  el.innerHTML = `<div class="page-head"><div><h1>Dashboard</h1><p>${isPreview ? '' : `Willkommen, ${esc(user.name)}. `}Kalenderjahr ${year}</p></div>${preview}</div>
    <div class="grid">${blocks.join('')}</div>`;
}

// ---------- Budgettöpfe (Liste) ----------
function renderPots(el, user, state) {
  const admin = isAdmin(user);
  const list = admin ? state.pots : visiblePots(state, user);
  const rows = list.map((p) => {
    const m = potMetrics(state, p, ui.year);
    const readers = state.access.filter((a) => a.potId === p.id);
    return `<tr style="${p.archived ? 'opacity:.55' : ''}">
      <td><a href="#/topf/${p.id}"><span class="swatch" style="background:${slotColor(p.colorSlot)}"></span><strong>${esc(p.name)}</strong></a>${p.archived ? ' <span class="badge">archiviert</span>' : ''}<div class="muted" style="font-size:12px;margin-left:18px">${esc(p.description)} · KST ${esc(p.costCenter)} · ${esc(store.user(p.ownerId)?.name ?? '–')}</div></td>
      <td class="num">${eur(m.allocated)}</td>
      <td style="min-width:160px">${budgetBar(m, { legend: false, height: 'sm' })}</td>
      <td class="num" style="${m.free < 0 ? 'color:var(--critical-ink)' : ''}">${eur(m.free)}</td>
      <td class="num">${m.topicCount}</td>
      ${admin ? `<td><a href="#/rechte" data-action="rights-tab" data-tab="pots">${readers.filter((a) => a.level === 'write').length} bearb. · ${readers.filter((a) => a.level === 'read').length} lesen</a></td>
      <td><div class="row" style="flex-wrap:nowrap">
        <button class="btn small" data-action="edit-pot" data-id="${p.id}">Bearbeiten</button>
        <button class="btn small" data-action="archive-pot" data-id="${p.id}" data-archived="${p.archived ? '0' : '1'}">${p.archived ? 'Reaktivieren' : 'Archivieren'}</button>
      </div></td>` : `<td><span class="badge">${LEVEL_LABEL[accessLevel(state, user, p.id)]}</span></td>`}
    </tr>`;
  }).join('');
  el.innerHTML = `<div class="page-head"><div><h1>Budgettöpfe</h1><p>${admin ? 'Töpfe anlegen, pflegen und archivieren. Budgets werden unter „Verteilung“ zugeteilt.' : 'Ihre freigegebenen Töpfe. Anklicken für Budget und Themen.'}</p></div>
    ${admin ? '<button class="btn primary" data-action="new-pot">+ Neuer Topf</button>' : ''}</div>
    <section class="card">${list.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Topf</th><th class="num">Budget ${ui.year}</th><th>Ausgegeben · Verplant · Frei</th><th class="num">Übrig</th><th class="num">Themen</th>${admin ? '<th>Zugriff</th><th></th>' : '<th>Ihr Recht</th>'}</tr></thead>
      <tbody>${rows}</tbody></table></div>` : '<div class="empty">Keine Töpfe freigegeben.</div>'}</section>`;
}

function potDialog(pot) {
  const state = store.state;
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `<form method="dialog" class="form">
    <h2>${pot ? 'Topf bearbeiten' : 'Neuer Budgettopf'}</h2>
    <label class="field">Name<input type="text" name="name" required maxlength="60" value="${esc(pot?.name ?? '')}"></label>
    <label class="field">Beschreibung<input type="text" name="description" maxlength="120" value="${esc(pot?.description ?? '')}"></label>
    <div class="form-grid">
      <label class="field">Kostenstelle<input type="text" name="costCenter" maxlength="20" value="${esc(pot?.costCenter ?? '')}"></label>
      <label class="field">Verantwortlich<select name="ownerId"><option value="">–</option>${state.users.map((u) => `<option value="${u.id}" ${u.id === pot?.ownerId ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></label>
    </div>
    ${pot ? '' : '<p class="muted" style="margin:0">Die verantwortliche Person erhält automatisch Bearbeitungsrecht. Weitere Rechte unter „Berechtigungen“.</p>'}
    <p class="error" hidden></p>
    <div class="actions"><button class="btn" value="cancel" formnovalidate>Abbrechen</button><button class="btn primary" value="ok">${pot ? 'Speichern' : 'Anlegen'}</button></div>
  </form>`;
  openDialog(dlg, async (data) => {
    if (pot) await store.updatePot(me(), pot.id, data);
    else await store.createPot(me(), data);
    toast(pot ? 'Topf gespeichert' : 'Topf angelegt – jetzt Budget zuteilen');
  });
}

function openDialog(dlg, onOk) {
  document.body.append(dlg);
  const form = dlg.querySelector('form');
  form.addEventListener('submit', async (ev) => {
    if (ev.submitter?.value !== 'ok') return;
    ev.preventDefault();
    try {
      await onOk(Object.fromEntries(new FormData(form)), form);
      dlg.close();
    } catch (e) {
      const err = form.querySelector('.error');
      err.textContent = e.message;
      err.hidden = false;
    }
  });
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
  return dlg;
}

// ---------- Topf-Detail mit Themen ----------
function renderPot(el, user, state, potId) {
  const pot = store.pot(potId);
  if (!pot || (!isAdmin(user) && !accessLevel(state, user, pot.id))) {
    el.innerHTML = '<div class="card empty">Dieser Topf existiert nicht oder ist für Sie nicht freigegeben. <a href="#/toepfe">Zur Übersicht</a></div>';
    return;
  }
  const year = ui.year;
  const m = potMetrics(state, pot, year);
  const level = accessLevel(state, user, pot.id);
  const editable = canEditTopics(state, user, pot.id);
  const showTopics = canSeeWidget(state, user, 'topics');

  const lines = [
    ['total', `Budget für Kalenderjahr ${year} insgesamt`, m.allocated],
    ['planned', 'Davon verplant', m.planned],
    ['spent', 'Davon ausgegeben', m.spent],
    ['free', 'Übriges Budget', m.free],
  ];

  let topicsHtml = '<p class="muted span-12">Die Themenliste ist für Sie nicht freigegeben.</p>';
  if (showTopics) {
    const q = ui.topicQuery.trim().toLowerCase();
    const topics = state.topics
      .filter((t) => t.potId === pot.id && t.year === year)
      .filter((t) => !q || TOPIC_FIELDS.some((f) => String(t[f.key] ?? '').toLowerCase().includes(q)))
      .sort((a, b) => (a.prio || '9').localeCompare(b.prio || '9') || a.thema.localeCompare(b.thema));
    const rows = topics.map((t) => topicRows(t, user, state, editable)).join('');
    topicsHtml = `<section class="card span-12">
      <div class="card-head">
        <div><h2>Geplante Themen ${year}</h2><p>${topics.length} ${topics.length === 1 ? 'Thema' : 'Themen'} · Bedarf gesamt ${eur(topics.reduce((a, t) => a + t.bedarf, 0))}</p></div>
        <div class="row">
          <input type="text" data-topic-search placeholder="Themen durchsuchen" value="${esc(ui.topicQuery)}" aria-label="Themen durchsuchen" style="width:200px">
          ${editable ? `<button class="btn primary small" data-action="new-topic" data-id="${pot.id}">+ Neues Thema</button>
          <button class="btn small" data-action="import-topics" data-id="${pot.id}">CSV importieren</button>` : ''}
          <button class="btn small" data-action="export-topics" data-id="${pot.id}">CSV exportieren</button>
        </div>
      </div>
      ${topics.length ? `<div class="table-wrap"><table class="topic-table">
        <thead><tr><th>Thema</th><th>Prio</th><th class="num">Bedarf (CAPEX)</th><th>Stand</th><th>AP CSS</th><th>Jira</th><th>Letzter Kommentar</th></tr></thead>
        <tbody>${rows}</tbody></table></div>` : `<div class="empty">${q ? 'Keine Treffer.' : 'Noch keine Themen erfasst.'}${editable && !q ? ' Legen Sie ein Thema an oder importieren Sie eine CSV-Datei.' : ''}</div>`}
    </section>`;
  }

  el.innerHTML = `<div class="page-head"><div>
      <p style="margin:0 0 4px"><a href="#/toepfe">← Budgettöpfe</a></p>
      <h1><span class="swatch" style="background:${slotColor(pot.colorSlot)};width:14px;height:14px"></span>${esc(pot.name)}</h1>
      <p>${esc(pot.description)} · KST ${esc(pot.costCenter)} · Verantwortlich: ${esc(store.user(pot.ownerId)?.name ?? '–')}</p></div>
      <span class="badge ${level === 'admin' ? 'admin' : ''}">Ihr Recht: ${LEVEL_LABEL[level]}</span></div>
    <div class="grid">
      <section class="card span-12">
        <div class="kpis" style="margin-bottom:20px">${lines.map(([cls, label, v]) => `<div class="kpi accent-${cls}" style="padding:12px 0 0"><div class="label">${label}</div><div class="value" style="${cls === 'free' && v < 0 ? 'color:var(--critical-ink)' : ''}">${eur(v)}</div><div class="sub">${cls === 'total' ? '' : `${pct(v / (m.allocated || 1))} des Budgets`}</div></div>`).join('')}</div>
        ${budgetBar(m)}
        ${m.free < 0 ? `<p class="error" style="margin-bottom:0">⚠ Die Themen übersteigen das Budget um ${eur(-m.free)}.</p>` : ''}
        ${m.backlogCount ? `<p class="muted" style="margin-bottom:0">Zusätzlich im Backlog (noch nicht eingeplant, zählt nicht ins Budget): ${m.backlogCount} ${m.backlogCount === 1 ? 'Thema' : 'Themen'} · ${eur(m.backlog)}</p>` : ''}
      </section>
      ${topicsHtml}
    </div>`;
}

function logLine(e, index) {
  const prefix = e.kind === 'comment' && index === 0 ? `${shortDate(e.ts)} durch ${loginOf(e.userId)}` : `Update ${shortDate(e.ts)} durch ${loginOf(e.userId)}`;
  return `<li title="${esc(ts(e.ts))}"><span class="meta">[${esc(prefix)}]:</span> ${esc(e.text)}</li>`;
}

function topicRows(t, user, state, editable) {
  const open = ui.openTopics.has(t.id);
  const last = t.log[t.log.length - 1];
  const jira = safeUrl(t.jira);
  const jiraKey = jira ? jira.split('/').pop() : '';
  const detail = open ? `<tr class="topic-detail"><td colspan="7">
    <dl class="topic-fields">
      ${TOPIC_FIELDS.filter((f) => !f.importOnly).map((f) => `<div><dt>${esc(f.label)}</dt><dd>${f.key === 'jira' && jira ? `<a href="${esc(jira)}" target="_blank" rel="noopener noreferrer">${esc(t.jira)}</a>` : esc(fieldText(f, t[f.key]))}</dd></div>`).join('')}
      <div><dt>Ist-Kosten (von Kostenstelle abgezogen)</dt><dd>${t.ist == null ? '– noch nicht abgerechnet' : eur(t.ist)}</dd></div>
      <div><dt>Angelegt</dt><dd>${esc(shortDate(t.createdAt))} durch ${esc(loginOf(t.createdBy))}</dd></div>
    </dl>
    <h3 style="margin-bottom:8px">Kommentare & Änderungen</h3>
    ${t.log.length ? `<ul class="log">${t.log.map(logLine).join('')}</ul>` : '<p class="muted">Noch keine Einträge.</p>'}
    ${canComment(state, user, t.potId) ? `<form class="comment-form" data-form="comment" data-id="${t.id}">
      <input type="text" name="text" maxlength="500" placeholder="Neuen Kommentar hinzufügen" required aria-label="Kommentar zu ${esc(t.thema)}">
      <button class="btn" type="submit">Hinzufügen</button></form>` : ''}
    <div class="row" style="margin-top:12px">
      ${editable ? `<button class="btn small" data-action="edit-topic" data-id="${t.id}">Thema bearbeiten</button>` : ''}
      ${isAdmin(user) ? `<button class="btn small danger" data-action="delete-topic" data-id="${t.id}">Thema löschen</button>` : ''}
    </div>
  </td></tr>` : '';
  return `<tr class="${open ? 'open' : ''}">
    <td><button class="toggle" data-action="toggle-topic" data-id="${t.id}" aria-expanded="${open}">${esc(t.thema)}</button><div class="muted" style="font-size:12px;margin-left:14px">${esc(t.beschreibung)}</div></td>
    <td>${esc(t.prio || '–')}</td>
    <td class="num">${eur(t.bedarf)}</td>
    <td>${statusTag(t.status)}<br>${t.ist != null ? `<span class="tag-spent">ausgegeben ${eur(t.ist)}</span>` : t.status === 'backlog' ? '<small class="muted">nicht im Budget</small>' : '<span class="tag-planned">verplant</span>'}</td>
    <td>${esc(t.apCss || '–')}</td>
    <td style="white-space:nowrap">${jira ? `<a href="${esc(jira)}" target="_blank" rel="noopener noreferrer">${esc(jiraKey)}</a>` : '–'}</td>
    <td class="muted" style="max-width:260px">${last ? `${esc(last.text.length > 70 ? `${last.text.slice(0, 70)}…` : last.text)}<br><small>${esc(shortDate(last.ts))} · ${esc(loginOf(last.userId))}</small>` : '–'}</td>
  </tr>${detail}`;
}

function topicDialog(potId, topic) {
  const user = me();
  const admin = isAdmin(user);
  const fields = TOPIC_FIELDS.filter((f) => !(topic && f.importOnly));
  const input = (f) => {
    const v = topic ? topic[f.key] : '';
    if (f.long) return `<label class="field" style="grid-column:1/-1">${esc(f.label)}<textarea name="${f.key}" rows="2" maxlength="1000">${esc(v)}</textarea></label>`;
    if (f.money) return `<label class="field">${esc(f.label)}<input type="number" name="${f.key}" min="0" step="1" value="${esc(v ?? '')}"></label>`;
    if (f.options) return `<label class="field">${esc(f.label)}<select name="${f.key}">${f.options.map((o) => `<option value="${o.id}" ${o.id === (v || 'geplant') ? 'selected' : ''}>${esc(o.label)} – ${esc(o.hint)}</option>`).join('')}</select></label>`;
    if (f.key === 'kommentar') return `<label class="field" style="grid-column:1/-1">Erster Kommentar<input type="text" name="kommentar" maxlength="500"></label>`;
    return `<label class="field" ${f.key === 'thema' || f.key === 'jira' ? 'style="grid-column:1/-1"' : ''}>${esc(f.label)}<input type="${f.key === 'jira' ? 'url' : 'text'}" name="${f.key}" maxlength="${f.key === 'jira' ? 300 : 120}" value="${esc(v)}" ${f.required ? 'required' : ''} ${f.key === 'prio' ? 'list="prio-list"' : ''} ${f.key === 'jira' ? 'placeholder="https://jira…"' : ''}></label>`;
  };
  const dlg = document.createElement('dialog');
  dlg.className = 'wide';
  dlg.innerHTML = `<form method="dialog" class="form">
    <h2>${topic ? 'Thema bearbeiten' : `Neues Thema für ${ui.year}`}</h2>
    <datalist id="prio-list"><option value="1"><option value="2"><option value="3"></datalist>
    <div class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
      ${fields.map(input).join('')}
      ${topic && admin ? `<label class="field">Ist-Kosten in € (von Kostenstelle abgezogen)<input type="number" name="ist" min="0" step="1" value="${topic.ist ?? ''}" placeholder="leer = noch verplant"></label>` : ''}
    </div>
    ${topic ? '<p class="muted" style="margin:0">Änderungen werden mit Alt- und Neu-Wert im Kommentarverlauf des Themas protokolliert.</p>' : ''}
    ${topic && admin ? '<p class="muted" style="margin:0">Sobald Ist-Kosten eingetragen sind, zählt das Thema als „ausgegeben“ statt „verplant“.</p>' : ''}
    <p class="error" hidden></p>
    <div class="actions"><button class="btn" value="cancel" formnovalidate>Abbrechen</button><button class="btn primary" value="ok">${topic ? 'Speichern' : 'Anlegen'}</button></div>
  </form>`;
  openDialog(dlg, async (data) => {
    if (topic) {
      const n = await store.updateTopic(user, topic.id, data);
      toast(n ? `Thema gespeichert (${n} Änderung${n === 1 ? '' : 'en'} protokolliert)` : 'Keine Änderungen');
    } else {
      const t = await store.createTopic(user, potId, ui.year, data);
      ui.openTopics.add(t.id);
      toast('Thema angelegt');
    }
  });
}

function importDialog(potId) {
  let parsed = null;
  const dlg = document.createElement('dialog');
  dlg.className = 'wide';
  dlg.innerHTML = `<form method="dialog" class="form">
    <h2>Themen aus CSV importieren (${ui.year})</h2>
    <p class="ink-2" style="margin:0">Erwartete Spalten (Überschrift in Zeile 1, Trennzeichen Semikolon, Komma oder Tab):<br>
      <small>${TOPIC_FIELDS.map((f) => esc(f.label)).join(' · ')}</small><br>
      Pflicht ist nur „Thema“. Ein Wert in „Kommentar“ wird als erster Kommentar übernommen.
      <button type="button" class="btn small" data-action="csv-template">Vorlage herunterladen</button></p>
    <label class="drop" data-drop>CSV-Datei hierher ziehen oder <input type="file" accept=".csv,.txt,text/csv" data-file></label>
    <div data-preview></div>
    <p class="error" hidden></p>
    <div class="actions"><button class="btn" value="cancel" formnovalidate>Abbrechen</button><button class="btn primary" value="ok" disabled data-import-btn>Importieren</button></div>
  </form>`;
  const showPreview = (result) => {
    parsed = result;
    const cols = TOPIC_FIELDS.filter((f) => f.key in result.columns);
    const missing = TOPIC_FIELDS.filter((f) => !(f.key in result.columns));
    dlg.querySelector('[data-preview]').innerHTML = `
      <p style="margin:12px 0 4px"><strong>${result.rows.length} Themen erkannt</strong>${result.rows.length ? ` · Bedarf gesamt ${eur(result.rows.reduce((a, r) => a + (r.bedarf || 0), 0))}` : ''}</p>
      ${missing.length && cols.length ? `<p class="muted" style="margin:0">Nicht gefunden (bleiben leer): ${missing.map((f) => esc(f.label)).join(', ')}</p>` : ''}
      ${result.warnings.length ? `<ul class="error">${result.warnings.slice(0, 8).map((w) => `<li>${esc(w)}</li>`).join('')}${result.warnings.length > 8 ? `<li>… ${result.warnings.length - 8} weitere</li>` : ''}</ul>` : ''}
      ${result.rows.length ? `<div class="preview-table"><table><thead><tr>${cols.map((f) => `<th>${esc(f.label)}</th>`).join('')}</tr></thead>
        <tbody>${result.rows.slice(0, 50).map((r) => `<tr>${cols.map((f) => `<td${f.money ? ' class="num"' : ''}>${f.money ? eur(r[f.key]) : esc(String(r[f.key] ?? '').slice(0, 60))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''}`;
    dlg.querySelector('[data-import-btn]').disabled = !result.rows.length;
    dlg.querySelector('[data-import-btn]').textContent = `${result.rows.length} Themen importieren`;
  };
  const load = async (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast('Datei ist größer als 5 MB', true); return; }
    showPreview(topicsFromCsv(await readFileText(file)));
  };
  dlg.querySelector('[data-file]').addEventListener('change', (e) => load(e.target.files[0]));
  const drop = dlg.querySelector('[data-drop]');
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); load(e.dataTransfer.files[0]); });
  openDialog(dlg, async () => {
    const n = await store.importTopics(me(), potId, ui.year, parsed.rows);
    toast(`${n} Themen importiert`);
  });
}

function exportTopics(potId) {
  const pot = store.pot(potId);
  const cols = TOPIC_FIELDS.filter((f) => !f.importOnly);
  const header = [...cols.map((f) => f.label), 'Ist-Kosten (Euro)', 'Kommentar'];
  const rows = store.state.topics.filter((t) => t.potId === potId && t.year === ui.year).map((t) => [
    ...cols.map((f) => (f.options ? statusLabel(t[f.key]) : t[f.key] ?? '')), t.ist ?? '',
    t.log.map((e, i) => `[${e.kind === 'comment' && i === 0 ? '' : 'Update '}${shortDate(e.ts)} durch ${loginOf(e.userId)}]: ${e.text}`).join('\n'),
  ]);
  download(`themen-${ui.year}-${pot.name.replace(/[^\wäöüÄÖÜß-]+/g, '_')}.csv`, toCsv(header, rows), 'text/csv;charset=utf-8');
}

// ---------- Reporting (nur Admins) ----------
function reportData(state) {
  const pots = state.pots.filter((p) => !p.archived && (!ui.reportPot || p.id === ui.reportPot));
  const order = new Map(pots.map((p, i) => [p.id, i]));
  const topics = state.topics
    .filter((t) => t.year === ui.year && order.has(t.potId))
    .sort((a, b) => order.get(a.potId) - order.get(b.potId) || (a.prio || '9').localeCompare(b.prio || '9') || a.thema.localeCompare(b.thema));
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s.id, topics.filter((t) => (t.status ?? 'geplant') === s.id)]));
  return { pots, topics, byStatus };
}

function renderReporting(el, user, state) {
  const year = ui.year;
  const { pots, topics, byStatus } = reportData(state);
  const cost = (list) => list.reduce((a, t) => a + (t.ist ?? t.bedarf), 0);
  const owner = (p) => store.user(p.ownerId)?.name ?? '–';

  const tiles = STATUSES.map((s) => {
    const list = byStatus[s.id];
    const missing = list.filter((t) => !t.benefits.trim()).length;
    return `<a class="card kpi report-tile ${s.id}" href="#rep-${s.id}" data-action="jump" data-target="rep-${s.id}">
      <div class="label">${statusTag(s.id)}</div>
      <div class="value">${list.length} ${list.length === 1 ? 'Thema' : 'Themen'}</div>
      <div class="sub">${s.id === 'backlog' ? 'Bedarf' : s.id === 'umgesetzt' ? 'Kosten (Ist, sonst Bedarf)' : 'Bedarf bzw. Ist'} ${eur(cost(list))} · ${new Set(list.map((t) => t.potId)).size} Töpfe${missing ? ` · ${missing} ohne Benefits` : ''}</div></a>`;
  }).join('');

  const overview = pots.map((p) => {
    const cells = STATUSES.map((s) => {
      const list = byStatus[s.id].filter((t) => t.potId === p.id);
      return `<td class="num">${list.length ? `${list.length} <small class="muted">· ${eurC(cost(list))}</small>` : '<span class="muted">–</span>'}</td>`;
    }).join('');
    return `<tr><td><a href="#/topf/${p.id}"><span class="swatch" style="background:${slotColor(p.colorSlot)}"></span>${esc(p.name)}</a></td><td>${esc(owner(p))}</td>${cells}</tr>`;
  }).join('');

  const section = (s) => {
    const list = byStatus[s.id];
    let rows = '';
    for (const p of pots) {
      const group = list.filter((t) => t.potId === p.id);
      if (!group.length) continue;
      rows += `<tr class="group"><th colspan="5"><span class="swatch" style="background:${slotColor(p.colorSlot)}"></span>${esc(p.name)} <span class="muted">· Verantwortlich: ${esc(owner(p))} · ${group.length} ${group.length === 1 ? 'Thema' : 'Themen'}</span></th></tr>`;
      rows += group.map((t) => {
        const jira = safeUrl(t.jira);
        return `<tr>
          <td><button class="link" data-action="open-topic" data-id="${t.id}">${esc(t.thema)}</button>${jira ? ` <a class="muted" style="font-size:12px" href="${esc(jira)}" target="_blank" rel="noopener noreferrer">${esc(jira.split('/').pop())}</a>` : ''}</td>
          <td class="benefit">${t.benefits.trim() ? esc(t.benefits) : '<span class="muted">– keine Benefits angegeben</span>'}${t.anmerkung ? `<div class="muted" style="font-size:12px">${esc(t.anmerkung)}</div>` : ''}</td>
          <td>${esc(t.apCss || '–')}</td>
          <td>${esc(t.prio || '–')}</td>
          <td class="num">${eur(t.ist ?? t.bedarf)}${t.ist != null ? '<br><small class="muted">Ist</small>' : ''}</td>
        </tr>`;
      }).join('');
    }
    return `<section class="card span-12 report-section" id="rep-${s.id}">
      <div class="card-head"><div><h2>${statusTag(s.id)} <span style="margin-left:4px">${list.length} ${list.length === 1 ? 'Thema' : 'Themen'} · ${eur(cost(list))}</span></h2><p>${esc(s.hint)}</p></div></div>
      ${list.length ? `<div class="table-wrap"><table class="report-table">
        <thead><tr><th>Thema</th><th>Benefits</th><th>Ansprechpartner (AP CSS)</th><th>Prio</th><th class="num">Betrag</th></tr></thead>
        <tbody>${rows}</tbody></table></div>` : '<div class="empty">Keine Themen in diesem Status.</div>'}
    </section>`;
  };

  el.innerHTML = `<div class="page-head"><div><h1>Benefit-Reporting ${year}</h1>
      <p>Benefits aller Themen je Budgettopf, geordnet nach Umsetzungsstand, mit Ansprechpartnern. Ein Klick auf das Thema öffnet es im Topf.</p></div>
    <div class="row filters">
      <label class="field">Topf<select data-action="report-pot"><option value="">Alle Töpfe</option>${state.pots.filter((p) => !p.archived).map((p) => `<option value="${p.id}" ${p.id === ui.reportPot ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      <button class="btn small" data-action="report-csv">CSV exportieren</button>
      <button class="btn small" data-action="print">Drucken / PDF</button>
    </div></div>
  ${topics.length ? `<div class="grid">
    <div class="span-12 kpis report-tiles">${tiles}</div>
    <section class="card span-12">
      <div class="card-head"><div><h2>Überblick je Topf</h2><p>Anzahl Themen · Betrag</p></div></div>
      <div class="table-wrap"><table><thead><tr><th>Topf</th><th>Verantwortlich</th>${STATUSES.map((s) => `<th class="num">${esc(s.label)}</th>`).join('')}</tr></thead><tbody>${overview}</tbody></table></div>
    </section>
    ${STATUSES.map(section).join('')}
  </div>` : `<div class="card empty">Für ${year} sind ${ui.reportPot ? 'in diesem Topf ' : ''}noch keine Themen erfasst.</div>`}`;
}

function exportReport() {
  const { topics } = reportData(store.state);
  const owner = (id) => store.user(store.pot(id).ownerId)?.name ?? '';
  const header = ['Status', 'Topf', 'Topf verantwortlich', 'Thema', 'Benefits', 'Anmerkung zu Bedarf und Benefits', 'AP CSS', 'Prio', 'Bedarf (Euro)', 'Ist-Kosten (Euro)', 'Jira-Link'];
  const rows = STATUSES.flatMap((s) => topics.filter((t) => (t.status ?? 'geplant') === s.id).map((t) => [
    s.label, store.pot(t.potId).name, owner(t.potId), t.thema, t.benefits, t.anmerkung, t.apCss, t.prio, t.bedarf, t.ist ?? '', t.jira,
  ]));
  download(`benefit-reporting-${ui.year}${ui.reportPot ? `-${store.pot(ui.reportPot).name.replace(/[^\wäöüÄÖÜß-]+/g, '_')}` : ''}.csv`, toCsv(header, rows), 'text/csv;charset=utf-8');
}

// ---------- Verteilung ----------
function renderAllocation(el, user, state) {
  const year = ui.year;
  const pots = state.pots.filter((p) => !p.archived);
  if (!ui.allocDraft || ui.allocDraft.year !== year) {
    ui.allocDraft = { year, baseline: store.yearEntry(year).baseline, values: Object.fromEntries(pots.map((p) => [p.id, p.budgets[year] ?? 0])) };
  }
  const d = ui.allocDraft;
  pots.forEach((p) => { if (!(p.id in d.values)) d.values[p.id] = p.budgets[year] ?? 0; });

  const rows = pots.map((p) => {
    const m = potMetrics(state, p, year);
    return `<div class="alloc-row">
      <div class="name"><span class="swatch" style="background:${slotColor(p.colorSlot)}"></span><span title="${esc(p.name)}">${esc(p.name)}<br><small class="muted">verplant + ausgegeben: ${eur(m.planned + m.spent)}</small></span></div>
      <input type="range" min="0" max="${Math.max(d.baseline, d.values[p.id])}" step="5000" value="${d.values[p.id]}" data-alloc="${p.id}" aria-label="Budget ${esc(p.name)}">
      <input type="number" min="0" step="1000" value="${d.values[p.id]}" data-alloc-num="${p.id}" aria-label="Budget ${esc(p.name)} in Euro">
      <div class="num share muted" data-share="${p.id}"></div>
    </div>`;
  }).join('');

  const years = state.years.map((y) => y.year);
  el.innerHTML = `<div class="page-head"><div><h1>Budgetverteilung ${year}</h1><p>Baseline festlegen und auf die Töpfe aufteilen. Änderungen werden erst mit „Verteilung speichern“ wirksam und protokolliert.</p></div>
    <div class="row"><span class="muted">Angelegte Jahre: ${years.join(', ')}</span><button class="btn primary" data-action="new-year">+ Neues Jahr</button></div></div>
  <div class="grid">
    <section class="card span-8">
      <div class="card-head"><h2>Töpfe</h2><div class="row">
        <button class="btn small" data-action="alloc-even">Rest gleichmäßig verteilen</button>
        <button class="btn small" data-action="alloc-revert">Änderungen verwerfen</button></div></div>
      <label class="field" style="max-width:280px;margin-bottom:8px">Baseline-Budget ${year} in €
        <input type="number" min="0" step="10000" value="${d.baseline}" data-baseline></label>
      ${rows}
    </section>
    <aside class="span-4"><div class="card sticky-summary">
      <h2 style="margin-bottom:12px">Übersicht</h2>
      <div id="alloc-summary"></div>
      <div class="row" style="margin-top:16px"><button class="btn primary" data-action="alloc-save">Verteilung speichern</button></div>
    </div></aside>
  </div>`;
  updateAllocSummary(state);
}

function yearDialog() {
  const years = store.state.years;
  const last = years[years.length - 1];
  const simYear = clock.now().getFullYear();
  const suggested = years.some((y) => y.year === simYear) ? last.year + 1 : simYear;
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `<form method="dialog" class="form">
    <h2>Neues Kalenderjahr anlegen</h2>
    <div class="form-grid">
      <label class="field">Jahr<input type="number" name="year" required min="2000" max="2100" step="1" value="${suggested}"></label>
      <label class="field">Baseline-Budget in € (optional)<input type="number" name="baseline" min="0" step="1000" placeholder="0"></label>
    </div>
    <p class="muted" style="margin:0">Das neue Jahr startet leer: Budgets werden anschließend unter „Verteilung“ zugeteilt, Themen je Topf neu erfasst. Töpfe, Rechte und Sichtbarkeiten gelten jahresübergreifend; Vorjahre bleiben über die Jahresauswahl einsehbar.</p>
    <p class="error" hidden></p>
    <div class="actions"><button class="btn" value="cancel" formnovalidate>Abbrechen</button><button class="btn primary" value="ok">Jahr anlegen</button></div>
  </form>`;
  openDialog(dlg, async (data) => {
    const year = Number(data.year);
    await store.createYear(me(), { year, baseline: Math.round(Number(data.baseline) || 0) });
    pickYear(year);
    ui.allocDraft = null;
    render();
    toast(`Kalenderjahr ${year} angelegt`);
  });
}

function updateAllocSummary(state) {
  const d = ui.allocDraft;
  const pots = state.pots.filter((p) => !p.archived);
  const sum = pots.reduce((a, p) => a + (d.values[p.id] || 0), 0);
  const rest = d.baseline - sum;
  const changed = d.baseline !== store.yearEntry(d.year).baseline || pots.some((p) => (p.budgets[d.year] ?? 0) !== d.values[p.id]);
  const warnings = pots.filter((p) => {
    const m = potMetrics(state, p, d.year);
    return d.values[p.id] < m.planned + m.spent;
  });
  document.getElementById('alloc-summary').innerHTML = `
    ${stackBar(pots.map((p) => ({ name: p.name, value: d.values[p.id] || 0, slot: p.colorSlot })), d.baseline).split('<div class="stack-legend">')[0]}
    <div style="margin-top:14px">
      <div class="summary-line"><span>Baseline</span><span class="num">${eur(d.baseline)}</span></div>
      <div class="summary-line"><span>Verteilt</span><span class="num">${eur(sum)}</span></div>
      <div class="summary-line total ${rest < 0 ? 'bad' : ''}"><span>${rest < 0 ? '⚠ Überverteilt' : 'Nicht verteilt'}</span><span class="num">${eur(rest)}</span></div>
    </div>
    ${warnings.length ? `<p class="error">⚠ Budget kleiner als verplant + ausgegeben: ${warnings.map((p) => esc(p.name)).join(', ')}</p>` : ''}
    <p class="muted" style="margin-bottom:0">${changed ? 'Ungespeicherte Änderungen' : 'Keine Änderungen'}</p>`;
  pots.forEach((p) => {
    const s = document.querySelector(`[data-share="${p.id}"]`);
    if (s) s.textContent = pct((d.values[p.id] || 0) / (d.baseline || 1));
  });
  const save = document.querySelector('[data-action="alloc-save"]');
  if (save) save.disabled = rest < 0 || !changed;
}

// ---------- Berechtigungen ----------
function renderRights(el, user, state) {
  const pots = state.pots.filter((p) => !p.archived);
  const users = state.users;
  const tab = ui.rightsTab;
  let body;
  if (tab === 'pots') {
    body = `<p class="ink-2" style="margin-top:0"><strong>Lesen</strong>: Topf, Budget und Themen sehen, Kommentare schreiben. <strong>Bearbeiten</strong>: zusätzlich Themen anlegen, ändern (inkl. Capex-Bedarf und Status) und per CSV importieren. Ist-Kosten eintragen und Themen löschen dürfen nur Admins.</p>
    <div class="table-wrap"><table class="matrix">
      <thead><tr><th>Person</th>${pots.map((p) => `<th class="rot"><span class="swatch" style="background:${slotColor(p.colorSlot)}"></span>${esc(p.name)}</th>`).join('')}</tr></thead>
      <tbody>${users.map((u) => `<tr><td>${esc(u.name)}<div class="muted" style="font-size:12px">${esc(u.unit)}</div></td>${pots.map((p) => {
        if (isAdmin(u)) return '<td><span class="badge admin">Admin</span></td>';
        const lvl = accessLevel(state, u, p.id) ?? '';
        return `<td><select data-access="${u.id}|${p.id}" class="lvl-${lvl}" aria-label="Zugriff ${esc(u.name)} auf ${esc(p.name)}">
          <option value="" ${!lvl ? 'selected' : ''}>–</option><option value="read" ${lvl === 'read' ? 'selected' : ''}>Lesen</option><option value="write" ${lvl === 'write' ? 'selected' : ''}>Bearbeiten</option></select></td>`;
      }).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
  } else {
    body = `<h3 style="margin:0 0 6px">Dashboard-Bereiche</h3><p class="ink-2" style="margin-top:0">Legt fest, welche Bereiche eine Person sieht. Inhalte beschränken sich immer auf die freigegebenen Töpfe – Ausnahme „Gesamtbudget & Reserve“, das die Aufteilung über alle Töpfe zeigt.</p>
    <div class="table-wrap"><table class="matrix">
      <thead><tr><th>Person</th>${WIDGETS.map((w) => `<th class="rot" title="${esc(w.hint)}">${esc(w.label)}</th>`).join('')}<th class="rot">Vorschau</th></tr></thead>
      <tbody>${users.map((u) => `<tr><td>${esc(u.name)}<div class="muted" style="font-size:12px">${esc(u.unit)}</div></td>${WIDGETS.map((w) => (isAdmin(u)
        ? '<td><span class="badge admin">Admin</span></td>'
        : `<td><input type="checkbox" data-widget="${u.id}|${w.id}" ${canSeeWidget(state, u, w.id) ? 'checked' : ''} aria-label="${esc(w.label)} für ${esc(u.name)}"></td>`)).join('')}
        <td>${isAdmin(u) ? '' : `<button class="btn small" data-action="preview-user" data-id="${u.id}">Ansehen</button>`}</td></tr>`).join('')}</tbody>
    </table></div>
    <h3 style="margin:28px 0 6px">Sichtbare Budgettöpfe</h3>
    <p class="ink-2" style="margin-top:0">Haken = Person sieht den Topf (mindestens Lesen). Ob sie im Topf auch bearbeiten darf, steht im Reiter „Topf-Rechte“ (✎ = Bearbeiten).</p>
    <div class="table-wrap"><table class="matrix">
      <thead><tr><th>Person</th>${pots.map((p) => `<th class="rot"><span class="swatch" style="background:${slotColor(p.colorSlot)}"></span>${esc(p.name)}</th>`).join('')}<th class="rot">Alle</th></tr></thead>
      <tbody>${users.map((u) => `<tr><td>${esc(u.name)}<div class="muted" style="font-size:12px">${esc(u.unit)}</div></td>${pots.map((p) => {
        if (isAdmin(u)) return '<td><span class="badge admin">Admin</span></td>';
        const lvl = accessLevel(state, u, p.id);
        return `<td><input type="checkbox" data-potvis="${u.id}|${p.id}" ${lvl ? 'checked' : ''} aria-label="${esc(p.name)} für ${esc(u.name)} sichtbar">${lvl === 'write' ? ' <span title="Bearbeiten">✎</span>' : ''}</td>`;
      }).join('')}
        <td style="white-space:nowrap">${isAdmin(u) ? '' : `<button class="btn small" data-action="vis-all" data-id="${u.id}">alle</button> <button class="btn small" data-action="vis-none" data-id="${u.id}">keine</button>`}</td></tr>`).join('')}</tbody>
    </table></div>`;
  }
  el.innerHTML = `<div class="page-head"><div><h1>Berechtigungen</h1><p>Wer darf welche Töpfe sehen bzw. bearbeiten, und wer sieht welche Bereiche?</p></div></div>
    <section class="card">
      <div class="tabs" role="tablist">
        <button role="tab" aria-selected="${tab === 'pots'}" data-action="rights-tab" data-tab="pots">Topf-Rechte</button>
        <button role="tab" aria-selected="${tab === 'widgets'}" data-action="rights-tab" data-tab="widgets">Sichtbarkeit</button>
      </div>
      ${body}
    </section>`;
}

// ---------- Nutzer ----------
function renderUsers(el, user, state) {
  const rows = state.users.map((u) => {
    const n = state.access.filter((a) => a.userId === u.id).length;
    return `<tr>
      <td><strong>${esc(u.name)}</strong>${u.id === user.id ? ' <span class="muted">(Sie)</span>' : ''}</td>
      <td>${esc(u.login)}</td><td>${esc(u.email)}</td><td>${esc(u.unit)}</td>
      <td><select data-role="${u.id}" aria-label="Rolle ${esc(u.name)}" style="width:auto"><option value="user" ${u.role === 'user' ? 'selected' : ''}>Nutzer</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option></select></td>
      <td>${isAdmin(u) ? 'alle Töpfe' : `${n} ${n === 1 ? 'Topf' : 'Töpfe'}`}</td>
    </tr>`;
  }).join('');
  el.innerHTML = `<div class="page-head"><div><h1>Nutzer</h1><p>Im POC lokal gepflegt. Im Zielsystem kommen Personen und Rollen aus dem Unternehmensverzeichnis (z. B. Entra-ID-Gruppen).</p></div>
    <button class="btn primary" data-action="new-user">+ Neue Person</button></div>
    <section class="card"><div class="table-wrap"><table>
      <thead><tr><th>Name</th><th>Login</th><th>E-Mail</th><th>Organisationseinheit</th><th>Rolle</th><th>Topf-Zugriff</th></tr></thead>
      <tbody>${rows}</tbody></table></div></section>`;
}

function userDialog() {
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `<form method="dialog" class="form">
    <h2>Neue Person (Demo)</h2>
    <label class="field">Name<input type="text" name="name" required maxlength="60"></label>
    <label class="field">E-Mail (Teil vor dem @ wird Loginname)<input type="email" name="email" maxlength="80" placeholder="name@example.org"></label>
    <div class="form-grid">
      <label class="field">Organisationseinheit<input type="text" name="unit" maxlength="60"></label>
      <label class="field">Rolle<select name="role"><option value="user">Nutzer</option><option value="admin">Admin</option></select></label>
    </div>
    <p class="error" hidden></p>
    <div class="actions"><button class="btn" value="cancel" formnovalidate>Abbrechen</button><button class="btn primary" value="ok">Anlegen</button></div>
  </form>`;
  openDialog(dlg, async (data) => {
    await store.createUser(me(), data);
    toast('Person angelegt – Topf-Zugriff unter „Berechtigungen“ vergeben');
  });
}

// ---------- Protokoll ----------
function renderAudit(el, user, state) {
  const rows = state.audit.slice(0, 300).map((a) => `<tr>
    <td class="num" style="text-align:left">${ts(a.ts)}</td><td>${esc(loginOf(a.userId))}</td>
    <td><span class="badge">${esc(a.action)}</span></td><td>${esc(a.detail)}</td></tr>`).join('');
  el.innerHTML = `<div class="page-head"><div><h1>Protokoll</h1><p>Alle Änderungen an Töpfen, Verteilung, Rechten und Themen (neueste zuerst).</p></div>
    <div class="row"><button class="btn" data-action="export-json">Datenstand exportieren (JSON)</button>
    <button class="btn danger" data-action="reset">Demo-Daten zurücksetzen</button></div></div>
    <section class="card"><div class="table-wrap"><table>
      <thead><tr><th>Zeitpunkt</th><th>Login</th><th>Aktion</th><th>Details</th></tr></thead>
      <tbody>${rows}</tbody></table></div></section>`;
}

// ---------- Downloads ----------
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportPotsCsv() {
  const user = me();
  const viewer = (isAdmin(user) && ui.previewUserId && store.user(ui.previewUserId)) || user;
  const state = store.state;
  const rows = visiblePots(state, viewer).map((p) => potMetrics(state, p, ui.year))
    .map((p) => [p.name, p.costCenter, p.allocated, p.planned, p.spent, p.free, p.topicCount]);
  download(`budgettoepfe-${ui.year}.csv`, toCsv(['Topf', 'Kostenstelle', 'Budget', 'Verplant', 'Ausgegeben', 'Übrig', 'Themen'], rows), 'text/csv;charset=utf-8');
}

function csvTemplate() {
  const header = TOPIC_FIELDS.map((f) => f.label);
  const example = ['Beispielthema', 'Kurzbeschreibung', '25000', 'Nutzen für Fachbereich', '', '', '2', 'Backlog', 'M. Muster', 'Thema ist wichtig für Sales', 'https://jira.example.org/browse/BUD-1'];
  download('themen-vorlage.csv', toCsv(header, [example]), 'text/csv;charset=utf-8');
}

// ---------- Ereignisse ----------
document.addEventListener('click', async (ev) => {
  const t = ev.target.closest('[data-action]');
  if (!t) return;
  const user = me();
  const a = t.dataset.action;
  if (a === 'login') { auth.login(t.dataset.id); ui.previewUserId = null; ui.allocDraft = null; ui.year = null; pickYear(); location.hash = '#/dashboard'; render(); return; }
  if (a === 'simdate-clear') { clock.setSimulated(null); updateBanner(); render(); return; }
  if (a === 'logout') { auth.logout(); render(); return; }
  if (a === 'theme') {
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === 'dark'
      : matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('budget-cockpit.theme', document.documentElement.dataset.theme); } catch { /* egal */ }
    return;
  }
  if (a === 'reset') {
    if (!confirm('Alle Änderungen verwerfen und die Demo-Daten neu laden?')) return;
    ui.allocDraft = null;
    await store.reset();
    toast('Demo-Daten zurückgesetzt');
    return;
  }
  if (!user) return;
  switch (a) {
    case 'csv-pots': exportPotsCsv(); break;
    case 'csv-template': csvTemplate(); break;
    case 'export-json': download('budget-cockpit-export.json', JSON.stringify(store.state, null, 2), 'application/json'); break;
    case 'new-pot': potDialog(null); break;
    case 'edit-pot': potDialog(store.pot(t.dataset.id)); break;
    case 'archive-pot': {
      const pot = store.pot(t.dataset.id);
      const archive = t.dataset.archived === '1';
      if (archive && !confirm(`„${pot.name}“ archivieren? Der Topf verschwindet aus Dashboard und Verteilung, sein Budget zählt nicht mehr mit. Reaktivieren ist jederzeit möglich.`)) return;
      ui.allocDraft = null;
      await run(() => store.setPotArchived(user, pot.id, archive), archive ? 'Topf archiviert' : 'Topf reaktiviert');
      break;
    }
    case 'toggle-topic':
      if (ui.openTopics.has(t.dataset.id)) ui.openTopics.delete(t.dataset.id); else ui.openTopics.add(t.dataset.id);
      render();
      document.querySelector(`[data-action="toggle-topic"][data-id="${t.dataset.id}"]`)?.focus();
      break;
    case 'new-topic': topicDialog(t.dataset.id, null); break;
    case 'edit-topic': { const topic = store.topic(t.dataset.id); topicDialog(topic.potId, topic); break; }
    case 'delete-topic': {
      const topic = store.topic(t.dataset.id);
      if (!confirm(`Thema „${topic.thema}“ inklusive Kommentarverlauf löschen? Das lässt sich nicht rückgängig machen.`)) return;
      await run(() => store.deleteTopic(user, topic.id), 'Thema gelöscht');
      break;
    }
    case 'import-topics': importDialog(t.dataset.id); break;
    case 'export-topics': exportTopics(t.dataset.id); break;
    case 'rights-tab': ui.rightsTab = t.dataset.tab; if (currentRoute().id === 'rechte') render(); break;
    case 'preview-user': ui.previewUserId = t.dataset.id; location.hash = '#/dashboard'; break;
    case 'new-user': userDialog(); break;
    case 'new-year': yearDialog(); break;
    case 'open-topic': {
      const topic = store.topic(t.dataset.id);
      ui.openTopics.add(topic.id);
      location.hash = `#/topf/${topic.potId}`;
      setTimeout(() => document.querySelector(`[data-action="toggle-topic"][data-id="${topic.id}"]`)?.scrollIntoView({ block: 'center' }), 50);
      break;
    }
    case 'jump': ev.preventDefault(); document.getElementById(t.dataset.target)?.scrollIntoView({ behavior: 'smooth' }); break;
    case 'report-csv': exportReport(); break;
    case 'print': window.print(); break;
    case 'vis-all':
    case 'vis-none': {
      const pots = store.state.pots.filter((p) => !p.archived).map((p) => p.id);
      const target = store.user(t.dataset.id);
      if (a === 'vis-none' && store.state.access.some((x) => x.userId === target.id && x.level === 'write')
        && !confirm(`${target.name} verliert damit auch alle Bearbeitungsrechte. Fortfahren?`)) return;
      await run(() => store.setPotsVisible(user, target.id, pots, a === 'vis-all'), a === 'vis-all' ? 'Alle Töpfe sichtbar' : 'Alle Töpfe ausgeblendet');
      break;
    }
    case 'alloc-even': {
      const d = ui.allocDraft;
      const pots = store.state.pots.filter((p) => !p.archived);
      const rest = d.baseline - pots.reduce((s, p) => s + d.values[p.id], 0);
      if (rest <= 0 || !pots.length) { toast('Kein unverteilter Rest vorhanden'); return; }
      const share = Math.floor(rest / pots.length / 1000) * 1000;
      pots.forEach((p) => { d.values[p.id] += share; });
      render();
      break;
    }
    case 'alloc-revert': ui.allocDraft = null; render(); break;
    case 'alloc-save': {
      const d = ui.allocDraft;
      await run(async () => {
        const n = await store.setAllocation(user, d.year, d.baseline, d.values);
        ui.allocDraft = null;
        render();
        toast(n ? `Verteilung gespeichert (${n} Änderung${n === 1 ? '' : 'en'})` : 'Keine Änderungen');
      });
      break;
    }
    default: break;
  }
});

document.addEventListener('input', (ev) => {
  const t = ev.target;
  const d = ui.allocDraft;
  if (t.dataset.alloc || t.dataset.allocNum) {
    const id = t.dataset.alloc || t.dataset.allocNum;
    d.values[id] = Math.max(0, Math.round(Number(t.value) || 0));
    const other = document.querySelector(t.dataset.alloc ? `[data-alloc-num="${id}"]` : `[data-alloc="${id}"]`);
    if (other) other.value = d.values[id];
    updateAllocSummary(store.state);
  } else if (t.hasAttribute('data-baseline')) {
    d.baseline = Math.max(0, Math.round(Number(t.value) || 0));
    document.querySelectorAll('[data-alloc]').forEach((r) => { r.max = Math.max(d.baseline, d.values[r.dataset.alloc]); });
    updateAllocSummary(store.state);
  } else if (t.hasAttribute('data-topic-search')) {
    ui.topicQuery = t.value;
    clearTimeout(input.t);
    const pos = t.selectionStart;
    input.t = setTimeout(() => {
      render();
      const inp = document.querySelector('[data-topic-search]');
      inp?.focus();
      inp?.setSelectionRange(pos, pos);
    }, 250);
  }
});
const input = {};

document.addEventListener('change', async (ev) => {
  const t = ev.target;
  if (t.hasAttribute('data-simdate')) { clock.setSimulated(t.value || null); updateBanner(); render(); return; }
  const user = me();
  if (!user) return;
  if (t.dataset.action === 'report-pot') { ui.reportPot = t.value; render(); return; }
  if (t.dataset.action === 'preview') { ui.previewUserId = t.value || null; render(); return; }
  if (t.dataset.action === 'year') { pickYear(Number(t.value)); ui.openTopics.clear(); render(); return; }
  if (t.dataset.potvis) {
    const [userId, potId] = t.dataset.potvis.split('|');
    const lvl = accessLevel(store.state, store.user(userId), potId);
    if (!t.checked && lvl === 'write' && !confirm('Damit wird auch das Bearbeitungsrecht für diesen Topf entzogen. Fortfahren?')) { t.checked = true; return; }
    await run(() => store.setPotsVisible(user, userId, [potId], t.checked), t.checked ? 'Topf sichtbar' : 'Topf ausgeblendet');
    return;
  }
  if (t.dataset.access) {
    const [userId, potId] = t.dataset.access.split('|');
    await run(() => store.setAccess(user, userId, potId, t.value || null), 'Zugriff gespeichert');
  } else if (t.dataset.widget) {
    const [userId, widgetId] = t.dataset.widget.split('|');
    await run(() => store.setWidget(user, userId, widgetId, t.checked), 'Sichtbarkeit gespeichert');
  } else if (t.dataset.role) {
    await run(() => store.setRole(user, t.dataset.role, t.value), 'Rolle gespeichert');
    render();
  }
});

document.addEventListener('submit', async (ev) => {
  const form = ev.target;
  if (form.dataset.form !== 'comment') return;
  ev.preventDefault();
  const id = form.dataset.id;
  const text = new FormData(form).get('text');
  await run(() => store.addComment(me(), id, String(text)), 'Kommentar hinzugefügt');
  document.querySelector(`form[data-id="${id}"] input`)?.focus();
});

// Tooltips für alle Elemente mit data-tip
const tooltipEl = document.getElementById('tooltip');
document.addEventListener('pointermove', (ev) => {
  const t = ev.target.closest?.('[data-tip]');
  if (!t) { tooltipEl.hidden = true; return; }
  const { title, rows } = JSON.parse(t.dataset.tip);
  showTip(tooltipEl, title, rows, ev.clientX, ev.clientY);
});

window.addEventListener('hashchange', () => { tooltipEl.hidden = true; ui.topicQuery = ''; render(); window.scrollTo(0, 0); });

store.subscribe(() => render());
await store.init();
updateBanner();
pickYear(Number((() => { try { return sessionStorage.getItem(YEAR_KEY); } catch { return null; } })()));
render();
