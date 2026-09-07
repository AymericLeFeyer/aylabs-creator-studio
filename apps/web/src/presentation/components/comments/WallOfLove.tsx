import { useMemo, useState } from 'react';
import { Heart, Quote, Shuffle } from 'lucide-react';
import { useComments } from '../../../application/comment/usecases/useComments.ts';
import { shuffle } from '../../../domain/comment/entities/Comment.ts';
import { formatDate, formatNumber } from '../../../shared/format.ts';
import { Button } from '../ui/button.tsx';
import { Card } from '../ui/card.tsx';
import { EmptyState } from '../EmptyState.tsx';
import { CommentAuthor } from './CommentAuthor.tsx';
import { CommentVideoLink } from './CommentVideoLink.tsx';

/**
 * Le mur des commentaires : ce que les gens ont écrit de bien, **au hasard**.
 *
 * L'ordre aléatoire n'est pas un effet de style. Trié par date, le mur raconterait une
 * chronologie et les mêmes trois messages tiendraient le haut de la page pendant des
 * mois — au bout de la deuxième visite on ne le lirait plus. Au hasard, chaque ouverture
 * en remonte d'autres, et c'est tout l'intérêt d'en garder deux cents.
 *
 * La graine vit dans un état et non dans le rendu : sans elle, chaque frappe ailleurs sur
 * l'écran redistribuerait les cartes sous les yeux du lecteur. Le bouton « Mélanger » est
 * le seul à la changer, et il ne coûte aucun aller-retour — la liste est déjà là.
 */
export const WallOfLove = () => {
  const { data: comments = [], isLoading } = useComments({ statuses: ['encouraging'] });
  const [seed, setSeed] = useState(() => Date.now());

  const shuffled = useMemo(() => shuffle(comments, seed), [comments, seed]);

  if (comments.length === 0) {
    return (
      <EmptyState
        title={isLoading ? 'Chargement…' : 'Le mur est encore vide'}
        description={
          "Marque un commentaire comme « Encourageant » dans l'onglet Commentaires et il apparaîtra ici. Les commentaires n'arrivent qu'avec une collecte."
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-[var(--positive)]">
            {formatNumber(comments.length)}
          </span>{' '}
          message(s) qui font du bien, dans un ordre différent à chaque fois.
        </p>
        <Button variant="outline" size="sm" onClick={() => setSeed(Date.now())}>
          <Shuffle className="h-4 w-4" />
          Mélanger
        </Button>
      </div>

      {/* Colonnes CSS plutôt qu'une grille : les commentaires vont de trois mots à dix
          lignes, et une grille alignerait des cartes de hauteurs très inégales en
          laissant des trous béants. `break-inside-avoid` empêche une carte d'être
          coupée en deux entre deux colonnes. */}
      <div className="columns-1 gap-4 md:columns-2 xl:columns-3 2xl:columns-4">
        {shuffled.map((comment) => (
          <Card
            key={comment.id}
            className="mb-4 break-inside-avoid p-4 transition-shadow hover:shadow-md"
          >
            <Quote
              className="h-5 w-5 opacity-30"
              style={{ color: 'var(--positive)' }}
              aria-hidden
            />
            <p className="mt-2 text-sm whitespace-pre-line">{comment.text}</p>

            <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
              <CommentAuthor comment={comment} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{comment.authorName}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="tabular shrink-0">{formatDate(comment.date)}</span>
                  <span aria-hidden>·</span>
                  <CommentVideoLink comment={comment} className="text-xs" />
                </div>
              </div>
              {comment.likeCount > 0 && (
                <span className="tabular flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  <Heart className="h-3 w-3" />
                  {formatNumber(comment.likeCount)}
                </span>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
