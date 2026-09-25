import type { AchievementMetric, AchievementPoint, Milestone } from '../entities/Achievement.ts';

/**
 * Les règles de reconstruction, **pures** : des lignes en entrée, une courbe cumulée et
 * ses paliers en sortie. Trois façons de rebâtir une courbe, selon ce que la base connaît.
 *
 * Chaque courbe vient avec sa **valeur de départ** (`start`) : ce que valait le compteur
 * juste avant le premier point. C'est elle, et non le premier point, qui décide qu'un
 * palier a été franchi avant l'historique — une chaîne qui gagne son 100e abonné le
 * premier jour collecté l'a bien gagné ce jour-là.
 */
export interface Curve {
  points: AchievementPoint[];
  start: number;
}

/**
 * Un FLUX quotidien (vues, abonnés gagnés − perdus) cumulé, puis **recalé sur un cumul
 * connu** (`anchor`, le dernier relevé de la chaîne) : la courbe finit exactement sur le
 * total affiché partout ailleurs, et tout ce qui précède le rattrapage se retrouve dans la
 * valeur de départ. Sans ancre, le cumul part de zéro (AdSense, stories).
 *
 * Planchée à zéro : un relevé public arrondi peut faire passer le départ sous zéro.
 */
export const cumulateFlux = (
  flux: Array<{ date: string; delta: number }>,
  anchor: AchievementPoint | null,
): Curve => {
  const sorted = [...flux].sort((a, b) => a.date.localeCompare(b.date));
  let running = 0;
  const raw = sorted.map((row) => {
    running += row.delta;
    return { date: row.date, value: running };
  });
  let offset = 0;
  if (anchor) {
    const atAnchor = raw.filter((point) => point.date <= anchor.date).at(-1)?.value ?? 0;
    offset = anchor.value - atAnchor;
  }
  const points = raw.map((point) => ({
    date: point.date,
    value: Math.max(0, point.value + offset),
  }));
  if (anchor && (points.length === 0 || anchor.date > points.at(-1)!.date)) {
    points.push({ date: anchor.date, value: Math.max(0, anchor.value) });
  }
  return { points, start: Math.max(0, offset) };
};

/**
 * Des CUMULS relevés tels quels (abonnés Instagram, coeurs TikTok). On ne sait rien
 * d'avant le premier relevé : la valeur de départ est ce premier relevé, et tout palier
 * déjà franchi à ce moment-là l'a été « avant ».
 */
export const fromSnapshots = (snapshots: Array<{ date: string; value: number | null }>): Curve => {
  const points = snapshots
    .filter((row): row is AchievementPoint => row.value !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
  return { points, start: points[0]?.value ?? 0 };
};

/**
 * Des ÉLÉMENTS datés (vidéos, publications, stories) : le n-ième élément fait passer le
 * compteur à n. `known` est le total que la plateforme annonce : s'il dépasse ce que la
 * base connaît, les plus anciens manquent (hors de la fenêtre de collecte), et ce sont
 * eux qui forment la valeur de départ — le 1er n'est alors pas daté.
 */
export const countItems = (dates: string[], known: number | null): Curve => {
  const sorted = [...dates].sort();
  const start = Math.max(0, (known ?? 0) - sorted.length);
  const points: AchievementPoint[] = [];
  sorted.forEach((date, index) => {
    const value = start + index + 1;
    // Plusieurs le même jour : un seul point, le dernier compte.
    if (points.at(-1)?.date === date) points.at(-1)!.value = value;
    else points.push({ date, value });
  });
  return { points, start };
};

/** « 1 000 », « 2,5 M » — les paliers se lisent ronds. */
const formatThreshold = (value: number): string => {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M`;
  }
  return value.toLocaleString('fr-FR');
};

const FIRSTS: Partial<Record<AchievementMetric, string>> = {
  videos: 'Première vidéo',
  posts: 'Première publication',
  stories: 'Première story archivée',
};

const NOUNS: Record<AchievementMetric, string> = {
  subscribers: 'abonnés',
  followers: 'abonnés',
  views: 'vues',
  videos: 'vidéos',
  posts: 'publications',
  stories: 'stories',
  hearts: 'coeurs',
  adsense: '€ AdSense',
};

export const milestoneTitle = (metric: AchievementMetric, threshold: number): string => {
  if (threshold === 1 && FIRSTS[metric]) return FIRSTS[metric]!;
  if (metric === 'videos' || metric === 'posts')
    return `${formatThreshold(threshold)}e ${metric === 'videos' ? 'vidéo' : 'publication'}`;
  if (metric === 'adsense') return `${formatThreshold(threshold / 100)} € AdSense`;
  return `${formatThreshold(threshold)} ${NOUNS[metric]}`;
};

/**
 * Le premier jour où la courbe atteint chaque palier. Un palier déjà atteint par la
 * valeur de départ l'a été **avant** l'historique ; un palier jamais atteint reste
 * verrouillé. La courbe étant cumulée, on la parcourt une seule fois.
 */
export const findMilestones = (
  curve: Curve,
  metric: AchievementMetric,
  thresholds: number[],
): Milestone[] =>
  thresholds.map((threshold) => {
    const title = milestoneTitle(metric, threshold);
    if (curve.start >= threshold && curve.points.length > 0) {
      return { threshold, title, reachedAt: null, before: true };
    }
    const hit = curve.points.find((point) => point.value >= threshold);
    return { threshold, title, reachedAt: hit?.date ?? null, before: false };
  });
