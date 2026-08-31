import type { VideoPerformanceRow } from '../../domain/analytics/entities/Analytics.ts';
import type { RevenueEntry } from '../../domain/revenue/entities/Revenue.ts';
import { formatDate, formatMoney } from '../../shared/format.ts';

/** Au-delà, le panneau dépasserait la carte : le reste est compté sur une ligne. */
const MAX_ITEMS = 5;

/**
 * Contenus des panneaux de survol des cartes de stats.
 *
 * Ils ne montrent que ce que le chiffre de la carte agrège — mêmes bornes de période,
 * mêmes chaînes — sinon le détail contredirait le total juste au-dessus.
 */

/** Les sorties de la période, avec leur miniature. */
export const VideoList = ({ videos }: { videos: VideoPerformanceRow[] }) => {
  if (videos.length === 0) {
    return <p className="text-muted-foreground">Aucune sortie sur cette période.</p>;
  }

  return (
    <div className="space-y-1.5">
      {videos.slice(0, MAX_ITEMS).map((video) => (
        <div key={video.videoId} className="flex items-center gap-2">
          {video.thumbnailUrl ? (
            <img
              src={video.thumbnailUrl}
              alt=""
              loading="lazy"
              className="h-9 w-16 shrink-0 rounded object-cover"
            />
          ) : (
            <span
              className="h-9 w-16 shrink-0 rounded"
              style={{ backgroundColor: `${video.channelColor}33` }}
              aria-hidden
            />
          )}
          <span className="min-w-0">
            <span className="line-clamp-2 text-popover-foreground">{video.title}</span>
            <span className="text-[11px] text-muted-foreground">{formatDate(video.date)}</span>
          </span>
        </div>
      ))}
      {videos.length > MAX_ITEMS && (
        <p className="text-muted-foreground">et {videos.length - MAX_ITEMS} de plus…</p>
      )}
    </div>
  );
};

/** Les revenus en nature de la période, avec leur valorisation. */
export const InKindList = ({ entries }: { entries: RevenueEntry[] }) => {
  if (entries.length === 0) {
    return <p className="text-muted-foreground">Aucun produit reçu sur cette période.</p>;
  }

  const total = entries.reduce((sum, entry) => sum + entry.amountCents, 0);

  return (
    <div className="space-y-1">
      {entries.slice(0, MAX_ITEMS).map((entry) => (
        <div key={entry.id} className="flex items-baseline justify-between gap-3">
          <span className="min-w-0">
            <span className="line-clamp-1 text-popover-foreground">{entry.label}</span>
            <span className="text-[11px] text-muted-foreground">{formatDate(entry.date)}</span>
          </span>
          <span className="shrink-0 tabular text-[var(--in-kind)]">
            {formatMoney(entry.amountCents)}
          </span>
        </div>
      ))}
      {entries.length > MAX_ITEMS && (
        <p className="text-muted-foreground">et {entries.length - MAX_ITEMS} de plus…</p>
      )}
      <div className="flex items-baseline justify-between gap-3 border-t border-border pt-1 font-medium">
        <span className="text-muted-foreground">Total</span>
        <span className="tabular">{formatMoney(total)}</span>
      </div>
    </div>
  );
};
