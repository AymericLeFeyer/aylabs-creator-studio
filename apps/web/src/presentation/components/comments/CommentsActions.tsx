import { Lightbulb, MessagesSquare, RefreshCw } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { CommentCounts } from '../../../domain/comment/entities/Comment.ts';
import { Button } from '../ui/button.tsx';
import { cn } from '../../../shared/cn.ts';

export type CommentsView = 'mur' | 'propositions' | 'commentaires';

interface CommentsActionsProps {
  view: CommentsView;
  onView: (view: CommentsView) => void;
  counts: CommentCounts | undefined;
  collecting: boolean;
  onCollect: () => void;
  /** Barre d'application mobile : que des icônes, et pas de libellé de collecte. */
  compact?: boolean;
}

/**
 * Les trois gestes de l'écran des commentaires, réunis à droite du titre.
 *
 * **Ils remplacent la rangée d'onglets.** « Wall of Love », « Propositions de la
 * communauté » et « Commentaires » avec leurs compteurs faisaient une ligne plus large
 * que l'écran d'un téléphone : on la faisait défiler pour découvrir qu'il n'y avait rien
 * de plus à droite. Deux icônes disent la même chose en trois centimètres, et le nombre
 * qui compte — ce qu'il reste à trier, ce qui a été proposé — tient dans la pastille.
 *
 * **Le mur est la vue par défaut et n'a pas de bouton** : c'est l'écran sur lequel on
 * arrive, et re-cliquer le bouton actif y ramène. Lui en donner un troisième aurait
 * remis une rangée là où on venait d'en retirer une.
 *
 * Monté **deux fois** — dans l'en-tête de la page sur grand écran, dans la barre
 * d'application sur mobile —, masqué en CSS de part et d'autre : un seul jeu de contrôles
 * pour une seule vérité, comme `CollectAction`.
 */
export const CommentsActions = ({
  view,
  onView,
  counts,
  collecting,
  onCollect,
  compact,
}: CommentsActionsProps) => (
  <div className="flex items-center gap-1">
    <ViewBadge
      icon={MessagesSquare}
      label="Commentaires à trier"
      count={counts?.new ?? 0}
      active={view === 'commentaires'}
      onClick={() => onView(view === 'commentaires' ? 'mur' : 'commentaires')}
    />
    <ViewBadge
      icon={Lightbulb}
      label="Propositions de la communauté"
      count={counts?.idea ?? 0}
      active={view === 'propositions'}
      onClick={() => onView(view === 'propositions' ? 'mur' : 'propositions')}
      tone="cash"
    />

    {/* La collecte tourne déjà avec celle des métriques ; le bouton sert à ne pas
        attendre le passage suivant quand on vient de publier. */}
    {compact ? (
      <Button variant="ghost" size="icon" disabled={collecting} onClick={onCollect}>
        <RefreshCw className={cn('h-5 w-5', collecting && 'animate-spin')} />
        <span className="sr-only">Collecter les commentaires</span>
      </Button>
    ) : (
      <Button
        variant="outline"
        size="sm"
        className="ml-1"
        disabled={collecting}
        onClick={onCollect}
      >
        <RefreshCw className={cn('h-4 w-4', collecting && 'animate-spin')} />
        {collecting ? 'Collecte…' : 'Collecter'}
      </Button>
    )}
  </div>
);

/**
 * Un accès à une vue, avec son compteur en pastille.
 *
 * Le compteur est **posé sur l'icône** et non écrit à côté : c'est le seul moyen de
 * garder une cible carrée de la taille d'un pouce. Un zéro n'affiche rien — une pastille
 * vide se lit comme une alerte, alors qu'elle ne dit que « rien à faire ».
 */
const ViewBadge = ({
  icon: Icon,
  label,
  count,
  active,
  onClick,
  tone = 'default',
}: {
  icon: LucideIcon;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  tone?: 'default' | 'cash';
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    title={active ? `${label} — revenir au mur` : label}
    className={cn(
      'relative inline-flex h-9 w-9 items-center justify-center rounded-md border transition-colors',
      'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
      active
        ? 'border-border bg-secondary text-secondary-foreground'
        : 'border-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground',
    )}
  >
    <Icon className="h-5 w-5" aria-hidden />
    {count > 0 && (
      <span
        className={cn(
          'absolute -top-1 -right-1 min-w-4 rounded-full px-1 text-[10px] leading-4 font-semibold text-white tabular',
          tone === 'cash' ? 'bg-[var(--cash)]' : 'bg-[var(--negative)]',
        )}
      >
        {count > 99 ? '99+' : count}
      </span>
    )}
    <span className="sr-only">
      {label} ({count})
    </span>
  </button>
);
