import type { ReactNode } from 'react';
import { Check, Plus } from 'lucide-react';
import {
  useAddWidget,
  useDashboardWidgets,
  useRemoveWidget,
} from '../../application/dashboard/usecases/useDashboard.ts';
import { cn } from '../../shared/cn.ts';
import { useWidgetOverrides } from './widgetContext.ts';

interface AddToDashboardButtonProps {
  blockId: string;
  /** Largeur donnée au bloc à l'ajout, sur une grille de 6. */
  width: number;
  /** Nom du bloc, pour l'infobulle et les lecteurs d'écran. */
  label: string;
  className?: string;
}

/**
 * L'interrupteur « sur le dashboard / pas sur le dashboard » d'un bloc.
 *
 * **Un interrupteur et non un simple ajout** : un bloc ne figure qu'une fois sur le
 * dashboard (unicité côté API), et l'icône cochée dit qu'il y est déjà — recliquer l'en
 * retire. Sans cet état, on l'ajouterait deux fois sans le savoir, ou on ne saurait plus
 * lequel des quarante blocs de l'app y est.
 *
 * Invisible sur le dashboard lui-même (`WidgetContext` posé) : on y retire un bloc en mode
 * édition, pas depuis le bloc.
 */
export const AddToDashboardButton = ({
  blockId,
  width,
  label,
  className,
}: AddToDashboardButtonProps) => {
  const onDashboard = useWidgetOverrides() !== null;
  const { data: widgets } = useDashboardWidgets();
  const add = useAddWidget();
  const remove = useRemoveWidget();

  if (onDashboard) return null;

  const existing = widgets?.find((widget) => widget.blockId === blockId);
  const present = existing !== undefined;

  return (
    <button
      type="button"
      // Le bloc peut être un lien ou déplier un panneau au survol : le clic s'arrête ici.
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (existing) {
          // Un ajout encore en vol n'a pas d'identifiant réel à supprimer.
          if (!existing.id.startsWith('pending:')) remove.mutate(existing.id);
        } else {
          add.mutate({ blockId, width });
        }
      }}
      onPointerDown={(event) => event.stopPropagation()}
      title={present ? `Retirer « ${label} » du dashboard` : `Ajouter « ${label} » au dashboard`}
      aria-label={
        present ? `Retirer « ${label} » du dashboard` : `Ajouter « ${label} » au dashboard`
      }
      aria-pressed={present}
      className={cn(
        'flex h-6 w-6 items-center justify-center rounded-full border shadow-sm transition-colors',
        present
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
        className,
      )}
    >
      {present ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
    </button>
  );
};

/**
 * Enveloppe un bloc de sa page d'origine et fait apparaître, **au survol**, l'icône qui
 * l'ajoute au dashboard — dans le coin haut droit, à cheval sur le bord pour ne masquer ni
 * l'icône d'une carte ni le bouton d'un en-tête.
 *
 * L'enveloppe prend la place du bloc dans sa grille et lui transmet sa hauteur : sans ça,
 * les cartes d'une même rangée cesseraient d'avoir la même taille.
 *
 * Le bouton reste visible tant que le bloc est sur le dashboard (coché) : c'est ce qui dit
 * d'un coup d'œil, sur une page, quels blocs y figurent déjà. Sur écran tactile, il n'y a
 * pas de survol ; il apparaît dès qu'on touche un élément focalisable du bloc.
 */
export const Addable = ({
  blockId,
  width,
  label,
  children,
  className,
}: AddToDashboardButtonProps & { children: ReactNode }) => {
  const onDashboard = useWidgetOverrides() !== null;
  const { data: widgets } = useDashboardWidgets();
  if (onDashboard) return <>{children}</>;

  const present = widgets?.some((widget) => widget.blockId === blockId) ?? false;

  return (
    <div className={cn('group/add relative min-w-0 [&>*:first-child]:h-full', className)}>
      {children}
      <AddToDashboardButton
        blockId={blockId}
        width={width}
        label={label}
        className={cn(
          'absolute -right-2 -top-2 z-20 transition-opacity',
          present
            ? 'opacity-70 hover:opacity-100'
            : 'opacity-0 focus-visible:opacity-100 group-focus-within/add:opacity-100 group-hover/add:opacity-100',
        )}
      />
    </div>
  );
};
