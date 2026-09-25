import { MessageCircle } from 'lucide-react';
import { useCommentCounts } from '../../application/comment/usecases/useComments.ts';
import { COMMENT_STATUSES, COMMENT_STATUS_LABELS } from '../../domain/comment/entities/Comment.ts';
import { formatNumber } from '../../shared/format.ts';
import { StatCard } from '../components/StatCard.tsx';
import { StatDetails } from '../components/StatDetails.tsx';
import { WallOfLove } from '../components/comments/WallOfLove.tsx';
import { CommunityIdeas } from '../components/comments/CommunityIdeas.tsx';
import { BlockHeading } from '../dashboard/BlockHeading.tsx';

/** Ce qu'il reste à trier : la boîte de réception, celle qui porte la pastille du menu. */
export const CommentsToSortCard = () => {
  const { data: counts } = useCommentCounts();
  const count = counts?.new ?? 0;
  return (
    <StatCard
      label="Commentaires à trier"
      value={counts ? formatNumber(count) : '…'}
      hint={`${formatNumber(counts?.encouraging ?? 0)} encourageant(s) · ${formatNumber(counts?.idea ?? 0)} idée(s)`}
      icon={<MessageCircle className="h-4 w-4" />}
      accent={count > 0 ? 'var(--expense)' : undefined}
      details={
        <StatDetails
          title="Tous les commentaires archivés, par statut"
          rows={COMMENT_STATUSES.map((status) => ({
            key: status,
            label: COMMENT_STATUS_LABELS[status],
            value: formatNumber(counts?.[status] ?? 0),
            tone: status === 'new' && count > 0 ? 'warning' : undefined,
          }))}
          total={{
            label: 'Total',
            value: formatNumber(
              COMMENT_STATUSES.reduce((sum, status) => sum + (counts?.[status] ?? 0), 0),
            ),
          }}
          note="Commentaires de premier niveau de toutes les chaînes, sans vos propres réponses. « À trier » est la file : elle se vide à mesure qu'on classe."
        />
      }
    />
  );
};

/** Le mur n'a pas de titre sur sa page ; sur le dashboard, il en prend un s'il en reçoit un. */
export const WallOfLoveBlock = () => (
  <div className="space-y-2">
    <BlockHeading />
    <WallOfLove />
  </div>
);

export const CommunityIdeasBlock = () => (
  <div className="space-y-2">
    <BlockHeading />
    <CommunityIdeas />
  </div>
);
