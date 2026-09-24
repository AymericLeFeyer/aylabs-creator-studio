import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useDashboardWidgets } from '../../application/dashboard/usecases/useDashboard.ts';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog.tsx';
import { Input } from '../components/ui/input.tsx';
import { AddToDashboardButton } from './AddToDashboard.tsx';
import { BLOCKS } from './registry.tsx';

/**
 * Tout le catalogue, rangé par page d'origine, pour ajouter un bloc **sans quitter le
 * dashboard**. Le chemin habituel reste l'icône au survol, sur la page du bloc — on y voit
 * ce qu'on ajoute — ; celui-ci sert à composer d'un coup, ou à retrouver un bloc dont on
 * ne sait plus sur quelle page il vit.
 */
export const BlockCatalogDialog = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const [query, setQuery] = useState('');
  const { data: widgets = [] } = useDashboardWidgets();

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const map = new Map<string, Array<[string, (typeof BLOCKS)[string]]>>();
    for (const entry of Object.entries(BLOCKS)) {
      const [, block] = entry;
      if (needle && !`${block.label} ${block.group}`.toLowerCase().includes(needle)) continue;
      map.set(block.group, [...(map.get(block.group) ?? []), entry]);
    }
    return [...map.entries()];
  }, [query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ajouter des blocs</DialogTitle>
          <DialogDescription>
            {widgets.length} bloc(s) sur le dashboard. Chacun reste aussi sur sa page d'origine.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Chercher un bloc…"
            className="pl-8"
          />
        </div>

        <div className="space-y-4">
          {groups.map(([group, entries]) => (
            <section key={group} className="space-y-1">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {group}
              </h3>
              <ul className="grid gap-1 sm:grid-cols-2">
                {entries.map(([id, block]) => (
                  <li
                    key={id}
                    className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted/60"
                  >
                    <span className="min-w-0 truncate">{block.label}</span>
                    <AddToDashboardButton
                      blockId={id}
                      width={block.width}
                      label={block.label}
                      className="shrink-0"
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {groups.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">Aucun bloc trouvé.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
