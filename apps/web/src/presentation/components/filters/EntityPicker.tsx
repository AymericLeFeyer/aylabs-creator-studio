import { Check, ChevronDown } from 'lucide-react';
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

export interface PickableEntity {
  id: string;
  label: string;
  color: string;
  thumbnailUrl: string | null;
}

interface EntityPickerProps {
  entities: PickableEntity[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** « Toutes les chaînes », « Tous les comptes »… */
  allLabel: string;
  /** « chaînes », « comptes »… pour le libellé « 3 comptes ». */
  noun: string;
}

/**
 * Le sélecteur d'entités (chaînes, comptes Instagram, comptes TikTok…), en un seul
 * déclencheur — factorisé depuis `ChannelPicker`, qui n'en est plus qu'un habillage :
 * trois écrans (dashboard, `/instagram`, `/tiktok`) posent exactement la même question
 * (« sur lesquels ? »), avec juste la source des données qui change.
 *
 * **Invisible s'il n'y a rien à choisir** : à zéro entité, rien à filtrer ; à une seule,
 * il n'y a pas de question à poser — la réponse est déjà connue. C'est ce qui fait que le
 * sélecteur disparaît de lui-même sur `/instagram` ou `/tiktok` tant qu'un seul compte est
 * suivi, le cas le plus courant pour un créateur solo.
 *
 * « Toutes » n'est pas une case parmi d'autres mais **l'absence de sélection** : c'est
 * déjà ce que l'API attend (liste vide = vue cumulée), et une case à cocher laisserait
 * croire à un état où l'on peut tout décocher.
 */
export const EntityPicker = ({
  entities,
  selectedIds,
  onChange,
  allLabel,
  noun,
}: EntityPickerProps) => {
  if (entities.length <= 1) return null;

  const selected = entities.filter((entity) => selectedIds.includes(entity.id));
  const all = selected.length === 0;

  const toggle = (id: string) => {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((current) => current !== id)
        : [...selectedIds, id],
    );
  };

  const label = all
    ? allLabel
    : selected.length === 1
      ? selected[0]!.label
      : `${selected.length} ${noun}`;

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
              {selected.slice(0, MAX_AVATARS).map((entity) => (
                <ChannelAvatar
                  key={entity.id}
                  channel={{
                    name: entity.label,
                    color: entity.color,
                    thumbnailUrl: entity.thumbnailUrl,
                  }}
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
            onChange([]);
          }}
          className={cn(all && 'bg-secondary')}
        >
          <span className="flex h-4 w-4 items-center justify-center">
            {all && <Check className="h-3.5 w-3.5" />}
          </span>
          {allLabel}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {entities.map((entity) => {
          const active = selectedIds.includes(entity.id);
          return (
            <DropdownMenuItem
              key={entity.id}
              // Sans ça, le menu se referme au premier clic : on en coche souvent deux.
              onSelect={(event) => {
                event.preventDefault();
                toggle(entity.id);
              }}
            >
              <span className="flex h-4 w-4 items-center justify-center">
                {active && <Check className="h-3.5 w-3.5" />}
              </span>
              <ChannelAvatar
                channel={{
                  name: entity.label,
                  color: entity.color,
                  thumbnailUrl: entity.thumbnailUrl,
                }}
                size={20}
              />
              <span className="truncate">{entity.label}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
