import { type KeyboardEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { type Editor, useEditorState } from '@tiptap/react';
import { LoaderCircle, RefreshCw, WandSparkles, X } from 'lucide-react';
import { useAiSettings } from '../../../application/ai/usecases/useAi.ts';
import { useAiScript } from '../../../application/production/usecases/useProductionAi.ts';
import { Button } from '../ui/button.tsx';
import { Textarea } from '../ui/input.tsx';

interface Target {
  from: number;
  to: number;
  /** Une sélection dans un seul paragraphe : le texte s'y insère sans le couper en deux. */
  inline: boolean;
  /** Le document de la demande : les positions n'ont de sens que sur lui. */
  doc: Editor['state']['doc'];
}

const NO_SELECTION = { from: 0, to: 0, text: '', inline: false };

const readSelection = (instance: Editor | null) => {
  if (!instance?.schema) return NO_SELECTION;
  const { from, to, empty, $from, $to } = instance.state.selection;
  if (empty) return { ...NO_SELECTION, from, to };
  const text = instance.state.doc.textBetween(from, to, '\n');
  const inline = $from.sameParent($to);
  if (!inline) return { from, to, text, inline };
  // Un double-clic sous Windows prend l'espace qui suit le mot : le remplacer collerait le
  // mot suivant. Dans un paragraphe, une position vaut un caractère.
  const trimmed = text.trim();
  if (!trimmed) return { ...NO_SELECTION, from, to: from };
  const start = from + (text.length - text.trimStart().length);
  return { from: start, to: start + trimmed.length, text: trimmed, inline };
};

const SINGLE_PARAGRAPH = /^<p>((?:(?!<\/?p>)[\s\S])*)<\/p>$/;

/**
 * L'IA de l'éditeur de script : on sélectionne un passage et on demande de le retravailler,
 * ou on ne sélectionne rien et elle écrit. Elle **propose** : rien n'entre dans le script
 * sans un clic, et ce clic se défait par Ctrl+Z.
 *
 * Un panneau et non une modale : le texte reste lisible et sélectionnable pendant qu'on
 * formule la demande, et l'éditeur vit déjà dans un dialogue sur d'autres écrans.
 */
export const ScriptAiPanel = ({
  editor,
  productionId,
  onClose,
}: {
  editor: Editor;
  productionId: string;
  onClose: () => void;
}) => {
  const { data: settings } = useAiSettings();
  const ask = useAiScript();
  const [prompt, setPrompt] = useState('');
  const [proposal, setProposal] = useState<string | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [stale, setStale] = useState(false);

  const selection = useEditorState({
    editor,
    selector: ({ editor: instance }) => readSelection(instance),
  });

  const submit = () => {
    const current = readSelection(editor);
    if (!prompt.trim() || ask.isPending) return;
    setStale(false);
    const request = {
      productionId,
      prompt,
      script: editor.getText(),
      selection: current.text || null,
    };
    ask.mutate(request, {
      onSuccess: ({ html }) => {
        setProposal(html);
        setTarget({ ...current, doc: editor.state.doc });
      },
    });
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      submit();
    }
  };

  const apply = (range: { from: number; to: number }, html: string) => {
    if (!target || !editor.state.doc.eq(target.doc)) {
      setStale(true);
      return;
    }
    editor.chain().focus().insertContentAt(range, html).run();
    setProposal(null);
    setTarget(null);
    setPrompt('');
  };

  const whole = { from: 0, to: editor.state.doc.content.size };
  /** Sur une sélection dans un paragraphe, `<p>` le couperait en deux. */
  const inlineHtml = (html: string) =>
    target?.inline ? (SINGLE_PARAGRAPH.exec(html)?.[1] ?? html) : html;

  if (settings && !settings.configured) {
    return (
      <div className="mt-1 flex items-center justify-between gap-2 rounded-lg border border-border bg-card p-3 text-sm">
        <span>
          Aucune clé :{' '}
          <Link to="/parametres?onglet=ia" className="underline">
            renseigne-la dans Paramètres → Assistant IA
          </Link>
          .
        </span>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fermer">
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-1 max-h-[60vh] space-y-2 overflow-y-auto rounded-lg border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-xs text-muted-foreground">
          {selection.text ? (
            <>
              Passage sélectionné :{' '}
              <span className="text-foreground">
                «{' '}
                {selection.text.length > 120 ? `${selection.text.slice(0, 120)}…` : selection.text}{' '}
                »
              </span>
            </>
          ) : (
            'Aucune sélection : l’IA écrit ce que tu lui demandes.'
          )}
        </p>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={onClose}
          aria-label="Fermer"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Textarea
        autoFocus
        className="min-h-[4.5rem] text-sm"
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={
          selection.text
            ? 'Reformule plus court, rends ça plus drôle, passe au tutoiement…'
            : 'Écris l’accroche, un plan en trois parties, le script complet sur…'
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={!prompt.trim() || ask.isPending} onClick={submit}>
          {ask.isPending ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <WandSparkles className="h-4 w-4" />
          )}
          {ask.isPending ? 'L’IA écrit…' : 'Demander'}
        </Button>
        <span className="text-xs text-muted-foreground">Ctrl+Entrée</span>
        {ask.error && <span className="text-xs text-destructive">{ask.error.message}</span>}
      </div>

      {proposal !== null && target && (
        <div className="space-y-2 border-t border-border pt-2">
          <div
            className="prose-script rounded-md bg-muted/50 px-3 py-2 text-sm"
            // Assaini par l'API : balises de texte seulement, aucun attribut.
            dangerouslySetInnerHTML={{ __html: proposal }}
          />
          <div className="flex flex-wrap items-center gap-2">
            {target.from !== target.to ? (
              <Button size="sm" onClick={() => apply(target, inlineHtml(proposal))}>
                Remplacer la sélection
              </Button>
            ) : (
              <>
                <Button size="sm" onClick={() => apply(target, proposal)}>
                  Insérer au curseur
                </Button>
                {!target.doc.textContent.trim() ? null : (
                  <Button size="sm" variant="outline" onClick={() => apply(whole, proposal)}>
                    Remplacer tout le script
                  </Button>
                )}
              </>
            )}
            <Button size="sm" variant="outline" disabled={ask.isPending} onClick={submit}>
              <RefreshCw className="h-4 w-4" />
              Autre proposition
            </Button>
            {stale && (
              <span className="text-xs text-destructive">
                Le script a changé depuis la demande : relance-la.
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
