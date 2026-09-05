import { useMemo } from 'react';
import { Gift, Handshake, Link2, PackageOpen, Wallet } from 'lucide-react';
import type { PartnerPipeline } from '../../../domain/partner/services/pipeline.ts';
import {
  AFFILIATE_CATEGORY_ID,
  NATURE_LABELS,
} from '../../../domain/category/entities/Category.ts';
import { useRevenues } from '../../../application/revenue/usecases/useRevenues.ts';
import { useFilters } from '../../hooks/useFilters.tsx';
import { formatMoney, formatNumber } from '../../../shared/format.ts';
import { StatCard } from '../StatCard.tsx';

/**
 * Les chiffres du pipeline de partenariats, dans la même carte que le dashboard.
 *
 * **Deux natures cohabitent dans la même rangée, et chaque sous-titre dit laquelle.**
 *
 * « Produits attendus » et « Sponsos à encaisser » sont des **états** : ils ignorent la
 * période, parce qu'un colis attendu depuis mars est toujours attendu en juin. Les réunir
 * ici plutôt que d'inventer un autre résumé garantit que le dashboard et cet écran
 * annoncent le même montant à encaisser.
 *
 * « Produits reçus », « Sponsos encaissées » et « Total affiliations » sont des **flux**,
 * exactement comme le chiffre d'affaires : ils suivent la période, et ils retombent sur ce
 * que les tables affichent en dessous — même prédicat, `partnerPipeline` et les listes
 * partageant `productInPeriod` / `sponsorshipInPeriod`.
 */
export const PartnerStatCards = ({ pipeline }: { pipeline: PartnerPipeline }) => {
  const filters = useFilters();
  const { data: revenues = [] } = useRevenues({
    from: filters.from,
    to: filters.to,
    channelIds: filters.channelIds,
  });

  /**
   * Ce que l'affiliation a rapporté sur la période.
   *
   * **AdSense en est exclu par construction**, pas par un filtre : ses revenus ne sont
   * pas des `revenue_entries` mais des métriques quotidiennes (contrainte 4), et
   * n'apparaissent donc jamais dans cette liste. C'est aussi ce qui rend le chiffre
   * comparable aux gains par plateforme de l'onglet Plateformes.
   */
  const affiliate = useMemo(() => {
    const rows = revenues.filter((entry) => entry.categoryId === AFFILIATE_CATEGORY_ID);
    return {
      totalCents: rows.reduce((sum, entry) => sum + entry.amountCents, 0),
      count: rows.length,
      /** Ce qui n'est rattaché à aucune plateforme : le reste à documenter. */
      unlinked: rows.filter((entry) => entry.platformId === null).length,
    };
  }, [revenues]);

  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
      <StatCard
        label="Produits attendus"
        value={formatNumber(pipeline.productsPending)}
        hint={
          pipeline.productsLate > 0
            ? `${pipeline.productsLate} en retard · toutes périodes`
            : 'aucun retard · toutes périodes'
        }
        icon={<PackageOpen className="h-4 w-4" />}
        accent={pipeline.productsLate > 0 ? 'var(--negative)' : undefined}
      />
      <StatCard
        label={NATURE_LABELS.in_kind}
        value={formatMoney(pipeline.productsReceivedCents)}
        hint={`${pipeline.productsReceived} produit(s) reçu(s) sur la période`}
        icon={<Gift className="h-4 w-4" />}
        accent={pipeline.productsReceivedCents > 0 ? 'var(--in-kind)' : undefined}
      />
      <StatCard
        label="Sponsos à encaisser"
        value={formatMoney(pipeline.sponsorshipsPendingCents)}
        hint={`${pipeline.sponsorshipsPending} sponso(s) non encaissée(s) · toutes périodes`}
        icon={<Handshake className="h-4 w-4" />}
      />
      <StatCard
        label="Sponsos encaissées"
        value={formatMoney(pipeline.sponsorshipsPaidCents)}
        hint={`${pipeline.sponsorshipsPaid} sponso(s) payée(s) sur la période`}
        icon={<Wallet className="h-4 w-4" />}
        accent={pipeline.sponsorshipsPaidCents > 0 ? 'var(--positive)' : undefined}
      />
      <StatCard
        label="Total affiliations"
        value={formatMoney(affiliate.totalCents)}
        hint={
          affiliate.unlinked > 0
            ? `${affiliate.count} revenu(s) sur la période · ${affiliate.unlinked} sans plateforme`
            : `${affiliate.count} revenu(s) sur la période · hors AdSense`
        }
        icon={<Link2 className="h-4 w-4" />}
        accent={affiliate.totalCents > 0 ? 'var(--positive)' : undefined}
      />
    </div>
  );
};
