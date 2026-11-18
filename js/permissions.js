// Zentrale Berechtigungslogik. Dieselben Regeln muss im Zielsystem das Backend durchsetzen.
//
// Rollen:   admin  – sieht und darf alles
//           user   – sieht nur freigegebene Töpfe und freigegebene Dashboard-Bereiche
// Topf-Zugriff: read  – Topf, Werte und Themen ansehen, kommentieren
//               write – zusätzlich Themen anlegen, bearbeiten und importieren
// Nur Admins: Budget verteilen, Bedarf nachträglich anpassen, Ist-Kosten eintragen, Themen löschen

export const isAdmin = (user) => user?.role === 'admin';

export function accessLevel(state, user, potId) {
  if (isAdmin(user)) return 'admin';
  return state.access.find((a) => a.userId === user.id && a.potId === potId)?.level ?? null;
}

export function visiblePots(state, user) {
  const active = state.pots.filter((p) => !p.archived);
  if (isAdmin(user)) return active;
  return active.filter((p) => accessLevel(state, user, p.id));
}

export function canEditTopics(state, user, potId) {
  const level = accessLevel(state, user, potId);
  return level === 'admin' || level === 'write';
}

export function canComment(state, user, potId) {
  return Boolean(accessLevel(state, user, potId));
}

export function canSeeWidget(state, user, widgetId) {
  if (isAdmin(user)) return true;
  return Boolean(state.widgetVisibility[user.id]?.[widgetId]);
}

export function assertAdmin(user) {
  if (!isAdmin(user)) throw new Error('Keine Berechtigung: nur für Admins');
}
