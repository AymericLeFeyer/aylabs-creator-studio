import { ExternalLink } from 'lucide-react';
import type { Comment } from '../../../domain/comment/entities/Comment.ts';
import { cn } from '../../../shared/cn.ts';

/**
 * La vidéo sous laquelle le commentaire a été laissé.
 *
 * Trois cas, et ils ne disent pas la même chose : la vidéo est **connue** (on affiche son
 * titre, qui est ce qu'on cherche), elle ne l'est **pas encore** (la collecte ne remonte
 * pas si loin — on affiche quand même un lien vers YouTube, parce que savoir « laquelle »
 * reste possible en un clic), ou le commentaire porte **sur la chaîne** et non sur une
 * vidéo, ce qui arrive et n'a rien d'anormal.
 *
 * Le lien s'ouvre dans un **nouvel onglet** : on va y répondre, puis on revient trier le
 * reste — une navigation ferait perdre l'onglet, le filtre et la position dans la liste.
 */
export const CommentVideoLink = ({
  comment,
  className,
}: {
  comment: Comment;
  className?: string;
}) => {
  if (!comment.videoExternalId) {
    return <span className={cn('text-muted-foreground', className)}>Sur la chaîne</span>;
  }

  const label = comment.videoTitle ?? 'Vidéo non collectée';

  return (
    <a
      href={`https://www.youtube.com/watch?v=${comment.videoExternalId}&lc=${comment.externalId}`}
      target="_blank"
      rel="noreferrer"
      title={label}
      className={cn(
        'inline-flex min-w-0 items-center gap-1 hover:underline',
        comment.videoTitle ? '' : 'text-muted-foreground italic',
        className,
      )}
    >
      <span className="line-clamp-1">{label}</span>
      <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
    </a>
  );
};
