import { Link } from 'react-router-dom';
import { AlertTriangle, Clock, Gift, Handshake, Pause } from 'lucide-react';
import type {
  ProductionAlert,
  ProductionAlertKind,
} from '../../../domain/production/entities/ProductionOverview.ts';
import { formatDate } from '../../../shared/format.ts';
import { Card } from '../ui/card.tsx';
import { cn } from '../../../shared/cn.ts';

const ICONS: Record<ProductionAlertKind, typeof AlertTriangle> = {
  product_late: Gift,
  sponsorship_due: Handshake,
  sponsorship_undelivered: Clock,
  production_stalled: Pause,
};

/** Où mène le clic sur une alerte : là où on peut la traiter. */
const target = (alert: ProductionAlert): string => {
  if (alert.productionId) return `/production/${alert.productionId}`;
  return alert.productId ? '/partenariats?onglet=produits' : '/partenariats?onglet=sponsors';
};

/**
 * Ce qui cloche, en tête de l'écran de production.
 *
 * La sévérité et l'ordre viennent de l'API : la règle qui décide qu'une échéance est
 * « en retard » ou « proche » n'existe qu'à un seul endroit, et le front ne fait que
 * l'afficher. Un maximum de cinq alertes est montré — au-delà, la liste cesse d'être
 * une alerte pour devenir un tableau qu'on ne lit plus.
 */
export const AlertsBanner = ({ alerts }: { alerts: ProductionAlert[] }) => {
  if (alerts.length === 0) return null;

  const shown = alerts.slice(0, 5);
  const hidden = alerts.length - shown.length;

  return (
    <Card className="divide-y divide-border overflow-hidden">
      {shown.map((alert, index) => {
        const Icon = ICONS[alert.kind];
        const danger = alert.severity === 'danger';
        return (
          <Link
            key={`${alert.kind}-${alert.productId ?? alert.sponsorshipId ?? alert.productionId ?? index}`}
            to={target(alert)}
            className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-muted/60"
          >
            <span
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                danger
                  ? 'bg-[var(--negative)]/15 text-[var(--negative)]'
                  : 'bg-[var(--expense)]/15 text-[var(--expense)]',
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{alert.title}</span>
              <span className="block truncate text-xs text-muted-foreground">{alert.detail}</span>
            </span>
            {alert.date && (
              <span className="shrink-0 text-xs tabular text-muted-foreground">
                {formatDate(alert.date)}
              </span>
            )}
          </Link>
        );
      })}

      {hidden > 0 && (
        <p className="px-4 py-2 text-xs text-muted-foreground">
          et {hidden} autre(s) point(s) à traiter.
        </p>
      )}
    </Card>
  );
};
