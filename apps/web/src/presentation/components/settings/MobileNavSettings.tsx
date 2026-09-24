import { RotateCcw } from 'lucide-react';
import { DEFAULT_MOBILE_NAV, resolveMobileNav } from '../../navigation.ts';
import { usePreferences } from '../../hooks/usePreferences.ts';
import { useNavSections } from '../../hooks/useNavSections.ts';
import { Button } from '../ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.tsx';
import { Label } from '../ui/label.tsx';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '../ui/select.tsx';

const SLOTS = ['À gauche', 'Au centre', 'À droite'] as const;

/**
 * Les trois entrées de la barre du bas, sur mobile. Tout écran du menu est proposé, rangé
 * par famille comme dans le tiroir ; le tiroir, lui, continue de tout porter. Le réglage
 * est propre à l'appareil (préférence locale), comme le reste de cet écran.
 */
export const MobileNavSettings = () => {
  const { preferences, set } = usePreferences();
  const { sections } = useNavSections();
  const current = resolveMobileNav(preferences.mobileNav, sections, DEFAULT_MOBILE_NAV);

  const choose = (slot: number, to: string) => {
    const next = current.map((item) => item.to) as [string, string, string];
    next[slot] = to;
    set({ mobileNav: next });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Barre du bas (mobile)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Trois accès directs, sous le pouce. Tous les écrans restent dans le menu.
        </p>
        {SLOTS.map((slotLabel, slot) => (
          <div key={slotLabel} className="flex items-center justify-between gap-3">
            <Label className="font-normal">{slotLabel}</Label>
            <Select value={current[slot]!.to} onValueChange={(value) => choose(slot, value)}>
              <SelectTrigger className="h-8 w-48 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sections.map((section) => (
                  <SelectGroup key={section.label ?? 'top'}>
                    {section.label && <SelectLabel>{section.label}</SelectLabel>}
                    {section.items.map((item) => (
                      <SelectItem key={item.to} value={item.to}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => set({ mobileNav: [...DEFAULT_MOBILE_NAV] })}
        >
          <RotateCcw className="h-4 w-4" />
          YouTube · Dashboard · Planning
        </Button>
      </CardContent>
    </Card>
  );
};
