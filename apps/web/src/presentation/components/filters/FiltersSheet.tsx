import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { useFilters } from '../../hooks/useFilters.tsx';
import { useChannels } from '../../../application/channel/usecases/useChannels.ts';
import type { Granularity } from '../../../domain/analytics/entities/Analytics.ts';
import { formatDate } from '../../../shared/format.ts';
import { Button } from '../ui/button.tsx';
import { Checkbox } from '../ui/checkbox.tsx';
import { Switch } from '../ui/switch.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog.tsx';
import { PeriodPicker } from './PeriodPicker.tsx';
import { ChannelPicker } from './ChannelPicker.tsx';
import { cn } from '../../../shared/cn.ts';

const GRANULARITIES: Array<{ value: Granularity | 'auto'; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'day', label: 'Jour' },
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
];

/** Une ligne de réglage : intitulé à gauche, contrôle à droite. */
const Row = ({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) => (
  <div className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-0">
    <div className="min-w-0">
      <p className="text-sm font-medium">{label}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);

/**
 * Les filtres sur mobile : **un bouton, et tout le reste dans une modale**.
 *
 * Dépliée, la barre occupait quatre lignes sur un téléphone — période, chaînes, pas
 * d'agrégation, interrupteur, case à cocher — soit la moitié de la hauteur utile, pour
 * des réglages qu'on change quelques fois par séance. L'écran commençait sous le pli.
 *
 * Le déclencheur affiche **l'état qui compte** : la période, et le nombre de chaînes
 * retenues quand ce n'est pas « toutes ». C'est ce qu'on vient vérifier d'un coup d'œil
 * avant de lire un chiffre — le pas d'agrégation ou la case des produits reçus, non.
 *
 * Les contrôles à l'intérieur sont **exactement les mêmes composants** que sur grand
 * écran : un second jeu, adapté au tactile, aurait fini par se contredire avec le premier
 * (un préréglage ajouté d'un côté et pas de l'autre).
 */
export const FiltersSheet = () => {
  const filters = useFilters();
  const { data: channels = [] } = useChannels();
  const [open, setOpen] = useState(false);

  const selected = filters.channelIds.length;
  const channelLabel =
    selected === 0
      ? 'Toutes les chaînes'
      : selected === 1
        ? (channels.find((channel) => channel.id === filters.channelIds[0])?.name ?? '1 chaîne')
        : `${selected} chaînes`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'flex w-full items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-left',
          'transition-colors active:bg-accent',
        )}
      >
        <SlidersHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {formatDate(filters.from)} – {formatDate(filters.to)}
          </span>
          <span className="block truncate text-xs text-muted-foreground">{channelLabel}</span>
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Filtres</DialogTitle>
            <DialogDescription>
              Ils pilotent tous les écrans, pas seulement celui-ci.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col">
            <Row label="Période">
              <PeriodPicker />
            </Row>

            <Row label="Chaînes">
              <ChannelPicker />
            </Row>

            <Row label="Pas" hint="Le découpage des séries.">
              <Select
                value={filters.granularity}
                onValueChange={(value) =>
                  filters.set({ granularity: value as Granularity | 'auto' })
                }
              >
                <SelectTrigger className="h-8 w-[6.5rem] text-xs">
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
            </Row>

            <Row label="Bénéfices" hint="Sinon le chiffre d'affaires.">
              <Switch
                checked={filters.moneyMode === 'profit'}
                onCheckedChange={(checked) =>
                  filters.set({ moneyMode: checked ? 'profit' : 'revenue' })
                }
              />
            </Row>

            <Row label="Produits reçus" hint="Les compter dans ce qui est gagné.">
              <Checkbox
                checked={filters.includeInKind}
                onCheckedChange={(checked) => filters.set({ includeInKind: checked === true })}
              />
            </Row>
          </div>

          <Button onClick={() => setOpen(false)}>Voir les résultats</Button>
        </DialogContent>
      </Dialog>
    </>
  );
};
