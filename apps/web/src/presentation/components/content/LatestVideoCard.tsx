import { useState } from 'react';
import { ExternalLink, EyeOff, Radio } from 'lucide-react';
import type { Video } from '../../../domain/video/entities/Video.ts';
import { youtubeUrl } from '../../../domain/video/entities/Video.ts';
import { useSetVideoHidden } from '../../../application/video/usecases/useVideos.ts';
import { formatDate } from '../../../shared/format.ts';
import { usePrivacy } from '../../hooks/usePrivacy.tsx';
import { Card } from '../ui/card.tsx';
import { CarouselStats, LatestCarousel } from './LatestCarousel.tsx';
import { HiddenVideosDialog } from './HiddenVideosDialog.tsx';

/**
 * Les dernières sorties YouTube, une à la fois (`LatestCarousel`).
 *
 * Elles **ignorent la période** de la barre de filtres : « ma dernière vidéo marche
 * comment » ne se pose pas dans une fenêtre de temps, et une période de sept jours
 * viderait le bloc précisément quand on vient le lire. Les chiffres sont des cumuls
 * depuis la sortie, relevés par la collecte — ils ne s'additionnent pas avec les totaux
 * de la période affichés juste au-dessus, qui comptent aussi les vidéos plus anciennes.
 *
 * `stats.updatedAt` à `null` veut dire « pas encore mesurée » et non « 0 vue » : le bloc
 * affiche alors « — » plutôt qu'une série de zéros, qui seraient un mensonge.
 *
 * **Une sortie se masque de cette liste** (l'œil barré) : un Short, un direct, une
 * rediffusion n'ont rien à faire parmi « mes dernières vidéos ». La liste arrive déjà
 * filtrée de l'API (`hidden: false`), si bien que la suivante prend sa place et qu'il en
 * reste dix. Le masquage n'agit **que** sur cette liste — chiffres, graphiques et tableaux
 * comptent toujours la vidéo. Les masquées se relisent et se réaffichent par le lien
 * « Masquées » (`HiddenVideosDialog`).
 */
const RANK_LABELS = ['Dernière sortie', 'Avant-dernière sortie'];

const iconButton =
  'rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40';

export const LatestVideoCard = ({
  videos,
  channelIds,
}: {
  videos: Video[];
  /** Les chaînes retenues, pour que la liste des masquées parle des mêmes. */
  channelIds: string[];
}) => {
  const privacy = usePrivacy();
  const setHidden = useSetVideoHidden();
  const [hiddenOpen, setHiddenOpen] = useState(false);

  const hiddenLink = (
    <button
      type="button"
      onClick={() => setHiddenOpen(true)}
      className="rounded-md px-1.5 py-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      title="Voir les vidéos masquées de cette liste"
    >
      Masquées
    </button>
  );
  const dialog = (
    <HiddenVideosDialog open={hiddenOpen} onOpenChange={setHiddenOpen} channelIds={channelIds} />
  );

  // Tout est masqué (ou rien n'est collecté) : on garde l'accès aux masquées.
  if (videos.length === 0) {
    return (
      <Card className="flex items-center justify-between gap-3 p-4 text-sm text-muted-foreground">
        Aucune sortie à afficher.
        {hiddenLink}
        {dialog}
      </Card>
    );
  }

  return (
    <>
      <LatestCarousel
        items={videos}
        noun="Sortie"
        actions={(video) => (
          <>
            <button
              type="button"
              onClick={() => setHidden.mutate({ id: video.id, hidden: true })}
              disabled={setHidden.isPending}
              className={iconButton}
              title="Masquer des dernières sorties (la vidéo reste comptée partout ailleurs)"
              aria-label={`Masquer « ${video.title} » des dernières sorties`}
            >
              <EyeOff className="h-4 w-4" aria-hidden />
            </button>
            {hiddenLink}
          </>
        )}
      >
        {(video, index) => {
          const measured = video.stats.updatedAt !== null;
          /** « — » l'emporte sur « ••• » : ne pas savoir se dit avant de refuser de dire. */
          const value = (formatted: string) => (measured ? formatted : '—');

          return {
            main: (
              <a
                href={youtubeUrl(video.externalId)}
                target="_blank"
                rel="noreferrer"
                draggable={false}
                className="group flex min-w-0 flex-1 items-center gap-4"
              >
                {video.thumbnailUrl ? (
                  <img
                    src={video.thumbnailUrl}
                    alt=""
                    loading="lazy"
                    draggable={false}
                    className="h-20 w-36 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <span
                    className="h-20 w-36 shrink-0 rounded-md"
                    style={{ backgroundColor: `${video.channelColor}33` }}
                    aria-hidden
                  />
                )}

                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <Radio className="h-3.5 w-3.5" aria-hidden />
                    {RANK_LABELS[index] ?? `Sortie n° ${index + 1}`}
                  </span>
                  <span className="mt-1 block truncate text-lg font-semibold group-hover:underline">
                    {video.title}
                    <ExternalLink
                      className="ml-1.5 inline h-3.5 w-3.5 align-baseline text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                      aria-hidden
                    />
                  </span>
                  <span className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: video.channelColor }}
                        aria-hidden
                      />
                      {video.channelName}
                    </span>
                    <span className="tabular">{formatDate(video.date)}</span>
                    {!measured && <span>pas encore mesurée</span>}
                  </span>
                </span>
              </a>
            ),
            stats: (
              <CarouselStats
                stats={[
                  { label: 'Vues', value: value(privacy.count(video.stats.views, 'views')) },
                  {
                    label: 'Heures vues',
                    value: value(privacy.hours(video.stats.watchMinutes / 60, 'views')),
                  },
                  {
                    label: 'Abonnés gagnés',
                    value: value(privacy.signed(video.stats.subscribersGained, 'subscribers')),
                  },
                  { label: 'Likes', value: value(privacy.count(video.stats.likes, 'views')) },
                  {
                    label: 'Commentaires',
                    value: value(privacy.count(video.stats.comments, 'views')),
                  },
                  {
                    label: 'AdSense',
                    value: value(privacy.money(video.stats.estimatedRevenueCents, 'adsense')),
                  },
                ]}
              />
            ),
          };
        }}
      </LatestCarousel>
      {dialog}
    </>
  );
};
