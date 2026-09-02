import { ExternalLink, Radio } from 'lucide-react';
import type { Video } from '../../../domain/video/entities/Video.ts';
import { youtubeUrl } from '../../../domain/video/entities/Video.ts';
import {
  formatDate,
  formatHours,
  formatMoney,
  formatNumber,
  formatSigned,
} from '../../../shared/format.ts';
import { Card } from '../ui/card.tsx';

/**
 * La dernière vidéo sortie, en pleine largeur, avec ses compteurs.
 *
 * Elle **ignore la période** de la barre de filtres : « ma dernière vidéo marche
 * comment » ne se pose pas dans une fenêtre de temps, et une période de sept jours
 * viderait le bloc précisément quand on vient le lire. Ses chiffres sont des cumuls
 * depuis la sortie, relevés par la collecte — ils ne s'additionnent pas avec les totaux
 * de la période affichés juste au-dessus, qui comptent aussi les vidéos plus anciennes.
 *
 * `stats.updatedAt` à `null` veut dire « pas encore mesurée » et non « 0 vue » : le bloc
 * affiche alors « — » plutôt qu'une série de zéros, qui seraient un mensonge.
 */
export const LatestVideoCard = ({ video }: { video: Video | undefined }) => {
  if (!video) return null;

  const measured = video.stats.updatedAt !== null;
  const value = (formatted: string) => (measured ? formatted : '—');

  const stats = [
    { label: 'Vues', value: value(formatNumber(video.stats.views)) },
    { label: 'Heures vues', value: value(formatHours(video.stats.watchMinutes / 60)) },
    { label: 'Abonnés gagnés', value: value(formatSigned(video.stats.subscribersGained)) },
    { label: 'Likes', value: value(formatNumber(video.stats.likes)) },
    { label: 'Commentaires', value: value(formatNumber(video.stats.comments)) },
    { label: 'AdSense', value: value(formatMoney(video.stats.estimatedRevenueCents)) },
  ];

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <a
          href={youtubeUrl(video.externalId)}
          target="_blank"
          rel="noreferrer"
          className="group flex min-w-0 flex-1 items-center gap-4"
        >
          {video.thumbnailUrl ? (
            <img
              src={video.thumbnailUrl}
              alt=""
              loading="lazy"
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
              Dernière sortie
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

        {/* Les compteurs à droite sur grand écran, sous la fiche en dessous : la
            miniature et le titre doivent rester lisibles avant de rétrécir les chiffres. */}
        <dl className="grid shrink-0 grid-cols-3 gap-x-6 gap-y-3 lg:grid-cols-6 lg:border-l lg:border-border lg:pl-6">
          {stats.map((stat) => (
            <div key={stat.label}>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {stat.label}
              </dt>
              <dd className="text-base font-semibold tabular">{stat.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Card>
  );
};
