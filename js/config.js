// Zentrale Rahmenparameter. Für den Zielbetrieb (Azure o. ä.) werden hier
// Backend und Authentifizierung umgestellt – die UI bleibt unverändert.
export const CONFIG = {
  appName: 'Budget-Cockpit',
  // 'local' = POC: Fakedaten im Browser (localStorage)
  // 'api'   = Zielsystem: REST-API (z. B. Azure App Service + Azure SQL)
  dataBackend: 'local',
  apiBaseUrl: '/api',
  // 'simulated' = POC: Nutzer wird aus einer Liste gewählt
  // 'entra'     = Zielsystem: Microsoft Entra ID (SSO via MSAL), Rollen über App-Rollen/Gruppen
  authMode: 'simulated',
  currency: 'EUR',
  locale: 'de-DE',
  storageKey: 'budget-cockpit.v1',
};
