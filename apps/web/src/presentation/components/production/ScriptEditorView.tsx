import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Color, TextStyle } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import { Placeholder } from '@tiptap/extensions';
import { Check, CircleAlert, LoaderCircle } from 'lucide-react';
import { ScriptToolbar } from './ScriptToolbar.tsx';
import {
  fromEditorHtml,
  scriptStats,
  toEditorHtml,
} from '../../../domain/production/services/script.ts';
import { cn } from '../../../shared/cn.ts';

/**
 * Le délai d'inactivité avant l'enregistrement automatique.
 *
 * Assez court pour qu'une fermeture d'onglet ne coûte jamais plus d'une phrase, assez
 * long pour ne pas envoyer une requête par mot tapé.
 */
const AUTOSAVE_DELAY_MS = 1200;

type SaveStatus = 'clean' | 'dirty' | 'saving' | 'saved' | 'error';

export interface ScriptEditorProps {
  value: string;
  onSave: (script: string) => Promise<unknown>;
}

/**
 * L'éditeur de script, en **WYSIWYG**.
 *
 * Il montrait avant deux panneaux — le markdown à gauche, son rendu à droite. C'est un
 * bon outil pour qui écrit du markdown ; ce n'en est pas un pour qui écrit un texte à
 * dire à voix haute, où l'on relit sans arrêt ce qu'on vient d'écrire et où la moitié de
 * la largeur part dans une syntaxe qu'on ne lira jamais à l'antenne. On écrit désormais
 * directement dans le rendu, et la mise en forme se pose depuis une barre d'outils.
 *
 * **L'enregistrement est automatique.** L'ancienne version s'y refusait par prudence, et
 * l'indicateur « Non enregistré » était là pour rendre l'oubli visible — c'est-à-dire
 * pour rendre visible un problème plutôt que pour le supprimer. Le brouillon vit
 * maintenant en base à une phrase près, et l'historique de TipTap (Ctrl+Z) couvre le
 * seul risque que le bouton protégeait vraiment : écraser un passage par mégarde.
 *
 * Trois filets, parce qu'un débit à retardement se perd exactement dans les moments où
 * l'on quitte l'écran : le démontage **vide la file d'attente** (on ferme la modale d'un
 * script de sponso, on change d'onglet de fiche), `beforeunload` prévient si un envoi
 * était encore en vol, et Ctrl+S force l'enregistrement pour qui ne fait confiance qu'à
 * son propre geste.
 *
 * Le compteur affiche la **durée de lecture** plutôt qu'un nombre de caractères : c'est
 * la seule mesure qui compte quand on écrit pour être dit à l'oral.
 */
export const ScriptEditorView = ({ value, onSave }: ScriptEditorProps) => {
  const [status, setStatus] = useState<SaveStatus>('clean');

  /** Le dernier contenu que le serveur connaît : c'est lui qui dit s'il y a quelque chose à envoyer. */
  const savedRef = useRef(value);
  /** Le contenu en attente d'envoi, `null` quand il n'y a rien à enregistrer. */
  const pendingRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const onSaveRef = useRef(onSave);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  const flush = useCallback(async () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const html = pendingRef.current;
    if (html === null) return;

    pendingRef.current = null;
    setStatus('saving');
    try {
      await onSaveRef.current(html);
      savedRef.current = html;
      // Une frappe pendant l'envoi a remis quelque chose en file : on reste « à enregistrer ».
      setStatus(pendingRef.current === null ? 'saved' : 'dirty');
    } catch {
      // Le contenu retourne en file : le prochain enregistrement le reprendra, et la
      // perdre ici effacerait silencieusement le travail que le réseau vient de refuser.
      pendingRef.current = html;
      setStatus('error');
    }
  }, []);

  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const schedule = useCallback((html: string) => {
    pendingRef.current = html;
    setStatus('dirty');
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void flushRef.current(), AUTOSAVE_DELAY_MS);
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        // Un lien s'édite, il ne se suit pas : cliquer dedans doit poser le curseur.
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: { rel: 'noreferrer noopener', target: '_blank' },
        },
      }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      // Les tableaux ne sont pas dans la barre d'outils, mais l'extension doit être là :
      // sans elle, un tableau venu d'un ancien script markdown serait effacé à l'ouverture.
      TableKit.configure({ table: { resizable: false } }),
      Placeholder.configure({
        placeholder:
          "Accroche, parties, appel à l'action… tout se met en forme depuis la barre ci-dessus.",
      }),
    ],
    content: toEditorHtml(value),
    editorProps: {
      attributes: {
        class: 'prose-script min-h-[28rem] px-4 py-3 focus:outline-none',
        spellcheck: 'true',
      },
    },
    onUpdate: ({ editor: instance }) => {
      const html = fromEditorHtml(instance.getHTML());
      if (html === savedRef.current) {
        pendingRef.current = null;
        setStatus('clean');
        return;
      }
      schedule(html);
    },
  });

  const stats = useEditorState({
    editor,
    selector: ({ editor: instance }) => scriptStats(instance.getText()),
  });

  /*
   * Le script rechargé depuis le serveur remplace le contenu **tant que rien n'attend
   * d'être envoyé** : écraser un brouillon en cours de frappe par une réponse en vol
   * ferait disparaître la phrase qu'on est en train d'écrire.
   */
  useEffect(() => {
    if (value === savedRef.current || pendingRef.current !== null) return;
    savedRef.current = value;
    editor.commands.setContent(toEditorHtml(value), { emitUpdate: false });
  }, [editor, value]);

  /* Quitter l'écran vide la file : c'est le cas où un débit à retardement se perdrait. */
  useEffect(
    () => () => {
      void flushRef.current();
    },
    [],
  );

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (pendingRef.current === null) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const forceSave = (event: KeyboardEvent) => {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return;
    event.preventDefault();
    void flush();
  };

  return (
    <div className="space-y-3" onKeyDown={forceSave}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ScriptToolbar editor={editor} />

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="tabular">
            {stats.words} mots · ~{stats.duration} à lire
          </span>
          <SaveIndicator status={status} onRetry={() => void flush()} />
        </div>
      </div>

      <div
        className={cn(
          'overflow-hidden rounded-md border border-border bg-card text-sm leading-relaxed',
          'focus-within:ring-2 focus-within:ring-ring',
        )}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};

/**
 * L'état de l'enregistrement, à la place de l'ancien bouton.
 *
 * Il reste **une seule ligne discrète** : un enregistrement automatique qui s'annonce
 * trop fort réintroduit exactement l'inquiétude qu'il devait retirer. Seule l'erreur
 * sort du gris — c'est le seul cas où l'on a quelque chose à faire, et le clic renvoie.
 */
const SaveIndicator = ({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) => {
  if (status === 'error') {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="flex items-center gap-1.5 font-medium text-[var(--negative)] underline-offset-2 hover:underline"
      >
        <CircleAlert className="h-3.5 w-3.5" />
        Échec de l'enregistrement — réessayer
      </button>
    );
  }

  if (status === 'saving') {
    return (
      <span className="flex items-center gap-1.5">
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
        Enregistrement…
      </span>
    );
  }

  if (status === 'dirty') {
    return <span className="text-[var(--expense)]">Modifications en attente…</span>;
  }

  if (status === 'saved') {
    return (
      <span className="flex items-center gap-1.5 text-[var(--positive)]">
        <Check className="h-3.5 w-3.5" />
        Enregistré
      </span>
    );
  }

  return <span>Enregistrement automatique</span>;
};
