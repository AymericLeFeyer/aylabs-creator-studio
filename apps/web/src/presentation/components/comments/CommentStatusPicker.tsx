import { Heart, Lightbulb, EyeOff } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { CommentStatus } from '../../../domain/comment/entities/Comment.ts';
import {
  COMMENT_DECISIONS,
  COMMENT_STATUS_LABELS,
} from '../../../domain/comment/entities/Comment.ts';
import { cn } from '../../../shared/cn.ts';

const ICONS: Record<Exclude<CommentStatus, 'new'>, LucideIcon> = {
  encouraging: Heart,
  idea: Lightbulb,
  ignored: EyeOff,
};

/** La teinte de chaque décision, la même que celle du badge de statut. */
const ACTIVE: Record<Exclude<CommentStatus, 'new'>, string> = {
  encouraging: 'bg-[var(--positive)]/15 text-[var(--positive)] border-[var(--positive)]/40',
  idea: 'bg-[var(--cash)]/15 text-[var(--cash)] border-[var(--cash)]/40',
  ignored: 'bg-muted text-muted-foreground border-border',
};

/**
 * Les trois décisions, en **un clic chacune**, et pas un `Select`.
 *
 * On trie une file de commentaires en rafale : un menu déroulant demanderait deux clics
 * et un déplacement du curseur par ligne, soit trois fois le geste pour la même
 * information. À trois options qui ne bougeront jamais, la place d'un groupe de boutons
 * est acquise.
 *
 * **Re-cliquer la décision active la défait** et remet le commentaire dans la file de
 * tri. C'est ce qui rattrape un clic de travers sans avoir à afficher un quatrième
 * bouton « À trier » qui ne servirait qu'à ça et occuperait de la place sur chaque ligne.
 */
export const CommentStatusPicker = ({
  status,
  onChange,
  disabled,
}: {
  status: CommentStatus;
  onChange: (status: CommentStatus) => void;
  disabled?: boolean;
}) => (
  <div className="inline-flex items-center gap-1">
    {COMMENT_DECISIONS.map((decision) => {
      const Icon = ICONS[decision];
      const active = status === decision;
      return (
        <button
          key={decision}
          type="button"
          disabled={disabled}
          aria-pressed={active}
          title={
            active
              ? `${COMMENT_STATUS_LABELS[decision]} — cliquer pour remettre à trier`
              : COMMENT_STATUS_LABELS[decision]
          }
          onClick={() => onChange(active ? 'new' : decision)}
          className={cn(
            'inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-medium transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
            active
              ? ACTIVE[decision]
              : 'border-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground',
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          <span className="hidden xl:inline">{COMMENT_STATUS_LABELS[decision]}</span>
        </button>
      );
    })}
  </div>
);
