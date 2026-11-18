// Persistenzschicht. Die App kennt nur diese Schnittstelle:
//   load()  -> Promise<State>
//   save(state) -> Promise<void>
//   reset() -> Promise<State>
// Im Zielsystem ersetzt ApiRepository die lokale Ablage; Berechtigungen werden dann
// zusätzlich serverseitig geprüft (die Client-Prüfung ist nur Komfort, keine Sicherheit).
import { CONFIG } from '../config.js';
import { createSeed, SCHEMA_VERSION } from './seed.js';

class LocalRepository {
  constructor(key) {
    this.key = key;
    this.memory = null; // Fallback, falls localStorage gesperrt ist
  }

  async load() {
    try {
      const raw = localStorage.getItem(this.key);
      const data = raw && JSON.parse(raw);
      if (data?.schemaVersion === SCHEMA_VERSION) return data;
    } catch { /* gesperrt oder defekt -> neu befüllen */ }
    if (this.memory?.schemaVersion === SCHEMA_VERSION) return structuredClone(this.memory);
    const seed = createSeed();
    await this.save(seed);
    return seed;
  }

  async save(state) {
    this.memory = structuredClone(state);
    try {
      localStorage.setItem(this.key, JSON.stringify(state));
    } catch { /* nur im Speicher */ }
  }

  async reset() {
    this.memory = null;
    try { localStorage.removeItem(this.key); } catch { /* egal */ }
    return this.load();
  }
}

class ApiRepository {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }

  async load() {
    const res = await fetch(`${this.baseUrl}/state`, { credentials: 'include' });
    if (!res.ok) throw new Error(`API-Fehler ${res.status}`);
    return res.json();
  }

  async save() {
    // Im Zielsystem sendet der Store einzelne Kommandos (POST /pots, PUT /allocations …)
    // statt den Gesamtzustand. Platzhalter, damit die Schnittstelle vollständig ist.
    throw new Error('ApiRepository.save: im POC nicht implementiert');
  }

  async reset() {
    throw new Error('Reset ist im Zielsystem nicht vorgesehen');
  }
}

export function createRepository() {
  return CONFIG.dataBackend === 'api'
    ? new ApiRepository(CONFIG.apiBaseUrl)
    : new LocalRepository(CONFIG.storageKey);
}
