import { Eraser, GripVertical, ListOrdered, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatMinutes, type PlanningItem } from '../../../domain/planning/entities/Planning.ts';
import {
  useClearPlanningItems,
  useRemovePlanningItem,
} from '../../../application/planning/usecases/usePlanning.ts';
import { Button } from '../ui/button.tsx';
import { Card } from '../ui/card.tsx';
import { cn } from '../../../shared/cn.ts';

export interface PlanningQueueProps {
  items: PlanningItem[];
  /**
   * Une tâche vient d'être attrapée pour être glissée sur la grille.
   *
   * La pile ne fait que dire **ce qu'on tient** : c'est la grille qui suit le pointeur et
   * résout le jour et l'heure, parce qu'elle est la seule à connaître sa géométrie.
   */
  onPickUp?: (item: PlanningItem) => void;
  /** La ligne en cours de glissement : elle s'efface pendant que le fantôme la remplace. */
  pendingId?: string | null;
}

/**
 * La pile de ce qui est en cours : le travail qui attend des créneaux.
 *
 * **L'ordre ne se règle pas ici, il se déduit** : file d'attente des vidéos, puis ordre
 * des étapes, puis ordre des tâches. On finit une vidéo avant d'attaquer la suivante, et
 * le tournage avant le montage. Il y avait auparavant deux flèches pour classer cette
 * pile à la main — un second ordre qui pouvait contredire la file de production, et deux
 * ordres concurrents pour la même question finissent par se répondre différemment. Pour
 * changer les priorités, on réordonne la file sur l'écran Production.
 *
 * Chaque ligne dit ce qui est **posé** et ce qui est **déjà fait** : c'est l'écart entre
 * les deux qui indique s'il reste des créneaux à trouver, et un simple total ne le
 * dirait pas.
 */
export const PlanningQueue = ({ items, onPickUp, pendingId = null }: PlanningQueueProps) => {
  const remove = useRemovePlanningItem();
  const clear = useClearPlanningItems();

  if (items.length === 0) {
    return (
      <Card className="p-4">
        <p className="text-sm font-medium">Rien en cours</p>
        <p className="mt-1 text-xs text-muted-foreground">
          « Ajouter une vidéo » met des étapes dans cette pile et leur trouve des créneaux.
        </p>
      </Card>
    );
  }

  // Les lignes arrivent déjà triées par l'API ; le regroupement ne fait que rendre la
  // règle visible — on voit d'un coup d'œil quelle vidéo passe avant quelle autre.
  const groups: Array<{
    productionId: string;
    title: string;
    color: string;
    rows: PlanningItem[];
  }> = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.productionId === item.productionId) last.rows.push(item);
    else
      groups.push({
        productionId: item.productionId,
        title: item.productionTitle,
        color: item.channelColor ?? '#64748b',
        rows: [item],
      });
  }

  return (
    <Card className="divide-y divide-border">
      <div className="px-4 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">En cours ({items.length})</p>
          {/* Vider est un geste de reprise en main : on revient sur un planning laissé
              de côté, et la pile décrit un travail qu'on ne compte plus faire dans cet
              ordre-là. Le proposer ligne à ligne obligerait à cliquer trente fois. */}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 px-2 text-xs text-muted-foreground hover:text-destructive"
            disabled={clear.isPending}
            onClick={() => {
              if (
                window.confirm(
                  `Vider la pile (${items.length} tâche${items.length > 1 ? 's' : ''}) ? ` +
                    'Les créneaux déjà approuvés restent, les suggestions partent. ' +
                    'Aucune tâche n’est décochée : elles restent à faire sur leur vidéo.',
                )
              ) {
                clear.mutate(undefined);
              }
            }}
            title="Retirer toutes les tâches encore à faire de la pile"
          >
            <Eraser className="h-3.5 w-3.5" />
            Tout vider
          </Button>
        </div>
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <ListOrdered className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          <span>
            L’ordre suit la{' '}
            <Link to="/production" className="underline hover:text-foreground">
              file de production
            </Link>{' '}
            puis celui des étapes. Une tâche cochée quitte la pile toute seule — et se glisse sur la
            grille pour lui donner une heure à la main.
          </span>
        </p>
      </div>

      {groups.map((group, groupIndex) => (
        <div key={group.productionId} className="py-1">
          <div className="flex items-center gap-2 px-3 py-1">
            <span
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
              style={{ backgroundColor: group.color }}
              aria-hidden
            >
              {groupIndex + 1}
            </span>
            <Link
              to={`/production/${group.productionId}`}
              className="min-w-0 flex-1 truncate text-xs font-medium hover:underline"
            >
              {group.title}
            </Link>
          </div>

          {group.rows.map((item) => {
            const remaining = Math.max(0, item.plannedMinutes - item.approvedMinutes);
            const uncovered = Math.max(0, remaining - item.scheduledMinutes);

            return (
              <div
                key={item.id}
                // Toute la ligne est la poignée : on attrape la tâche où l'on veut, comme
                // on attrape un bloc dans la grille. Le bouton de retrait neutralise son
                // propre `pointerdown`, sinon le clic partirait en glissement.
                onPointerDown={() => onPickUp?.(item)}
                className={cn(
                  'group flex cursor-grab items-start gap-2 px-3 py-1.5 pl-7 active:cursor-grabbing',
                  // La ligne s'efface pendant le geste : le bloc fantôme de la grille la
                  // représente déjà, et la voir aux deux endroits ferait douter de ce
                  // qu'on tient.
                  item.id === pendingId && 'opacity-40',
                )}
                title="Glisser sur la grille pour poser un créneau"
              >
                <GripVertical
                  className="mt-1 h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-60"
                  aria-hidden
                />
                <span
                  className="mt-0.5 h-7 w-1 shrink-0 rounded-full"
                  style={{ backgroundColor: item.stepColor ?? group.color }}
                  aria-hidden
                />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{item.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatMinutes(item.scheduledMinutes)} posées
                    {item.approvedMinutes > 0 && ` · ${formatMinutes(item.approvedMinutes)} faites`}
                    {uncovered > 0 && (
                      <span className="text-[var(--negative)]">
                        {' '}
                        · {formatMinutes(uncovered)} sans place
                      </span>
                    )}
                  </p>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => {
                    // Les créneaux **approuvés** restent : ils racontent du temps passé.
                    // Ceux qui n'ont pas encore eu lieu partent avec la ligne — les
                    // laisser afficherait du travail à faire pour une tâche retirée.
                    if (window.confirm(`Retirer « ${item.label} » de la pile ?`)) {
                      remove.mutate(item.id);
                    }
                  }}
                  title="Retirer de la pile"
                >
                  <X className="h-3 w-3 text-destructive" />
                  <span className="sr-only">Retirer</span>
                </Button>
              </div>
            );
          })}
        </div>
      ))}
    </Card>
  );
};
