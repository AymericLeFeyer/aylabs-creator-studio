import type { ProductionSlot } from '../../../domain/production/entities/ProductionSlot.ts';
import { formatSlotTime } from '../../../domain/production/entities/ProductionSlot.ts';
import { formatDate } from '../../../shared/format.ts';
import { cn } from '../../../shared/cn.ts';

interface SlotSummaryProps {
  slot: ProductionSlot;
  /** Ajoute la vidéo à la ligne de contexte. Inutile sur la fiche d'une vidéo. */
  showProduction?: boolean;
  /** Barre le titre quand le créneau est fait. */
  strikeWhenDone?: boolean;
}

/**
 * Le résumé d'un créneau, en trois lignes.
 *
 * **L'étape en titre** : c'est elle qui dit ce qu'on va faire, et elle est là dans la
 * quasi-totalité des cas. L'intitulé libre ne fait que préciser, il passe en dessous ;
 * date, horaire et vidéo ferment la ligne de contexte.
 *
 * Extrait parce que deux écrans l'affichent — les prochains créneaux de la page
 * production et l'onglet Créneaux d'une fiche. Dupliqué, le rendu finissait par diverger
 * dès la première retouche.
 */
export const SlotSummary = ({ slot, showProduction, strikeWhenDone }: SlotSummaryProps) => (
  <span className="min-w-0 flex-1">
    <span
      className={cn('block truncate font-medium', strikeWhenDone && slot.done && 'line-through')}
    >
      {slot.stepName ?? 'Créneau'}
    </span>
    {slot.label && <span className="block truncate text-xs">{slot.label}</span>}
    <span className="block truncate text-xs text-muted-foreground">
      {formatDate(slot.date)} · {formatSlotTime(slot)}
      {showProduction ? ` · ${slot.productionTitle}` : ''}
    </span>
  </span>
);
