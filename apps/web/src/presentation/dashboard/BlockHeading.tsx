import type { ReactNode } from 'react';
import { cn } from '../../shared/cn.ts';
import { useWidgetOverrides } from './widgetContext.ts';

interface BlockHeadingProps {
  /** Titre d'origine. Absent : rien ne s'affiche tant qu'aucune retouche n'en pose un. */
  title?: ReactNode;
  description?: ReactNode;
  /** Ce qui suit le titre sur la même ligne (un total, un bouton). */
  aside?: ReactNode;
  className?: string;
  titleClassName?: string;
}

/**
 * L'en-tête d'un bloc (graphique, tableau, liste) : titre, sous-titre, et les retouches du
 * dashboard quand le bloc y est posé (`WidgetContext`).
 *
 * Un bloc qui n'a pas de titre sur sa page (un carrousel, un graphique à onglets) monte
 * quand même le composant sans `title` : il n'affiche rien, sauf si on lui en donne un
 * depuis le dashboard.
 */
export const BlockHeading = ({
  title: originalTitle,
  description: originalDescription,
  aside,
  className,
  titleClassName,
}: BlockHeadingProps) => {
  const overrides = useWidgetOverrides();
  const title = overrides?.title ?? originalTitle;
  const description = overrides?.description ?? originalDescription;
  const Icon = overrides?.icon;

  if (!title && !description && !aside) return null;

  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-2', className)}>
      <div className="min-w-0">
        {title && (
          <h3 className={cn('flex items-center gap-2 text-sm font-semibold', titleClassName)}>
            {Icon && <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />}
            {title}
          </h3>
        )}
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {aside}
    </div>
  );
};
