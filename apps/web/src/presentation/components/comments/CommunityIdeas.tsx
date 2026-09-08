import { EyeOff, Heart, Lightbulb } from 'lucide-react';
import {
  useComments,
  useSetCommentStatus,
} from '../../../application/comment/usecases/useComments.ts';
import { formatDate, formatNumber } from '../../../shared/format.ts';
import { Button } from '../ui/button.tsx';
import { Card } from '../ui/card.tsx';
import { EmptyState } from '../EmptyState.tsx';
import { CommentAuthor } from './CommentAuthor.tsx';
import { CommentVideoLink } from './CommentVideoLink.tsx';

/**
 * Les propositions de la communauté : les commentaires classés « Idée ».
 *
 * Contrairement au mur, elles sont **dans l'ordre chronologique et non au hasard**. Ce ne
 * sont pas les mêmes objets : le mur se contemple, une liste de propositions se dépouille.
 * On veut savoir ce qui vient d'être demandé, et retrouver deux fois de suite la même
 * ligne au même endroit — un ordre aléatoire ferait relire trois fois la même idée en
 * ratant les autres.
 *
 * La plus récente en tête : c'est la demande encore chaude, celle qui a le plus de chances
 * de coller à ce qu'on est en train de préparer.
 *
 * **Chaque ligne peut être écartée sur place.** Une liste de propositions se dépouille :
 * on la relit en cherchant quoi tourner, et ce qui a été fait — ou ce qu'on ne fera pas —
 * doit pouvoir en sortir au moment où on le décide. Sans ce geste il fallait retourner
 * dans le tableau de tri retrouver la ligne parmi des centaines d'autres, et la liste
 * grossissait jusqu'à ne plus être lue. Écarter est un **statut**, pas une suppression :
 * la ligne reste en base, sinon la collecte suivante la remettrait dans la file de tri.
 */
export const CommunityIdeas = () => {
  const { data: comments = [], isLoading } = useComments({ statuses: ['idea'] });
  const setStatus = useSetCommentStatus();

  if (comments.length === 0) {
    return (
      <EmptyState
        title={isLoading ? 'Chargement…' : 'Aucune proposition pour le moment'}
        description={
          "Marque un commentaire comme « Idée » depuis la file de tri (l'icône de bulle, en haut) et il apparaîtra ici, de la plus récente à la plus ancienne."
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        <span className="font-semibold text-[var(--cash)]">{formatNumber(comments.length)}</span>{' '}
        proposition(s), de la plus récente à la plus ancienne.
      </p>

      <div className="space-y-2">
        {comments.map((comment) => (
          <Card key={comment.id} className="flex gap-3 p-4">
            <span
              aria-hidden
              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--cash)]/15"
            >
              <Lightbulb className="h-4 w-4 text-[var(--cash)]" />
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-sm whitespace-pre-line">{comment.text}</p>

              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <CommentAuthor comment={comment} size={18} />
                <span className="font-medium">{comment.authorName}</span>
                <span aria-hidden>·</span>
                <span className="tabular">{formatDate(comment.date)}</span>
                <span aria-hidden>·</span>
                <CommentVideoLink comment={comment} className="text-xs" />
                {comment.likeCount > 0 && (
                  <>
                    <span aria-hidden>·</span>
                    <span className="tabular inline-flex items-center gap-1">
                      <Heart className="h-3 w-3" />
                      {formatNumber(comment.likeCount)}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Écarter, et rien d'autre : « ça fait plaisir » n'a pas de sens ici, et
                remettre à trier se fait dans le tableau. Un seul bouton reste une cible
                franche au pouce, là où trois se disputeraient le bord de la carte. */}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-muted-foreground"
              disabled={setStatus.isPending}
              title="Écarter cette proposition"
              onClick={() => setStatus.mutate({ id: comment.id, status: 'ignored' })}
            >
              <EyeOff className="h-3.5 w-3.5" />
              <span className="sr-only">Écarter « {comment.authorName} »</span>
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
};
