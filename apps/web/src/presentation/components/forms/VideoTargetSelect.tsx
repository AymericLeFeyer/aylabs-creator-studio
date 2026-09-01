import { useMemo } from 'react';
import type { Production } from '../../../domain/production/entities/Production.ts';
import { STATUS_LABELS } from '../../../domain/production/entities/Production.ts';
import type { Video } from '../../../domain/video/entities/Video.ts';
import { formatDate } from '../../../shared/format.ts';
import { Label } from '../ui/label.tsx';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '../ui/select.tsx';
import { NONE } from './selectNone.ts';
import { PRODUCTION_PREFIX, VIDEO_PREFIX, type VideoTarget } from './videoTarget.ts';

interface VideoTargetSelectProps {
  id: string;
  value: string;
  onChange: (target: VideoTarget) => void;
  productions: Production[];
  videos: Video[];
  /** Restreint les deux listes à cette chaîne. `null` = pas de restriction. */
  channelId?: string | null;
}

export const VideoTargetSelect = ({
  id,
  value,
  onChange,
  productions,
  videos,
  channelId,
}: VideoTargetSelectProps) => {
  /**
   * Une production déjà rattachée à sa sortie représente la même vidéo que celle-ci :
   * proposer les deux ferait choisir entre deux entrées identiques, dont une seule
   * porte le script et les créneaux.
   */
  const claimedVideoIds = useMemo(
    () => new Set(productions.map((production) => production.videoId).filter(Boolean)),
    [productions],
  );

  const productionOptions = useMemo(
    () =>
      productions
        .filter(
          (production) => !channelId || !production.channelId || production.channelId === channelId,
        )
        // Les terminées en dernier, puis la sortie visée la plus proche en premier.
        .sort((a, b) => {
          if ((a.status === 'done') !== (b.status === 'done')) return a.status === 'done' ? 1 : -1;
          return (b.plannedDate ?? b.startDate ?? '').localeCompare(
            a.plannedDate ?? a.startDate ?? '',
          );
        }),
    [productions, channelId],
  );

  const videoOptions = useMemo(
    () =>
      videos
        .filter((video) => !claimedVideoIds.has(video.id))
        .filter((video) => !channelId || video.channelId === channelId)
        // La plus récente d'abord : on rattache presque toujours à une sortie fraîche.
        .sort((a, b) => b.date.localeCompare(a.date)),
    [videos, claimedVideoIds, channelId],
  );

  // Le rattachement courant doit rester sélectionnable même s'il sort des listes filtrées
  // (chaîne changée depuis, production terminée…), sinon une édition l'effacerait.
  const missing =
    value !== NONE &&
    !productionOptions.some((p) => `${PRODUCTION_PREFIX}${p.id}` === value) &&
    !videoOptions.some((v) => `${VIDEO_PREFIX}${v.id}` === value);
  const currentLabel =
    productions.find((p) => `${PRODUCTION_PREFIX}${p.id}` === value)?.title ??
    videos.find((v) => `${VIDEO_PREFIX}${v.id}` === value)?.title;

  const resolve = (next: string): VideoTarget => {
    if (next.startsWith(PRODUCTION_PREFIX)) {
      const production = productions.find(
        (item) => item.id === next.slice(PRODUCTION_PREFIX.length),
      );
      return {
        kind: 'production',
        id: production?.id ?? '',
        channelId: production?.channelId ?? null,
      };
    }
    if (next.startsWith(VIDEO_PREFIX)) {
      const video = videos.find((item) => item.id === next.slice(VIDEO_PREFIX.length));
      return { kind: 'video', id: video?.id ?? '', channelId: video?.channelId ?? '' };
    }
    return { kind: 'none' };
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Vidéo</Label>
      <Select value={value} onValueChange={(next) => onChange(resolve(next))}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Aucune</SelectItem>

          {missing && currentLabel && (
            <SelectItem value={value}>{currentLabel} (rattachement actuel)</SelectItem>
          )}

          {productionOptions.length > 0 && (
            <SelectGroup>
              <SelectSeparator />
              <SelectLabel>En production</SelectLabel>
              {productionOptions.map((production) => (
                <SelectItem key={production.id} value={`${PRODUCTION_PREFIX}${production.id}`}>
                  {production.title} · {STATUS_LABELS[production.status]}
                  {production.plannedDate ? ` · ${formatDate(production.plannedDate)}` : ''}
                </SelectItem>
              ))}
            </SelectGroup>
          )}

          {videoOptions.length > 0 && (
            <SelectGroup>
              <SelectSeparator />
              <SelectLabel>Déjà publiées</SelectLabel>
              {videoOptions.map((video) => (
                <SelectItem key={video.id} value={`${VIDEO_PREFIX}${video.id}`}>
                  {formatDate(video.date)} · {video.title}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Les vidéos en préparation et les sorties collectées sur YouTube, les plus récentes d'abord.
        C'est elle qui porte la chaîne : le revenu généré la reprendra.
      </p>
    </div>
  );
};
