// Kennzahlen eines Topfs:
//   ausgegeben = Ist-Kosten abgerechneter Themen (vom Admin eingetragen)
//   verplant   = Bedarf der Themen, die noch nicht abgerechnet sind
//   frei       = Budget − verplant − ausgegeben (negativ = überplant)
export function potMetrics(state, pot) {
  let planned = 0;
  let spent = 0;
  let count = 0;
  for (const t of state.topics) {
    if (t.potId !== pot.id) continue;
    count++;
    if (t.ist != null) spent += t.ist; else planned += t.bedarf;
  }
  const free = pot.allocated - planned - spent;
  return { ...pot, planned, spent, free, topicCount: count, util: pot.allocated ? (planned + spent) / pot.allocated : planned + spent ? Infinity : 0 };
}

export function sumMetrics(list) {
  const sum = (k) => list.reduce((a, p) => a + p[k], 0);
  return { allocated: sum('allocated'), planned: sum('planned'), spent: sum('spent'), free: sum('free') };
}
