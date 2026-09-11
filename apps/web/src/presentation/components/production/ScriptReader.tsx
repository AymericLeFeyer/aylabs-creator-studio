import { useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '../ui/dialog.tsx';
import { Checkbox } from '../ui/checkbox.tsx';
import { cn } from '../../../shared/cn.ts';

/** Les tailles proposées, du plus petit au plus grand. La deuxième est le défaut. */
const SIZES = ['script-reader-md', 'script-reader-lg', 'script-reader-xl'] as const;

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
 * tourner —, et la case les éteint comme dans l'éditeur, en CSS.
 */
export const ScriptReader = ({ open, onOpenChange, html, hasAngles }: ScriptReaderProps) => {
  const [size, setSize] = useState(1);
  const [anglesHidden, setAnglesHidden] = useState(false);

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

          {hasAngles && (
            <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs text-muted-foreground">
              <Checkbox
                checked={anglesHidden}
                onCheckedChange={(checked) => setAnglesHidden(checked === true)}
              />
              <span className="hidden sm:inline">Masquer les angles</span>
              <span className="sm:hidden">Angles</span>
            </label>
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

        <div className={cn(anglesHidden && 'script-angles-hidden')}>
          <div
            className={cn(
              'prose-script script-reader mx-auto max-w-3xl px-5 py-6 pb-24 sm:px-8',
              SIZES[size],
            )}
            // Du HTML sérialisé par TipTap : le schéma a déjà écarté tout ce qui n'est
            // pas un noeud ou une marque du script.
            dangerouslySetInnerHTML={{
              __html: html || '<p><em>Ce script est vide.</em></p>',
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};
