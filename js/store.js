// Fachlogik (Commands). Jede Änderung prüft die Berechtigung des handelnden Nutzers
// und schreibt einen Protokolleintrag. Im Zielsystem werden diese Methoden zu API-Aufrufen.
import { createRepository } from './data/repository.js';
import { WIDGETS, TOPIC_FIELDS } from './data/seed.js';
import { assertAdmin, canEditTopics, canComment, isAdmin } from './permissions.js';
import { eur } from './format.js';
import { clock } from './clock.js';

const uid = (prefix) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export class Store {
  constructor() {
    this.repo = createRepository();
    this.state = null;
    this.listeners = new Set();
  }

  async init() {
    this.state = await this.repo.load();
    return this.state;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  async commit(actor, action, detail) {
    this.state.audit.unshift({ id: uid('a'), ts: clock.iso(), userId: actor.id, action, detail });
    this.state.audit = this.state.audit.slice(0, 500);
    await this.repo.save(this.state);
    this.listeners.forEach((fn) => fn(this.state));
  }

  user(id) {
    return this.state.users.find((u) => u.id === id);
  }

  pot(id) {
    return this.state.pots.find((p) => p.id === id);
  }

  // ---------- Budgettöpfe ----------
  async createPot(actor, data) {
    assertAdmin(actor);
    const name = data.name.trim();
    if (!name) throw new Error('Name fehlt');
    if (this.state.pots.some((p) => !p.archived && p.name.toLowerCase() === name.toLowerCase())) {
      throw new Error('Ein Topf mit diesem Namen existiert bereits');
    }
    const usedSlots = new Set(this.state.pots.map((p) => p.colorSlot));
    let colorSlot = 0;
    while (usedSlots.has(colorSlot)) colorSlot++;
    const pot = {
      id: uid('p'), name, description: data.description.trim(), costCenter: data.costCenter.trim(),
      ownerId: data.ownerId || null, budgets: {}, colorSlot, archived: false, createdAt: clock.iso(),
    };
    this.state.pots.push(pot);
    if (pot.ownerId && this.user(pot.ownerId)?.role === 'user') {
      this.state.access.push({ potId: pot.id, userId: pot.ownerId, level: 'write' });
    }
    await this.commit(actor, 'Topf angelegt', pot.name);
    return pot;
  }

  async updatePot(actor, id, data) {
    assertAdmin(actor);
    const pot = this.pot(id);
    Object.assign(pot, {
      name: data.name.trim() || pot.name, description: data.description.trim(),
      costCenter: data.costCenter.trim(), ownerId: data.ownerId || null,
    });
    await this.commit(actor, 'Topf geändert', pot.name);
  }

  async setPotArchived(actor, id, archived) {
    assertAdmin(actor);
    const pot = this.pot(id);
    pot.archived = archived;
    await this.commit(actor, archived ? 'Topf archiviert' : 'Topf reaktiviert', pot.name);
  }

  // ---------- Kalenderjahre & Budgetverteilung ----------
  yearEntry(year) {
    return this.state.years.find((y) => y.year === year);
  }

  // Ein neues Jahr startet leer: Baseline wie angegeben, keine Topfbudgets, keine Themen
  async createYear(actor, { year, baseline }) {
    assertAdmin(actor);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error('Bitte ein gültiges Jahr angeben');
    if (this.yearEntry(year)) throw new Error(`Das Jahr ${year} existiert bereits`);
    if (!(baseline >= 0)) throw new Error('Ungültige Baseline');
    this.state.years.push({ year, baseline });
    this.state.years.sort((a, b) => a.year - b.year);
    await this.commit(actor, 'Jahr angelegt', `${year}: Baseline ${eur(baseline)}`);
  }

  async setAllocation(actor, year, baseline, allocations) {
    assertAdmin(actor);
    const entry = this.yearEntry(year);
    if (!entry) throw new Error('Unbekanntes Jahr');
    if (!(baseline >= 0)) throw new Error('Ungültige Baseline');
    const sum = Object.values(allocations).reduce((a, b) => a + b, 0);
    if (sum > baseline) throw new Error('Die Verteilung übersteigt die Baseline');
    const changes = [];
    if (baseline !== entry.baseline) {
      changes.push(`Baseline ${eur(entry.baseline)} → ${eur(baseline)}`);
      entry.baseline = baseline;
    }
    for (const [potId, amount] of Object.entries(allocations)) {
      const pot = this.pot(potId);
      const old = pot?.budgets[year] ?? 0;
      if (pot && old !== amount) {
        changes.push(`${pot.name}: ${eur(old)} → ${eur(amount)}`);
        pot.budgets[year] = amount;
      }
    }
    if (changes.length) await this.commit(actor, `Budget ${year} verteilt`, changes.join('; '));
    return changes.length;
  }

  // ---------- Berechtigungen ----------
  async setAccess(actor, userId, potId, level) {
    assertAdmin(actor);
    this.state.access = this.state.access.filter((a) => !(a.userId === userId && a.potId === potId));
    if (level) this.state.access.push({ userId, potId, level });
    const label = { read: 'Lesen', write: 'Buchen' }[level] ?? 'kein Zugriff';
    await this.commit(actor, 'Topf-Zugriff gesetzt', `${this.user(userId).name} · ${this.pot(potId).name}: ${label}`);
  }

  // Sichtbarkeit mehrerer Töpfe auf einmal: sichtbar = mindestens Lesen, unsichtbar = kein Zugriff
  async setPotsVisible(actor, userId, potIds, visible) {
    assertAdmin(actor);
    const changed = [];
    for (const potId of potIds) {
      const has = this.state.access.some((a) => a.userId === userId && a.potId === potId);
      if (visible && !has) { this.state.access.push({ userId, potId, level: 'read' }); changed.push(potId); }
      if (!visible && has) { this.state.access = this.state.access.filter((a) => !(a.userId === userId && a.potId === potId)); changed.push(potId); }
    }
    if (!changed.length) return 0;
    await this.commit(actor, 'Topf-Sichtbarkeit geändert', `${this.user(userId).name}: ${changed.map((id) => this.pot(id).name).join(', ')} ${visible ? 'sichtbar' : 'ausgeblendet'}`);
    return changed.length;
  }

  async setWidget(actor, userId, widgetId, visible) {
    assertAdmin(actor);
    this.state.widgetVisibility[userId] ??= {};
    this.state.widgetVisibility[userId][widgetId] = visible;
    const w = WIDGETS.find((x) => x.id === widgetId);
    await this.commit(actor, 'Sichtbarkeit geändert', `${this.user(userId).name} · ${w.label}: ${visible ? 'sichtbar' : 'ausgeblendet'}`);
  }

  // ---------- Nutzer ----------
  async createUser(actor, data) {
    assertAdmin(actor);
    const user = { id: uid('u'), login: data.email.trim().split('@')[0] || data.name.trim().toLowerCase().replace(/\s+/g, '.'), name: data.name.trim(), email: data.email.trim(), role: data.role, unit: data.unit.trim() };
    if (!user.name) throw new Error('Name fehlt');
    this.state.users.push(user);
    this.state.widgetVisibility[user.id] = { baseline: false, kpis: true, potBars: true, potTable: true, topics: true };
    await this.commit(actor, 'Nutzer angelegt', `${user.name} (${user.role === 'admin' ? 'Admin' : 'Nutzer'})`);
    return user;
  }

  async setRole(actor, userId, role) {
    assertAdmin(actor);
    const admins = this.state.users.filter((u) => u.role === 'admin');
    if (role === 'user' && admins.length === 1 && admins[0].id === userId) {
      throw new Error('Mindestens ein Admin muss bestehen bleiben');
    }
    const user = this.user(userId);
    user.role = role;
    await this.commit(actor, 'Rolle geändert', `${user.name}: ${role === 'admin' ? 'Admin' : 'Nutzer'}`);
  }

  // ---------- Themen ----------
  topic(id) {
    return this.state.topics.find((t) => t.id === id);
  }

  async createTopic(actor, potId, year, data) {
    if (!canEditTopics(this.state, actor, potId)) throw new Error('Keine Berechtigung, in diesem Topf Themen anzulegen');
    const topic = this.buildTopic(actor, potId, year, data);
    this.state.topics.push(topic);
    await this.commit(actor, 'Thema angelegt', `${this.pot(potId).name} ${year}: ${topic.thema} (${eur(topic.bedarf)})`);
    return topic;
  }

  async importTopics(actor, potId, year, rows) {
    if (!canEditTopics(this.state, actor, potId)) throw new Error('Keine Berechtigung, in diesem Topf Themen anzulegen');
    const topics = rows.map((r) => this.buildTopic(actor, potId, year, r, 'Per CSV importiert'));
    this.state.topics.push(...topics);
    const sum = topics.reduce((a, t) => a + t.bedarf, 0);
    await this.commit(actor, 'CSV-Import', `${this.pot(potId).name} ${year}: ${topics.length} Themen, Bedarf ${eur(sum)}`);
    return topics.length;
  }

  buildTopic(actor, potId, year, data, origin) {
    const thema = String(data.thema ?? '').trim();
    if (!thema) throw new Error('Thema fehlt');
    if (!this.yearEntry(year)) throw new Error('Unbekanntes Jahr');
    const now = clock.iso();
    const topic = { id: uid('t'), potId, year, createdBy: actor.id, createdAt: now, ist: null, log: [] };
    for (const f of TOPIC_FIELDS) {
      if (f.importOnly) continue;
      topic[f.key] = f.money ? Math.max(0, Math.round(Number(data[f.key]) || 0)) : String(data[f.key] ?? '').trim();
    }
    const comment = String(data.kommentar ?? '').trim();
    if (comment) topic.log.push({ ts: now, userId: actor.id, kind: 'comment', text: comment });
    if (origin) topic.log.push({ ts: now, userId: actor.id, kind: 'update', text: origin });
    return topic;
  }

  // Änderungen werden feldweise mit Alt/Neu im Kommentarverlauf des Themas festgehalten
  async updateTopic(actor, id, data) {
    const topic = this.topic(id);
    if (!topic || !canEditTopics(this.state, actor, topic.potId)) throw new Error('Keine Berechtigung');
    const fmt = (f, v) => (f.money ? (v == null ? '–' : eur(v)) : v || '–');
    const fields = [...TOPIC_FIELDS.filter((f) => !f.importOnly), { key: 'ist', label: 'Ist-Kosten', money: true, adminOnly: true }];
    const changes = [];
    for (const f of fields) {
      if (!(f.key in data)) continue;
      let next = data[f.key];
      if (f.money) next = next === '' || next == null ? (f.key === 'ist' ? null : 0) : Math.max(0, Math.round(Number(next) || 0));
      else next = String(next).trim();
      if (next === topic[f.key]) continue;
      if ((f.adminOnly || f.key === 'bedarf') && !isAdmin(actor)) throw new Error(`${f.label} kann nur ein Admin ändern`);
      if (f.key === 'thema' && !next) throw new Error('Thema darf nicht leer sein');
      changes.push(`${f.label} wurde geändert. Alt: ${fmt(f, topic[f.key])} / Neu: ${fmt(f, next)}`);
      topic[f.key] = next;
    }
    if (!changes.length) return 0;
    const now = clock.iso();
    changes.forEach((text) => topic.log.push({ ts: now, userId: actor.id, kind: 'update', text }));
    await this.commit(actor, 'Thema geändert', `${topic.thema}: ${changes.join('; ')}`);
    return changes.length;
  }

  async addComment(actor, id, text) {
    const topic = this.topic(id);
    if (!topic || !canComment(this.state, actor, topic.potId)) throw new Error('Keine Berechtigung');
    const clean = text.trim();
    if (!clean) throw new Error('Kommentar ist leer');
    topic.log.push({ ts: clock.iso(), userId: actor.id, kind: topic.log.length ? 'update' : 'comment', text: clean });
    await this.commit(actor, 'Kommentar', `${topic.thema}: ${clean}`);
  }

  async deleteTopic(actor, id) {
    assertAdmin(actor);
    const topic = this.topic(id);
    this.state.topics = this.state.topics.filter((t) => t.id !== id);
    await this.commit(actor, 'Thema gelöscht', `${this.pot(topic.potId).name}: ${topic.thema} (${eur(topic.bedarf)})`);
  }

  async reset() {
    this.state = await this.repo.reset();
    this.listeners.forEach((fn) => fn(this.state));
  }
}
