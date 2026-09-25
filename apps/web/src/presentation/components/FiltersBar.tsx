import { useFilters } from '../hooks/useFilters.tsx';
import type { Granularity } from '../../domain/analytics/entities/Analytics.ts';
import { Checkbox } from './ui/checkbox.tsx';
import { Label } from './ui/label.tsx';
import { Switch } from './ui/switch.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.tsx';
import { PeriodPicker } from './filters/PeriodPicker.tsx';
import { ContextualEntityPicker } from './filters/ContextualEntityPicker.tsx';
import { CollectAction } from './filters/CollectAction.tsx';
import { cn } from '../../shared/cn.ts';

const GRANULARITIES: Array<{ value: Granularity | 'auto'; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'day', label: 'Jour' },
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
];

/**
 * La barre de filtres, sur **une seule ligne**.
 *
 * Elle en occupait deux : sept boutons de période, puis une puce par chaîne. Les deux
 * réglages sont désormais des déclencheurs compacts (`PeriodPicker`, `ChannelPicker`)
 * qui affichent leur état sans le déplier — c'est ce qui libère la place. L'ordre reste
 * celui dans lequel on s'en sert : *quand*, *quoi*, puis *comment le lire*.
 *
 * La case « Marquer les sorties de vidéo » a quitté cette barre pour Paramètres →
 * Application : elle se règle une fois et ne change plus, alors que tout ce qui reste
 * ici se change plusieurs fois par session.
 *
 * **Grand écran seulement.** Sur mobile, elle n'est pas montée du tout : les filtres y
 * sont une icône de la barre d'application (`FiltersSheet`), à côté de la collecte.
 */
export const FiltersBar = ({
  actionsRef,
}: {
  /** Le point d'arrivée de `FilterBarActions` : les actions d'écran, avant la collecte. */
  actionsRef?: (node: HTMLDivElement | null) => void;
}) => {
  const filters = useFilters();

  return (
    <div className="pb-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <PeriodPicker />
        <ContextualEntityPicker />

        <div className="flex items-center gap-1.5">
          <Label className="text-xs text-muted-foreground">Pas</Label>
          <Select
            value={filters.granularity}
            onValueChange={(value) => filters.set({ granularity: value as Granularity | 'auto' })}
          >
            <SelectTrigger className="h-8 w-[5.5rem] text-xs">
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
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2">
            <Label
              htmlFor="money-mode"
              className={cn(
                'text-xs font-normal',
                filters.moneyMode === 'revenue' ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              CA
            </Label>
            <Switch
              id="money-mode"
              checked={filters.moneyMode === 'profit'}
              onCheckedChange={(checked) =>
                filters.set({ moneyMode: checked ? 'profit' : 'revenue' })
              }
            />
            <Label
              htmlFor="money-mode"
              className={cn(
                'text-xs font-normal',
                filters.moneyMode === 'profit' ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              Bénéfices
            </Label>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="include-in-kind"
              checked={filters.includeInKind}
              onCheckedChange={(checked) => filters.set({ includeInKind: checked === true })}
            />
            <Label htmlFor="include-in-kind" className="text-xs font-normal text-muted-foreground">
              Produits reçus
            </Label>
          </div>

          <div ref={actionsRef} className="flex items-center gap-2 empty:hidden" />
          <CollectAction />
        </div>
      </div>
    </div>
  );
};
