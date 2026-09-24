import { MessageCircle } from 'lucide-react';
import { useCommentCounts } from '../../application/comment/usecases/useComments.ts';
import { formatNumber } from '../../shared/format.ts';
import { StatCard } from '../components/StatCard.tsx';
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
