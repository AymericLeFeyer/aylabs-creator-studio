import { Suspense, lazy } from 'react';
import { LoaderCircle } from 'lucide-react';
import type { ScriptEditorProps } from './ScriptEditorView.tsx';

/**
 * L'éditeur de script, **chargé à la demande**.
 *
 * TipTap et ProseMirror pèsent à eux seuls plus que le reste de l'application réunie, et
 * ne servent que sur deux écrans : une fiche de production et le script d'une sponso. Un
 * simple `manualChunks` les isole dans leur propre fichier mais ne les rend pas
 * facultatifs — statiquement importés, ils sont téléchargés au premier écran venu, y
 * compris le dashboard. Le `lazy` est ce qui rend l'isolement réel.
 *
 * Le repli n'est pas une page blanche mais un bloc à la **hauteur de l'éditeur** : sans
 * ça, le contenu sous l'onglet remonterait puis redescendrait au chargement.
 */
const ScriptEditorView = lazy(() =>
  import('./ScriptEditorView.tsx').then((module) => ({ default: module.ScriptEditorView })),
);

export const ScriptEditor = (props: ScriptEditorProps) => (
  <Suspense
    fallback={
      <div className="flex min-h-[32rem] items-center justify-center rounded-md border border-border bg-card text-sm text-muted-foreground">
        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
        Chargement de l'éditeur…
      </div>
    }
  >
    <ScriptEditorView {...props} />
  </Suspense>
);
