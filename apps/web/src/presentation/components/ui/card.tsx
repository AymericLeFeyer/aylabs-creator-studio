import * as React from 'react';
import { cn } from '../../../shared/cn.ts';
import { useWidgetOverrides } from '../../dashboard/widgetContext.ts';

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('rounded-xl border border-border bg-card text-card-foreground', className)}
      {...props}
    />
  ),
);
Card.displayName = 'Card';

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col gap-1.5 p-5', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

interface CardTitleProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Titre secondaire d'un bloc qui en porte plusieurs (deux graphiques dans un même bloc) :
   * les retouches du dashboard ne s'appliquent qu'au titre principal.
   */
  secondary?: boolean;
}

/**
 * Le titre d'une carte. Posé sur le dashboard (`WidgetContext`), il prend le titre, l'icône
 * et le sous-titre donnés au bloc : c'est ce qui rend n'importe quel panneau renommable
 * sans qu'il ait à connaître le dashboard.
 */
export const CardTitle = React.forwardRef<HTMLDivElement, CardTitleProps>(
  ({ className, secondary, children, ...props }, ref) => {
    const overrides = useWidgetOverrides();
    const active = !secondary && overrides !== null;
    const Icon = active ? overrides.icon : null;
    const title = active && overrides.title !== null ? overrides.title : children;
    const description = active ? overrides.description : null;
    return (
      <div
        ref={ref}
        className={cn('font-semibold leading-none tracking-tight', className)}
        {...props}
      >
        {Icon ? (
          <span className="flex items-center gap-2">
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            {title}
          </span>
        ) : (
          title
        )}
        {description && (
          <span className="mt-1 block text-xs font-normal tracking-normal text-muted-foreground">
            {description}
          </span>
        )}
      </div>
    );
  },
);
CardTitle.displayName = 'CardTitle';

/**
 * Le sous-titre d'une carte. S'efface quand le bloc a reçu un sous-titre sur le dashboard :
 * c'est alors `CardTitle` qui l'affiche, et les deux ne doivent pas se lire l'un sous
 * l'autre.
 */
export const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const overrides = useWidgetOverrides();
  if (overrides?.description != null) return null;
  return <div ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />;
});
CardDescription.displayName = 'CardDescription';

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-5 pt-0', className)} {...props} />
  ),
);
CardContent.displayName = 'CardContent';

export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-5 pt-0', className)} {...props} />
  ),
);
CardFooter.displayName = 'CardFooter';
