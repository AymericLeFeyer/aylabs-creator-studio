import { ExternalLink, Music2 } from 'lucide-react';
import type { TikTokAccount, TikTokVideo } from '../../../domain/tiktok/entities/TikTok.ts';
import { formatDate } from '../../../shared/format.ts';
import { usePrivacy } from '../../hooks/usePrivacy.tsx';
import { CarouselStats, LatestCarousel } from '../content/LatestCarousel.tsx';

const RANK_LABELS = ['Dernière vidéo', 'Avant-dernière vidéo'];

/**
 * Les 10 dernières vidéos TikTok, une à la fois — le pendant de `LatestPostCard` et de
 * `LatestVideoCard`, pour les mêmes raisons : **hors période** (`latestVideos`), et une
 * vidéo ne se juge qu'à côté de celles qui la précèdent.
 *
 * Les compteurs sont ceux du dernier relevé du profil public. `statsAt` à `null` = jamais
 * mesurée : « — » partout plutôt que des zéros.
 */
export const LatestTikTokCard = ({
  videos,
  accounts,
}: {
  videos: TikTokVideo[];
  accounts: TikTokAccount[];
}) => {
  const privacy = usePrivacy();

  return (
    <LatestCarousel items={videos} noun="Vidéo">
      {(item, index) => {
        const account = accounts.find((candidate) => candidate.id === item.accountId);
        const measured = item.statsAt !== null;
        const value = (count: number | null) =>
          measured && count !== null ? privacy.count(count, 'views') : '—';
        const description = item.description?.split('\n')[0]?.trim() || '(sans description)';

        const body = (
          <>
            {item.thumbnailUrl ? (
              <img
                src={item.thumbnailUrl}
                alt=""
                loading="lazy"
                draggable={false}
                className="h-24 w-[4.5rem] shrink-0 rounded-md object-cover"
              />
            ) : (
              <span
                className="flex h-24 w-[4.5rem] shrink-0 items-center justify-center rounded-md text-white"
                style={{ backgroundColor: account?.color ?? '#000000' }}
                aria-hidden
              >
                <Music2 className="h-6 w-6" />
              </span>
            )}

            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Music2 className="h-3.5 w-3.5" aria-hidden />
                {RANK_LABELS[index] ?? `Vidéo n° ${index + 1}`}
              </span>
              <span className="mt-1 block truncate text-lg font-semibold group-hover:underline">
                {description}
                {item.permalink && (
                  <ExternalLink
                    className="ml-1.5 inline h-3.5 w-3.5 align-baseline text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                    aria-hidden
                  />
                )}
              </span>
              <span className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                {account && <span>@{account.username}</span>}
                <span className="tabular">{formatDate(item.date)}</span>
                {measured ? (
                  <span>relevé du {formatDate(item.statsAt!)}</span>
                ) : (
                  <span>pas encore mesurée</span>
                )}
              </span>
            </span>
          </>
        );

        return {
          main: item.permalink ? (
            <a
              href={item.permalink}
              target="_blank"
              rel="noreferrer"
              draggable={false}
              className="group flex min-w-0 flex-1 items-center gap-4"
            >
              {body}
            </a>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-4">{body}</div>
          ),
          stats: (
            <CarouselStats
              stats={[
                { label: 'Vues', value: value(item.views) },
                { label: 'J’aime', value: value(item.likes) },
                { label: 'Commentaires', value: value(item.comments) },
                { label: 'Partages', value: value(item.shares) },
              ]}
            />
          ),
        };
      }}
    </LatestCarousel>
  );
};
