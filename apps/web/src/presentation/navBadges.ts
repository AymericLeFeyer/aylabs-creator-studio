import {
  AlertTriangle,
  CalendarClock,
  Clock,
  Gift,
  Handshake,
  ListChecks,
  Pause,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type {
  ProductionAlert,
  ProductionAlertKind,
  ProductionOverview,
} from '../domain/production/entities/ProductionOverview.ts';
import { FORMAT_ROUTES, PRODUCTION_FORMATS } from '../domain/production/entities/Production.ts';
import type { LegalAlert } from '../domain/legal/entities/Legal.ts';
import { formatMonth } from '../domain/legal/entities/Legal.ts';

/**
 * Les pastilles du menu : ce qui remplace les bandeaux d'alertes du dashboard.
 *
 * Les alertes vivaient en bloc sur le dashboard, tous sujets mêlés — un produit en retard
 * à côté d'une déclaration d'Urssaf à côté d'une vidéo en pause. Elles sont désormais
 * **rangées dans le menu qui permet de les traiter**, et chaque menu concerné porte une
 * pastille. On voit d'où vient le problème avant de l'ouvrir, et l'écran ouvert redit en
 * tête **pourquoi** (`PageAlerts`), avec les mêmes lignes.
 *
 * Le calcul des alertes reste côté API (`GetProductionOverview`, `GetLegalOverview`) : ce
 * fichier ne fait que les **ranger**. Aucune règle d'échéance n'y est réécrite.
 *
 * **Le chiffre et la couleur ne disent pas la même chose**, et c'est voulu :
 *
 * | Menu             | Chiffre                        | Couleur                          |
 * | ---------------- | ------------------------------ | -------------------------------- |
 * | Vidéos, Shorts   | vidéos pas encore publiées     | rouge si une sortie est en péril |
 * | Produits         | produits en retard ou attendus | la pire alerte                   |
 * | Sponsors         | paiements en attente           | la pire alerte                   |
 * | Légal            | obligations à faire            | la pire alerte                   |
 *
 * Sans aucune alerte, la pastille des files reste **neutre** : « 4 en cours » est une
 * information, pas un problème.
 */

export type BadgeTone = 'neutral' | 'warning' | 'danger';

/** Une ligne qui explique la pastille — sur le menu comme en tête de l'écran. */
export interface BadgeReason {
  key: string;
  severity: 'danger' | 'warning';
  title: string;
  detail: string;
  date: string | null;
  /** Là où on la traite. */
  to: string;
  icon: LucideIcon;
}

export interface NavBadge {
  /** Le nombre affiché. À zéro, la pastille devient un point s'il reste des raisons. */
  count: number;
  tone: BadgeTone;
  reasons: BadgeReason[];
}

const ICONS: Record<ProductionAlertKind, LucideIcon> = {
  product_late: Gift,
  sponsorship_due: Handshake,
  sponsorship_undelivered: Clock,
  sponsorship_awaiting_payment: Wallet,
  production_stalled: Pause,
  production_urgent: AlertTriangle,
  production_incomplete: ListChecks,
};

const PRODUCTION_KINDS: ProductionAlertKind[] = [
  'production_urgent',
  'production_stalled',
  'production_incomplete',
];

const SPONSOR_KINDS: ProductionAlertKind[] = [
  'sponsorship_due',
  'sponsorship_undelivered',
  'sponsorship_awaiting_payment',
];

/**
 * Où mène le clic sur une alerte : là où on peut la traiter.
 *
 * Une échéance de produit ou de sponso rattachée à une vidéo se règle sur la fiche de la
 * vidéo (c'est là qu'est le travail) ; un paiement en attente, lui, se relance depuis la
 * table des sponsors.
 */
const alertTarget = (alert: ProductionAlert): string => {
  if (alert.kind === 'sponsorship_awaiting_payment') return '/sponsors';
  if (alert.productionId) return `/production/${alert.productionId}`;
  return alert.kind === 'product_late' ? '/produits' : '/sponsors';
};

const fromProductionAlert = (alert: ProductionAlert, index: number): BadgeReason => ({
  key: `${alert.kind}-${alert.productId ?? alert.sponsorshipId ?? alert.productionId ?? index}`,
  severity: alert.severity,
  title: alert.title,
  detail: alert.detail,
  date: alert.date,
  to: alertTarget(alert),
  icon: ICONS[alert.kind],
});

const fromLegalAlert = (alert: LegalAlert): BadgeReason => ({
  key: `${alert.obligationId}-${alert.month}`,
  severity: alert.severity,
  title: alert.label,
  detail: `${formatMonth(alert.month)} · ${alert.severity === 'danger' ? 'échéance dépassée' : 'à faire bientôt'}`,
  date: alert.dueDate,
  to: `/legal?annee=${alert.month.slice(0, 4)}`,
  icon: alert.severity === 'danger' ? AlertTriangle : CalendarClock,
});

/** La pire sévérité l'emporte : une seule alerte rouge suffit à colorer la pastille. */
const toneOf = (reasons: BadgeReason[]): BadgeTone => {
  if (reasons.some((reason) => reason.severity === 'danger')) return 'danger';
  return reasons.length > 0 ? 'warning' : 'neutral';
};

const badge = (count: number, reasons: BadgeReason[]): NavBadge => ({
  count,
  tone: toneOf(reasons),
  reasons,
});

/** Les pastilles de chaque menu, indexées par l'adresse de l'entrée (`NavItem.to`). */
export const buildNavBadges = (
  overview: ProductionOverview | undefined,
  legalAlerts: LegalAlert[] | undefined,
): Record<string, NavBadge> => {
  const badges: Record<string, NavBadge> = {};

  if (overview) {
    const reasonsOf = (keep: (alert: ProductionAlert) => boolean) =>
      overview.alerts.filter(keep).map(fromProductionAlert);

    for (const format of PRODUCTION_FORMATS) {
      badges[FORMAT_ROUTES[format]] = badge(
        overview.queue.filter((production) => production.format === format).length,
        reasonsOf(
          (alert) => PRODUCTION_KINDS.includes(alert.kind) && alert.productionFormat === format,
        ),
      );
    }

    const products = reasonsOf((alert) => alert.kind === 'product_late');
    badges['/produits'] = badge(products.length, products);

    badges['/sponsors'] = badge(
      overview.alerts.filter((alert) => alert.kind === 'sponsorship_awaiting_payment').length,
      reasonsOf((alert) => SPONSOR_KINDS.includes(alert.kind)),
    );
  }

  if (legalAlerts) {
    const legal = legalAlerts.map(fromLegalAlert);
    badges['/legal'] = badge(legal.length, legal);
  }

  return badges;
};
