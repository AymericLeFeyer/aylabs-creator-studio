import { useMemo } from 'react';
import { useAnalytics } from '../../application/analytics/usecases/useAnalytics.ts';
import { useBrandStats } from '../../application/brand/usecases/useBrands.ts';
import { useInstagramOverview } from '../../application/instagram/usecases/useInstagram.ts';
import { useTikTokOverview } from '../../application/tiktok/usecases/useTikTok.ts';
import { useProducts } from '../../application/product/usecases/useProducts.ts';
import { useSponsorships } from '../../application/sponsorship/usecases/useSponsorships.ts';
import { partnerPipeline } from '../../domain/partner/services/pipeline.ts';
import { toIsoDate } from '../../shared/format.ts';
import { useAnalyticsParams, useFilters } from '../hooks/useFilters.tsx';

/**
 * Les lectures partagées par les blocs.
 *
 * Chaque bloc est **autonome** — il doit pouvoir se dessiner seul sur le dashboard, loin de
 * sa page — et va donc chercher ses propres données. Ces hooks garantissent qu'ils les
 * cherchent **avec les mêmes paramètres** : même clé de cache, donc une seule requête pour
 * les douze cartes d'une page, et deux blocs posés côte à côte ne peuvent pas se contredire.
 *
 * Ce fichier n'exporte aucun composant (`react-refresh/only-export-components`).
 */
export const useAnalyticsData = () => useAnalytics(useAnalyticsParams());

/**
 * L'aperçu vu depuis YouTube : **sans les Shorts** quand la case « Afficher les Shorts »
 * est décochée (repères, classement, tableaux). Les courbes restent entières —
 * `daily_metrics` est mesuré à la chaîne, sans découpage par format — et une vidéo pas
 * encore classée (`isShort` null) reste affichée.
 */
export const useYouTubeData = () => {
  const filters = useFilters();
  const query = useAnalyticsData();
  const data = useMemo(() => {
    const raw = query.data;
    if (!raw || filters.showShorts) return raw;
    const keep = <T extends { isShort: boolean | null }>(rows: T[]) =>
      rows.filter((row) => row.isShort !== true);
    return {
      ...raw,
      videos: keep(raw.videos),
      videoPerformance: keep(raw.videoPerformance),
      catalogPerformance: keep(raw.catalogPerformance ?? []),
    };
  }, [query.data, filters.showShorts]);
  return { ...query, data };
};

export const useBrandStatsData = () => {
  const filters = useFilters();
  return useBrandStats({ from: filters.from, to: filters.to, channelIds: filters.channelIds });
};

/** Toujours au jour, comme l'écran Instagram : le calendrier compte une case par jour. */
export const useInstagramData = () => {
  const filters = useFilters();
  return useInstagramOverview({
    from: filters.from,
    to: filters.to,
    granularity: 'day',
    accountIds: filters.instagramAccountIds,
  });
};

export const useTikTokData = () => {
  const filters = useFilters();
  return useTikTokOverview({
    from: filters.from,
    to: filters.to,
    granularity: 'day',
    accountIds: filters.tiktokAccountIds,
  });
};

/**
 * Le pipeline des partenariats, borné par la période : les **flux** (reçus, encaissés) la
 * suivent, les **états** (à encaisser, attendus) l'ignorent d'eux-mêmes (`partnerPipeline`).
 */
export const usePipeline = () => {
  const filters = useFilters();
  const { data: products = [] } = useProducts();
  const { data: sponsorships = [] } = useSponsorships();
  return useMemo(
    () => ({
      products,
      sponsorships,
      pipeline: partnerPipeline(products, sponsorships, toIsoDate(new Date()), {
        from: filters.from,
        to: filters.to,
      }),
    }),
    [products, sponsorships, filters.from, filters.to],
  );
};
