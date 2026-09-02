import { Gift, Handshake, PackageOpen, Wallet } from 'lucide-react';
import type { PartnerPipeline } from '../../../domain/partner/services/pipeline.ts';
import { NATURE_LABELS } from '../../../domain/category/entities/Category.ts';
import { formatMoney, formatNumber } from '../../../shared/format.ts';
import { StatCard } from '../StatCard.tsx';

/**
 * Les quatre chiffres du pipeline de partenariats, dans la même carte que le dashboard.
 *
 * Ils ne suivent **pas** la période : ce sont des états, pas des flux, et le sous-titre
 * le dit pour qu'on ne les lise pas comme un cumul. Les réutiliser ici plutôt que
 * d'inventer un autre résumé garantit que les deux écrans annoncent le même montant à
 * encaisser.
 */
export const PartnerStatCards = ({ pipeline }: { pipeline: PartnerPipeline }) => (
  <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
    <StatCard
      label="Produits attendus"
      value={formatNumber(pipeline.productsPending)}
      hint={pipeline.productsLate > 0 ? `${pipeline.productsLate} en retard` : 'aucun retard'}
      icon={<PackageOpen className="h-4 w-4" />}
      accent={pipeline.productsLate > 0 ? 'var(--negative)' : undefined}
    />
    <StatCard
      label={NATURE_LABELS.in_kind}
      value={formatMoney(pipeline.productsReceivedCents)}
      hint={`${pipeline.productsReceived} produit(s) reçu(s)`}
      icon={<Gift className="h-4 w-4" />}
      accent={pipeline.productsReceivedCents > 0 ? 'var(--in-kind)' : undefined}
    />
    <StatCard
      label="Sponsos en cours"
      value={formatMoney(pipeline.sponsorshipsPendingCents)}
      hint={`${pipeline.sponsorshipsPending} en attente de paiement`}
      icon={<Handshake className="h-4 w-4" />}
    />
    <StatCard
      label="Sponsos encaissées"
      value={formatMoney(pipeline.sponsorshipsPaidCents)}
      hint={`${pipeline.sponsorshipsPaid} sponso(s) payée(s)`}
      icon={<Wallet className="h-4 w-4" />}
      accent={pipeline.sponsorshipsPaidCents > 0 ? 'var(--positive)' : undefined}
    />
  </div>
);
