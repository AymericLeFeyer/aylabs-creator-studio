import { useMemo } from 'react';
import { useVideos } from '../../../application/video/usecases/useVideos.ts';
import type { Video } from '../../../domain/video/entities/Video.ts';
import { formatDate } from '../../../shared/format.ts';
import { Label } from '../ui/label.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select.tsx';

/** Valeur du Select pour « aucune vidéo » : Radix refuse une valeur vide. */
export const NO_VIDEO = '__none__';

interface VideoSelectProps {
  id: string;
  /** Identifiant de vidéo, ou `NO_VIDEO`. */
  value: string;
  /** Reçoit la vidéo choisie pour que l'appelant en déduise la chaîne. */
  onChange: (value: string, video: Video | null) => void;
  /** Chaîne sélectionnée dans le formulaire ; `null` (global) ne filtre rien. */
  channelId: string | null;
}

/**
 * Rattachement facultatif d'un revenu ou d'une dépense à une sortie de vidéo.
 *
 * La liste ignore la période affichée : une sponso encaissée aujourd'hui se rattache
 * souvent à une vidéo sortie il y a plusieurs mois. Elle se restreint en revanche à la
 * chaîne choisie, pour ne pas proposer les vidéos d'une autre chaîne.
 */
export const VideoSelect = ({ id, value, onChange, channelId }: VideoSelectProps) => {
  const { data: videos = [], isLoading } = useVideos();

  const options = useMemo(
    () => (channelId ? videos.filter((video) => video.channelId === channelId) : videos),
    [videos, channelId],
  );

  // Une vidéo déjà rattachée mais absente de la liste (chaîne changée depuis, ou sortie
  // au-delà du plafond) doit rester sélectionnable, sinon l'édition l'effacerait.
  const selected = videos.find((video) => video.id === value);
  const withSelected =
    selected && !options.some((video) => video.id === selected.id)
      ? [selected, ...options]
      : options;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Vidéo</Label>
      <Select
        value={value}
        onValueChange={(next) =>
          onChange(next, next === NO_VIDEO ? null : (videos.find((v) => v.id === next) ?? null))
        }
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_VIDEO}>Aucune</SelectItem>
          {withSelected.map((video) => (
            <SelectItem key={video.id} value={video.id}>
              {formatDate(video.date)} · {video.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        {isLoading
          ? 'Chargement des sorties…'
          : withSelected.length === 0
            ? 'Aucune sortie connue. Les vidéos sont enregistrées à chaque collecte.'
            : 'Facultatif : alimente le tableau de performance par vidéo.'}
      </p>
    </div>
  );
};
