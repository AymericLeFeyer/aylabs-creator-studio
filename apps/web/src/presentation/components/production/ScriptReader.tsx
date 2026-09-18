import { useMemo, useState } from 'react';
import { Check, ChevronDown, Minus, Plus, X } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '../ui/dialog.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu.tsx';
import { cn } from '../../../shared/cn.ts';

/** Les tailles proposées, du plus petit au plus grand. La deuxième est le défaut. */
const SIZES = ['script-reader-md', 'script-reader-lg', 'script-reader-xl'] as const;

/** Un angle tel qu'il est écrit dans le script : le lecteur ne consulte aucun référentiel. */
interface ReaderAngle {
  key: string;
  label: string;
  color: string;
}

/**
 * La clé d'un passage marqué. `angleId` d'abord ; à défaut — marque écrite sans
 * identifiant —, le libellé, qui est ce que le lecteur voit et ce qu'il choisit.
 */
const angleKey = (element: Element): string => {
  const id = element.getAttribute('data-shot-angle');
  return id ? id : `label:${element.getAttribute('data-shot-label') ?? ''}`;
};

/**
 * Les angles **présents dans ce script**, dans leur ordre d'apparition — l'ordre du
 * tournage, qui est celui dans lequel on les cherche. Lus dans le HTML plutôt que dans le
 * référentiel : un angle supprimé depuis reste marqué dans le texte, et doit pouvoir s'y
 * allumer comme les autres.
 */
const anglesOf = (doc: Document): ReaderAngle[] => {
  const seen = new Map<string, ReaderAngle>();
  doc.querySelectorAll('[data-shot-angle]').forEach((element) => {
    const key = angleKey(element);
    if (seen.has(key)) return;
    seen.set(key, {
      key,
      label: element.getAttribute('data-shot-label') || 'Sans nom',
      color: element.getAttribute('data-shot-color') ?? '#3b82f6',
    });
  });
  return [...seen.values()];
};

interface ScriptReaderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Le HTML **sérialisé par l'éditeur** (`getHTML`), jamais la valeur brute en base. */
  html: string;
  hasAngles: boolean;
}

/**
 * Le script en **lecture seule, plein écran**, en gros caractères : pour le lire à voix
 * haute, téléphone posé à côté de la caméra.
 *
 * Rien n'y est éditable, et c'est le but : sur un téléphone, un doigt qui effleure le
 * texte pour le faire défiler ne doit ni poser un curseur, ni ouvrir le clavier, ni
 * déplacer une phrase. D'où un rendu HTML et non un second éditeur en `editable: false`
 * — le même résultat, sans charger ProseMirror une deuxième fois.
 *
 * Le HTML est celui que **l'éditeur** sérialise, pas la chaîne stockée : il est déjà passé
 * par le schéma (seuls les noeuds et marques connus survivent), et un vieux script
 * markdown y arrive converti.
 *
 * Une modale Radix et non un `fixed` maison : ouvert depuis le script d'une sponso,
 * le lecteur vit **dans** une modale, et un élément `fixed` y serait positionné par
 * rapport à elle (elle est centrée par `transform`). Radix empile correctement les deux,
 * et Échap ne referme que celle du dessus.
 *
 * Les angles de vue restent visibles par défaut — on lit souvent le script pour le
 * tourner. Un menu permet de n'en **allumer que certains** (« je tourne les plans face
 * caméra, puis les inserts ») : le texte reste entier, seuls les passages des angles
 * retenus gardent leur teinte. L'état retient les angles **éteints** et non les allumés,
 * pour qu'un angle ajouté au script depuis la dernière ouverture arrive allumé.
 *
 * L'extinction est un `data-shot-off` posé sur une **copie** du HTML (la règle CSS est à
 * côté de `.script-angles-hidden`) : le script n'est jamais touché.
 */
export const ScriptReader = ({ open, onOpenChange, html, hasAngles }: ScriptReaderProps) => {
  const [size, setSize] = useState(1);
  const [off, setOff] = useState<ReadonlySet<string>>(() => new Set());

  const { angles, rendered } = useMemo(() => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const found = anglesOf(doc);
    if (off.size > 0) {
      doc.querySelectorAll('[data-shot-angle]').forEach((element) => {
        if (off.has(angleKey(element))) element.setAttribute('data-shot-off', '');
      });
    }
    return { angles: found, rendered: doc.body.innerHTML };
  }, [html, off]);

  const shown = angles.filter((angle) => !off.has(angle.key));
  const toggle = (key: string) =>
    setOff((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // Toute la fenêtre : `cn` (tailwind-merge) fait gagner ces classes sur celles du
        // gabarit de modale. Le bouton de fermeture intégré est masqué — il défilerait
        // avec le texte ; celui de la barre collante reste à portée.
        className={cn(
          'h-[100dvh] max-h-none w-screen max-w-none rounded-none border-0 bg-background p-0',
          '[&>button:last-child]:hidden',
        )}
      >
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background/95 px-4 py-2 backdrop-blur">
          <DialogTitle className="min-w-0 flex-1 truncate text-base">Lecture du script</DialogTitle>

          {hasAngles && angles.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'flex h-9 min-w-0 items-center gap-1.5 rounded-md border border-border px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                    shown.length !== angles.length && 'border-primary/40 text-foreground',
                  )}
                >
                  <span className="flex -space-x-1">
                    {shown.slice(0, 3).map((angle) => (
                      <span
                        key={angle.key}
                        className="h-2.5 w-2.5 rounded-full ring-2 ring-background"
                        style={{ backgroundColor: angle.color }}
                      />
                    ))}
                  </span>
                  <span className="max-w-[9rem] truncate">
                    {shown.length === angles.length
                      ? 'Tous les angles'
                      : shown.length === 0
                        ? 'Aucun angle'
                        : shown.length === 1
                          ? shown[0]?.label
                          : `${shown.length} angles`}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="min-w-52">
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    setOff(new Set());
                  }}
                >
                  <span className="flex h-4 w-4 items-center justify-center">
                    {shown.length === angles.length && <Check className="h-3.5 w-3.5" />}
                  </span>
                  Tous
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    setOff(new Set(angles.map((angle) => angle.key)));
                  }}
                >
                  <span className="flex h-4 w-4 items-center justify-center">
                    {shown.length === 0 && <Check className="h-3.5 w-3.5" />}
                  </span>
                  Aucun
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                {angles.map((angle) => (
                  <DropdownMenuItem
                    key={angle.key}
                    // Sans ça, le menu se referme au premier clic : on en retient souvent deux.
                    onSelect={(event) => {
                      event.preventDefault();
                      toggle(angle.key);
                    }}
                  >
                    <span className="flex h-4 w-4 items-center justify-center">
                      {!off.has(angle.key) && <Check className="h-3.5 w-3.5" />}
                    </span>
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: angle.color }}
                    />
                    <span className="truncate">{angle.label}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <div className="flex items-center rounded-md border border-border">
            <button
              type="button"
              className="p-2 text-muted-foreground hover:text-foreground disabled:opacity-40"
              onClick={() => setSize((value) => Math.max(0, value - 1))}
              disabled={size === 0}
              aria-label="Texte plus petit"
            >
              <Minus className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="p-2 text-muted-foreground hover:text-foreground disabled:opacity-40"
              onClick={() => setSize((value) => Math.min(SIZES.length - 1, value + 1))}
              disabled={size === SIZES.length - 1}
              aria-label="Texte plus grand"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <DialogClose
            className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Fermer la lecture"
          >
            <X className="h-5 w-5" />
          </DialogClose>
        </div>

        <div
          className={cn(
            'prose-script script-reader mx-auto max-w-3xl px-5 py-6 pb-24 sm:px-8',
            SIZES[size],
          )}
          // Du HTML sérialisé par TipTap : le schéma a déjà écarté tout ce qui n'est
          // pas un noeud ou une marque du script.
          dangerouslySetInnerHTML={{
            __html: rendered || '<p><em>Ce script est vide.</em></p>',
          }}
        />
      </DialogContent>
    </Dialog>
  );
};
