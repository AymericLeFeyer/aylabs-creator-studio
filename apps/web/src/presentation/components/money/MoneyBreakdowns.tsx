import { useMemo } from 'react';
import { NATURE_LABELS } from '../../../domain/category/entities/Category.ts';
import { revenueMaskKey } from '../../../domain/privacy/services/privacy.ts';
import { useFilters } from '../../hooks/useFilters.tsx';
import { usePrivacy } from '../../hooks/usePrivacy.tsx';
import { useAnalyticsData, useBrandStatsData } from '../../blocks/blockData.ts';
import { DonutBreakdown, type DonutSlice } from '../charts/DonutBreakdown.tsx';
import { RankingBars, type RankingRow } from '../charts/RankingBars.tsx';

/**
 * Les répartitions d'argent : trois anneaux et deux classements, **chacun un bloc** — ils
 * se posent séparément sur le dashboard, et chacun y garde son propre titre.
 *
 * Une part masquée vaut **zéro**, et zéro fait disparaître la tranche : `DonutBreakdown`
 * et `RankingBars` écartent déjà tout ce qui vaut zéro, et le total du centre comme la
 * longueur des barres se recalculent sur ce qui reste. Garder la tranche en cachant son
 * montant aurait livré sa part au premier coup d'œil.
 */

/** Décoché, l'anneau ne montre pas les produits reçus : son total reste celui du CA. */
export const RevenueSplit = () => {
  const filters = useFilters();
  const privacy = usePrivacy();
  const { data } = useAnalyticsData();

  const slices = useMemo<DonutSlice[]>(
    () =>
      (data?.byCategory ?? [])
        .filter((item) => filters.includeInKind || item.nature !== 'in_kind')
        .map((item) => ({
          id: `r-${item.categoryId}`,
          label: item.categoryName,
          color: item.color,
          cents: privacy.amount(item.totalCents, revenueMaskKey(item.categoryId, item.nature)),
          badge: item.nature === 'in_kind' ? NATURE_LABELS.in_kind : undefined,
        })),
    [data, filters.includeInKind, privacy],
  );

  return (
    <DonutBreakdown
      title="Répartition des revenus"
      slices={slices}
      emptyLabel="Aucun revenu sur cette période."
      totalHint={filters.includeInKind ? 'produits reçus compris' : undefined}
      masked={privacy.isMasked('totals')}
    />
  );
};

export const ExpenseSplit = () => {
  const privacy = usePrivacy();
  const { data } = useAnalyticsData();

  const slices = useMemo<DonutSlice[]>(
    () =>
      (data?.byExpenseCategory ?? []).map((item) => ({
        id: `e-${item.categoryId}`,
        label: item.categoryName,
        color: item.color,
        cents: privacy.amount(item.totalCents, 'expenses'),
      })),
    [data, privacy],
  );

  return (
    <DonutBreakdown
      title="Répartition des dépenses"
      slices={slices}
      emptyLabel="Aucune dépense sur cette période."
      masked={privacy.isMasked('expenses')}
    />
  );
};

/**
 * Même unité que ses deux voisins — l'argent gagné par chaîne, pas les vues. Les revenus
 * globaux (sans chaîne) ne sont dans aucune tranche : le total peut être inférieur à celui
 * des revenus, c'est voulu.
 */
export const ChannelSplit = () => {
  const filters = useFilters();
  const privacy = usePrivacy();
  const { data } = useAnalyticsData();

  const slices = useMemo<DonutSlice[]>(
    () =>
      (data?.byChannel ?? []).map((channel) => ({
        id: channel.channelId,
        label: channel.channelName,
        color: channel.color,
        cents:
          privacy.amount(channel.revenueCashCents, 'cash') +
          (filters.includeInKind ? privacy.amount(channel.inKindCents, 'inKind') : 0),
      })),
    [data, filters.includeInKind, privacy],
  );

  return (
    <DonutBreakdown
      title="Revenus par chaîne"
      slices={slices}
      emptyLabel="Aucun revenu rattaché à une chaîne sur cette période."
      totalHint="hors revenus globaux"
      masked={privacy.isMasked('cash') && privacy.isMasked('inKind')}
    />
  );
};

/** Barres et non anneau : sur un top-N ordonné, on lit le rang et l'écart au premier. */
export const BrandRanking = () => {
  const privacy = usePrivacy();
  const { data: brandStats = [] } = useBrandStatsData();

  const rows = useMemo<RankingRow[]>(
    () =>
      brandStats.map((brand) => ({
        id: brand.brandId,
        label: brand.brandName,
        color: brand.color,
        value: privacy.amount(brand.productsValueCents, 'inKind'),
        formatted: privacy.money(brand.productsValueCents, 'inKind'),
        hint: `${brand.productsCount} produit(s)`,
      })),
    [brandStats, privacy],
  );

  return (
    <RankingBars
      title="Marques les plus généreuses"
      description="Valeur des produits reçus sur la période."
      rows={rows}
      emptyLabel="Aucun produit reçu sur cette période."
      masked={privacy.isMasked('inKind')}
    />
  );
};

export const SponsorRanking = () => {
  const privacy = usePrivacy();
  const { data: brandStats = [] } = useBrandStatsData();

  const rows = useMemo<RankingRow[]>(
    () =>
      brandStats.map((brand) => ({
        id: brand.brandId,
        label: brand.brandName,
        color: brand.color,
        value: privacy.amount(brand.sponsorshipsPaidCents, 'sponsorships'),
        formatted: privacy.money(brand.sponsorshipsPaidCents, 'sponsorships'),
        hint: `${brand.sponsorshipsPaidCount} sponso(s)`,
      })),
    [brandStats, privacy],
  );

  return (
    <RankingBars
      title="Sponsors qui paient le plus"
      description="Sponsos encaissées sur la période."
      rows={rows}
      emptyLabel="Aucune sponso encaissée sur cette période."
      masked={privacy.isMasked('sponsorships')}
    />
  );
};
