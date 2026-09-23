import type { InstagramMedia } from '../../../domain/instagram/entities/Instagram.ts';
import { MEDIA_TYPE_LABELS } from '../../../domain/instagram/entities/Instagram.ts';
import type { TooltipVideo } from '../charts/videoMarkers.tsx';

/**
 * Regroupe les publications par jour, sur le modèle de `groupVideosByBucket` — la série
 * Instagram est toujours à la maille du jour, `date` en tient donc lieu de `bucket`.
 * Réutilise `TooltipVideo`/`videoMarkerLines`/`VideoTooltipList` du dashboard : le repère
 * (un trait pointillé, une coche `▾`) est le même geste qu'une sortie de vidéo, seule la
 * source des points change.
 */
export const groupMediaByDate = (
  media: InstagramMedia[],
  enabled: boolean,
): Map<string, TooltipVideo[]> => {
  const map = new Map<string, TooltipVideo[]>();
  if (!enabled) return map;

  for (const item of media) {
    const kind = MEDIA_TYPE_LABELS[item.mediaType ?? ''] ?? 'Publication';
    const title = item.caption ? item.caption.slice(0, 90) : kind;
    const entry: TooltipVideo = { id: item.id, title, thumbnailUrl: item.thumbnailUrl };
    const existing = map.get(item.date);
    if (existing) existing.push(entry);
    else map.set(item.date, [entry]);
  }
  return map;
};
