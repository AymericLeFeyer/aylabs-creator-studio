import { ExternalLink } from 'lucide-react';
import type { Video } from '../../../domain/video/entities/Video.ts';
import { youtubeUrl } from '../../../domain/video/entities/Video.ts';
import { formatDate, formatMoney, formatNumber } from '../../../shared/format.ts';
import { Card, CardHeader, CardTitle } from '../ui/card.tsx';

interface RecentVideosCardProps {
  videos: Video[];
  /** Titre différent selon qu'on affiche les dernières sorties ou celles de la période. */
  title: string;
  description: string;
  emptyLabel: string;
}

/**
 * Les sorties les plus récentes, dans l'ordre où elles sont parues.
 *
 * Ce n'est pas un classement : la question à laquelle cette liste répond est « qu'est-ce
 * que j'ai sorti dernièrement », pas « qu'est-ce qui marche le mieux » — le tableau de
 * performance à côté s'en charge, et lui se trie. La miniature porte l'identification :
 * on reconnaît une vidéo à son image bien avant de lire son titre.
 *
 * `stats.updatedAt` à `null` veut dire « pas encore mesurée » et non « 0 vue » : la
 * ligne affiche alors « — », un zéro serait un mensonge.
 */
export const RecentVideosCard = ({
  videos,
  title,
  description,
  emptyLabel,
}: RecentVideosCardProps) => (
  <Card className="overflow-hidden">
    <CardHeader>
      <CardTitle>{title}</CardTitle>
      <p className="text-xs text-muted-foreground">{description}</p>
    </CardHeader>

    {videos.length === 0 ? (
      <p className="px-4 pb-4 text-sm text-muted-foreground">{emptyLabel}</p>
    ) : (
      <div className="divide-y divide-border border-t border-border">
        {videos.map((video) => {
          const measured = video.stats.updatedAt !== null;
          return (
            <a
              key={video.id}
              href={youtubeUrl(video.externalId)}
              target="_blank"
              rel="noreferrer"
              className="group flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-muted/60"
            >
              {video.thumbnailUrl ? (
                <img
                  src={video.thumbnailUrl}
                  alt=""
                  loading="lazy"
                  className="h-10 w-[4.5rem] shrink-0 rounded object-cover"
                />
              ) : (
                <span
                  className="h-10 w-[4.5rem] shrink-0 rounded"
                  style={{ backgroundColor: `${video.channelColor}33` }}
                  aria-hidden
                />
              )}

              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium group-hover:underline">
                  {video.title}
                </span>
                <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: video.channelColor }}
                      aria-hidden
                    />
                    {video.channelName}
                  </span>
                  <span className="tabular">{formatDate(video.date)}</span>
                </span>
              </span>

              <span className="shrink-0 text-right text-xs">
                <span className="block tabular font-medium">
                  {measured ? `${formatNumber(video.stats.views)} vues` : '—'}
                </span>
                {measured && video.stats.estimatedRevenueCents > 0 && (
                  <span className="block tabular text-muted-foreground">
                    {formatMoney(video.stats.estimatedRevenueCents)}
                  </span>
                )}
              </span>

              <ExternalLink
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                aria-hidden
              />
            </a>
          );
        })}
      </div>
    )}
  </Card>
);
