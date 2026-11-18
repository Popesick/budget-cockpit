// Zeitquelle der App. Im POC lässt sich auf dem Login-Screen ein Datum simulieren
// (z. B. um die Ansicht im Folgejahr zu testen). Im Zielsystem entfällt das; dort gilt die Serverzeit.
const KEY = 'budget-cockpit.simdate';
let memory = null;

export const clock = {
  // 'YYYY-MM-DD' oder null
  simulated() {
    try { return localStorage.getItem(KEY) ?? memory; } catch { return memory; }
  },
  setSimulated(isoDate) {
    memory = isoDate || null;
    try {
      if (isoDate) localStorage.setItem(KEY, isoDate); else localStorage.removeItem(KEY);
    } catch { /* nur im Speicher */ }
  },
  // Simuliertes Datum mit der aktuellen Uhrzeit
  now() {
    const d = new Date();
    const sim = this.simulated();
    if (sim) {
      const [y, m, day] = sim.split('-').map(Number);
      d.setFullYear(y, m - 1, day);
    }
    return d;
  },
  iso() {
    return this.now().toISOString();
  },
};
