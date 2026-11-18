import { useVideos } from '../../application/video/usecases/useVideos.ts';
import { LatestVideoCard } from '../components/content/LatestVideoCard.tsx';
import { LiveIdeasPanel } from '../components/live/LiveIdeasPanel.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.tsx';

/**
 * Production → Directs : les directs à faire (datés, repris dans le planning) et ceux déjà
 * faits, avec leurs stats, dans le même carrousel que « Dernières sorties ». Un direct est
 * repéré par YouTube (`liveStreamingDetails`) à la collecte ; il peut falloir une collecte
 * pour que les anciens apparaissent.
 */
export const LivePage = () => {
  const { data: videos = [], isLoading } = useVideos({ live: true, limit: 50 });
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Directs</h1>
        <p className="text-sm text-muted-foreground hidden lg:block">
          Tes précédents directs avec leurs chiffres, et ceux que tu veux faire.
        </p>
      </div>

      <LiveIdeasPanel />

      {videos.length > 0 ? (
        <LatestVideoCard videos={videos} channelIds={[]} />
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Directs précédents</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {isLoading
              ? 'Chargement…'
              : 'Aucun direct repéré pour l’instant. Ils apparaissent après la prochaine collecte des vidéos.'}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
