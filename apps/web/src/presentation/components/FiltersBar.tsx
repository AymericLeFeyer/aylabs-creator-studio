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
 * Barre de filtres commune au dashboard et aux listes.
 *
 * La sélection de chaînes est un multi-choix : aucune chaîne cochée signifie
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
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        {/* --- Période --- */}
        <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
          {PRESETS.map((preset) => (
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
          <button
            type="button"
            onClick={() => filters.set({ preset: 'custom' })}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              filters.preset === 'custom'
                ? 'bg-background text-foreground shadow'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {PERIOD_LABELS.custom}
          </button>
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
            <SelectTrigger className="h-8 w-28 text-xs">
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

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground tabular">
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
      </div>

      {/* --- Chaînes --- */}
      {channels.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <button
            type="button"
            onClick={() => filters.set({ channelIds: [] })}
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              filters.channelIds.length === 0
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {filters.channelIds.length === 0 && <Check className="h-3 w-3" />}
            Toutes (cumulé)
          </button>

          {channels.map((channel) => {
            const selected = filters.channelIds.includes(channel.id);
            return (
              <button
                key={channel.id}
                type="button"
                onClick={() => toggleChannel(channel.id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
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

      {collectAll.data && (
        <p className="text-xs text-muted-foreground">
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
