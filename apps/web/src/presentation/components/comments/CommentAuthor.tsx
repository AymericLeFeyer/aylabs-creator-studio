import type { Comment } from '../../../domain/comment/entities/Comment.ts';
import { readableTextColor } from '../../../shared/contrast.ts';
import { cn } from '../../../shared/cn.ts';

interface CommentAuthorProps {
  comment: Comment;
  /** Diamètre en pixels. 28 dans un tableau, 40 sur une carte du mur. */
  size?: number;
  className?: string;
}

/**
 * La photo de l'auteur, ou son initiale sur la couleur de la chaîne.
 *
 * Le repli n'est pas un cas d'erreur — YouTube ne renvoie pas toujours d'avatar, et un
 * compte sans photo en a un générique qui peut disparaître. Même mécanique que
 * `ChannelAvatar`, et la couleur du texte est calculée pour rester lisible sur n'importe
 * quel fond (`readableTextColor`).
 *
 * L'image est en `loading="lazy"` : un mur affiche facilement deux cents visages, et
 * les charger tous d'un coup ferait ramer l'ouverture de l'onglet.
 */
export const CommentAuthor = ({ comment, size = 28, className }: CommentAuthorProps) => {
  const style = { width: size, height: size };

  if (comment.authorAvatarUrl) {
    return (
      <img
        src={comment.authorAvatarUrl}
        alt=""
        loading="lazy"
        style={style}
        className={cn('shrink-0 rounded-full object-cover', className)}
      />
    );
  }

  return (
    <span
      aria-hidden
      style={{
        ...style,
        backgroundColor: comment.channelColor,
        color: readableTextColor(comment.channelColor),
        fontSize: Math.round(size * 0.45),
      }}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-semibold uppercase',
        className,
      )}
    >
      {comment.authorName.replace(/^@/, '').trim().charAt(0) || '?'}
    </span>
  );
};
