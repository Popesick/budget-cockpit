// Login-Simulation. Im Zielsystem: Microsoft Entra ID (MSAL.js), Rolle aus dem ID-Token
// (App-Rolle "Budget.Admin" bzw. Gruppenmitgliedschaft) – die Auswahl unten entfällt dann.
import { CONFIG } from './config.js';

const SESSION_KEY = `${CONFIG.storageKey}.session`;
let memoryUserId = null; // Fallback, falls sessionStorage gesperrt ist

export const auth = {
  currentUserId() {
    try { return sessionStorage.getItem(SESSION_KEY) ?? memoryUserId; } catch { return memoryUserId; }
  },
  login(userId) {
    memoryUserId = userId;
    try { sessionStorage.setItem(SESSION_KEY, userId); } catch { /* nur im Speicher */ }
  },
  logout() {
    memoryUserId = null;
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* egal */ }
  },
};
