import { Suspense, lazy } from 'react';
import type { ScriptEditorProps } from './ScriptEditorView.tsx';
import { ScriptEditorSkeleton } from './ScriptEditorSkeleton.tsx';

/**
 * L'éditeur de script, **chargé à la demande**.
 *
 * TipTap et ProseMirror pèsent à eux seuls plus que le reste de l'application réunie, et
 * ne servent que sur deux écrans : une fiche de production et le script d'une sponso. Un
 * simple `manualChunks` les isole dans leur propre fichier mais ne les rend pas
 * facultatifs — statiquement importés, ils sont téléchargés au premier écran venu, y
 * compris le dashboard. Le `lazy` est ce qui rend l'isolement réel.
 */
const ScriptEditorView = lazy(() =>
  import('./ScriptEditorView.tsx').then((module) => ({ default: module.ScriptEditorView })),
);

export const ScriptEditor = (props: ScriptEditorProps) => (
  <Suspense fallback={<ScriptEditorSkeleton />}>
    <ScriptEditorView {...props} />
  </Suspense>
);
