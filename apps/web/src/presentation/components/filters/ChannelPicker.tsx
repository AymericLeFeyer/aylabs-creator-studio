import { Check, ChevronDown } from 'lucide-react';
import { useChannels } from '../../../application/channel/usecases/useChannels.ts';
import { useFilters } from '../../hooks/useFilters.tsx';
import { ChannelAvatar } from './ChannelAvatar.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu.tsx';
import { cn } from '../../../shared/cn.ts';

/** Au-delà, les miniatures empilées deviennent une bouillie : un compteur les remplace. */
const MAX_AVATARS = 3;

/**
 * Le sélecteur de chaînes, en un seul déclencheur.
 *
 * Une puce par chaîne prenait toute une rangée et grandissait à chaque chaîne ajoutée —
 * or la barre de filtres doit tenir sur une ligne. Le déclencheur montre les miniatures
 * des chaînes retenues (empilées, comme un groupe d'avatars) et le nom quand il n'y en a
 * qu'une : l'état se lit sans ouvrir le menu.
 *
 * « Toutes » n'est pas une case parmi d'autres mais **l'absence de sélection** : c'est
 * déjà ce que l'API attend (`channelIds` vide = vue cumulée), et une case à cocher
 * laisserait croire à un état où l'on peut tout décocher.
 */
export const ChannelPicker = () => {
  const filters = useFilters();
  const { data: channels = [] } = useChannels();

  if (channels.length === 0) return null;

  const selected = channels.filter((channel) => filters.channelIds.includes(channel.id));
  const all = selected.length === 0;

  const toggle = (id: string) => {
    filters.set({
      channelIds: filters.channelIds.includes(id)
        ? filters.channelIds.filter((current) => current !== id)
        : [...filters.channelIds, id],
    });
  };

  const label = all
    ? 'Toutes les chaînes'
    : selected.length === 1
      ? selected[0]!.name
      : `${selected.length} chaînes`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex h-8 items-center gap-2 rounded-lg border border-border px-2 text-xs font-medium transition-colors hover:bg-muted',
            !all && 'border-primary/40',
          )}
        >
          {!all && (
            // Empilées avec un léger chevauchement : trois miniatures tiennent dans la
            // largeur de deux, et l'anneau les détache les unes des autres.
            <span className="flex -space-x-1.5">
              {selected.slice(0, MAX_AVATARS).map((channel) => (
                <ChannelAvatar
                  key={channel.id}
                  channel={channel}
                  size={18}
                  className="ring-2 ring-background"
                />
              ))}
            </span>
          )}
          <span className="max-w-[10rem] truncate">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            filters.set({ channelIds: [] });
          }}
          className={cn(all && 'bg-secondary')}
        >
          <span className="flex h-4 w-4 items-center justify-center">
            {all && <Check className="h-3.5 w-3.5" />}
          </span>
          Toutes les chaînes
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {channels.map((channel) => {
          const active = filters.channelIds.includes(channel.id);
          return (
            <DropdownMenuItem
              key={channel.id}
              // Sans ça, le menu se referme au premier clic : on en coche souvent deux.
              onSelect={(event) => {
                event.preventDefault();
                toggle(channel.id);
              }}
            >
              <span className="flex h-4 w-4 items-center justify-center">
                {active && <Check className="h-3.5 w-3.5" />}
              </span>
              <ChannelAvatar channel={channel} size={20} />
              <span className="truncate">{channel.name}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
