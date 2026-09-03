import { RefreshCw } from 'lucide-react';
import { useCollectAll } from '../../application/analytics/usecases/useAnalytics.ts';
import { useFilters } from '../hooks/useFilters.tsx';
import type { Granularity } from '../../domain/analytics/entities/Analytics.ts';
import { Button } from './ui/button.tsx';
import { Checkbox } from './ui/checkbox.tsx';
import { Label } from './ui/label.tsx';
import { Switch } from './ui/switch.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.tsx';
import { PeriodPicker } from './filters/PeriodPicker.tsx';
import { ChannelPicker } from './filters/ChannelPicker.tsx';
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
 */
export const FiltersBar = () => {
  const filters = useFilters();
  const collectAll = useCollectAll();

  return (
    <div className="flex flex-col gap-2 pb-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
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

          <Button
            variant="outline"
            size="sm"
            onClick={() => collectAll.mutate()}
            disabled={collectAll.isPending}
          >
            <RefreshCw className={cn('h-4 w-4', collectAll.isPending && 'animate-spin')} />
            Collecter
          </Button>
        </div>
      </div>

      {collectAll.data && (
        <p className="truncate text-xs text-muted-foreground">
          {collectAll.data.results
            .map(
              (result) =>
                `${result.channelName} : ${result.message ?? `${result.daysUpserted ?? 0} jour(s)`}`,
            )
            .join(' · ')}
        </p>
      )}
    </div>
  );
};
