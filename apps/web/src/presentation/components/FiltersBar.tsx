import { RefreshCw } from 'lucide-react';
import { useChannels } from '../../application/channel/usecases/useChannels.ts';
import { useAnalytics, useCollectAll } from '../../application/analytics/usecases/useAnalytics.ts';
import {
  PERIOD_LABELS,
  useAnalyticsParams,
  useFilters,
  type PeriodPreset,
} from '../hooks/useFilters.tsx';
import type { Granularity } from '../../domain/analytics/entities/Analytics.ts';
import { Button } from './ui/button.tsx';
import { Checkbox } from './ui/checkbox.tsx';
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
 * Deux rangées, dans l'ordre où on s'en sert : d'abord *quand* (période, pas, collecte),
 * puis *quoi* (chaînes) et *comment le lire* (avantages en nature, repères de sortie).
 * Ces deux dernières coches pilotent tous les graphiques : les laisser dans une carte
 * obligeait à remonter en haut de page pour changer d'avis.
 */
export const FiltersBar = () => {
  const filters = useFilters();
  const { data: channels = [] } = useChannels();
  const collectAll = useCollectAll();

  // Même clé de cache que le dashboard : la requête est partagée, pas dupliquée.
  const { data } = useAnalytics(useAnalyticsParams());
  const videoCount = data?.videos.length ?? 0;

  const toggleChannel = (id: string) => {
    filters.set({
      channelIds: filters.channelIds.includes(id)
        ? filters.channelIds.filter((current) => current !== id)
        : [...filters.channelIds, id],
    });
  };

  return (
    <div className="flex flex-col gap-2 pb-2.5">
      {/* --- Quand --- */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
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

        {/* Aligné avec le sélecteur de période, à l'autre bout de la même rangée. */}
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => collectAll.mutate()}
          disabled={collectAll.isPending}
        >
          <RefreshCw className={cn('h-4 w-4', collectAll.isPending && 'animate-spin')} />
          Collecter
        </Button>
      </div>

      {/* --- Quoi, et comment le lire --- */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {channels.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => filters.set({ channelIds: [] })}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                filters.channelIds.length === 0
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
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

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:ml-auto">
          <div className="flex items-center gap-2">
            <Checkbox
              id="include-in-kind"
              checked={filters.includeInKind}
              onCheckedChange={(checked) => filters.set({ includeInKind: checked === true })}
            />
            <Label htmlFor="include-in-kind" className="text-xs font-normal text-muted-foreground">
              Compter les avantages en nature
            </Label>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="show-videos"
              checked={filters.showVideos}
              onCheckedChange={(checked) => filters.set({ showVideos: checked === true })}
            />
            <Label
              htmlFor="show-videos"
              className="text-xs font-normal text-muted-foreground"
              title={
                videoCount === 0
                  ? 'Aucune sortie connue sur la période. Les vidéos sont enregistrées à chaque collecte.'
                  : undefined
              }
            >
              Marquer les sorties de vidéo
              {videoCount > 0 && ` (${videoCount})`}
            </Label>
          </div>
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
