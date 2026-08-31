import { Check, RefreshCw } from 'lucide-react';
import { useChannels } from '../../application/channel/usecases/useChannels.ts';
import { useCollectAll } from '../../application/analytics/usecases/useAnalytics.ts';
import { PERIOD_LABELS, useFilters, type PeriodPreset } from '../hooks/useFilters.tsx';
import type { Granularity } from '../../domain/analytics/entities/Analytics.ts';
import { Button } from './ui/button.tsx';
import { Input } from './ui/input.tsx';
import { Label } from './ui/label.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.tsx';
import { cn } from '../../shared/cn.ts';

const PRESETS: PeriodPreset[] = ['7d', '30d', '90d', '12m', 'ytd', 'all'];
const GRANULARITIES: Array<{ value: Granularity | 'auto'; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'day', label: 'Jour' },
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
];

/**
 * Barre de filtres du dashboard et des listes, posée dans l'en-tête collant.
 *
 * Tout tient sur une seule rangée qui se replie : l'en-tête reste visible en
 * permanence, donc chaque pixel de hauteur se paie sur toutes les pages.
 * La sélection de chaînes est un multi-choix — aucune chaîne cochée signifie
 * « toutes », c'est-à-dire la vue cumulée.
 */
export const FiltersBar = () => {
  const filters = useFilters();
  const { data: channels = [] } = useChannels();
  const collectAll = useCollectAll();

  const toggleChannel = (id: string) => {
    filters.set({
      channelIds: filters.channelIds.includes(id)
        ? filters.channelIds.filter((current) => current !== id)
        : [...filters.channelIds, id],
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
      {/* --- Période --- */}
      <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
        {[...PRESETS, 'custom' as const].map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => filters.set({ preset })}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              filters.preset === preset
                ? 'bg-background text-foreground shadow'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {PERIOD_LABELS[preset]}
          </button>
        ))}
      </div>

      {filters.preset === 'custom' && (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={filters.customFrom}
            onChange={(event) => filters.set({ customFrom: event.target.value })}
            className="h-8 w-auto text-xs"
          />
          <span className="text-xs text-muted-foreground">au</span>
          <Input
            type="date"
            value={filters.customTo}
            onChange={(event) => filters.set({ customTo: event.target.value })}
            className="h-8 w-auto text-xs"
          />
        </div>
      )}

      {/* --- Granularité --- */}
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground">Pas</Label>
        <Select
          value={filters.granularity}
          onValueChange={(value) => filters.set({ granularity: value as Granularity | 'auto' })}
        >
          <SelectTrigger className="h-8 w-24 text-xs">
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

      {/* --- Chaînes --- */}
      {channels.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-l border-border pl-3">
          <button
            type="button"
            onClick={() => filters.set({ channelIds: [] })}
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
              filters.channelIds.length === 0
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {filters.channelIds.length === 0 && <Check className="h-3 w-3" />}
            Toutes
          </button>

          {channels.map((channel) => {
            const selected = filters.channelIds.includes(channel.id);
            return (
              <button
                key={channel.id}
                type="button"
                onClick={() => toggleChannel(channel.id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                  selected
                    ? 'border-transparent text-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
                style={selected ? { backgroundColor: `${channel.color}26` } : undefined}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: channel.color }}
                  aria-hidden
                />
                {channel.name}
              </button>
            );
          })}
        </div>
      )}

      <div className="ml-auto flex items-center gap-2">
        <span className="hidden text-xs text-muted-foreground tabular lg:inline">
          {filters.from} → {filters.to}
        </span>
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

      {collectAll.data && (
        <p className="w-full truncate text-xs text-muted-foreground">
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
