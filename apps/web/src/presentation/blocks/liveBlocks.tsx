import { useMemo } from 'react';
import { ExternalLink, Radio, Users, TrendingUp, X } from 'lucide-react';
import { useSetVideoNotLive, useVideos } from '../../application/video/usecases/useVideos.ts';
import { youtubeUrl, type Video } from '../../domain/video/entities/Video.ts';
import { formatDate, formatNumber, toIsoDate } from '../../shared/format.ts';
import { useFilters } from '../hooks/useFilters.tsx';
import { usePrivacy } from '../hooks/usePrivacy.tsx';
import { StatCard } from '../components/StatCard.tsx';
import { StatDetails } from '../components/StatDetails.tsx';
import { LiveIdeasPanel } from '../components/live/LiveIdeasPanel.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.tsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table.tsx';

/**
 * Les blocs des directs. Tous lisent les directs de la période des filtres (le jour du
 * début réel), chaînes retenues : même requête partagée, donc pas de contradiction entre
 * les cartes et l'historique.
 */

const PENDING = '…';

/** Les directs de la période, le plus récent d'abord. */
const useLivesInPeriod = (): { lives: Video[]; loading: boolean } => {
  const filters = useFilters();
  const { data, isLoading } = useVideos({ live: true, limit: 500 });
  const lives = useMemo(
    () =>
      (data ?? [])
        .filter((video) => {
          if (!video.liveStartedAt) return false;
          const day = toIsoDate(new Date(video.liveStartedAt));
          const inChannel =
            filters.channelIds.length === 0 || filters.channelIds.includes(video.channelId);
          return inChannel && day >= filters.from && day <= filters.to;
        })
        .sort((a, b) => b.liveStartedAt!.localeCompare(a.liveStartedAt!)),
    [data, filters.from, filters.to, filters.channelIds],
  );
  return { lives, loading: isLoading };
};

const average = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;

type Privacy = ReturnType<typeof usePrivacy>;

/** « — » l'emporte sur « ••• » : pas mesuré se dit avant d'être masqué. */
const shown = (privacy: Privacy, value: number | null) =>
  value === null ? '—' : privacy.count(Math.round(value), 'views');

export const LivesCountCard = () => {
  const { lives, loading } = useLivesInPeriod();
  return (
    <StatCard
      label="Directs"
      value={loading ? PENDING : formatNumber(lives.length)}
      hint="sur la période"
      icon={<Radio className="h-4 w-4" />}
      details={
        lives.length > 0 ? (
          <StatDetails
            title="Directs de la période"
            rows={lives.map((live) => ({
              key: live.id,
              label: live.title,
              sub: formatDate(live.liveStartedAt!.slice(0, 10)),
              value:
                live.livePeakViewers === null ? '—' : `${formatNumber(live.livePeakViewers)} pic`,
            }))}
          />
        ) : undefined
      }
    />
  );
};

export const LivesPeakCard = () => {
  const { lives, loading } = useLivesInPeriod();
  const privacy = usePrivacy();
  const peaks = lives.flatMap((live) =>
    live.livePeakViewers === null ? [] : [live.livePeakViewers],
  );
  const mean = average(peaks);
  return (
    <StatCard
      label="Pic moyen de viewers"
      value={loading ? PENDING : shown(privacy, mean)}
      hint={
        peaks.length < lives.length
          ? `${peaks.length} direct(s) mesuré(s) sur ${lives.length}`
          : 'moyenne des pics simultanés'
      }
      icon={<TrendingUp className="h-4 w-4" />}
    />
  );
};

export const LivesAverageCard = () => {
  const { lives, loading } = useLivesInPeriod();
  const privacy = usePrivacy();
  const means = lives.flatMap((live) =>
    live.liveAverageViewers === null ? [] : [live.liveAverageViewers],
  );
  return (
    <StatCard
      label="Viewers moyens"
      value={loading ? PENDING : shown(privacy, average(means))}
      hint={
        means.length < lives.length
          ? `${means.length} direct(s) mesuré(s) sur ${lives.length}`
          : 'moyenne des spectateurs simultanés'
      }
      icon={<Users className="h-4 w-4" />}
    />
  );
};

/** L'historique en liste : un direct par ligne, le plus récent en tête. */
export const LivesHistoryTable = () => {
  const { lives, loading } = useLivesInPeriod();
  const privacy = usePrivacy();
  const notLive = useSetVideoNotLive();
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Historique des directs</CardTitle>
      </CardHeader>
      <CardContent>
        {lives.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            {loading
              ? 'Chargement…'
              : 'Aucun direct sur la période. Ils sont repérés à la collecte des vidéos.'}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Titre</TableHead>
                <TableHead className="text-right">Pic</TableHead>
                <TableHead className="text-right">Moyenne</TableHead>
                <TableHead className="text-right">Vues</TableHead>
                <TableHead className="text-right">J’aime</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lives.map((live) => {
                const measured = live.stats.updatedAt !== null;
                return (
                  <TableRow key={live.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(toIsoDate(new Date(live.liveStartedAt!)))}
                    </TableCell>
                    <TableCell className="max-w-[24rem]">
                      <a
                        href={youtubeUrl(live.externalId)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 hover:underline"
                      >
                        <span className="truncate">{live.title}</span>
                        <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                      </a>
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {shown(privacy, live.livePeakViewers)}
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {shown(privacy, live.liveAverageViewers)}
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {measured ? privacy.count(live.stats.views, 'views') : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {measured ? privacy.count(live.stats.likes, 'views') : '—'}
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        title="Ce n’est pas un direct (une première, par exemple)"
                        disabled={notLive.isPending}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        onClick={() => {
                          if (
                            window.confirm(
                              `« ${live.title} » n’est pas un direct ? Il sera retiré de cette liste.`,
                            )
                          )
                            notLive.mutate(live.id);
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                        <span className="sr-only">Retirer des directs</span>
                      </button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};

export const LiveIdeasBlock = () => <LiveIdeasPanel />;
