import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Eye, Pencil, Save } from 'lucide-react';
import { Button } from '../ui/button.tsx';
import { Textarea } from '../ui/input.tsx';
import { cn } from '../../../shared/cn.ts';

/** Débit de lecture à voix haute, en mots par minute. Un script se lit, il ne se survole pas. */
const WORDS_PER_MINUTE = 150;

interface ScriptEditorProps {
  value: string;
  onSave: (script: string) => Promise<unknown>;
  saving?: boolean;
}

/**
 * L'éditeur de script, en markdown.
 *
 * **Pas d'enregistrement automatique** : perdre une version d'un script coûte bien plus
 * cher qu'un clic de plus, et une sauvegarde en continu écraserait un brouillon en cours
 * de réflexion. L'indicateur « non enregistré » rend l'oubli visible.
 *
 * Le compteur affiche la durée de lecture estimée plutôt que le nombre de caractères :
 * c'est la seule mesure qui compte quand on écrit pour être dit à l'oral.
 */
export const ScriptEditor = ({ value, onSave, saving }: ScriptEditorProps) => {
  const [draft, setDraft] = useState(value);
  const [mode, setMode] = useState<'split' | 'write' | 'read'>('split');

  // Le script rechargé depuis le serveur remplace le brouillon tant qu'on n'a rien tapé.
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue && draft === lastValue) {
    setLastValue(value);
    setDraft(value);
  }

  const dirty = draft !== value;

  const stats = useMemo(() => {
    const words = draft.trim().split(/\s+/).filter(Boolean).length;
    const minutes = words / WORDS_PER_MINUTE;
    return {
      words,
      duration:
        words === 0
          ? '—'
          : minutes < 1
            ? `${Math.round(minutes * 60)} s`
            : `${Math.round(minutes)} min`,
    };
  }, [draft]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1 text-sm">
          {(
            [
              ['write', 'Écrire', Pencil],
              ['split', 'Les deux', null],
              ['read', 'Lire', Eye],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-colors',
                mode === key
                  ? 'bg-background text-foreground shadow'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="tabular">
            {stats.words} mots · ~{stats.duration} à lire
          </span>
          {dirty && <span className="text-[var(--expense)]">Non enregistré</span>}
          <Button size="sm" disabled={!dirty || saving} onClick={() => void onSave(draft)}>
            <Save className="h-4 w-4" />
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </div>

      <div className={cn('grid gap-3', mode === 'split' && 'lg:grid-cols-2')}>
        {mode !== 'read' && (
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            spellCheck
            placeholder={
              "# Accroche\n\nCe qu'on dit dans les 10 premières secondes…\n\n## Partie 1\n\n- point\n- point"
            }
            className="min-h-[28rem] resize-y font-mono text-[13px] leading-relaxed"
          />
        )}

        {mode !== 'write' && (
          <div className="prose-script min-h-[28rem] overflow-auto rounded-md border border-border bg-card p-4 text-sm leading-relaxed">
            {draft.trim() === '' ? (
              <p className="text-muted-foreground">
                Rien d'écrit pour l'instant. Le markdown est rendu ici au fur et à mesure.
              </p>
            ) : (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{draft}</ReactMarkdown>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
