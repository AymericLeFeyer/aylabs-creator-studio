import { Clapperboard, Smartphone, type LucideIcon } from 'lucide-react';
import type { ProductionFormat } from '../../../domain/production/entities/Production.ts';

/**
 * L'icône de chaque format, à un seul endroit : le menu, les cartes, la swimlane et les
 * blocs du planning doivent désigner un short du même pictogramme, sans quoi on ne le
 * reconnaîtrait plus d'un écran à l'autre.
 *
 * Le planning mélange volontairement les deux formats — c'est le même temps de travail —,
 * et l'icône est la seule chose qui les y distingue. Le menu reprend les mêmes, pour que
 * le lien se fasse sans y penser.
 *
 * Ce fichier n'exporte aucun composant (`react-refresh/only-export-components`) : le
 * rendu vit dans `FormatIcon.tsx`.
 */
export const FORMAT_ICONS: Record<ProductionFormat, LucideIcon> = {
  video: Clapperboard,
  short: Smartphone,
};
