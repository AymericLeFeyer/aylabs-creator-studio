import { useMemo } from 'react';
import { Link2, Trophy, Unlink, Layers } from 'lucide-react';
import { usePlatforms } from '../../application/affiliate/usecases/usePlatforms.ts';
import { useRevenues } from '../../application/revenue/usecases/useRevenues.ts';
import { AFFILIATE_CATEGORY_ID } from '../../domain/category/entities/Category.ts';
import { formatNumber } from '../../shared/format.ts';
import { useFilters } from '../hooks/useFilters.tsx';
import { usePrivacy } from '../hooks/usePrivacy.tsx';
import { StatCard } from '../components/StatCard.tsx';
import { PeriodPicker } from '../components/filters/PeriodPicker.tsx';
import { PlatformsPanel } from '../components/partners/PlatformsPanel.tsx';

/**
 * Les plateformes d'affiliation : où est gérée l'affiliation d'une marque, et laquelle
 * rapporte le plus.
 *
 * Ancien onglet de `/partenariats`. Ses cartes ne parlent que d'affiliation : le total de
 * la période, ce qui reste à rattacher (sans rattachement, le classement des plateformes
 * ment par omission), la plateforme en tête, et combien de comptes sont encore suivis.
 *
 * **AdSense est exclu par construction** : ses revenus sont des métriques quotidiennes
 * (contrainte 4) et n'apparaissent jamais dans `useRevenues`.
 */
export const PlatformsPage = () => {
  const filters = useFilters();
  const privacy = usePrivacy();

  // Mêmes paramètres que `PlatformsPanel` : la requête est partagée, pas dupliquée.
  const { data: platforms = [] } = usePlatforms({
    includeArchived: true,
    from: filters.from,
    to: filters.to,
  });
  const { data: revenues = [] } = useRevenues({
    from: filters.from,
    to: filters.to,
    channelIds: filters.channelIds,
  });

  const stats = useMemo(() => {
    const rows = revenues.filter((entry) => entry.categoryId === AFFILIATE_CATEGORY_ID);
    const active = platforms.filter((platform) => !platform.isArchived);
    const best = [...active].sort((a, b) => b.earnedCents - a.earnedCents)[0];
    return {
      totalCents: rows.reduce((sum, entry) => sum + entry.amountCents, 0),
      count: rows.length,
      unlinked: rows.filter((entry) => entry.platformId === null).length,
      active: active.length,
      archived: platforms.length - active.length,
      best: best && best.earnedCents > 0 ? best : null,
    };
  }, [revenues, platforms]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="hidden lg:block">
          <h1 className="text-lg font-semibold">Plateformes</h1>
          <p className="text-sm text-muted-foreground">
            Où est gérée l'affiliation de chaque marque, et laquelle te rapporte le plus.
          </p>
        </div>
        <PeriodPicker />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total affiliations"
          value={privacy.money(stats.totalCents, 'affiliation')}
          hint={`${stats.count} revenu(s) sur la période · hors AdSense`}
          icon={<Link2 className="h-4 w-4" />}
          accent={stats.totalCents > 0 ? 'var(--positive)' : undefined}
        />
        <StatCard
          label="Sans plateforme"
          value={formatNumber(stats.unlinked)}
          hint="revenus d'affiliation à rattacher"
          icon={<Unlink className="h-4 w-4" />}
          accent={stats.unlinked > 0 ? 'var(--expense)' : undefined}
        />
        <StatCard
          label="En tête"
          value={stats.best?.name ?? '—'}
          hint={
            stats.best
              ? `${privacy.money(stats.best.earnedCents, 'affiliation')} sur la période`
              : 'aucun gain rattaché sur la période'
          }
          icon={<Trophy className="h-4 w-4" />}
        />
        <StatCard
          label="Plateformes suivies"
          value={formatNumber(stats.active)}
          hint={stats.archived > 0 ? `${stats.archived} archivée(s)` : 'aucune archivée'}
          icon={<Layers className="h-4 w-4" />}
        />
      </div>

      <PlatformsPanel />
    </div>
  );
};
