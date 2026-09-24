import { ArrowDown, ArrowUp, Plus, RotateCcw, X } from 'lucide-react';
import {
  DEFAULT_MOBILE_NAV,
  MOBILE_NAV_MAX,
  MOBILE_NAV_MIN,
  flattenNav,
  resolveMobileNav,
} from '../../navigation.ts';
import { usePreferences } from '../../hooks/usePreferences.ts';
import { useNavSections } from '../../hooks/useNavSections.ts';
import { Button } from '../ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.tsx';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '../ui/select.tsx';

const iconButton = 'h-8 w-8 shrink-0';

/**
 * Les entrées de la barre du bas, sur mobile : **de une à cinq**, dans l'ordre de gauche à
 * droite. Tout écran du menu est proposé, rangé par famille comme dans le tiroir ; le
 * tiroir, lui, continue de tout porter. Un écran déjà dans la barre n'est pas reproposé
 * ailleurs — deux fois le même onglet ne mènerait nulle part de plus.
 *
 * Le réglage est propre à l'appareil (préférence locale), comme le reste de cet écran.
 */
export const MobileNavSettings = () => {
  const { preferences, set } = usePreferences();
  const { sections } = useNavSections();
  const current = resolveMobileNav(preferences.mobileNav, sections, DEFAULT_MOBILE_NAV).map(
    (item) => item.to,
  );

  const save = (next: string[]) => set({ mobileNav: next });
  const replace = (slot: number, to: string) =>
    save(current.map((path, index) => (index === slot ? to : path)));
  const move = (slot: number, delta: number) => {
    const next = [...current];
    const [item] = next.splice(slot, 1);
    next.splice(slot + delta, 0, item!);
    save(next);
  };
  const remove = (slot: number) => save(current.filter((_, index) => index !== slot));
  const unused = flattenNav(sections).filter((item) => !current.includes(item.to));
  const add = () => {
    if (unused[0]) save([...current, unused[0].to]);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Barre du bas (mobile)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          De {MOBILE_NAV_MIN} à {MOBILE_NAV_MAX} accès directs, sous le pouce, de gauche à droite.
          Tous les écrans restent dans le menu.
        </p>

        <ol className="space-y-2">
          {current.map((path, slot) => (
            <li key={`${slot}:${path}`} className="flex items-center gap-1.5">
              <span className="w-4 shrink-0 text-center text-xs tabular text-muted-foreground">
                {slot + 1}
              </span>
              <Select value={path} onValueChange={(value) => replace(slot, value)}>
                <SelectTrigger className="h-8 min-w-0 flex-1 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sections.map((section) => (
                    <SelectGroup key={section.label ?? 'top'}>
                      {section.label && <SelectLabel>{section.label}</SelectLabel>}
                      {section.items
                        .filter((item) => item.to === path || !current.includes(item.to))
                        .map((item) => (
                          <SelectItem key={item.to} value={item.to}>
                            {item.label}
                          </SelectItem>
                        ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                className={iconButton}
                disabled={slot === 0}
                onClick={() => move(slot, -1)}
                aria-label="Vers la gauche"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={iconButton}
                disabled={slot === current.length - 1}
                onClick={() => move(slot, 1)}
                aria-label="Vers la droite"
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={iconButton}
                disabled={current.length <= MOBILE_NAV_MIN}
                onClick={() => remove(slot)}
                aria-label="Retirer de la barre"
              >
                <X className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={current.length >= MOBILE_NAV_MAX || unused.length === 0}
            onClick={add}
          >
            <Plus className="h-4 w-4" />
            Ajouter un accès
          </Button>
          <Button variant="ghost" size="sm" onClick={() => save([...DEFAULT_MOBILE_NAV])}>
            <RotateCcw className="h-4 w-4" />
            YouTube · Dashboard · Planning
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
