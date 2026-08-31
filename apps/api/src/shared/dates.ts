/** Une date calendaire au format `YYYY-MM-DD`, seule unité de temps stockée en base. */
export type IsoDate = string;

export const toIsoDate = (d: Date): IsoDate => {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const today = (): IsoDate => toIsoDate(new Date());

export const parseIsoDate = (s: IsoDate): Date => new Date(`${s}T00:00:00.000Z`);

export const addDays = (s: IsoDate, days: number): IsoDate => {
  const d = parseIsoDate(s);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
};

export const isIsoDate = (s: unknown): s is IsoDate =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

/** Granularité d'agrégation des séries temporelles. */
export type Granularity = 'day' | 'week' | 'month';

/**
 * Ramène une date au début de son bucket.
 * La semaine commence le lundi (ISO 8601, cohérent avec l'affichage FR).
 */
export const bucketStart = (date: IsoDate, granularity: Granularity): IsoDate => {
  if (granularity === 'day') return date;
  const d = parseIsoDate(date);
  if (granularity === 'month') {
    d.setUTCDate(1);
    return toIsoDate(d);
  }
  // getUTCDay() renvoie 0 pour dimanche : on le ramène à 6 jours après lundi.
  const dayOfWeek = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayOfWeek);
  return toIsoDate(d);
};

/** Liste tous les débuts de bucket entre `from` et `to` inclus, pour combler les trous. */
export const enumerateBuckets = (
  from: IsoDate,
  to: IsoDate,
  granularity: Granularity,
): IsoDate[] => {
  const buckets: IsoDate[] = [];
  let cursor = bucketStart(from, granularity);
  const end = bucketStart(to, granularity);
  let guard = 0;
  while (cursor <= end && guard++ < 5000) {
    buckets.push(cursor);
    const d = parseIsoDate(cursor);
    if (granularity === 'day') d.setUTCDate(d.getUTCDate() + 1);
    else if (granularity === 'week') d.setUTCDate(d.getUTCDate() + 7);
    else d.setUTCMonth(d.getUTCMonth() + 1);
    cursor = toIsoDate(d);
  }
  return buckets;
};
