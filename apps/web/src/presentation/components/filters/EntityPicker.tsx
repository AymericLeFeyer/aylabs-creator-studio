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
import { checkedIn, pickerSummary, type EntityGroup } from './useFilterPicker.ts';

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
  /** Plusieurs sources dans un même menu, chacune cochée par défaut (voir `useFilterPicker`). */
  groups?: EntityGroup[];
}

/**
 * Le sélecteur d'entités (chaînes, comptes Instagram, comptes TikTok…), en un seul
 * déclencheur — factorisé depuis `ChannelPicker`, qui n'en est plus qu'un habillage :
 * trois écrans (dashboard, `/instagram`, `/tiktok`) posent exactement la même question
 * (« sur lesquels ? »), avec juste la source des données qui change.
 *
 * **Invisible seulement à zéro entité** : rien à filtrer. À une seule, il reste affiché
 * (menu d'un seul élément) : il dit **quel** compte on regarde — sur `/instagram` ou
 * `/tiktok`, le cas le plus courant pour un créateur solo, c'est la seule trace à l'écran
 * du compte suivi.
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
  groups,
}: EntityPickerProps) => {
  if (entities.length === 0) return null;

  const { label, selected } = pickerSummary({
    entities,
    selectedIds,
    onChange,
    allLabel,
    noun,
    groups,
  });
  const all = selected.length === 0;

  const toggle = (id: string) => {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((current) => current !== id)
        : [...selectedIds, id],
    );
  };

  /**
   * En groupes, chaque entité est **cochée par défaut** (sélection vide = tout) : décocher
   * part de la liste complète, et revenir à la liste complète la remet à vide — l'API lit
   * « vide » comme « tout », et c'est ce qui garde les comptes ajoutés plus tard cochés.
   * La dernière case d'un groupe ne se décoche pas : un groupe vide voudrait dire « tout ».
   */
  const toggleInGroup = (group: EntityGroup, id: string) => {
    const everything = group.entities.map((entity) => entity.id);
    const current = group.selectedIds.length === 0 ? everything : group.selectedIds;
    const next = current.includes(id)
      ? current.filter((candidate) => candidate !== id)
      : [...current, id];
    if (next.length === 0) return;
    group.onChange(next.length === everything.length ? [] : next);
  };

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
            if (groups) groups.forEach((group) => group.onChange([]));
            else onChange([]);
          }}
          className={cn(all && 'bg-secondary')}
        >
          <span className="flex h-4 w-4 items-center justify-center">
            {all && <Check className="h-3.5 w-3.5" />}
          </span>
          {allLabel}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {groups
          ? groups.map((group) => {
              const checked = new Set(checkedIn(group).map((entity) => entity.id));
              return (
                <div key={group.label}>
                  <p className="px-2 pb-0.5 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </p>
                  {group.entities.map((entity) => (
                    <EntityItem
                      key={entity.id}
                      entity={entity}
                      active={checked.has(entity.id)}
                      onToggle={() => toggleInGroup(group, entity.id)}
                    />
                  ))}
                </div>
              );
            })
          : entities.map((entity) => (
              <EntityItem
                key={entity.id}
                entity={entity}
                active={selectedIds.includes(entity.id)}
                onToggle={() => toggle(entity.id)}
              />
            ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const EntityItem = ({
  entity,
  active,
  onToggle,
}: {
  entity: PickableEntity;
  active: boolean;
  onToggle: () => void;
}) => (
  <DropdownMenuItem
    // Sans ça, le menu se referme au premier clic : on en coche souvent deux.
    onSelect={(event) => {
      event.preventDefault();
      onToggle();
    }}
  >
    <span className="flex h-4 w-4 items-center justify-center">
      {active && <Check className="h-3.5 w-3.5" />}
    </span>
    <ChannelAvatar
      channel={{ name: entity.label, color: entity.color, thumbnailUrl: entity.thumbnailUrl }}
      size={20}
    />
    <span className="truncate">{entity.label}</span>
  </DropdownMenuItem>
);
