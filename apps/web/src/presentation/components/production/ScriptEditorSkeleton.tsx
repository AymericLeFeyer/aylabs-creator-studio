import { LoaderCircle } from 'lucide-react';
import { cn } from '../../../shared/cn.ts';

/**
 * Le bloc d'attente de la surface d'écriture.
 *
 * Il sert **deux fois** — pendant le téléchargement du chunk TipTap, puis pendant la
 * création de l'éditeur — et vit dans son propre fichier pour ça : l'enveloppe `lazy` ne
 * peut rien importer de la vue, sinon le chunk serait chargé d'office et le `lazy` ne
 * servirait plus à rien.
 *
 * Sa hauteur est celle de l'éditeur qu'il remplace, sinon le contenu qui suit remonterait
 * puis redescendrait au chargement.
 */
export const ScriptEditorSkeleton = ({ className }: { className?: string }) => (
  <div
    className={cn(
      'flex min-h-[32rem] items-center justify-center rounded-md border border-border bg-card text-sm text-muted-foreground',
      className,
    )}
  >
    <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
    Chargement de l'éditeur…
  </div>
);
