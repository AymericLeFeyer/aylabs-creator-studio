import { useMemo } from 'react';
import { useProductionOverview } from '../../application/production/usecases/useProductions.ts';
import { useLegalOverview } from '../../application/legal/usecases/useLegal.ts';
import { buildNavBadges, type NavBadge } from '../navBadges.ts';

/**
 * Les pastilles du menu, et les raisons qui les expliquent.
 *
 * Lit l'aperçu de production **sans format** — celui qui porte toutes les alertes et
 * toute la file — et l'aperçu légal. Ce sont les mêmes clés de cache que le dashboard et
 * les écrans concernés : le menu et l'écran ouvert ne peuvent pas se contredire, et
 * cocher une case ou changer un statut fait bouger la pastille dans la foulée.
 */
export const useNavBadges = (): Record<string, NavBadge> => {
  const { data: overview } = useProductionOverview();
  const { data: legal } = useLegalOverview();
  return useMemo(() => buildNavBadges(overview, legal?.alerts), [overview, legal]);
};
