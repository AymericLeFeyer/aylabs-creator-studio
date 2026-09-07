import type { ReactNode } from 'react';
import { type Editor, useEditorState } from '@tiptap/react';
import {
  AlignCenter,
  Aperture,
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
  Plus,
  Redo2,
  RemoveFormatting,
  Sparkles,
  Strikethrough,
  Underline,
  Undo2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu.tsx';
import {
  useCreateProductionShotAngle,
  useProductionShotAngles,
  useScriptPresets,
} from '../../../application/script/usecases/useScript.ts';
import type { ScriptPreset } from '../../../domain/script/entities/ScriptPreset.ts';
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
  shotAngle: string | null;
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
  shotAngle: null,
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
  shotAngle: (instance.getAttributes('shotAngle').angleId as string | undefined) ?? null,
  canUndo: instance.can().undo(),
  canRedo: instance.can().redo(),
});

/**
 * Un déclencheur de menu, aux mêmes dimensions qu'un bouton d'outil.
 *
 * `ToolButton` ne convient pas ici : Radix pose ses propres gestionnaires sur le
 * déclencheur via `asChild`, et le `onClick` obligatoire de `ToolButton` les écraserait.
 */
const MenuButton = ({
  label,
  active,
  children,
}: {
  label: string;
  active?: boolean;
  children: ReactNode;
}) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    onMouseDown={(event) => event.preventDefault()}
    className={cn(
      'flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors',
      'hover:bg-accent hover:text-foreground',
      active && 'bg-background text-foreground shadow-sm',
    )}
  >
    {children}
  </button>
);

/** Une valeur destinée à un attribut HTML construit à la main. */
const escapeAttribute = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Les gabarits : rappel d'abonnement, appel à l'action de fin, mention de partenariat.
 *
 * L'insertion **copie** le contenu du gabarit dans le script, elle ne le référence pas.
 * Le bloc inséré est du vrai contenu de script — on écrit dedans, on le retouche pour la
 * vidéo du jour — et il ne bougera plus jamais tout seul, même si le gabarit change dans
 * les paramètres. C'est ce qui permet de lire le script d'un bout à l'autre sans aller
 * chercher ailleurs ce qu'il contient.
 *
 * Le HTML est construit à la main plutôt qu'en JSON ProseMirror : le contenu d'un gabarit
 * est déjà du HTML, et le retraverser en noeuds pour le réécrire ensuite ne ferait
 * qu'ajouter une occasion de perdre une couleur.
 */
const PresetMenu = ({ editor }: { editor: Editor }) => {
  const { data: presets } = useScriptPresets();

  const insert = (preset: ScriptPreset) => {
    const body = preset.content.trim() === '' ? '<p></p>' : preset.content;
    editor
      .chain()
      .focus()
      .insertContent(
        `<div data-script-preset data-preset-label="${escapeAttribute(preset.label)}"` +
          ` data-preset-color="${escapeAttribute(preset.color)}">${body}</div>`,
      )
      .run();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <MenuButton label="Insérer un gabarit">
          <Sparkles className="h-4 w-4" />
        </MenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 min-w-64 overflow-y-auto">
        <DropdownMenuLabel>Insérer un gabarit</DropdownMenuLabel>
        {presets?.length === 0 && (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            Aucun gabarit. Ça se crée dans Paramètres → Script.
          </p>
        )}
        {presets?.map((preset) => (
          <DropdownMenuItem key={preset.id} onSelect={() => insert(preset)}>
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: preset.color }}
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{preset.label}</span>
              {preset.description && (
                <span className="block truncate text-xs text-muted-foreground">
                  {preset.description}
                </span>
              )}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const AngleItem = ({
  angle,
  active,
  onPick,
}: {
  angle: { id: string; label: string; description: string | null; color: string };
  active: boolean;
  onPick: (angle: { id: string; label: string; color: string }) => void;
}) => (
  <DropdownMenuItem onSelect={() => onPick(angle)} className={cn(active && 'bg-secondary')}>
    <span
      className="h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: angle.color }}
      aria-hidden
    />
    <span className="min-w-0 flex-1">
      <span className="block truncate">{angle.label}</span>
      {angle.description && (
        <span className="block truncate text-xs text-muted-foreground">{angle.description}</span>
      )}
    </span>
  </DropdownMenuItem>
);

/**
 * Les angles de vue : on sélectionne une phrase, on clique l'angle, le fond se teinte.
 *
 * Deux origines dans le même menu, séparées par un filet — le référentiel d'abord, les
 * angles de cette vidéo ensuite. On cherche presque toujours un angle habituel, et les
 * mélanger ferait relire toute la liste à chaque fois.
 *
 * **Créer et appliquer sont un seul geste** : « Nouvel angle pour cette vidéo » demande le
 * nom, rien d'autre — la couleur vient de la rotation côté API, comme pour une marque
 * créée à la volée depuis un formulaire de partenariat. Demander une teinte au moment où
 * l'on écrit ferait renoncer à créer l'angle.
 */
const ShotAngleMenu = ({
  editor,
  productionId,
  activeId,
}: {
  editor: Editor;
  productionId?: string;
  activeId: string | null;
}) => {
  const { data: angles } = useProductionShotAngles(productionId);
  const create = useCreateProductionShotAngle();

  const apply = (angle: { id: string; label: string; color: string }) =>
    editor
      .chain()
      .focus()
      .setShotAngle({ angleId: angle.id, label: angle.label, color: angle.color })
      .run();

  const createAndApply = async () => {
    if (!productionId) return;
    const label = window.prompt("Nom de l'angle de vue (pour cette vidéo seulement)");
    if (label === null || label.trim() === '') return;

    const items = await create.mutateAsync({ productionId, input: { label: label.trim() } });
    // La réponse porte la liste complète : le nouvel angle est le dernier des ponctuels.
    const created = items.filter((item) => item.origin === 'production').at(-1);
    if (created) apply(created);
  };

  const global = angles?.filter((angle) => angle.origin === 'global') ?? [];
  const local = angles?.filter((angle) => angle.origin === 'production') ?? [];
  const active = angles?.find((angle) => angle.id === activeId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <MenuButton label="Angle de vue" active={activeId !== null}>
          <Aperture className="h-4 w-4" style={active ? { color: active.color } : undefined} />
        </MenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 min-w-64 overflow-y-auto">
        <DropdownMenuLabel>Tourner ce passage en…</DropdownMenuLabel>
        {global.map((angle) => (
          <AngleItem key={angle.id} angle={angle} active={angle.id === activeId} onPick={apply} />
        ))}

        {local.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Propres à cette vidéo</DropdownMenuLabel>
            {local.map((angle) => (
              <AngleItem
                key={angle.id}
                angle={angle}
                active={angle.id === activeId}
                onPick={apply}
              />
            ))}
          </>
        )}

        <DropdownMenuSeparator />
        {productionId && (
          <DropdownMenuItem onSelect={() => void createAndApply()}>
            <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Nouvel angle pour cette vidéo
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onSelect={() => editor.chain().focus().unsetShotAngle().run()}
          className="text-muted-foreground"
        >
          Retirer l'angle
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

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
 *
 * Les deux derniers outils — gabarits et angles de vue — sont montés **conditionnellement**
 * et non masqués : ils portent chacun leurs requêtes, et les laisser tourner dans le
 * formulaire d'un gabarit chargerait la liste des gabarits pour l'écran qui la modifie.
 */
export const ScriptToolbar = ({
  editor,
  productionId,
  scriptTools = true,
}: {
  editor: Editor;
  productionId?: string;
  scriptTools?: boolean;
}) => {
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

      {scriptTools && (
        <>
          <Divider />
          <PresetMenu editor={editor} />
          <ShotAngleMenu editor={editor} productionId={productionId} activeId={state.shotAngle} />
        </>
      )}
    </div>
  );
};
