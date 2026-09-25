import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { useFilters } from '../../hooks/useFilters.tsx';
import type { Granularity } from '../../../domain/analytics/entities/Analytics.ts';
import { formatDate } from '../../../shared/format.ts';
import { Button } from '../ui/button.tsx';
import { Checkbox } from '../ui/checkbox.tsx';
import { Switch } from '../ui/switch.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog.tsx';
import { PeriodPicker } from './PeriodPicker.tsx';
import { EntityPicker } from './EntityPicker.tsx';
import { pickerSummary, useFilterPicker } from './useFilterPicker.ts';

const GRANULARITIES: Array<{ value: Granularity | 'auto'; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'day', label: 'Jour' },
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
];

/** Une ligne de réglage : intitulé à gauche, contrôle à droite. */
const Row = ({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) => (
  <div className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-0">
    <div className="min-w-0">
      <p className="text-sm font-medium">{label}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);

/**
 * Les filtres sur mobile : **une icône dans la barre d'application, et tout le reste dans
 * une modale**.
 *
 * Dépliée, la barre occupait quatre lignes sur un téléphone — période, chaînes, pas
 * d'agrégation, interrupteur, case à cocher — soit la moitié de la hauteur utile, pour
 * des réglages qu'on change quelques fois par séance. Repliée en un bouton pleine largeur
 * sous la barre d'application, elle prenait encore un bloc entier en haut de chaque
 * écran. Elle n'est plus qu'une icône, à côté de la collecte : le défaut (30 derniers
 * jours, toutes les chaînes) convient la plupart du temps, et la période active se lit
 * dans l'infobulle et en tête de la modale.
 *
 * Les contrôles à l'intérieur sont **exactement les mêmes composants** que sur grand
 * écran : un second jeu, adapté au tactile, aurait fini par se contredire avec le premier
 * (un préréglage ajouté d'un côté et pas de l'autre).
 */
export const FiltersSheet = () => {
  const filters = useFilters();
  const picker = useFilterPicker();
  const [open, setOpen] = useState(false);

  const entityLabel = pickerSummary(picker).label;
  const period = `${formatDate(filters.from)} – ${formatDate(filters.to)}`;
  const entityRowLabel = picker.noun.charAt(0).toUpperCase() + picker.noun.slice(1);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0"
        onClick={() => setOpen(true)}
        aria-label={`Filtres : ${period}, ${entityLabel}`}
        title={`${period} · ${entityLabel}`}
      >
        <SlidersHorizontal className="h-5 w-5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Filtres</DialogTitle>
            <DialogDescription>
              {period} · {entityLabel}. Ils pilotent tous les écrans, pas seulement celui-ci.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col">
            <Row label="Période">
              <PeriodPicker />
            </Row>

            {picker.entities.length > 0 && (
              <Row label={entityRowLabel}>
                <EntityPicker {...picker} />
              </Row>
            )}

            <Row label="Pas" hint="Le découpage des séries.">
              <Select
                value={filters.granularity}
                onValueChange={(value) =>
                  filters.set({ granularity: value as Granularity | 'auto' })
                }
              >
                <SelectTrigger className="h-8 w-[6.5rem] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GRANULARITIES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>

            <Row label="Bénéfices" hint="Sinon le chiffre d'affaires.">
              <Switch
                checked={filters.moneyMode === 'profit'}
                onCheckedChange={(checked) =>
                  filters.set({ moneyMode: checked ? 'profit' : 'revenue' })
                }
              />
            </Row>

            <Row label="Produits reçus" hint="Les compter dans ce qui est gagné.">
              <Checkbox
                checked={filters.includeInKind}
                onCheckedChange={(checked) => filters.set({ includeInKind: checked === true })}
              />
            </Row>
          </div>

          <Button onClick={() => setOpen(false)}>Voir les résultats</Button>
        </DialogContent>
      </Dialog>
    </>
  );
};
