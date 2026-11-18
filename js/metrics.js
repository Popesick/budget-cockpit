// Kennzahlen eines Topfs:
//   ausgegeben = Ist-Kosten abgerechneter Themen (vom Admin eingetragen)
//   verplant   = Bedarf der Themen, die noch nicht abgerechnet sind (ohne Backlog)
//   backlog    = Bedarf noch nicht eingeplanter Themen – zählt nicht ins Budget
//   frei       = Budget − verplant − ausgegeben (negativ = überplant)
// Alle Werte beziehen sich auf ein Kalenderjahr.
export function potMetrics(state, pot, year) {
  const allocated = pot.budgets[year] ?? 0;
  let planned = 0;
  let spent = 0;
  let backlog = 0;
  let backlogCount = 0;
  let count = 0;
  for (const t of state.topics) {
    if (t.potId !== pot.id || t.year !== year) continue;
    count++;
    if (t.ist != null) spent += t.ist;
    else if (t.status === 'backlog') { backlog += t.bedarf; backlogCount++; } else planned += t.bedarf;
  }
  const free = allocated - planned - spent;
  return { ...pot, allocated, planned, spent, free, backlog, backlogCount, topicCount: count, util: allocated ? (planned + spent) / allocated : planned + spent ? Infinity : 0 };
}

export function sumMetrics(list) {
  const sum = (k) => list.reduce((a, p) => a + p[k], 0);
  return { allocated: sum('allocated'), planned: sum('planned'), spent: sum('spent'), free: sum('free') };
}
