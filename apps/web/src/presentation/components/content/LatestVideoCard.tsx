import { ExternalLink, Radio } from 'lucide-react';
import type { Video } from '../../../domain/video/entities/Video.ts';
import { youtubeUrl } from '../../../domain/video/entities/Video.ts';
import { formatDate } from '../../../shared/format.ts';
import { usePrivacy } from '../../hooks/usePrivacy.tsx';
import { CarouselStats, LatestCarousel } from './LatestCarousel.tsx';

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
 */
const RANK_LABELS = ['Dernière sortie', 'Avant-dernière sortie'];

export const LatestVideoCard = ({ videos }: { videos: Video[] }) => {
  const privacy = usePrivacy();

  return (
    <LatestCarousel items={videos} noun="Sortie">
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
  );
};
