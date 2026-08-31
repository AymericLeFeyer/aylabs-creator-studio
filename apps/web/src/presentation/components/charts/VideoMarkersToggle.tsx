import { useFilters } from '../../hooks/useFilters.tsx';
import { Checkbox } from '../ui/checkbox.tsx';
import { Label } from '../ui/label.tsx';

/**
 * Coche « Marquer les sorties de vidéo ».
 *
 * Le réglage est partagé : `id` ne sert qu'à relier la coche à son libellé, les deux
 * instances pilotent le même état.
 */
export const VideoMarkersToggle = ({ id, count }: { id: string; count: number }) => {
  const filters = useFilters();

  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={id}
        checked={filters.showVideos}
        onCheckedChange={(checked) => filters.set({ showVideos: checked === true })}
      />
      <Label
        htmlFor={id}
        className="text-xs font-normal text-muted-foreground"
        title={
          count === 0
            ? 'Aucune sortie connue sur la période. Les vidéos sont enregistrées à chaque collecte.'
            : undefined
        }
      >
        Marquer les sorties de vidéo
        {count > 0 && ` (${count})`}
      </Label>
    </div>
  );
};
