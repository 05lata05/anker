/**
 * Giornata logica.
 *
 * La specifica non dice quando inizia "oggi". Se si usasse la mezzanotte, chi
 * studia all'una di notte spezzerebbe lo streak per un tecnicismo di
 * calendario — ed è esattamente la persona che l'abitudine ce l'ha. La giornata
 * inizia quindi alle 04:00 locali (configurabile).
 */

export const DAY_MS = 86_400_000;

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Giornata logica in formato YYYY-MM-DD, in ora locale del dispositivo. */
export function logicalDay(ts: number, rolloverHour = 4): string {
  const d = new Date(ts);
  if (d.getHours() < rolloverHour) {
    d.setDate(d.getDate() - 1);
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Istante di inizio della giornata logica che contiene `ts`. */
export function startOfLogicalDay(ts: number, rolloverHour = 4): number {
  const d = new Date(ts);
  if (d.getHours() < rolloverHour) {
    d.setDate(d.getDate() - 1);
  }
  d.setHours(rolloverHour, 0, 0, 0);
  return d.getTime();
}

export function endOfLogicalDay(ts: number, rolloverHour = 4): number {
  return startOfLogicalDay(ts, rolloverHour) + DAY_MS;
}

export function isSameLogicalDay(a: number, b: number, rolloverHour = 4): boolean {
  return logicalDay(a, rolloverHour) === logicalDay(b, rolloverHour);
}

/** Giorni frazionari tra due istanti. Usato per `elapsed_days` di FSRS. */
export function daysBetween(from: number, to: number): number {
  return (to - from) / DAY_MS;
}

/**
 * Giornata logica precedente. Serve allo streak: la catena si spezza solo se
 * manca un giorno E non è stato coperto da un freeze.
 */
export function previousLogicalDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - 1);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
