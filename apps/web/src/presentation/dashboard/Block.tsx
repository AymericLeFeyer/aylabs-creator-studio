import { Addable } from './AddToDashboard.tsx';
import { BLOCKS } from './registry.tsx';

/**
 * Un bloc sur sa **page d'origine** : le bloc du catalogue, avec l'icône qui l'ajoute au
 * dashboard au survol. C'est le seul chemin par lequel une page monte un bloc, si bien
 * que tout ce qu'on voit dans l'app est, par construction, ajoutable au dashboard.
 */
export const Block = ({ id, className }: { id: string; className?: string }) => {
  const definition = BLOCKS[id];
  if (!definition) {
    if (import.meta.env.DEV) console.warn(`[dashboard] bloc inconnu : ${id}`);
    return null;
  }
  return (
    <Addable blockId={id} width={definition.width} label={definition.label} className={className}>
      {definition.render()}
    </Addable>
  );
};
