import { Link } from 'react-router-dom';
import type { ProductionStatus } from '../../../domain/production/entities/Production.ts';
import {
  STATUS_COLORS as PRODUCTION_STATUS_COLORS,
  STATUS_LABELS as PRODUCTION_STATUS_LABELS,
} from '../../../domain/production/entities/Production.ts';
import { formatDate, toIsoDate } from '../../../shared/format.ts';
import { cn } from '../../../shared/cn.ts';
import { Checkbox } from '../ui/checkbox.tsx';
import { Label } from '../ui/label.tsx';

/**
 * Les cellules communes aux tables des produits et des sponsors — deux écrans depuis que
 * les partenariats ont quitté leurs onglets, et une seule façon d'afficher une échéance ou
 * la vidéo rattachée.
 */

/**
 * Une échéance dépassée sur quelque chose qui n'est pas arrivé se lit en rouge et ne
 * demande aucune interprétation. Une fois reçu ou payé, la date n'a plus rien d'urgent.
 */
export const DeadlineCell = ({ date, pending }: { date: string | null; pending: boolean }) => {
  if (!date) return <span className="text-muted-foreground">—</span>;
  const late = pending && date < toIsoDate(new Date());
  return (
    <span
      className={cn(
        'tabular',
        late ? 'font-medium text-[var(--negative)]' : 'text-muted-foreground',
      )}
    >
      {formatDate(date)}
    </span>
  );
};

/**
 * L'état de la vidéo à laquelle un produit ou une sponso est rattaché.
 *
 * C'est la question qu'on se pose devant la table des produits : **lesquels n'ont pas
 * encore de vidéo ?** Le titre seul ne le disait pas — une fiche à l'état d'idée et une
 * sortie déjà en ligne s'y lisaient exactement pareil.
 *
 * Trois cas, et le troisième est le seul qui appelle une action : une production en
 * cours (statut affiché dans sa couleur), une sortie **publiée** (elle est en ligne, il
 * n'y a plus rien à faire), ou **rien** — et c'est celui-là qu'on met en accent.
 */
export const LinkedVideoCell = ({
  productionId,
  productionTitle,
  productionStatus,
  videoTitle,
}: {
  productionId: string | null;
  productionTitle: string | null;
  productionStatus: ProductionStatus | null;
  videoTitle: string | null;
}) => {
  if (productionId) {
    return (
      <div className="min-w-0">
        <Link to={`/production/${productionId}`} className="line-clamp-1 hover:underline">
          {productionTitle}
        </Link>
        {productionStatus && (
          <span className="text-xs" style={{ color: PRODUCTION_STATUS_COLORS[productionStatus] }}>
            {PRODUCTION_STATUS_LABELS[productionStatus]}
          </span>
        )}
      </div>
    );
  }

  if (videoTitle) {
    return (
      <div className="min-w-0">
        <span className="line-clamp-1" title={videoTitle}>
          {videoTitle}
        </span>
        <span className="text-xs" style={{ color: PRODUCTION_STATUS_COLORS.done }}>
          Publiée
        </span>
      </div>
    );
  }

  return <span className="text-xs font-medium text-[var(--expense)]">Aucune vidéo</span>;
};

/**
 * « Reste à faire uniquement » : un filtre, pas une préférence.
 *
 * On l'active pour trancher « qu'est-ce qui me reste à faire », puis on le retire pour
 * retrouver l'historique — plusieurs fois dans la même séance. D'où un état local, non
 * persisté, à côté de la période : c'est le même geste, restreindre ce qu'on regarde.
 */
export const OutstandingToggle = ({
  id,
  checked,
  onChange,
  hint,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint: string;
}) => (
  <div className="flex items-center gap-2">
    <Checkbox id={id} checked={checked} onCheckedChange={(value) => onChange(value === true)} />
    <Label htmlFor={id} className="text-xs font-normal text-muted-foreground" title={hint}>
      Reste à faire uniquement
    </Label>
  </div>
);
