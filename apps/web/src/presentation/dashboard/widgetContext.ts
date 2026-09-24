import { createContext, useContext } from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * Les retouches d'un bloc posé sur le dashboard, **lues par le bloc lui-même**.
 *
 * Un bloc ne sait pas s'il est sur sa page ou sur le dashboard : il rend son titre, son
 * sous-titre et son icône par `StatCard` ou `BlockHeading`, qui consultent ce contexte et
 * s'effacent devant la retouche quand il y en a une. C'est ce qui permet de renommer
 * n'importe quel bloc sans que chacun ait à connaître le dashboard — et c'est la seule
 * façon de rester WYSIWYG : on retouche le bloc réel, pas une copie.
 *
 * `null` hors du dashboard. Dans un champ, `null` = valeur d'origine ; une chaîne vide
 * efface volontairement (un sous-titre qu'on ne veut plus voir).
 *
 * Ce fichier n'exporte aucun composant (`react-refresh/only-export-components`).
 */
export interface WidgetOverrides {
  title: string | null;
  description: string | null;
  icon: LucideIcon | null;
}

export const WidgetContext = createContext<WidgetOverrides | null>(null);

export const useWidgetOverrides = (): WidgetOverrides | null => useContext(WidgetContext);
