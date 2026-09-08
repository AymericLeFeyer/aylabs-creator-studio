import { useMemo } from 'react';
import type { AnalyticsResult } from '../../../domain/analytics/entities/Analytics.ts';
import type { BrandStats } from '../../../domain/brand/entities/Brand.ts';
import { NATURE_LABELS } from '../../../domain/category/entities/Category.ts';
import { revenueMaskKey } from '../../../domain/privacy/services/privacy.ts';
import { useFilters } from '../../hooks/useFilters.tsx';
import { usePrivacy } from '../../hooks/usePrivacy.tsx';
import { DonutBreakdown, type DonutSlice } from '../charts/DonutBreakdown.tsx';
import { RankingBars, type RankingRow } from '../charts/RankingBars.tsx';

/**
 * Les répartitions d'argent : trois anneaux et deux classements.
 *
 * Extraites du dashboard, qui ne garde que ses deux graphiques : elles vivent
 * désormais dans l'onglet Chiffre d'affaires, là où on vient chercher le détail de ce
 * qui rentre et de ce qui sort. Un seul composant pour les deux écrans, sinon la même
 * répartition finirait par se lire différemment selon la page.
 */
export const MoneyBreakdowns = ({
  data,
  brandStats,
}: {
  data: AnalyticsResult;
  brandStats: BrandStats[];
}) => {
  const filters = useFilters();
  const privacy = usePrivacy();

  /**
   * Une part masquée vaut **zéro**, et zéro fait disparaître la tranche : `DonutBreakdown`
   * et `RankingBars` écartent déjà tout ce qui vaut zéro, et le total du centre comme la
   * longueur des barres se recalculent sur ce qui reste. C'est la mise à zéro demandée —
   * garder la tranche en cachant son montant aurait livré sa part au premier coup d'œil.
   */
  const revenueSlices = useMemo<DonutSlice[]>(
    () =>
      data.byCategory
        .filter((item) => filters.includeInKind || item.nature !== 'in_kind')
        .map((item) => ({
          id: `r-${item.categoryId}`,
          label: item.categoryName,
          color: item.color,
          cents: privacy.amount(item.totalCents, revenueMaskKey(item.categoryId, item.nature)),
          badge: item.nature === 'in_kind' ? NATURE_LABELS.in_kind : undefined,
        })),
    [data.byCategory, filters.includeInKind, privacy],
  );

  const expenseSlices = useMemo<DonutSlice[]>(
    () =>
      data.byExpenseCategory.map((item) => ({
        id: `e-${item.categoryId}`,
        label: item.categoryName,
        color: item.color,
        cents: privacy.amount(item.totalCents, 'expenses'),
      })),
    [data.byExpenseCategory, privacy],
  );

  // Même unité que ses deux voisins — l'argent gagné par chaîne, pas les vues : sinon
  // on comparerait trois échelles différentes sur la même rangée.
  const channelSlices = useMemo<DonutSlice[]>(
    () =>
      data.byChannel.map((channel) => ({
        id: channel.channelId,
        label: channel.channelName,
        color: channel.color,
        // Pas de granularité par catégorie ici : l'encaissé et le nature d'une chaîne
        // sont deux sommes, masquées dès qu'une de leurs composantes l'est.
        cents:
          privacy.amount(channel.revenueCashCents, 'cash') +
          (filters.includeInKind ? privacy.amount(channel.inKindCents, 'inKind') : 0),
      })),
    [data.byChannel, filters.includeInKind, privacy],
  );

  const brandRows = useMemo<RankingRow[]>(
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

  const sponsorRows = useMemo<RankingRow[]>(
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
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {/* Décoché, l'anneau ne montre pas les produits reçus : son total doit rester
            celui du CA affiché partout ailleurs. */}
        <DonutBreakdown
          title="Répartition des revenus"
          slices={revenueSlices}
          emptyLabel="Aucun revenu sur cette période."
          totalHint={filters.includeInKind ? 'produits reçus compris' : undefined}
          masked={privacy.isMasked('totals')}
        />
        <DonutBreakdown
          title="Répartition des dépenses"
          slices={expenseSlices}
          emptyLabel="Aucune dépense sur cette période."
          masked={privacy.isMasked('expenses')}
        />
        {/* Les revenus globaux (sans chaîne) ne sont dans aucune tranche : le total de
            cet anneau peut être inférieur à celui des revenus, c'est voulu. */}
        <DonutBreakdown
          title="Revenus par chaîne"
          slices={channelSlices}
          emptyLabel="Aucun revenu rattaché à une chaîne sur cette période."
          totalHint="hors revenus globaux"
          masked={privacy.isMasked('cash') && privacy.isMasked('inKind')}
        />
      </div>

      {/* Barres horizontales et non anneaux : sur un top-N ordonné, c'est le rang et
          l'écart au premier qu'on lit, deux choses qu'une longueur donne d'un coup. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <RankingBars
          title="Marques les plus généreuses"
          description="Valeur des produits reçus sur la période."
          rows={brandRows}
          emptyLabel="Aucun produit reçu sur cette période."
          masked={privacy.isMasked('inKind')}
        />
        <RankingBars
          title="Sponsors qui paient le plus"
          description="Sponsos encaissées sur la période."
          rows={sponsorRows}
          emptyLabel="Aucune sponso encaissée sur cette période."
          masked={privacy.isMasked('sponsorships')}
        />
      </div>
    </>
  );
};
