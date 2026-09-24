import { EntityPicker } from './EntityPicker.tsx';
import { useFilterPicker } from './useFilterPicker.ts';

/**
 * Le déclencheur de la barre de filtres : chaînes YouTube partout, comptes Instagram sur
 * `/instagram`, comptes TikTok sur `/tiktok` (voir `useFilterPicker`). Invisible tant
 * qu'il n'y a aucune entité (`EntityPicker`) ; à une seule, il reste affiché.
 */
export const ContextualEntityPicker = () => {
  const picker = useFilterPicker();
  return <EntityPicker {...picker} />;
};
