import { useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Columns3, GripVertical, ImageIcon, RotateCcw, Trash2, Type } from 'lucide-react';
import type { DashboardWidget } from '../../domain/dashboard/entities/DashboardWidget.ts';
import { WIDGET_WIDTHS } from '../../domain/dashboard/entities/DashboardWidget.ts';
import {
  useRemoveWidget,
  useUpdateWidget,
} from '../../application/dashboard/usecases/useDashboard.ts';
import { cn } from '../../shared/cn.ts';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog.tsx';
import { Button } from '../components/ui/button.tsx';
import { Input } from '../components/ui/input.tsx';
import { Label } from '../components/ui/label.tsx';
import { WIDGET_ICONS } from './widgetIcons.ts';

const WIDTH_LABELS: Record<number, string> = {
  1: '1/6',
  2: '1/3',
  3: 'Moitié',
  4: '2/3',
  5: '5/6',
  6: 'Pleine largeur',
};

const toolButton =
  'flex h-7 items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground';

interface WidgetToolbarProps {
  widget: DashboardWidget;
  /** Nom d'origine du bloc (catalogue), en repli du titre. */
  label: string;
  onGripDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}

/**
 * La barre d'édition d'un bloc, **au-dessus du bloc réel** : poignée de glissement, texte,
 * icône, largeur, retrait. Ce qu'on règle s'applique aussitôt au bloc juste en dessous —
 * les écritures sont optimistes —, si bien qu'on édite le dashboard tel qu'il sera.
 */
export const WidgetToolbar = ({ widget, label, onGripDown }: WidgetToolbarProps) => {
  const update = useUpdateWidget();
  const remove = useRemoveWidget();
  const [textOpen, setTextOpen] = useState(false);
  const pending = widget.id.startsWith('pending:');
  const patch = (input: Parameters<typeof update.mutate>[0]['input']) =>
    update.mutate({ id: widget.id, input });

  return (
    <div className="flex items-center gap-0.5 rounded-t-lg border border-b-0 border-dashed border-primary/50 bg-muted/60 px-1 py-0.5">
      <button
        type="button"
        onPointerDown={onGripDown}
        className={cn(toolButton, 'cursor-grab touch-none active:cursor-grabbing')}
        aria-label={`Déplacer « ${widget.title ?? label} »`}
        title="Glisser pour déplacer"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <span
        className="min-w-0 flex-1 truncate px-1 text-[11px] text-muted-foreground"
        title={label}
      >
        {label}
      </span>

      <button
        type="button"
        className={toolButton}
        onClick={() => setTextOpen(true)}
        disabled={pending}
        title="Titre et description"
      >
        <Type className="h-3.5 w-3.5" />
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={toolButton} disabled={pending} title="Icône">
            <ImageIcon className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuItem onSelect={() => patch({ icon: null })}>
            <RotateCcw className="h-4 w-4" />
            Icône d'origine
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <div className="grid grid-cols-7 gap-0.5 p-1">
            {Object.entries(WIDGET_ICONS).map(([key, { label: iconLabel, icon: Icon }]) => (
              <DropdownMenuItem
                key={key}
                onSelect={() => patch({ icon: key })}
                title={iconLabel}
                className={cn(
                  'justify-center px-0 py-1.5',
                  widget.icon === key && 'bg-secondary text-secondary-foreground',
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="sr-only">{iconLabel}</span>
              </DropdownMenuItem>
            ))}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={toolButton} disabled={pending} title="Largeur">
            <Columns3 className="h-3.5 w-3.5" />
            <span className="tabular">{widget.width}/6</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {WIDGET_WIDTHS.map((width) => (
            <DropdownMenuItem
              key={width}
              onSelect={() => patch({ width })}
              className={cn(widget.width === width && 'bg-secondary text-secondary-foreground')}
            >
              {/* Une miniature de la rangée : la largeur se lit mieux qu'elle ne se compte. */}
              <span className="flex h-3 w-12 gap-px" aria-hidden>
                {WIDGET_WIDTHS.map((cell) => (
                  <span
                    key={cell}
                    className={cn(
                      'flex-1 rounded-[1px]',
                      cell <= width ? 'bg-primary' : 'bg-muted',
                    )}
                  />
                ))}
              </span>
              {WIDTH_LABELS[width]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <button
        type="button"
        className={cn(toolButton, 'hover:text-destructive')}
        onClick={() => remove.mutate(widget.id)}
        disabled={pending}
        title="Retirer du dashboard (le bloc reste sur sa page)"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>

      {textOpen && (
        <WidgetTextDialog
          widget={widget}
          label={label}
          onClose={() => setTextOpen(false)}
          onSave={(input) => {
            patch(input);
            setTextOpen(false);
          }}
        />
      )}
    </div>
  );
};

/**
 * Titre et description d'un bloc. Un champ laissé vide **rend l'original** (`null`) —
 * c'est le cas le plus fréquent, et le seul qu'on puisse défaire sans se souvenir du texte
 * d'origine. Pour effacer vraiment un sous-titre, la case dédiée écrit une chaîne vide.
 */
const WidgetTextDialog = ({
  widget,
  label,
  onClose,
  onSave,
}: {
  widget: DashboardWidget;
  label: string;
  onClose: () => void;
  onSave: (input: { title: string | null; description: string | null }) => void;
}) => {
  const [title, setTitle] = useState(widget.title ?? '');
  const [description, setDescription] = useState(widget.description ?? '');
  const [hideDescription, setHideDescription] = useState(widget.description === '');

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Texte du bloc</DialogTitle>
          <DialogDescription>
            Ne change que le dashboard : sur sa page, « {label} » garde son texte. Laisse un champ
            vide pour reprendre celui d'origine.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSave({
              title: title.trim() === '' ? null : title.trim(),
              description: hideDescription
                ? ''
                : description.trim() === ''
                  ? null
                  : description.trim(),
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="widget-title">Titre</Label>
            <Input
              id="widget-title"
              value={title}
              placeholder={label}
              maxLength={120}
              onChange={(event) => setTitle(event.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="widget-description">Description</Label>
            <Input
              id="widget-description"
              value={description}
              placeholder="Celle d'origine"
              maxLength={300}
              disabled={hideDescription}
              onChange={(event) => setDescription(event.target.value)}
            />
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={hideDescription}
                onChange={(event) => setHideDescription(event.target.checked)}
              />
              Ne pas afficher de description
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit">Enregistrer</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
