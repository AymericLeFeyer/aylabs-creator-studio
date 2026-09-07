import { Suspense, lazy } from 'react';
import type { ScriptEditorProps, ScriptFieldProps } from './ScriptEditorView.tsx';
import { ScriptEditorSkeleton } from './ScriptEditorSkeleton.tsx';

/**
 * L'éditeur de script, **chargé à la demande**.
 *
 * TipTap et ProseMirror pèsent à eux seuls plus que le reste de l'application réunie, et
 * ne servent que sur trois écrans : une fiche de production, le script d'une sponso, et
 * le formulaire d'un gabarit. Un simple `manualChunks` les isole dans leur propre fichier
 * mais ne les rend pas facultatifs — statiquement importés, ils sont téléchargés au
 * premier écran venu, y compris le dashboard. Le `lazy` est ce qui rend l'isolement réel.
 *
 * Les deux entrées partagent **le même module** : le second `lazy` ne coûte donc aucun
 * téléchargement de plus, il désigne un autre export du fichier déjà chargé.
 */
const ScriptEditorView = lazy(() =>
  import('./ScriptEditorView.tsx').then((module) => ({ default: module.ScriptEditorView })),
);

const ScriptFieldView = lazy(() =>
  import('./ScriptEditorView.tsx').then((module) => ({ default: module.ScriptFieldView })),
);

export const ScriptEditor = (props: ScriptEditorProps) => (
  <Suspense fallback={<ScriptEditorSkeleton />}>
    <ScriptEditorView {...props} />
  </Suspense>
);

/** Le contenu d'un gabarit : la même surface, en champ de formulaire contrôlé. */
export const ScriptField = (props: ScriptFieldProps) => (
  <Suspense fallback={<ScriptEditorSkeleton className={props.minHeight ?? 'min-h-[14rem]'} />}>
    <ScriptFieldView {...props} />
  </Suspense>
);
