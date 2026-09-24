import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Check, Heading, LayoutDashboard, Pencil, Plus } from 'lucide-react';
import {
  useAddWidget,
  useDashboardWidgets,
  useReorderWidgets,
} from '../../application/dashboard/usecases/useDashboard.ts';
import type { DashboardWidget } from '../../domain/dashboard/entities/DashboardWidget.ts';
import { isHeading, newHeadingId } from '../../domain/dashboard/entities/DashboardWidget.ts';
import { SectionHeading } from '../dashboard/SectionHeading.tsx';
import { cn } from '../../shared/cn.ts';
import { AppBarActions, FilterBarActions } from '../hooks/useAppBar.tsx';
import { Button } from '../components/ui/button.tsx';
import { Card } from '../components/ui/card.tsx';
import { BLOCKS } from '../dashboard/registry.tsx';
import { WIDGET_ICONS } from '../dashboard/widgetIcons.ts';
import { WidgetContext, type WidgetOverrides } from '../dashboard/widgetContext.ts';
import { WidgetToolbar } from '../dashboard/WidgetToolbar.tsx';
import { BlockCatalogDialog } from '../dashboard/BlockCatalogDialog.tsx';

/** Les classes écrites en entier : Tailwind ne voit pas une classe composée à l'exécution. */
const LG_SPAN: Record<number, string> = {
  1: 'lg:col-span-1',
  2: 'lg:col-span-2',
  3: 'lg:col-span-3',
  4: 'lg:col-span-4',
  5: 'lg:col-span-5',
  6: 'lg:col-span-6',
};

/**
 * Sur mobile, deux colonnes : un grand chiffre en prend une, tout ce qui occupe au moins
 * la moitié de l'écran large en prend deux — un graphique sur une demi-largeur de
 * téléphone ne se lit plus.
 */
const spanOf = (width: number) =>
  cn(width >= 3 ? 'col-span-2' : 'col-span-1', LG_SPAN[width] ?? LG_SPAN[1]);

/** Près des bords de la fenêtre, la page défile toute seule pendant un glissement. */
const EDGE = 64;
const SCROLL_STEP = 14;

const sameOrder = (widgets: DashboardWidget[], ids: string[]) =>
  widgets.length === ids.length && widgets.every((widget, index) => widget.id === ids[index]);

/**
 * Le tableau de bord **composé** : il part vide, et chaque bloc de l'application peut y
 * être posé depuis sa page (l'icône qui apparaît au survol), sans quitter sa page pour
 * autant. La base est la seule source : les blocs, leur ordre, leur largeur et leurs
 * retouches sont les mêmes sur tous les appareils (`useDashboardWidgets` relit toutes les
 * 15 s et au retour sur l'onglet).
 *
 * **Le crayon passe en édition, et l'édition se fait sur les vrais blocs** : chacun garde
 * ses données et son rendu, surmonté d'une barre (poignée, texte, icône, largeur,
 * retrait). Un bloc se retouche par `WidgetContext`, que `StatCard`, `CardTitle` et
 * `BlockHeading` consultent — personne n'a à savoir qu'il est sur le dashboard.
 *
 * Le glisser-déposer est écrit à la main, comme partout dans l'app (couloirs de
 * publication, planning) : écouteurs sur `window`, cible trouvée par `elementFromPoint`,
 * ordre vivant en ref. Le DnD HTML5 ne marche pas au doigt sur iOS.
 */
export const DashboardPage = () => {
  const { data: widgets = [], isLoading } = useDashboardWidgets();
  const reorder = useReorderWidgets();
  const add = useAddWidget();

  /**
   * Le titre qu'on vient de créer, désigné par son `blockId` — connu avant la réponse, là où
   * son `id` passe de provisoire à réel. Il naît en fin de dashboard, donc souvent hors de
   * l'écran : sans défilement jusqu'à lui ni curseur dans son texte, le bouton paraissait
   * ne rien faire.
   */
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const addHeading = () => {
    const blockId = newHeadingId();
    setJustAdded(blockId);
    add.mutate({ blockId, width: 6, variant: 'h2', title: 'Nouvelle section' });
  };
  const [editing, setEditing] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);

  /** L'ordre affiché pendant et juste après un glissement, avant que le cache ne suive. */
  const [order, setOrder] = useState<string[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const orderRef = useRef<string[] | null>(null);

  // Le cache a rattrapé l'ordre lâché : la version locale n'a plus de raison d'être.
  // Dérivé pendant le rendu, pas dans un effet (`react-hooks/set-state-in-effect`).
  if (order && !dragId && sameOrder(widgets, order)) setOrder(null);

  const shown = useMemo(() => {
    if (!order) return widgets;
    const byId = new Map(widgets.map((widget) => [widget.id, widget]));
    return order
      .map((id) => byId.get(id))
      .filter((widget): widget is DashboardWidget => widget !== undefined);
  }, [widgets, order]);

  const startDrag = (id: string, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const initial = widgets.map((widget) => widget.id);
    orderRef.current = initial;
    setOrder(initial);
    setDragId(id);

    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.clientY < EDGE) window.scrollBy(0, -SCROLL_STEP);
      else if (moveEvent.clientY > window.innerHeight - EDGE) window.scrollBy(0, SCROLL_STEP);

      const target = document
        .elementFromPoint(moveEvent.clientX, moveEvent.clientY)
        ?.closest<HTMLElement>('[data-widget-id]');
      const targetId = target?.dataset.widgetId;
      const current = orderRef.current;
      if (!target || !targetId || targetId === id || !current) return;

      // Moitié gauche : avant la cible ; moitié droite : après. Sur une rangée de grands
      // chiffres comme sur une pile de graphiques pleine largeur, c'est le geste attendu.
      const rect = target.getBoundingClientRect();
      const after =
        rect.width > window.innerWidth * 0.6
          ? moveEvent.clientY > rect.top + rect.height / 2
          : moveEvent.clientX > rect.left + rect.width / 2;
      const without = current.filter((candidate) => candidate !== id);
      const index = without.indexOf(targetId) + (after ? 1 : 0);
      const next = [...without.slice(0, index), id, ...without.slice(index)];
      if (next.join() !== current.join()) {
        orderRef.current = next;
        setOrder(next);
      }
    };

    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      const final = orderRef.current;
      orderRef.current = null;
      setDragId(null);
      if (final && final.join() !== initial.join()) {
        reorder.mutate(final, { onError: () => setOrder(null) });
      } else {
        setOrder(null);
      }
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  const addButtons = (
    <>
      <Button size="sm" variant="outline" onClick={addHeading}>
        <Heading className="h-4 w-4" />
        Ajouter un titre
      </Button>
      <Button size="sm" variant="outline" onClick={() => setCatalogOpen(true)}>
        <Plus className="h-4 w-4" />
        Ajouter des blocs
      </Button>
    </>
  );

  const editButton = (compact: boolean) =>
    editing ? (
      <Button size={compact ? 'icon' : 'sm'} onClick={() => setEditing(false)}>
        <Check className="h-4 w-4" />
        {!compact && 'Terminer'}
      </Button>
    ) : (
      <Button
        size={compact ? 'icon' : 'sm'}
        variant={compact ? 'ghost' : 'outline'}
        onClick={() => setEditing(true)}
        aria-label="Modifier le dashboard"
      >
        <Pencil className="h-4 w-4" />
        {!compact && 'Modifier'}
      </Button>
    );

  return (
    <div className="space-y-4">
      <AppBarActions>{editButton(true)}</AppBarActions>

      {/* Aucune rangée d'en-tête : le crayon — et en édition, les deux ajouts — vivent
          dans la barre de filtres, à côté de « Collecter » (`FilterBarActions`), au large ;
          dans la barre d'application sur mobile. L'en-tête de l'écran est un titre de
          section comme les autres (migration 43). */}
      <FilterBarActions>
        {editing && addButtons}
        {editButton(false)}
      </FilterBarActions>
      {/* Sur mobile, les ajouts restent sous le pouce en défilant : collés sous la barre
          d'application, comme au large où ils vivent dans la barre de filtres collante. */}
      {editing && (
        <div className="sticky top-[var(--app-header)] z-20 -mx-4 flex flex-wrap gap-2 border-b border-border bg-background px-4 py-2 lg:hidden">
          {addButtons}
        </div>
      )}

      {!isLoading && !shown.some((widget) => !isHeading(widget.blockId)) && (
        <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <span className="rounded-full bg-muted p-3 text-muted-foreground">
            <LayoutDashboard className="h-6 w-6" />
          </span>
          <div>
            <h2 className="font-semibold">Ton dashboard est vide</h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Survole n'importe quel bloc de l'application — une carte, un graphique, un tableau,
              une ligne de Domadoo — et clique sur le « + » qui apparaît dans son coin. Il arrivera
              ici, et restera aussi sur sa page.
            </p>
          </div>
          <Button size="sm" onClick={() => setCatalogOpen(true)}>
            <Plus className="h-4 w-4" />
            Parcourir les blocs
          </Button>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {shown.map((widget) => {
          if (isHeading(widget.blockId)) {
            return (
              <div
                key={widget.id}
                data-widget-id={widget.id}
                // Un titre prend toujours toute la largeur sur mobile : coupé en deux
                // colonnes, il ne séparerait plus rien.
                className={cn(
                  'col-span-2 flex min-w-0 flex-col',
                  LG_SPAN[widget.width] ?? LG_SPAN[6],
                  dragId === widget.id && 'opacity-60',
                )}
              >
                {editing && (
                  <WidgetToolbar
                    widget={widget}
                    label="Titre"
                    heading
                    onGripDown={(event) => startDrag(widget.id, event)}
                  />
                )}
                <div
                  className={cn(
                    editing && 'rounded-b-xl px-2 pb-2 outline-dashed outline-1 outline-primary/50',
                    dragId === widget.id && 'ring-2 ring-primary',
                  )}
                >
                  <SectionHeading
                    widget={widget}
                    editing={editing}
                    autoFocus={justAdded === widget.blockId}
                    onFocused={() => setJustAdded(null)}
                  />
                </div>
              </div>
            );
          }

          const block = BLOCKS[widget.blockId];
          // Un bloc retiré du code : ignoré à l'affichage, retirable en édition.
          if (!block && !editing) return null;

          const overrides: WidgetOverrides = {
            title: widget.title,
            description: widget.description,
            icon: widget.icon ? (WIDGET_ICONS[widget.icon]?.icon ?? null) : null,
          };

          return (
            <div
              key={widget.id}
              data-widget-id={widget.id}
              className={cn(
                'flex min-w-0 flex-col',
                spanOf(widget.width),
                dragId === widget.id && 'opacity-60',
              )}
            >
              {editing && (
                <WidgetToolbar
                  widget={widget}
                  label={block?.label ?? 'Bloc retiré de l’application'}
                  onGripDown={(event) => startDrag(widget.id, event)}
                />
              )}
              <div
                className={cn(
                  'min-w-0 flex-1 [&>*:first-child]:h-full',
                  editing &&
                    'pointer-events-none select-none rounded-b-xl outline-dashed outline-1 outline-primary/50',
                  dragId === widget.id && 'ring-2 ring-primary',
                )}
              >
                <WidgetContext.Provider value={overrides}>
                  {block ? (
                    block.render()
                  ) : (
                    <Card className="p-4 text-sm text-muted-foreground">
                      Ce bloc n'existe plus dans l'application ({widget.blockId}).
                    </Card>
                  )}
                </WidgetContext.Provider>
              </div>
            </div>
          );
        })}
      </div>

      <BlockCatalogDialog open={catalogOpen} onOpenChange={setCatalogOpen} />
    </div>
  );
};
