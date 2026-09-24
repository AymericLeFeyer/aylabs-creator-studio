import { useEffect, useRef, useState } from 'react';
import type { DashboardWidget } from '../../domain/dashboard/entities/DashboardWidget.ts';
import { headingVariant } from '../../domain/dashboard/entities/DashboardWidget.ts';
import { useUpdateWidget } from '../../application/dashboard/usecases/useDashboard.ts';
import { cn } from '../../shared/cn.ts';
import { WIDGET_ICONS } from './widgetIcons.ts';

/** Le style du texte, par variante. Le séparateur ajoute ses filets autour. */
const TITLE_CLASS = {
  h1: 'text-2xl font-bold tracking-tight',
  h2: 'text-lg font-semibold',
  h3: 'text-base font-semibold',
  label: 'text-xs font-semibold uppercase tracking-wide text-muted-foreground',
  divider: 'text-sm font-medium text-muted-foreground',
} as const;

const ICON_CLASS = {
  h1: 'h-6 w-6',
  h2: 'h-5 w-5',
  h3: 'h-4 w-4',
  label: 'h-3.5 w-3.5',
  divider: 'h-4 w-4',
} as const;

/**
 * Un titre de section du dashboard : texte, sous-titre facultatif (`description`), icône
 * au choix et cinq styles (`HEADING_VARIANTS`). Il ne porte aucune donnée — il sépare.
 *
 * **En édition, le texte se tape sur place** : c'est le seul élément du dashboard dont le
 * contenu est le texte lui-même, et une modale pour changer trois mots serait un détour.
 * Validé à la sortie du champ ou sur Entrée (une écriture par frappe partirait à chaque
 * lettre, même piège que `StepsPage`) ; Échap annule. Un titre vide ne s'affiche pas hors
 * édition — il reste un repère d'espacement.
 */
export const SectionHeading = ({
  widget,
  editing,
  autoFocus = false,
  onFocused,
}: {
  widget: DashboardWidget;
  editing: boolean;
  /** Le titre vient d'être créé : on défile jusqu'à lui et on sélectionne son texte. */
  autoFocus?: boolean;
  onFocused?: () => void;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  // Attendre l'identifiant réel : un texte validé sur l'identifiant provisoire partirait
  // vers une ligne que l'API ne connaît pas encore.
  const pending = widget.id.startsWith('pending:');

  useEffect(() => {
    const input = inputRef.current;
    if (!autoFocus || pending || !input) return;
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    input.focus({ preventScroll: true });
    input.select();
    onFocused?.();
  }, [autoFocus, pending, onFocused]);
  const update = useUpdateWidget();
  const variant = headingVariant(widget.variant);
  const Icon = widget.icon ? (WIDGET_ICONS[widget.icon]?.icon ?? null) : null;
  const [draft, setDraft] = useState<string | null>(null);
  const title = widget.title ?? '';

  const commit = () => {
    if (draft === null) return;
    const next = draft.trim();
    setDraft(null);
    if (next !== title) update.mutate({ id: widget.id, input: { title: next || null } });
  };

  const text = editing ? (
    <input
      ref={inputRef}
      value={draft ?? title}
      disabled={pending}
      placeholder="Titre de la section"
      maxLength={120}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          setDraft(null);
          event.currentTarget.blur();
        }
      }}
      className={cn(
        TITLE_CLASS[variant],
        'min-w-0 flex-1 rounded bg-transparent outline-none placeholder:text-muted-foreground/60 focus:bg-muted/60',
        variant === 'divider' && 'flex-none text-center',
      )}
    />
  ) : (
    <span className={cn(TITLE_CLASS[variant], 'min-w-0 truncate')}>{title}</span>
  );

  if (!editing && !title && !widget.description) {
    return <div className="h-2" aria-hidden />;
  }

  const Tag = variant === 'h1' ? 'h1' : variant === 'h3' ? 'h3' : 'h2';

  return (
    <div className={cn('min-w-0', variant === 'h1' ? 'pt-1' : 'pt-3')}>
      <Tag
        className={cn(
          'flex items-center gap-2',
          variant === 'h2' && 'border-b border-border pb-1.5',
        )}
      >
        {variant === 'divider' && <span className="h-px flex-1 bg-border" aria-hidden />}
        {Icon && (
          <Icon className={cn(ICON_CLASS[variant], 'shrink-0 text-muted-foreground')} aria-hidden />
        )}
        {text}
        {variant === 'divider' && <span className="h-px flex-1 bg-border" aria-hidden />}
      </Tag>
      {widget.description && (
        <p
          className={cn(
            'mt-0.5 text-sm text-muted-foreground',
            variant === 'divider' && 'text-center',
          )}
        >
          {widget.description}
        </p>
      )}
    </div>
  );
};
