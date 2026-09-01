import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select.tsx';
import { NONE } from './selectNone.ts';

export interface AttachOption {
  id: string;
  label: string;
  /** Complément discret : montant, marque, ou l'endroit d'où l'élément serait déplacé. */
  hint?: string;
}

interface AttachExistingSelectProps {
  /** Texte du déclencheur : c'est une **action**, pas une valeur sélectionnée. */
  placeholder: string;
  options: AttachOption[];
  onSelect: (id: string) => void;
  emptyLabel: string;
  disabled?: boolean;
}

/**
 * « Rattacher quelque chose qui existe déjà ».
 *
 * Le `Select` reste bloqué sur `NONE` : il ne mémorise aucune valeur, il déclenche une
 * action et se réarme aussitôt — on peut donc en rattacher plusieurs d'affilée sans que
 * le déclencheur n'affiche le dernier choix, ce qui le ferait lire comme un filtre.
 *
 * Créer et rattacher sont deux gestes distincts et tous deux courants : un produit
 * arrive parfois avant qu'on sache pour quelle vidéo il servira.
 */
export const AttachExistingSelect = ({
  placeholder,
  options,
  onSelect,
  emptyLabel,
  disabled,
}: AttachExistingSelectProps) => (
  <Select value={NONE} onValueChange={onSelect} disabled={disabled || options.length === 0}>
    <SelectTrigger className="h-8 w-auto min-w-44 text-xs" aria-label={placeholder}>
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value={NONE} disabled>
        {options.length === 0 ? emptyLabel : placeholder}
      </SelectItem>
      {options.map((option) => (
        <SelectItem key={option.id} value={option.id}>
          {option.label}
          {option.hint ? ` · ${option.hint}` : ''}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);
