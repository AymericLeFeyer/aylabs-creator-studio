import { useFilters } from '../hooks/useFilters.tsx';
import type { Granularity } from '../../domain/analytics/entities/Analytics.ts';
import { Checkbox } from './ui/checkbox.tsx';
import { Label } from './ui/label.tsx';
import { Switch } from './ui/switch.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.tsx';
import { PeriodPicker } from './filters/PeriodPicker.tsx';
import { ChannelPicker } from './filters/ChannelPicker.tsx';
import { CollectAction } from './filters/CollectAction.tsx';
import { FiltersSheet } from './filters/FiltersSheet.tsx';
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
 * **Sur mobile, elle se replie en un seul bouton** (`FiltersSheet`) : les cinq réglages
 * dépliés y occupaient quatre lignes, soit la moitié de la hauteur utile, et l'écran
 * commençait sous le pli. La collecte, elle, n'est plus ici du tout sur mobile — elle est
 * passée en action de la barre d'application, là où le pouce l'atteint.
 */
export const FiltersBar = () => {
  const filters = useFilters();

  return (
    <div className="flex flex-col gap-2 pb-2.5">
      <div className="lg:hidden">
        <FiltersSheet />
      </div>

      <div className="hidden flex-wrap items-center gap-x-3 gap-y-2 lg:flex">
        <PeriodPicker />
        <ChannelPicker />

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

          <CollectAction />
        </div>
      </div>
    </div>
  );
};
