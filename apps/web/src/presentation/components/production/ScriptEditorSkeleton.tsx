import { LoaderCircle } from 'lucide-react';

/**
 * Le bloc d'attente de l'éditeur de script.
 *
 * Il sert **deux fois** — pendant le téléchargement du chunk TipTap, puis pendant la
 * création de l'éditeur — et vit dans son propre fichier pour ça : l'enveloppe `lazy` ne
 * peut rien importer de `ScriptEditorView`, sinon le chunk serait chargé d'office et le
 * `lazy` ne servirait plus à rien.
 *
 * Il a la **hauteur de l'éditeur** : sans ça, le contenu de l'onglet remonterait puis
 * redescendrait au chargement.
 */
export const ScriptEditorSkeleton = () => (
  <div className="flex min-h-[32rem] items-center justify-center rounded-md border border-border bg-card text-sm text-muted-foreground">
    <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
    Chargement de l'éditeur…
  </div>
);
