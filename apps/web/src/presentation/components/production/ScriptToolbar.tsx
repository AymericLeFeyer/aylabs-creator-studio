import type { ReactNode } from 'react';
import { type Editor, useEditorState } from '@tiptap/react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  Link2,
  Link2Off,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Underline,
  Undo2,
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '../ui/dropdown-menu.tsx';
import { HIGHLIGHT_COLORS, TEXT_COLORS, type Swatch } from './scriptPalette.ts';
import { cn } from '../../../shared/cn.ts';

/**
 * Un bouton d'outil : carré, sans libellé écrit, l'intitulé en infobulle.
 *
 * `onMouseDown` est **neutralisé** sur tous : sans ça, le clic retire le focus de
 * l'éditeur avant que la commande ne parte, la sélection se perd, et l'outil paraît
 * n'agir que sur le curseur. Même piège que les options du `BrandCombobox`.
 */
const ToolButton = ({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    aria-pressed={active}
    disabled={disabled}
    onMouseDown={(event) => event.preventDefault()}
    onClick={onClick}
    className={cn(
      'flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors',
      'hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent',
      active && 'bg-background text-foreground shadow-sm',
    )}
  >
    {children}
  </button>
);

const Divider = () => <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />;

/** Une grille de pastilles : on choisit une couleur en la voyant, pas en lisant son nom. */
const SwatchGrid = ({
  swatches,
  current,
  property,
  onPick,
  onClear,
}: {
  swatches: Swatch[];
  current: string | null;
  property: 'color' | 'backgroundColor';
  onPick: (value: string) => void;
  onClear: () => void;
}) => (
  <div className="space-y-1">
    <div className="grid grid-cols-6 gap-1">
      {swatches.map((swatch) => (
        <button
          key={swatch.value}
          type="button"
          title={swatch.label}
          aria-label={swatch.label}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onPick(swatch.value)}
          style={{ [property]: swatch.value }}
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-md border border-border text-sm font-bold',
            current === swatch.value && 'ring-2 ring-ring ring-offset-1 ring-offset-popover',
          )}
        >
          A
        </button>
      ))}
    </div>
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClear}
      className="w-full rounded-md px-2 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      Aucune couleur
    </button>
  </div>
);

interface ToolbarState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  code: boolean;
  h1: boolean;
  h2: boolean;
  h3: boolean;
  paragraph: boolean;
  bulletList: boolean;
  orderedList: boolean;
  taskList: boolean;
  blockquote: boolean;
  link: boolean;
  alignLeft: boolean;
  alignCenter: boolean;
  alignRight: boolean;
  color: string | null;
  highlight: string | null;
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * L'état neutre, rendu quand l'éditeur n'est pas interrogeable.
 *
 * `useEditorState` appelle son sélecteur avec l'instantané **courant**, qui peut porter
 * une instance déjà détruite : `schema` et `commandManager` y valent alors `null`, et
 * `isActive` / `getAttributes` / `can()` s'y écrasent. Une barre éteinte le temps d'une
 * image vaut mieux qu'un écran blanc.
 */
const INACTIVE: ToolbarState = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  code: false,
  h1: false,
  h2: false,
  h3: false,
  paragraph: false,
  bulletList: false,
  orderedList: false,
  taskList: false,
  blockquote: false,
  link: false,
  alignLeft: false,
  alignCenter: false,
  alignRight: false,
  color: null,
  highlight: null,
  canUndo: false,
  canRedo: false,
};

const readState = (instance: Editor): ToolbarState => ({
  bold: instance.isActive('bold'),
  italic: instance.isActive('italic'),
  underline: instance.isActive('underline'),
  strike: instance.isActive('strike'),
  code: instance.isActive('code'),
  h1: instance.isActive('heading', { level: 1 }),
  h2: instance.isActive('heading', { level: 2 }),
  h3: instance.isActive('heading', { level: 3 }),
  paragraph: instance.isActive('paragraph'),
  bulletList: instance.isActive('bulletList'),
  orderedList: instance.isActive('orderedList'),
  taskList: instance.isActive('taskList'),
  blockquote: instance.isActive('blockquote'),
  link: instance.isActive('link'),
  alignLeft: instance.isActive({ textAlign: 'left' }),
  alignCenter: instance.isActive({ textAlign: 'center' }),
  alignRight: instance.isActive({ textAlign: 'right' }),
  color: (instance.getAttributes('textStyle').color as string | undefined) ?? null,
  highlight: (instance.getAttributes('highlight').color as string | undefined) ?? null,
  canUndo: instance.can().undo(),
  canRedo: instance.can().redo(),
});

/**
 * La barre d'outils de l'éditeur de script.
 *
 * Elle est **plate et non enfouie dans des menus** : on met un mot en gras ou une phrase
 * en rouge au fil de l'écriture, et un outil qui demande deux clics ne sert plus. Seules
 * les deux palettes de couleurs se déplient — une grille de pastilles ne tient pas dans
 * une rangée, et c'est le seul outil qui demande de choisir plutôt que de basculer.
 *
 * L'état actif vient de `useEditorState` : depuis TipTap 3, l'éditeur ne provoque plus de
 * rendu à chaque transaction, et une barre branchée directement sur `editor.isActive()`
 * resterait figée sur l'état du premier rendu.
 */
export const ScriptToolbar = ({ editor }: { editor: Editor }) => {
  const state =
    useEditorState({
      editor,
      selector: ({ editor: instance }) => (instance?.schema ? readState(instance) : INACTIVE),
    }) ?? INACTIVE;

  const chain = () => editor.chain().focus();

  /**
   * Le lien passe par une invite du navigateur plutôt que par une modale : l'éditeur vit
   * déjà dans un dialogue sur l'écran des sponsos, et une modale dans une modale se
   * referme de travers dès la première touche Échap.
   */
  const setLink = () => {
    const previous = editor.getAttributes('link').href as string | undefined;
    const href = window.prompt('Adresse du lien', previous ?? 'https://');
    if (href === null) return;
    if (href.trim() === '') {
      chain().unsetLink().run();
      return;
    }
    chain().extendMarkRange('link').setLink({ href: href.trim() }).run();
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-lg border border-border bg-muted/60 p-1">
      <ToolButton label="Annuler" disabled={!state.canUndo} onClick={() => chain().undo().run()}>
        <Undo2 className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="Rétablir" disabled={!state.canRedo} onClick={() => chain().redo().run()}>
        <Redo2 className="h-4 w-4" />
      </ToolButton>

      <Divider />

      <ToolButton
        label="Paragraphe"
        active={state.paragraph}
        onClick={() => chain().setParagraph().run()}
      >
        <Pilcrow className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        label="Titre 1"
        active={state.h1}
        onClick={() => chain().toggleHeading({ level: 1 }).run()}
      >
        <Heading1 className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        label="Titre 2"
        active={state.h2}
        onClick={() => chain().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        label="Titre 3"
        active={state.h3}
        onClick={() => chain().toggleHeading({ level: 3 }).run()}
      >
        <Heading3 className="h-4 w-4" />
      </ToolButton>

      <Divider />

      <ToolButton
        label="Gras (Ctrl+B)"
        active={state.bold}
        onClick={() => chain().toggleBold().run()}
      >
        <Bold className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        label="Italique (Ctrl+I)"
        active={state.italic}
        onClick={() => chain().toggleItalic().run()}
      >
        <Italic className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        label="Souligné (Ctrl+U)"
        active={state.underline}
        onClick={() => chain().toggleUnderline().run()}
      >
        <Underline className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="Barré" active={state.strike} onClick={() => chain().toggleStrike().run()}>
        <Strikethrough className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="Code" active={state.code} onClick={() => chain().toggleCode().run()}>
        <Code className="h-4 w-4" />
      </ToolButton>

      <Divider />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title="Couleur du texte"
            aria-label="Couleur du texte"
            onMouseDown={(event) => event.preventDefault()}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors',
              'hover:bg-accent hover:text-foreground',
              state.color && 'bg-background text-foreground shadow-sm',
            )}
          >
            <Baseline
              className="h-4 w-4"
              style={state.color ? { color: state.color } : undefined}
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-0 p-2">
          <SwatchGrid
            swatches={TEXT_COLORS}
            current={state.color}
            property="color"
            onPick={(value) => chain().setColor(value).run()}
            onClear={() => chain().unsetColor().run()}
          />
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title="Surligner"
            aria-label="Surligner"
            onMouseDown={(event) => event.preventDefault()}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors',
              'hover:bg-accent hover:text-foreground',
              state.highlight && 'bg-background text-foreground shadow-sm',
            )}
          >
            <Highlighter className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-0 p-2">
          <SwatchGrid
            swatches={HIGHLIGHT_COLORS}
            current={state.highlight}
            property="backgroundColor"
            onPick={(value) => chain().setHighlight({ color: value }).run()}
            onClear={() => chain().unsetHighlight().run()}
          />
        </DropdownMenuContent>
      </DropdownMenu>

      <Divider />

      <ToolButton
        label="Liste à puces"
        active={state.bulletList}
        onClick={() => chain().toggleBulletList().run()}
      >
        <List className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        label="Liste numérotée"
        active={state.orderedList}
        onClick={() => chain().toggleOrderedList().run()}
      >
        <ListOrdered className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        label="Liste à cocher"
        active={state.taskList}
        onClick={() => chain().toggleTaskList().run()}
      >
        <ListChecks className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        label="Citation"
        active={state.blockquote}
        onClick={() => chain().toggleBlockquote().run()}
      >
        <Quote className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="Séparateur" onClick={() => chain().setHorizontalRule().run()}>
        <Minus className="h-4 w-4" />
      </ToolButton>

      <Divider />

      <ToolButton
        label="Aligner à gauche"
        active={state.alignLeft}
        onClick={() => chain().setTextAlign('left').run()}
      >
        <AlignLeft className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        label="Centrer"
        active={state.alignCenter}
        onClick={() => chain().setTextAlign('center').run()}
      >
        <AlignCenter className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        label="Aligner à droite"
        active={state.alignRight}
        onClick={() => chain().setTextAlign('right').run()}
      >
        <AlignRight className="h-4 w-4" />
      </ToolButton>

      <Divider />

      <ToolButton label="Lien" active={state.link} onClick={setLink}>
        <Link2 className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        label="Retirer le lien"
        disabled={!state.link}
        onClick={() => chain().unsetLink().run()}
      >
        <Link2Off className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        label="Effacer la mise en forme"
        onClick={() => chain().unsetAllMarks().clearNodes().run()}
      >
        <RemoveFormatting className="h-4 w-4" />
      </ToolButton>
    </div>
  );
};
