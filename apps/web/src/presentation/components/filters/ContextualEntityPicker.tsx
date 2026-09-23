import { EntityPicker } from './EntityPicker.tsx';
import { useFilterPicker } from './useFilterPicker.ts';

/**
 * Le déclencheur de la barre de filtres : chaînes YouTube partout, comptes Instagram sur
 * `/instagram`, comptes TikTok sur `/tiktok` (voir `useFilterPicker`). Invisible tant
 * qu'il n'y a rien — ou qu'une seule entité — à choisir (`EntityPicker`).
 */
export const ContextualEntityPicker = () => {
  const picker = useFilterPicker();
  return <EntityPicker {...picker} />;
};
