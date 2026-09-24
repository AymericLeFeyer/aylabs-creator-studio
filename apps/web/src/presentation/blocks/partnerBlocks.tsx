import { useMemo } from 'react';
import {
  BellRing,
  Clapperboard,
  Gift,
  Hammer,
  Handshake,
  Layers,
  Link2,
  PackageOpen,
  Trophy,
  Truck,
  Unlink,
  Wallet,
} from 'lucide-react';
import { usePlatforms } from '../../application/affiliate/usecases/usePlatforms.ts';
import { useRevenues } from '../../application/revenue/usecases/useRevenues.ts';
import { AFFILIATE_CATEGORY_ID, NATURE_LABELS } from '../../domain/category/entities/Category.ts';
import { PENDING_PRODUCT_STATUSES } from '../../domain/product/entities/Product.ts';
import { productIsOutstanding } from '../../domain/partner/services/pipeline.ts';
import { formatNumber, toIsoDate } from '../../shared/format.ts';
import { useFilters } from '../hooks/useFilters.tsx';
import { usePrivacy } from '../hooks/usePrivacy.tsx';
import { StatCard } from '../components/StatCard.tsx';
import { usePipeline } from './blockData.ts';

/**
 * Les cartes des partenariats. Deux natures, et le sous-titre dit laquelle : les **états**
 * (attendus, à encaisser, à livrer) ignorent la période — un colis attendu depuis mars
 * l'est toujours en juin —, les **flux** (reçus, encaissés) la suivent.
 */

// --- Produits -------------------------------------------------------------------------

export const ProductsPendingCard = () => {
  const { products, pipeline } = usePipeline();
  const shipped = products.filter((product) => product.status === 'shipped').length;
  return (
    <StatCard
      label="Produits attendus"
      value={formatNumber(pipeline.productsPending)}
      hint={
        pipeline.productsLate > 0
          ? `${pipeline.productsLate} en retard · toutes périodes`
          : `${shipped} expédié(s) · toutes périodes`
      }
      icon={<PackageOpen className="h-4 w-4" />}
      accent={pipeline.productsLate > 0 ? 'var(--negative)' : undefined}
    />
  );
};

export const ProductsPendingValueCard = () => {
  const privacy = usePrivacy();
  const { products } = usePipeline();
  const cents = products
    .filter((product) => PENDING_PRODUCT_STATUSES.includes(product.status))
    .reduce((total, product) => total + product.valueCents, 0);
  return (
    <StatCard
      label="Valeur attendue"
      value={privacy.money(cents, 'inKind')}
      hint="pas encore arrivée, donc pas encore comptée"
      icon={<Truck className="h-4 w-4" />}
    />
  );
};

export const ProductsReceivedCard = () => {
  const privacy = usePrivacy();
  const { pipeline } = usePipeline();
  return (
    <StatCard
      label={`${NATURE_LABELS.in_kind} sur la période`}
      value={privacy.money(pipeline.productsReceivedCents, 'inKind')}
      hint={`${pipeline.productsReceived} produit(s) reçu(s)`}
      icon={<Gift className="h-4 w-4" />}
      accent={pipeline.productsReceivedCents > 0 ? 'var(--in-kind)' : undefined}
    />
  );
};

/** Arrivés, mais la vidéo n'est pas en ligne : c'est le travail qui attend. */
export const ProductsToShootCard = () => {
  const { products } = usePipeline();
  const count = products.filter(productIsOutstanding).length;
  return (
    <StatCard
      label="À tourner"
      value={formatNumber(count)}
      hint="reçus, vidéo pas encore publiée"
      icon={<Clapperboard className="h-4 w-4" />}
      accent={count > 0 ? 'var(--expense)' : undefined}
    />
  );
};

// --- Sponsors -------------------------------------------------------------------------

export const SponsorsAwaitingCard = () => {
  const privacy = usePrivacy();
  const { sponsorships } = usePipeline();
  const awaiting = sponsorships.filter((item) => item.status === 'awaiting_payment');
  const cents = awaiting.reduce((total, item) => total + item.amountCents, 0);
  return (
    <StatCard
      label="Paiements en attente"
      value={formatNumber(awaiting.length)}
      hint={`${privacy.money(cents, 'sponsorships')} dus · vidéo livrée`}
      icon={<BellRing className="h-4 w-4" />}
      accent={awaiting.length > 0 ? 'var(--negative)' : undefined}
    />
  );
};

export const SponsorsToDeliverCard = () => {
  const { sponsorships } = usePipeline();
  const stats = useMemo(() => {
    const today = toIsoDate(new Date());
    const toDeliver = sponsorships.filter(
      (item) => item.status === 'todo' || item.status === 'in_progress',
    );
    return {
      count: toDeliver.length,
      late: toDeliver.filter((item) => item.deadline !== null && item.deadline < today).length,
      inDiscussion: sponsorships.filter((item) => item.status === 'discussion').length,
    };
  }, [sponsorships]);
  return (
    <StatCard
      label="À livrer"
      value={formatNumber(stats.count)}
      hint={
        stats.late > 0
          ? `${stats.late} échéance(s) dépassée(s)`
          : `${stats.inDiscussion} en discussion`
      }
      icon={<Hammer className="h-4 w-4" />}
      accent={stats.late > 0 ? 'var(--negative)' : undefined}
    />
  );
};

export const SponsorsPendingCard = () => {
  const privacy = usePrivacy();
  const { pipeline } = usePipeline();
  return (
    <StatCard
      label="Sponsos à encaisser"
      value={privacy.money(pipeline.sponsorshipsPendingCents, 'sponsorships')}
      hint={`${pipeline.sponsorshipsPending} sponso(s) non encaissée(s) · toutes périodes`}
      icon={<Handshake className="h-4 w-4" />}
      accent={pipeline.sponsorshipsPendingCents > 0 ? 'var(--positive)' : undefined}
    />
  );
};

export const SponsorsPaidCard = () => {
  const privacy = usePrivacy();
  const { pipeline } = usePipeline();
  return (
    <StatCard
      label="Encaissées sur la période"
      value={privacy.money(pipeline.sponsorshipsPaidCents, 'sponsorships')}
      hint={`${pipeline.sponsorshipsPaid} sponso(s) payée(s)`}
      icon={<Wallet className="h-4 w-4" />}
      accent={pipeline.sponsorshipsPaidCents > 0 ? 'var(--positive)' : undefined}
    />
  );
};

// --- Plateformes d'affiliation --------------------------------------------------------

/** Mêmes paramètres que `PlatformsPanel` : la requête est partagée, pas dupliquée. */
const usePlatformStats = () => {
  const filters = useFilters();
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
  return useMemo(() => {
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
};

export const AffiliationTotalCard = () => {
  const privacy = usePrivacy();
  const stats = usePlatformStats();
  return (
    <StatCard
      label="Total affiliations"
      value={privacy.money(stats.totalCents, 'affiliation')}
      hint={`${stats.count} revenu(s) sur la période · hors AdSense`}
      icon={<Link2 className="h-4 w-4" />}
      accent={stats.totalCents > 0 ? 'var(--positive)' : undefined}
    />
  );
};

export const AffiliationUnlinkedCard = () => {
  const stats = usePlatformStats();
  return (
    <StatCard
      label="Sans plateforme"
      value={formatNumber(stats.unlinked)}
      hint="revenus d'affiliation à rattacher"
      icon={<Unlink className="h-4 w-4" />}
      accent={stats.unlinked > 0 ? 'var(--expense)' : undefined}
    />
  );
};

export const AffiliationBestCard = () => {
  const privacy = usePrivacy();
  const stats = usePlatformStats();
  return (
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
  );
};

export const AffiliationPlatformsCard = () => {
  const stats = usePlatformStats();
  return (
    <StatCard
      label="Plateformes suivies"
      value={formatNumber(stats.active)}
      hint={stats.archived > 0 ? `${stats.archived} archivée(s)` : 'aucune archivée'}
      icon={<Layers className="h-4 w-4" />}
    />
  );
};
