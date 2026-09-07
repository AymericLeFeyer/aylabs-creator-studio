import { useState } from 'react';
import { Heart, Search } from 'lucide-react';
import {
  useComments,
  useSetCommentStatus,
} from '../../../application/comment/usecases/useComments.ts';
import { useChannels } from '../../../application/channel/usecases/useChannels.ts';
import type { CommentCounts, CommentStatus } from '../../../domain/comment/entities/Comment.ts';
import {
  COMMENT_STATUSES,
  COMMENT_STATUS_BADGES,
  COMMENT_STATUS_LABELS,
} from '../../../domain/comment/entities/Comment.ts';
import { formatDate, formatNumber } from '../../../shared/format.ts';
import { Badge } from '../ui/badge.tsx';
import { Card, CardHeader, CardTitle } from '../ui/card.tsx';
import { Input } from '../ui/input.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table.tsx';
import { EmptyState } from '../EmptyState.tsx';
import { CommentAuthor } from './CommentAuthor.tsx';
import { CommentVideoLink } from './CommentVideoLink.tsx';
import { CommentStatusPicker } from './CommentStatusPicker.tsx';
import { cn } from '../../../shared/cn.ts';

/** Sentinelle des sélecteurs facultatifs : Radix refuse une `SelectItem` de valeur vide. */
const ALL = '__all__';

/**
 * Le grand tableau de tri : une ligne par commentaire, trois boutons par ligne.
 *
 * **Il s'ouvre sur la file de tri** (`new`) et non sur tout l'historique : c'est la seule
 * question que cet écran pose vraiment — « qu'est-ce que je n'ai pas encore regardé ».
 * Tout reste accessible par le filtre juste au-dessus, et on y revient pour rattraper un
 * classement raté.
 *
 * Le tri se fait **sur place**, sans modale ni bouton d'enregistrement : un clic écrit, et
 * la ligne quitte la file — c'est une boîte de réception, elle se vide. On rattrape un
 * clic de travers en passant le filtre sur le statut posé par erreur (le compteur du
 * sélecteur dit où chercher), puis en re-cliquant la décision active, qui la défait.
 *
 * Aucune ligne n'est jamais supprimée : « ignoré » est un statut, pas un effacement.
 * C'est ce qui fait qu'un commentaire écarté ne remonte pas dans la file à la collecte
 * suivante.
 */
export const CommentsTable = ({ counts }: { counts: CommentCounts | undefined }) => {
  const [status, setStatus] = useState<CommentStatus | typeof ALL>('new');
  const [channelId, setChannelId] = useState<string>(ALL);
  const [search, setSearch] = useState('');

  const { data: channels = [] } = useChannels();

  // Le statut et la chaîne partent à l'API — ce sont eux qui bornent la requête. La
  // **recherche reste côté écran** : branchée sur la requête, elle changerait la clé de
  // cache à chaque lettre tapée et enverrait un aller-retour par caractère. Filtrer les
  // lignes déjà chargées est instantané, et l'API garde son paramètre `search` pour le
  // jour où la liste dépassera ce qu'on charge d'un coup. Même parti pris que
  // `/partenariats`, dont le filtrage vit aussi dans l'écran.
  const { data: comments = [], isLoading } = useComments({
    statuses: status === ALL ? undefined : [status],
    channelIds: channelId === ALL ? undefined : [channelId],
  });

  const needle = search.trim().toLowerCase();
  const visible = needle
    ? comments.filter(
        (comment) =>
          comment.text.toLowerCase().includes(needle) ||
          comment.authorName.toLowerCase().includes(needle),
      )
    : comments;

  const setCommentStatus = useSetCommentStatus();
  const pending = counts?.new ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={(value) => setStatus(value as CommentStatus)}>
          <SelectTrigger className="w-[190px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tous les statuts</SelectItem>
            {COMMENT_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {COMMENT_STATUS_LABELS[value]}
                {counts ? ` (${counts[value]})` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={channelId} onValueChange={setChannelId}>
          <SelectTrigger className="w-[190px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Toutes les chaînes</SelectItem>
            {channels.map((channel) => (
              <SelectItem key={channel.id} value={channel.id}>
                {channel.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Chercher un mot, un auteur…"
            className="pl-9"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={isLoading ? 'Chargement…' : 'Rien à trier ici'}
          description={
            status === 'new' && pending === 0
              ? 'Tous les commentaires collectés sont classés. Les prochains arriveront avec la collecte, qui tourne avec celle des métriques.'
              : "Aucun commentaire ne correspond à ce filtre. Les commentaires n'arrivent qu'avec une collecte : sur une chaîne jamais collectée, la liste reste vide."
          }
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{visible.length} commentaire(s)</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[160px]">Auteur</TableHead>
                  <TableHead className="min-w-[320px]">Commentaire</TableHead>
                  <TableHead className="min-w-[160px]">Vidéo</TableHead>
                  <TableHead className="w-[110px]">Date</TableHead>
                  <TableHead className="w-[70px] text-right">Likes</TableHead>
                  <TableHead className="w-[110px]">Statut</TableHead>
                  <TableHead className="w-[240px] text-right">Trier</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((comment) => (
                  <TableRow
                    key={comment.id}
                    className={cn(comment.status === 'ignored' && 'opacity-55')}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <CommentAuthor comment={comment} />
                        <span className="line-clamp-1" title={comment.authorName}>
                          {comment.authorName}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {/* Trois lignes au plus : une ligne de tableau reste balayable, et
                          le texte entier est à un survol — ou sur YouTube, à un clic. */}
                      <p className="line-clamp-3 whitespace-pre-line" title={comment.text}>
                        {comment.text}
                      </p>
                    </TableCell>
                    <TableCell className="max-w-[220px] text-sm">
                      <CommentVideoLink comment={comment} />
                    </TableCell>
                    <TableCell className="tabular text-muted-foreground">
                      {formatDate(comment.date)}
                    </TableCell>
                    <TableCell className="tabular text-right text-muted-foreground">
                      {comment.likeCount > 0 ? (
                        <span className="inline-flex items-center gap-1">
                          <Heart className="h-3 w-3" />
                          {formatNumber(comment.likeCount)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={COMMENT_STATUS_BADGES[comment.status]}>
                        {COMMENT_STATUS_LABELS[comment.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <CommentStatusPicker
                        status={comment.status}
                        disabled={setCommentStatus.isPending}
                        onChange={(next) =>
                          setCommentStatus.mutate({ id: comment.id, status: next })
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
};
