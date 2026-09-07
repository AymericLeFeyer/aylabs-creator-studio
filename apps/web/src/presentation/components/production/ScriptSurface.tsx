import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Color, TextStyle } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import { Placeholder } from '@tiptap/extensions';
import { ScriptToolbar } from './ScriptToolbar.tsx';
import { Checkbox } from '../ui/checkbox.tsx';
import { ScriptEditorSkeleton } from './ScriptEditorSkeleton.tsx';
import { ScriptPresetNode } from './extensions/ScriptPresetNode.ts';
import { ShotAngleMark } from './extensions/ShotAngleMark.ts';
import {
  scriptStats,
  toEditorHtml,
  fromEditorHtml,
} from '../../../domain/production/services/script.ts';
import { cn } from '../../../shared/cn.ts';

/** Le compteur avant que l'éditeur n'existe : « 0 mot » est plus honnête qu'un écran cassé. */
const EMPTY_STATS = scriptStats('');

const DEFAULT_PLACEHOLDER =
  "Accroche, parties, appel à l'action… tout se met en forme depuis la barre ci-dessus.";

export interface ScriptSurfaceProps {
  value: string;
  onChange: (html: string) => void;
  /**
   * La vidéo dont on écrit le script, quand il y en a une. Elle ouvre les **angles
   * ponctuels** : sans elle (le script d'une sponso non rattachée), seul le référentiel
   * est proposé, faute de fiche à laquelle rattacher un angle.
   */
  productionId?: string;
  /**
   * Gabarits et angles de vue. À `false` dans le formulaire d'un gabarit : un gabarit ne
   * contient pas de gabarit, et annoter un angle sur un texte qui sera copié dans dix
   * vidéos n'aurait pas de sens.
   */
  scriptTools?: boolean;
  placeholder?: string;
  /** Classe de hauteur minimale de la zone d'écriture. */
  minHeight?: string;
  /**
   * Où la barre d'outils s'arrête en défilant. Sous l'en-tête de l'application dans une
   * page (`var(--app-header)`), tout en haut dans une modale, qui défile toute seule.
   */
  stickyOffset?: string;
  /** Rendu à droite de la barre : l'état d'enregistrement, quand il y en a un. */
  status?: ReactNode;
}

/**
 * La **surface d'écriture** d'un script : l'éditeur, sa barre d'outils, son compteur.
 *
 * Elle ne sait rien de l'enregistrement — c'est `ScriptEditorView` qui pose l'écriture
 * automatique par-dessus, et le formulaire d'un gabarit qui la pilote en champ contrôlé.
 * Les deux doivent écrire **exactement** le même HTML : un gabarit rédigé dans un éditeur
 * plus pauvre que celui du script produirait un bloc qui se relit mal une fois inséré.
 *
 * Elle est **non contrôlée après le montage** : `value` sert de contenu initial, et n'est
 * rejoué que s'il diffère de ce qu'elle a émis en dernier. Rejouer à chaque rendu
 * remettrait le curseur au début à chaque frappe.
 */
export const ScriptSurface = ({
  value,
  onChange,
  productionId,
  scriptTools = true,
  placeholder = DEFAULT_PLACEHOLDER,
  minHeight = 'min-h-[28rem]',
  stickyOffset = 'var(--app-header, 0px)',
  status,
}: ScriptSurfaceProps) => {
  /**
   * Masquer les angles de vue **à l'affichage seulement**.
   *
   * Un script annoté se lit mal : six fonds colorés et autant d'étiquettes sur une page
   * de texte, c'est parfait pour préparer un tournage et insupportable pour relire une
   * phrase. La case les éteint sans **rien** retirer du document — les marques sont
   * toujours là, et les recocher les rallume telles quelles.
   *
   * C'est un **filtre et non une préférence** : on l'active pour relire, on le retire
   * pour annoter, plusieurs fois dans la même séance. Même parti pris que « Reste à faire
   * uniquement » sur l'écran des partenariats, et donc un état local, non persisté.
   */
  const [anglesHidden, setAnglesHidden] = useState(false);

  /** Le dernier HTML sorti d'ici : c'est lui qui dit si un `value` entrant est nouveau. */
  const emittedRef = useRef(value);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  /*
   * Extensions et `editorProps` mémoïsés : `useEditor` compare ses options à chaque rendu
   * et rappelle `setOptions` dès qu'une référence bouge. Des objets recréés à chaque
   * frappe déclenchaient donc un `setOptions` par caractère tapé, pour rien.
   */
  const extensions = useMemo(
    () => [
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
      // Chargés dans les deux cas, même quand les outils sont masqués : un noeud ou une
      // marque dont l'extension manque est **supprimé au parsing**, et rouvrir un script
      // dans un éditeur allégé le viderait de ses blocs et de ses angles.
      ScriptPresetNode,
      ShotAngleMark,
      Placeholder.configure({ placeholder }),
    ],
    [placeholder],
  );

  const editorProps = useMemo(
    () => ({
      attributes: {
        class: cn('prose-script px-4 py-3 focus:outline-none', minHeight),
        spellcheck: 'true',
      },
    }),
    [minHeight],
  );

  const editor = useEditor({
    /*
     * **L'éditeur naît dans l'effet de montage, pas pendant le rendu.**
     *
     * Au défaut (`true`), `useEditor` construit l'instance dès le rendu puis programme sa
     * destruction une milliseconde plus tard, annulée seulement si le composant s'est
     * monté entre-temps. Un rendu concurrent découpé par React suffit à dépasser ce
     * délai : l'éditeur est détruit, `schema` passe à `null`, et le rendu suivant lit
     * encore l'instance morte — `getText()` y explose. Créer l'instance dans l'effet
     * supprime la course, au prix d'un `editor` à `null` au premier rendu.
     */
    immediatelyRender: false,
    extensions,
    content: toEditorHtml(value),
    editorProps,
    onUpdate: ({ editor: instance }) => {
      const html = fromEditorHtml(instance.getHTML());
      emittedRef.current = html;
      onChangeRef.current(html);
    },
  });

  /*
   * `useEditorState` appelle son sélecteur avec l'instantané **courant**, qui peut porter
   * un éditeur pas encore créé (`null`) ou déjà détruit — son `schema` vaut alors `null`
   * et `getText()` s'y écrase. Le sélecteur ne suppose donc rien.
   */
  const stats =
    useEditorState({
      editor,
      selector: ({ editor: instance }) =>
        instance?.schema ? scriptStats(instance.getText()) : EMPTY_STATS,
    }) ?? EMPTY_STATS;

  /* Un contenu venu d'ailleurs remplace le document ; celui qu'on vient d'émettre, non. */
  useEffect(() => {
    if (!editor || value === emittedRef.current) return;
    emittedRef.current = value;
    editor.commands.setContent(toEditorHtml(value), { emitUpdate: false });
  }, [editor, value]);

  if (!editor) return <ScriptEditorSkeleton className={minHeight} />;

  return (
    <div className="space-y-3">
      {/*
        La barre suit le défilement : un script fait plusieurs pages, et devoir remonter
        en haut pour mettre un mot en gras revient à ne plus le mettre en gras. Le fond
        est opaque — le texte passe dessous — et le décalage vient de l'appelant, l'écran
        ayant un en-tête collant que la modale n'a pas.
      */}
      <div
        className="sticky z-20 -mx-1 bg-background/95 px-1 py-1 backdrop-blur"
        style={{ top: stickyOffset }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ScriptToolbar editor={editor} productionId={productionId} scriptTools={scriptTools} />

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {scriptTools && (
              <label className="flex cursor-pointer select-none items-center gap-1.5">
                <Checkbox
                  checked={anglesHidden}
                  onCheckedChange={(checked) => setAnglesHidden(checked === true)}
                />
                Masquer les angles
              </label>
            )}
            <span className="tabular">
              {stats.words} mots · ~{stats.duration} à lire
            </span>
            {status}
          </div>
        </div>
      </div>

      {/*
        La classe éteint les angles **en CSS**, sur l'enveloppe : le document n'est pas
        touché, aucune transaction n'est émise, et rien n'est enregistré. Réécrire les
        marques pour les masquer aurait fait de la lecture une modification du script.
      */}
      <div
        className={cn(
          'overflow-hidden rounded-md border border-border bg-card text-sm leading-relaxed',
          'focus-within:ring-2 focus-within:ring-ring',
          anglesHidden && 'script-angles-hidden',
        )}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};
