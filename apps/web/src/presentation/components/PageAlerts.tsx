import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useNavBadges } from '../hooks/useNavBadges.ts';
import { formatDate } from '../../shared/format.ts';
import { Card } from './ui/card.tsx';
import { cn } from '../../shared/cn.ts';

/** Au-delà, la liste se replie : elle doit rester un avertissement, pas un tableau. */
const COLLAPSED_COUNT = 5;

/**
 * Pourquoi ce menu porte une pastille — en tête de l'écran qu'elle désigne.
 *
 * C'est l'autre moitié du système de pastilles : une pastille rouge dans le menu dit
 * « il y a un problème ici », et l'écran ouvert doit dire **lequel** avant tout le reste.
 * Les lignes sont exactement celles qui ont allumé la pastille (`useNavBadges`), si bien
 * que les deux ne peuvent pas se contredire.
 *
 * `path` est l'adresse de l'entrée de menu (`NavItem.to`), pas celle de la page : c'est
 * ce qui permet à un écran monté sous plusieurs adresses de viser la bonne pastille.
 */
export const PageAlerts = ({ path }: { path: string }) => {
  const reasons = useNavBadges()[path]?.reasons ?? [];
  const [expanded, setExpanded] = useState(false);

  if (reasons.length === 0) return null;

  const shown = expanded ? reasons : reasons.slice(0, COLLAPSED_COUNT);
  const hidden = reasons.length - shown.length;

  return (
    <Card className="divide-y divide-border overflow-hidden">
      {shown.map((reason) => {
        const Icon = reason.icon;
        const danger = reason.severity === 'danger';
        return (
          <Link
            key={reason.key}
            to={reason.to}
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
              <span className="block truncate font-medium">{reason.title}</span>
              <span className="block truncate text-xs text-muted-foreground">{reason.detail}</span>
            </span>
            {reason.date && (
              <span className="shrink-0 text-xs tabular text-muted-foreground">
                {formatDate(reason.date)}
              </span>
            )}
          </Link>
        );
      })}

      {(hidden > 0 || expanded) && reasons.length > COLLAPSED_COUNT && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="w-full px-4 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          {expanded ? 'Replier' : `et ${hidden} autre(s) point(s) à traiter — tout afficher`}
        </button>
      )}
    </Card>
  );
};
