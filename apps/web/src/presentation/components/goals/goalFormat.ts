import type { GoalStatus, GoalUnit, GoalView } from '../../../domain/goal/entities/Goal.ts';
import { MASKED_TEXT } from '../../../domain/privacy/entities/Privacy.ts';
import { usePrivacy, type PrivacyTarget } from '../../hooks/usePrivacy.tsx';
import { formatMoney, formatNumber } from '../../../shared/format.ts';

/**
 * Ce qui se partage entre les blocs et le formulaire des objectifs. Ce fichier n'exporte
 * aucun composant (`react-refresh/only-export-components`).
 */

export const formatGoalValue = (value: number, unit: GoalUnit): string =>
  unit === 'cents'
    ? formatMoney(value)
    : unit === 'hours'
      ? `${formatNumber(value)} h`
      : formatNumber(value);

/** Une valeur stockée (centimes pour l'argent) vers ce qu'on tape dans le champ (euros). */
export const toFieldValue = (value: number, unit: GoalUnit): string =>
  String(unit === 'cents' ? Math.round(value) / 100 : Math.round(value));

/** Ce qu'on tape vers la valeur stockée. `null` si le champ ne contient pas un nombre. */
export const fromFieldValue = (text: string, unit: GoalUnit): number | null => {
  const value = Number(text.replace(/\s/g, '').replace(',', '.'));
  if (text.trim() === '' || !Number.isFinite(value)) return null;
  return unit === 'cents' ? Math.round(value * 100) : value;
};

/**
 * Une prévision arrondie à ce qu'on écrirait soi-même : 3 127 → 3 150, pas au chiffre
 * près. Deux chiffres significatifs et demi — c'est un ordre de grandeur, pas une promesse.
 */
export const roundForecast = (value: number, unit: GoalUnit): number => {
  const scaled = unit === 'cents' ? value / 100 : value;
  const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(Math.max(1, Math.abs(scaled)))) - 1);
  const step = magnitude >= 10 ? magnitude / 2 : magnitude;
  const rounded = Math.round(scaled / step) * step;
  return unit === 'cents' ? rounded * 100 : rounded;
};

/**
 * La clé de confidentialité d'une métrique : un objectif affiche une valeur, une cible et
 * une courbe, qui révèlent autant qu'un palier. Les comptes (vidéos, produits, membres)
 * ne disent rien de confidentiel.
 */
const METRIC_MASKS: Record<string, PrivacyTarget> = {
  'youtube.subscribers': 'subscribers',
  'instagram.followers': 'subscribers',
  'tiktok.followers': 'subscribers',
  'youtube.views': 'views',
  'youtube.watchHours': 'views',
  'youtube.likes': 'views',
  'youtube.comments': 'views',
  'youtube.shares': 'views',
  'instagram.reach': 'views',
  'instagram.views': 'views',
  'instagram.interactions': 'views',
  'tiktok.hearts': 'views',
  'adsense.revenue': 'adsense',
  'products.value': 'inKind',
  'sponsorships.amount': 'sponsorships',
  'affiliation.revenue': 'affiliation',
  'amazon.earnings': 'affiliation',
  'domadoo.earnings': 'affiliation',
  'money.revenue': 'totals',
  'money.cash': 'totals',
  'money.profit': 'totals',
};

export const goalMask = (metric: string): PrivacyTarget | null => METRIC_MASKS[metric] ?? null;

/** Couleur de la pastille de statut, dans les teintes du thème. */
export const STATUS_TONES: Record<GoalStatus, string> = {
  upcoming: 'bg-muted text-muted-foreground',
  achieved: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  on_track: 'bg-[var(--cash)]/15 text-[var(--cash)]',
  behind: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  missed: 'bg-destructive/10 text-destructive',
};

export const percent = (value: number | null): string =>
  value === null ? '—' : `${Math.round(value * 100)} %`;

/** La valeur d'un objectif, ou `•••` si sa métrique est masquée. */
export const useGoalValue = (goal: GoalView) => {
  const privacy = usePrivacy();
  const mask = goalMask(goal.metric);
  const masked = mask !== null && privacy.isMasked(mask);
  return (value: number | null) =>
    value === null ? '—' : masked ? MASKED_TEXT : formatGoalValue(value, goal.unit);
};
