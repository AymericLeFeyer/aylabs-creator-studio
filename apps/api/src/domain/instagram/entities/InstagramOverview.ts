import type { Granularity, IsoDate } from '../../../shared/dates.ts';
import type { InstagramAccountView, InstagramDailyMetric } from './InstagramAccount.ts';
import type { InstagramMedia, InstagramStory } from './InstagramStory.ts';

/**
 * Un point de série Instagram.
 *
 * Même découpage FLUX / CUMUL que les séries YouTube, et pour la même raison : `stories`
 * et `reach` se somment dans le bucket, `followers` non — on y reporte la dernière valeur
 * connue.
 */
export interface InstagramSeriesPoint {
  date: IsoDate;
  /** Nombre de stories publiées dans le bucket. C'est le chiffre qu'on vient lire. */
  stories: number;
  /** Publications (posts, carrousels, reels) parues dans le bucket. */
  posts: number;
  reach: number | null;
  views: number | null;
  totalInteractions: number | null;
  /** CUMUL : dernière valeur connue du bucket, reportée sur les jours sans relevé. */
  followers: number | null;
  /** Gain d'abonnés du bucket, déduit de deux relevés successifs. */
  followersGained: number | null;
}

/**
 * Les totaux de la période.
 *
 * `storiesPerDay` est une **moyenne sur les jours de la période**, pas sur les jours où
 * l'on a publié : « je poste 2,4 stories par jour » se compare d'un mois à l'autre,
 * « 4 stories les jours où j'en poste » ne dit rien du rythme.
 */
export interface InstagramTotals {
  stories: number;
  posts: number;
  reach: number | null;
  views: number | null;
  totalInteractions: number | null;
  /** Abonnés au dernier relevé de la période. */
  followers: number | null;
  followersGained: number | null;
  storiesPerDay: number;
  storiesPerWeek: number;
  /** Jours de la période où au moins une story est sortie. */
  activeDays: number;
  /** Jours couverts par la période, pour lire les moyennes sans se tromper. */
  days: number;
}

/**
 * Tout l'écran Instagram en une requête.
 *
 * `firstStoryDate` porte l'aveu que l'écran doit faire : avant cette date, le comptage de
 * stories vaut zéro parce que rien n'était collecté, pas parce que rien n'a été publié.
 * Sans elle, un mois d'avant l'installation se lirait comme un mois sans activité.
 */
export interface InstagramOverview {
  from: IsoDate;
  to: IsoDate;
  granularity: Granularity;
  accounts: InstagramAccountView[];
  series: InstagramSeriesPoint[];
  totals: InstagramTotals;
  previousTotals: InstagramTotals | null;
  /** Les stories de la période, les plus récentes d'abord. */
  stories: InstagramStory[];
  /** Les publications de la période, les plus récentes d'abord. */
  media: InstagramMedia[];
  /** Première story jamais archivée, tous comptes confondus. */
  firstStoryDate: IsoDate | null;
  /** Les métriques brutes, pour les écrans qui veulent le détail. */
  dailyMetrics: InstagramDailyMetric[];
}
