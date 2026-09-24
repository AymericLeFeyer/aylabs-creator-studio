import { ExternalLink, Instagram } from 'lucide-react';
import type {
  InstagramAccount,
  InstagramMedia,
} from '../../../domain/instagram/entities/Instagram.ts';
import { MEDIA_TYPE_LABELS } from '../../../domain/instagram/entities/Instagram.ts';
import { formatDate } from '../../../shared/format.ts';
import { usePrivacy } from '../../hooks/usePrivacy.tsx';
import { CarouselStats, LatestCarousel } from '../content/LatestCarousel.tsx';

const RANK_LABELS = ['Dernière publication', 'Avant-dernière publication'];

/**
 * Les 10 dernières publications Instagram, une à la fois — le pendant de
 * `LatestVideoCard`, et pour les mêmes raisons : **hors période** (`latestMedia`), et une
 * publication ne se juge qu'à côté de celles qui la précèdent.
 *
 * `statsAt` à `null` = pas encore mesurée par l'API Graph : « — » partout plutôt que des
 * zéros. Un compteur absent (Meta n'en rend pas certains pour certains types de média)
 * s'affiche « — » de la même façon.
 */
export const LatestPostCard = ({
  media,
  accounts,
}: {
  media: InstagramMedia[];
  accounts: InstagramAccount[];
}) => {
  const privacy = usePrivacy();

  return (
    <LatestCarousel items={media} noun="Publication">
      {(item, index) => {
        const account = accounts.find((candidate) => candidate.id === item.accountId);
        const measured = item.statsAt !== null;
        const value = (count: number | null) =>
          measured && count !== null ? privacy.count(count, 'views') : '—';
        const caption = item.caption?.split('\n')[0]?.trim() || '(sans légende)';

        const body = (
          <>
            {item.thumbnailUrl ? (
              <img
                src={item.thumbnailUrl}
                alt=""
                loading="lazy"
                draggable={false}
                className="h-20 w-20 shrink-0 rounded-md object-cover"
              />
            ) : (
              <span
                className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md text-white"
                style={{ backgroundColor: account?.color ?? '#833ab4' }}
                aria-hidden
              >
                <Instagram className="h-6 w-6" />
              </span>
            )}

            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Instagram className="h-3.5 w-3.5" aria-hidden />
                {RANK_LABELS[index] ?? `Publication n° ${index + 1}`}
              </span>
              <span className="mt-1 block truncate text-lg font-semibold group-hover:underline">
                {caption}
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
                {item.mediaType && <span>{MEDIA_TYPE_LABELS[item.mediaType] ?? ''}</span>}
                {!measured && <span>pas encore mesurée</span>}
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
                { label: 'Portée', value: value(item.reach) },
                { label: 'J’aime', value: value(item.likes) },
                { label: 'Commentaires', value: value(item.comments) },
                { label: 'Partages', value: value(item.shares) },
                { label: 'Enregistr.', value: value(item.saved) },
              ]}
            />
          ),
        };
      }}
    </LatestCarousel>
  );
};
