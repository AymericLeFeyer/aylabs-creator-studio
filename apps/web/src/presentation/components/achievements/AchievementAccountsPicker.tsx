import { useMemo } from 'react';
import { ChevronDown, Users } from 'lucide-react';
import {
  achievementEntityKey,
  useVisibleAchievements,
} from '../../../application/achievement/usecases/useAchievements.ts';
import { Button } from '../ui/button.tsx';
import { Checkbox } from '../ui/checkbox.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu.tsx';
import { PLATFORM_LABELS, PLATFORMS } from './achievementFormat.ts';

/**
 * Les chaînes et comptes qui comptent dans les achievements — une case par compte, rangée
 * par plateforme. Décocher exclut le compte de l'écran **et** des blocs du dashboard, sur
 * tous les appareils (`useVisibleAchievements`). Le menu reste ouvert au clic : on en
 * décoche souvent plusieurs d'affilée (même parti pris que `EntityPicker`).
 */
export const AchievementAccountsPicker = () => {
  const { all, hidden, setHidden } = useVisibleAchievements();

  const entities = useMemo(() => {
    const seen = new Map<
      string,
      { key: string; platform: (typeof PLATFORMS)[number]; name: string; color: string }
    >();
    for (const item of [...(all?.tracks ?? []), ...(all?.records ?? [])]) {
      const key = achievementEntityKey(item);
      if (!seen.has(key)) {
        seen.set(key, {
          key,
          platform: item.platform,
          name: item.entityName,
          color: item.entityColor,
        });
      }
    }
    return [...seen.values()];
  }, [all]);

  if (entities.length < 2) return null;

  const excluded = new Set(hidden);
  const shown = entities.filter((entity) => !excluded.has(entity.key)).length;
  const toggle = (key: string) =>
    setHidden(excluded.has(key) ? hidden.filter((item) => item !== key) : [...hidden, key]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline">
          <Users className="h-4 w-4" />
          {shown === entities.length ? 'Tous les comptes' : `${shown} / ${entities.length} comptes`}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {PLATFORMS.filter((platform) =>
          entities.some((entity) => entity.platform === platform),
        ).map((platform) => (
          <div key={platform}>
            <DropdownMenuLabel>{PLATFORM_LABELS[platform]}</DropdownMenuLabel>
            {entities
              .filter((entity) => entity.platform === platform)
              .map((entity) => (
                <DropdownMenuItem
                  key={entity.key}
                  onSelect={(event) => {
                    event.preventDefault();
                    toggle(entity.key);
                  }}
                  className="gap-2"
                >
                  <Checkbox checked={!excluded.has(entity.key)} className="pointer-events-none" />
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: entity.color }}
                    aria-hidden
                  />
                  <span className="min-w-0 truncate">{entity.name}</span>
                </DropdownMenuItem>
              ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
