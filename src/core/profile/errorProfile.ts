/**
 * Profilo errori per tag grammaticale (§3.4).
 *
 * Media mobile esponenziale con α = 0,2: la memoria effettiva è di circa 5
 * esposizioni recenti. Serve a rispondere a una domanda sola — «questo tag sta
 * peggiorando adesso?» — non a fare la media storica della carriera
 * dell'utente. Chi ha sbagliato il dativo trenta volte a gennaio e lo azzecca
 * da due settimane non deve trovarsi un drill sul dativo.
 */
import { DAY_MS } from '../scheduler/day';
import type { ErrorProfileEntry, GrammarTag } from '../types';
import { DRILLABLE_TAGS, isDrillableTag } from '../german/tags';

export const EMA_ALPHA = 0.2;

/** Sopra questo tasso di errore il tag è considerato debole. Confronto stretto. */
export const DRILL_ERROR_THRESHOLD = 0.3;

/**
 * Esposizioni minime prima di poter attivare un drill.
 *
 * Senza questa soglia, due errori consecutivi su un tag appena incontrato
 * portano l'EMA a 0,36 e farebbero scattare un drill su un tag di cui non
 * sappiamo ancora niente. Otto esposizioni sono il minimo per distinguere una
 * debolezza da due distrazioni.
 */
export const DRILL_MIN_EXPOSURES = 8;

/** Un drill sullo stesso tag non si ripete per tre giorni. */
export const DRILL_COOLDOWN_MS = 3 * DAY_MS;

export type ErrorProfile = ReadonlyMap<GrammarTag, ErrorProfileEntry>;

export function emptyEntry(tag: GrammarTag, now: number): ErrorProfileEntry {
  return { tag, emaErrorRate: 0, exposures: 0, lastUpdated: now, lastDrillAt: null };
}

/**
 * Aggiorna una singola voce. L'EMA parte da 0 (presunzione di competenza): un
 * tag deve guadagnarsi la reputazione di debolezza con errori ripetuti.
 */
export function updateEntry(
  previous: ErrorProfileEntry | undefined,
  tag: GrammarTag,
  wasCorrect: boolean,
  now: number,
): ErrorProfileEntry {
  const base = previous ?? emptyEntry(tag, now);
  const observation = wasCorrect ? 0 : 1;
  return {
    ...base,
    tag,
    emaErrorRate: base.emaErrorRate + EMA_ALPHA * (observation - base.emaErrorRate),
    exposures: base.exposures + 1,
    lastUpdated: now,
  };
}

/** Registra una risposta su tutti i tag dell'item. Restituisce una nuova mappa. */
export function recordAnswer(
  profile: ErrorProfile,
  tags: readonly GrammarTag[],
  wasCorrect: boolean,
  now: number,
): Map<GrammarTag, ErrorProfileEntry> {
  const next = new Map(profile);
  for (const tag of tags) {
    next.set(tag, updateEntry(next.get(tag), tag, wasCorrect, now));
  }
  return next;
}

/**
 * Il tag ha superato la soglia? Il confronto sull'EMA è STRETTO: la specifica
 * dice «supera il 30%», quindi 0,30 esatto non basta.
 */
export function exceedsThreshold(entry: ErrorProfileEntry): boolean {
  return entry.emaErrorRate > DRILL_ERROR_THRESHOLD && entry.exposures >= DRILL_MIN_EXPOSURES;
}

export function needsDrill(entry: ErrorProfileEntry, now: number, cooldownMs = DRILL_COOLDOWN_MS): boolean {
  if (!isDrillableTag(entry.tag)) return false;
  if (!exceedsThreshold(entry)) return false;
  if (entry.lastDrillAt !== null && now - entry.lastDrillAt < cooldownMs) return false;
  return true;
}

/** Tag da drillare nella prossima sessione, dal più debole al meno debole. */
export function tagsNeedingDrill(profile: ErrorProfile, now: number, cooldownMs = DRILL_COOLDOWN_MS): GrammarTag[] {
  return [...profile.values()]
    .filter((entry) => needsDrill(entry, now, cooldownMs))
    .sort((a, b) => b.emaErrorRate - a.emaErrorRate)
    .map((entry) => entry.tag);
}

export function markDrilled(entry: ErrorProfileEntry, now: number): ErrorProfileEntry {
  return { ...entry, lastDrillAt: now };
}

export interface TagHeat {
  tag: GrammarTag;
  emaErrorRate: number;
  exposures: number;
  /** 0-1, per la mappa di calore. Un tag con poche esposizioni pesa meno. */
  confidence: number;
}

/**
 * Mappa di calore dei tag deboli (§7.5). La confidenza evita di dipingere di
 * rosso un tag visto due volte: la heatmap deve mostrare debolezze reali, non
 * rumore campionario.
 */
export function tagHeatmap(profile: ErrorProfile): TagHeat[] {
  return DRILLABLE_TAGS.map((tag) => {
    const entry = profile.get(tag);
    return {
      tag,
      emaErrorRate: entry?.emaErrorRate ?? 0,
      exposures: entry?.exposures ?? 0,
      confidence: Math.min(1, (entry?.exposures ?? 0) / DRILL_MIN_EXPOSURES),
    };
  }).sort((a, b) => b.emaErrorRate * b.confidence - a.emaErrorRate * a.confidence);
}
