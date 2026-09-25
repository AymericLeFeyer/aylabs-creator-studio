import { useSearchParams } from 'react-router-dom';
import { useVisibleAchievements } from '../../application/achievement/usecases/useAchievements.ts';
import { AchievementAccountsPicker } from '../components/achievements/AchievementAccountsPicker.tsx';
import type { AchievementPlatform } from '../../domain/achievement/entities/Achievement.ts';
import { Block } from '../dashboard/Block.tsx';
import { AchievementTrackCard } from '../components/achievements/AchievementTrackCard.tsx';
import { PLATFORM_LABELS, PLATFORMS } from '../components/achievements/achievementFormat.ts';
import { EmptyState } from '../components/EmptyState.tsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs.tsx';
import { BlockSkeleton } from '../blocks/BlockSkeleton.tsx';

/**
 * Les achievements : les paliers franchis et leur date, sur toute la vie des chaînes et
 * des comptes. **Hors période** — un palier ne se regarde pas dans une fenêtre de temps —,
 * d'où l'absence de barre de filtres (`ROUTES_WITHOUT_FILTERS`).
 *
 * En tête, trois blocs ajoutables au dashboard (derniers paliers, prochains, records) ;
 * dessous, une courbe par chaîne et par métrique, rangées par plateforme en onglets.
 */
export const AchievementsPage = () => {
  const { data, all, isLoading } = useVisibleAchievements();
  const [searchParams, setSearchParams] = useSearchParams();

  const tracks = data?.tracks ?? [];
  const platforms = PLATFORMS.filter((platform) =>
    tracks.some((track) => track.platform === platform),
  );
  const requested = searchParams.get('plateforme') as AchievementPlatform | null;
  const active = requested && platforms.includes(requested) ? requested : platforms[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="hidden lg:block">
          <h1 className="text-lg font-semibold">Achievements</h1>
          <p className="text-sm text-muted-foreground">
            Les paliers franchis, reconstruits depuis tout l’historique collecté. Un palier acquis
            avant le début de l’historique est marqué « avant le … » : on sait qu’il l’est, pas
            quand.
          </p>
        </div>
        {/* Visible aussi sur mobile, où le bloc titre disparaît : poussé à droite. */}
        <div className="ml-auto">
          <AchievementAccountsPicker />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Block id="achievements.recent" />
        <Block id="achievements.next" />
      </div>
      <Block id="achievements.records" />

      {isLoading ? (
        <BlockSkeleton className="h-64" />
      ) : !active && (all?.tracks.length ?? 0) > 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Tous les comptes sont exclus : recoche-en un dans « Comptes ».
        </p>
      ) : !active ? (
        <EmptyState
          title="Aucun historique pour l'instant"
          description="Les achievements se calculent à partir des collectes : connecte une chaîne YouTube, un compte Instagram ou un profil TikTok, et ils apparaîtront au premier relevé."
          actionLabel="Paramètres"
          actionTo="/parametres?onglet=youtube"
        />
      ) : (
        <Tabs
          value={active}
          onValueChange={(value) => setSearchParams({ plateforme: value }, { replace: true })}
        >
          <TabsList>
            {platforms.map((platform) => (
              <TabsTrigger key={platform} value={platform}>
                {PLATFORM_LABELS[platform]}
              </TabsTrigger>
            ))}
          </TabsList>
          {platforms.map((platform) => (
            <TabsContent key={platform} value={platform} className="mt-4">
              <div className="grid gap-4 xl:grid-cols-2">
                {tracks
                  .filter((track) => track.platform === platform)
                  .map((track) => (
                    <AchievementTrackCard key={track.id} track={track} />
                  ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
};
