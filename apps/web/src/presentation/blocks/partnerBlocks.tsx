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
import {
  PENDING_PRODUCT_STATUSES,
  PRODUCT_STATUS_LABELS,
  type Product,
} from '../../domain/product/entities/Product.ts';
import {
  PENDING_SPONSORSHIP_STATUSES,
  SPONSORSHIP_SORT_RANK,
  SPONSORSHIP_STATUS_LABELS,
  type Sponsorship,
} from '../../domain/sponsorship/entities/Sponsorship.ts';
import {
  productIsOutstanding,
  productInPeriod,
  sponsorshipInPeriod,
} from '../../domain/partner/services/pipeline.ts';
import { formatDate, formatNumber, toIsoDate } from '../../shared/format.ts';
import { useFilters } from '../hooks/useFilters.tsx';
import { usePrivacy } from '../hooks/usePrivacy.tsx';
import { StatCard } from '../components/StatCard.tsx';
import { StatDetails, type DetailRow } from '../components/StatDetails.tsx';
import { usePipeline } from './blockData.ts';

/**
 * Les cartes des partenariats. Deux natures, et le sous-titre dit laquelle : les **états**
 * (attendus, à encaisser, à livrer) ignorent la période — un colis attendu depuis mars
 * l'est toujours en juin —, les **flux** (reçus, encaissés) la suivent.
 *
 * Chaque carte déplie **la liste des lignes qu'elle compte** : « 3 paiements en attente »
 * ne dit pas lesquels, et c'est précisément ce qu'on veut savoir pour relancer.
 */

type Privacy = ReturnType<typeof usePrivacy>;

const today = () => toIsoDate(new Date());

const joined = (...parts: Array<string | null | undefined | false>) =>
  parts.filter(Boolean).join(' · ');

/** La vidéo visée, telle que la colonne « Vidéo » des tables la dit. */
const videoOf = (item: { productionTitle: string | null; videoTitle: string | null }) =>
  item.videoTitle ?? item.productionTitle ?? 'aucune vidéo';

const productRow = (product: Product, privacy: Privacy, withDate: 'deadline' | 'received') => {
  const late = withDate === 'deadline' && product.deadline !== null && product.deadline < today();
  return {
    key: product.id,
    label: product.name,
    color: product.brandColor ?? undefined,
    sub: joined(
      product.brandName ?? 'Sans marque',
      PRODUCT_STATUS_LABELS[product.status],
      withDate === 'deadline'
        ? product.deadline && `échéance ${formatDate(product.deadline)}${late ? ' (dépassée)' : ''}`
        : product.receivedAt && `reçu le ${formatDate(product.receivedAt)}`,
    ),
    value: privacy.money(product.valueCents, 'inKind'),
    tone: late ? 'danger' : undefined,
  } satisfies DetailRow;
};

const sponsorRow = (sponsorship: Sponsorship, privacy: Privacy, withDate: 'deadline' | 'paid') => {
  const late =
    withDate === 'deadline' &&
    sponsorship.status !== 'awaiting_payment' &&
    sponsorship.deadline !== null &&
    sponsorship.deadline < today();
  return {
    key: sponsorship.id,
    label: sponsorship.label,
    color: sponsorship.brandColor ?? undefined,
    sub: joined(
      sponsorship.brandName ?? 'Sans marque',
      SPONSORSHIP_STATUS_LABELS[sponsorship.status],
      withDate === 'deadline'
        ? sponsorship.deadline &&
            `échéance ${formatDate(sponsorship.deadline)}${late ? ' (dépassée)' : ''}`
        : sponsorship.paidAt && `payée le ${formatDate(sponsorship.paidAt)}`,
    ),
    value: privacy.money(sponsorship.amountCents, 'sponsorships'),
    tone: sponsorship.status === 'awaiting_payment' || late ? 'danger' : undefined,
  } satisfies DetailRow;
};

/** Échéance la plus proche d'abord, les lignes sans date à la fin. */
const byDeadline = <T extends { deadline: string | null }>(a: T, b: T) =>
  (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999');

const sum = <T,>(items: T[], pick: (item: T) => number) =>
  items.reduce((total, item) => total + pick(item), 0);

// --- Produits -------------------------------------------------------------------------

const usePendingProducts = () => {
  const { products } = usePipeline();
  return useMemo(
    () =>
      products
        .filter((product) => PENDING_PRODUCT_STATUSES.includes(product.status))
        .sort(byDeadline),
    [products],
  );
};

export const ProductsPendingCard = () => {
  const privacy = usePrivacy();
  const { products, pipeline } = usePipeline();
  const pending = usePendingProducts();
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
      details={
        <StatDetails
          title="En discussion, confirmés ou expédiés"
          rows={pending.map((product) => productRow(product, privacy, 'deadline'))}
          empty="Aucun colis attendu."
          note="Un état, pas un flux : un colis attendu depuis des mois compte quelle que soit la période choisie."
        />
      }
    />
  );
};

export const ProductsPendingValueCard = () => {
  const privacy = usePrivacy();
  const pending = usePendingProducts();
  const cents = sum(pending, (product) => product.valueCents);
  return (
    <StatCard
      label="Valeur attendue"
      value={privacy.money(cents, 'inKind')}
      hint="pas encore arrivée, donc pas encore comptée"
      icon={<Truck className="h-4 w-4" />}
      details={
        <StatDetails
          title={`${pending.length} colis attendu(s)`}
          rows={[...pending]
            .sort((a, b) => b.valueCents - a.valueCents)
            .map((product) => productRow(product, privacy, 'deadline'))}
          total={{ label: 'Total', value: privacy.money(cents, 'inKind') }}
          empty="Aucun colis attendu."
          note={`Elle rejoindra « ${NATURE_LABELS.in_kind} » le jour où chaque colis passera à « Reçu ».`}
        />
      }
    />
  );
};

export const ProductsReceivedCard = () => {
  const privacy = usePrivacy();
  const filters = useFilters();
  const { products, pipeline } = usePipeline();
  const received = useMemo(
    () =>
      products
        .filter(
          (product) =>
            product.status === 'received' &&
            productInPeriod(product, { from: filters.from, to: filters.to }),
        )
        .sort((a, b) => (b.receivedAt ?? '').localeCompare(a.receivedAt ?? '')),
    [products, filters.from, filters.to],
  );
  return (
    <StatCard
      label={`${NATURE_LABELS.in_kind} sur la période`}
      value={privacy.money(pipeline.productsReceivedCents, 'inKind')}
      hint={`${pipeline.productsReceived} produit(s) reçu(s)`}
      icon={<Gift className="h-4 w-4" />}
      accent={pipeline.productsReceivedCents > 0 ? 'var(--in-kind)' : undefined}
      details={
        <StatDetails
          title={`Reçus du ${formatDate(filters.from)} au ${formatDate(filters.to)}`}
          rows={received.map((product) => productRow(product, privacy, 'received'))}
          total={{
            label: 'Total',
            value: privacy.money(pipeline.productsReceivedCents, 'inKind'),
          }}
          empty="Aucun produit reçu sur la période."
          note="Comptés à la date de réception. Un produit reçu sans date reste compté partout."
        />
      }
    />
  );
};

/** Arrivés, mais la vidéo n'est pas en ligne : c'est le travail qui attend. */
export const ProductsToShootCard = () => {
  const privacy = usePrivacy();
  const { products } = usePipeline();
  const toShoot = useMemo(
    () =>
      products
        .filter(productIsOutstanding)
        .sort((a, b) => (a.receivedAt ?? '').localeCompare(b.receivedAt ?? '')),
    [products],
  );
  return (
    <StatCard
      label="À tourner"
      value={formatNumber(toShoot.length)}
      hint="reçus, vidéo pas encore publiée"
      icon={<Clapperboard className="h-4 w-4" />}
      accent={toShoot.length > 0 ? 'var(--expense)' : undefined}
      details={
        <StatDetails
          title="Reçus, le plus ancien d'abord"
          rows={toShoot.map((product) => ({
            ...productRow(product, privacy, 'received'),
            sub: joined(
              product.brandName ?? 'Sans marque',
              product.receivedAt && `reçu le ${formatDate(product.receivedAt)}`,
              product.productionTitle ? `pour « ${product.productionTitle} »` : 'aucune vidéo',
            ),
          }))}
          empty="Rien à tourner : tous les produits reçus ont leur vidéo."
          note="Une vidéo rattachée mais pas encore terminée compte comme à tourner."
        />
      }
    />
  );
};

// --- Sponsors -------------------------------------------------------------------------

export const SponsorsAwaitingCard = () => {
  const privacy = usePrivacy();
  const { sponsorships } = usePipeline();
  const awaiting = useMemo(
    () => sponsorships.filter((item) => item.status === 'awaiting_payment').sort(byDeadline),
    [sponsorships],
  );
  const cents = sum(awaiting, (item) => item.amountCents);
  return (
    <StatCard
      label="Paiements en attente"
      value={formatNumber(awaiting.length)}
      hint={`${privacy.money(cents, 'sponsorships')} dus · vidéo livrée`}
      icon={<BellRing className="h-4 w-4" />}
      accent={awaiting.length > 0 ? 'var(--negative)' : undefined}
      details={
        <StatDetails
          title="Vidéo livrée, argent dû : à relancer"
          rows={awaiting.map((item) => ({
            ...sponsorRow(item, privacy, 'deadline'),
            sub: joined(
              item.brandName ?? 'Sans marque',
              videoOf(item),
              item.deadline && `livraison prévue le ${formatDate(item.deadline)}`,
            ),
          }))}
          total={{ label: 'Total dû', value: privacy.money(cents, 'sponsorships') }}
          empty="Aucun paiement en attente."
          note="Passer une sponso à « Payée » crée son revenu dans le chiffre d'affaires."
        />
      }
    />
  );
};

export const SponsorsToDeliverCard = () => {
  const privacy = usePrivacy();
  const { sponsorships } = usePipeline();
  const stats = useMemo(() => {
    const now = today();
    const toDeliver = sponsorships
      .filter((item) => item.status === 'todo' || item.status === 'in_progress')
      .sort(byDeadline);
    return {
      toDeliver,
      late: toDeliver.filter((item) => item.deadline !== null && item.deadline < now).length,
      inDiscussion: sponsorships.filter((item) => item.status === 'discussion').length,
    };
  }, [sponsorships]);
  return (
    <StatCard
      label="À livrer"
      value={formatNumber(stats.toDeliver.length)}
      hint={
        stats.late > 0
          ? `${stats.late} échéance(s) dépassée(s)`
          : `${stats.inDiscussion} en discussion`
      }
      icon={<Hammer className="h-4 w-4" />}
      accent={stats.late > 0 ? 'var(--negative)' : undefined}
      details={
        <StatDetails
          title="Signées, vidéo à produire — échéance la plus proche d'abord"
          rows={stats.toDeliver.map((item) => ({
            ...sponsorRow(item, privacy, 'deadline'),
            sub: joined(
              item.brandName ?? 'Sans marque',
              SPONSORSHIP_STATUS_LABELS[item.status],
              videoOf(item),
              item.deadline && `échéance ${formatDate(item.deadline)}`,
            ),
          }))}
          empty="Aucune intégration à livrer."
          note={`Statuts « ${SPONSORSHIP_STATUS_LABELS.todo} » et « ${SPONSORSHIP_STATUS_LABELS.in_progress} ». ${stats.inDiscussion} autre(s) en discussion, pas encore signée(s).`}
        />
      }
    />
  );
};

export const SponsorsPendingCard = () => {
  const privacy = usePrivacy();
  const { sponsorships, pipeline } = usePipeline();
  const pending = useMemo(
    () =>
      sponsorships
        .filter((item) => PENDING_SPONSORSHIP_STATUSES.includes(item.status))
        .sort(
          (a, b) =>
            SPONSORSHIP_SORT_RANK[a.status] - SPONSORSHIP_SORT_RANK[b.status] ||
            b.amountCents - a.amountCents,
        ),
    [sponsorships],
  );
  // Le même montant, découpé par statut : « à relancer » et « en discussion » ne sont pas
  // le même argent, l'un est dû, l'autre n'est pas signé.
  const byStatus = PENDING_SPONSORSHIP_STATUSES.map((status) => {
    const items = pending.filter((item) => item.status === status);
    return { status, count: items.length, cents: sum(items, (item) => item.amountCents) };
  }).filter((row) => row.count > 0);
  return (
    <StatCard
      label="Sponsos à encaisser"
      value={privacy.money(pipeline.sponsorshipsPendingCents, 'sponsorships')}
      hint={`${pipeline.sponsorshipsPending} sponso(s) non encaissée(s) · toutes périodes`}
      icon={<Handshake className="h-4 w-4" />}
      accent={pipeline.sponsorshipsPendingCents > 0 ? 'var(--positive)' : undefined}
      details={
        <StatDetails
          title="Par statut"
          rows={byStatus.map((row) => ({
            key: row.status,
            label: SPONSORSHIP_STATUS_LABELS[row.status],
            sub: `${row.count} sponso(s)`,
            value: privacy.money(row.cents, 'sponsorships'),
            tone: row.status === 'awaiting_payment' ? 'danger' : undefined,
          }))}
          total={{
            label: 'Total',
            value: privacy.money(pipeline.sponsorshipsPendingCents, 'sponsorships'),
          }}
          empty="Rien à encaisser."
          note="Tout ce qui n'est ni payé ni annulé, quelle que soit la période : une sponso signée reste à encaisser tant que l'argent n'est pas arrivé."
        >
          {pending.length > 0 && (
            <StatDetails
              rows={pending.map((item) => sponsorRow(item, privacy, 'deadline'))}
              max={5}
            />
          )}
        </StatDetails>
      }
    />
  );
};

export const SponsorsPaidCard = () => {
  const privacy = usePrivacy();
  const filters = useFilters();
  const { sponsorships, pipeline } = usePipeline();
  const paid = useMemo(
    () =>
      sponsorships
        .filter(
          (item) =>
            item.status === 'paid' &&
            sponsorshipInPeriod(item, { from: filters.from, to: filters.to }),
        )
        .sort((a, b) => (b.paidAt ?? '').localeCompare(a.paidAt ?? '')),
    [sponsorships, filters.from, filters.to],
  );
  return (
    <StatCard
      label="Encaissées sur la période"
      value={privacy.money(pipeline.sponsorshipsPaidCents, 'sponsorships')}
      hint={`${pipeline.sponsorshipsPaid} sponso(s) payée(s)`}
      icon={<Wallet className="h-4 w-4" />}
      accent={pipeline.sponsorshipsPaidCents > 0 ? 'var(--positive)' : undefined}
      details={
        <StatDetails
          title={`Payées du ${formatDate(filters.from)} au ${formatDate(filters.to)}`}
          rows={paid.map((item) => sponsorRow(item, privacy, 'paid'))}
          total={{
            label: 'Total',
            value: privacy.money(pipeline.sponsorshipsPaidCents, 'sponsorships'),
          }}
          empty="Aucune sponso encaissée sur la période."
          note="Comptées à la date de paiement. Chacune a son revenu dans le chiffre d'affaires."
        />
      }
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
    const ranked = [...active].sort((a, b) => b.earnedCents - a.earnedCents);
    const best = ranked[0];
    // Recompté depuis les revenus, et non lu dans `earnedCents` : ce dernier ignore le
    // filtre de chaînes, et le détail doit retomber sur le total de la carte.
    const byPlatform = new Map<
      string,
      { name: string; color?: string; cents: number; count: number }
    >();
    for (const entry of rows) {
      const key = entry.platformId ?? '__none__';
      const platform = platforms.find((candidate) => candidate.id === entry.platformId);
      const current = byPlatform.get(key) ?? {
        name: platform?.name ?? entry.platformName ?? 'Sans plateforme',
        color: platform?.color,
        cents: 0,
        count: 0,
      };
      current.cents += entry.amountCents;
      current.count += 1;
      byPlatform.set(key, current);
    }
    return {
      rows,
      totalCents: sum(rows, (entry) => entry.amountCents),
      count: rows.length,
      unlinked: rows.filter((entry) => entry.platformId === null),
      active,
      ranked,
      archived: platforms.length - active.length,
      best: best && best.earnedCents > 0 ? best : null,
      byPlatform: [...byPlatform.entries()]
        .map(([key, value]) => ({ key, ...value }))
        .sort((a, b) => b.cents - a.cents),
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
      details={
        <StatDetails
          title="Par plateforme"
          rows={stats.byPlatform.map((row) => ({
            key: row.key,
            label: row.name,
            color: row.color,
            sub: `${row.count} revenu(s)`,
            value: privacy.money(row.cents, 'affiliation'),
            tone: row.key === '__none__' ? 'warning' : undefined,
          }))}
          total={{ label: 'Total', value: privacy.money(stats.totalCents, 'affiliation') }}
          empty="Aucun revenu d'affiliation sur la période."
          note="Les revenus de la catégorie « Affiliation » saisis sur la période. Domadoo n'y est que si ses gains ont été saisis en revenu."
        />
      }
    />
  );
};

export const AffiliationUnlinkedCard = () => {
  const privacy = usePrivacy();
  const stats = usePlatformStats();
  return (
    <StatCard
      label="Sans plateforme"
      value={formatNumber(stats.unlinked.length)}
      hint="revenus d'affiliation à rattacher"
      icon={<Unlink className="h-4 w-4" />}
      accent={stats.unlinked.length > 0 ? 'var(--expense)' : undefined}
      details={
        <StatDetails
          title="À rattacher depuis le chiffre d'affaires → Revenus"
          rows={stats.unlinked.map((entry) => ({
            key: entry.id,
            label: entry.label,
            sub: formatDate(entry.date),
            value: privacy.money(entry.amountCents, 'affiliation'),
          }))}
          empty="Tout est rattaché."
          note="Sans plateforme, ces revenus ne comptent dans le classement d'aucune."
        />
      }
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
      details={
        <StatDetails
          title="Classement de la période"
          rows={stats.ranked
            .filter((platform) => platform.earnedCents > 0)
            .map((platform, index) => ({
              key: platform.id,
              label: `${index + 1}. ${platform.name}`,
              color: platform.color,
              value: privacy.money(platform.earnedCents, 'affiliation'),
            }))}
          empty="Aucun gain rattaché à une plateforme sur la période."
          note="Toutes chaînes confondues : une plateforme ne se rattache pas à une chaîne."
        />
      }
    />
  );
};

export const AffiliationPlatformsCard = () => {
  const privacy = usePrivacy();
  const stats = usePlatformStats();
  return (
    <StatCard
      label="Plateformes suivies"
      value={formatNumber(stats.active.length)}
      hint={stats.archived > 0 ? `${stats.archived} archivée(s)` : 'aucune archivée'}
      icon={<Layers className="h-4 w-4" />}
      details={
        <StatDetails
          title="Plateformes actives"
          rows={stats.active.map((platform) => ({
            key: platform.id,
            label: platform.name,
            color: platform.color,
            sub: `${privacy.money(platform.totalEarnedCents, 'affiliation')} depuis toujours`,
          }))}
          max={10}
          empty="Aucune plateforme active."
        />
      }
    />
  );
};
