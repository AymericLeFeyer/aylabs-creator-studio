import type { BadgeTone, NavBadge } from '../navBadges.ts';
import { cn } from '../../shared/cn.ts';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-muted-foreground/15 text-muted-foreground',
  warning: 'bg-[var(--expense)] text-white',
  danger: 'bg-[var(--negative)] text-white',
};

/**
 * La pastille d'une entrée de menu.
 *
 * Un nombre quand il y a quelque chose à compter, un **point** quand le compte est nul
 * mais qu'une alerte reste à lire (une vidéo publiée incomplète alors que la file est
 * vide) — une pastille « 0 » se lirait comme « rien à faire », l'inverse de ce qu'elle
 * voudrait dire. Rien du tout sinon.
 *
 * `dot` force le point : la barre repliée et les onglets du bas n'ont pas la place d'un
 * nombre à côté de l'icône.
 */
export const NavBadgePill = ({
  badge,
  dot = false,
  className,
}: {
  badge: NavBadge | undefined;
  dot?: boolean;
  className?: string;
}) => {
  if (!badge || (badge.count === 0 && badge.reasons.length === 0)) return null;

  const label =
    badge.reasons.length > 0
      ? `${badge.reasons.length} point(s) à traiter`
      : `${badge.count} en cours`;

  if (dot || badge.count === 0) {
    return (
      <span
        className={cn(
          'h-2 w-2 shrink-0 rounded-full',
          badge.tone === 'neutral' ? 'bg-muted-foreground/60' : TONES[badge.tone],
          className,
        )}
        title={label}
        aria-label={label}
      />
    );
  }

  return (
    <span
      className={cn(
        'flex h-[1.125rem] min-w-[1.125rem] shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular leading-none',
        TONES[badge.tone],
        className,
      )}
      title={label}
      aria-label={label}
    >
      {badge.count > 99 ? '99+' : badge.count}
    </span>
  );
};
