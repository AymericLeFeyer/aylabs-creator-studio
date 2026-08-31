import { ReferenceLine } from 'recharts';
import type { VideoMarker } from '../../../domain/analytics/entities/Analytics.ts';

/**
 * Repères de sortie de vidéo, partagés par le graphique d'argent et celui d'audience.
 *
 * Les deux graphiques ont la même abscisse : un trait doit apparaître au même endroit
 * des deux côtés, et la coche qui les affiche est unique (`filters.showVideos`,
 * persistée) — la cocher d'un côté l'active donc de l'autre.
 */

/** Ce que l'infobulle a besoin de savoir d'une vidéo. */
export interface TooltipVideo {
  id: string;
  title: string;
  thumbnailUrl: string | null;
}

/** Toute ligne de graphique capable de porter des repères. */
export interface MarkerRow {
  label: string;
  bucket: string;
  videos: TooltipVideo[];
}

/**
 * Regroupe les sorties par bucket. Une seule marque par bucket : deux vidéos le même
 * jour — ou la même semaine en granularité `week` — donneraient deux traits confondus.
 */
export const groupVideosByBucket = (
  videos: VideoMarker[],
  enabled: boolean,
): Map<string, TooltipVideo[]> => {
  const map = new Map<string, TooltipVideo[]>();
  if (!enabled) return map;

  for (const video of videos) {
    const entry = { id: video.id, title: video.title, thumbnailUrl: video.thumbnailUrl };
    const existing = map.get(video.bucket);
    if (existing) existing.push(entry);
    else map.set(video.bucket, [entry]);
  }
  return map;
};

/**
 * Traits verticaux aux buckets contenant une sortie.
 *
 * Renvoyé comme un tableau d'éléments plutôt que comme un composant : Recharts
 * n'accepte les `ReferenceLine` que comme enfants directs du graphique.
 */
export const videoMarkerLines = (rows: MarkerRow[]) =>
  rows
    .filter((row) => row.videos.length > 0)
    .map((row) => (
      <ReferenceLine
        key={row.bucket}
        x={row.label}
        stroke="var(--color-muted-foreground)"
        strokeDasharray="4 4"
        strokeOpacity={0.65}
        label={{
          value: row.videos.length > 1 ? `▾ ${row.videos.length}` : '▾',
          position: 'top',
          fontSize: 10,
          fill: 'var(--color-muted-foreground)',
        }}
      />
    ));
