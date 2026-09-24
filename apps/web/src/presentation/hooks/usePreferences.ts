import { useLocalStorage } from './useLocalStorage.ts';
import { DEFAULT_MOBILE_NAV } from '../navigation.ts';

/**
 * Les préférences d'affichage de l'application.
 *
 * Distinctes des **filtres** (`useFilters`), et la frontière est nette : un filtre change
 * *ce qu'on regarde* et se règle en haut de l'écran, une préférence change *comment
 * l'outil se présente* et se règle une fois pour toutes dans Paramètres → Application.
 *
 * Le stockage est local au navigateur : ce sont des choix d'affichage, pas des données.
 */
export interface AppPreferences {
  /** Barre latérale repliée sur ses seules icônes. */
  sidebarCollapsed: boolean;
  /** File d'attente en cartes compactes : une ligne par vidéo au lieu d'un bloc. */
  compactQueue: boolean;
  /** Rangée des tâches Todo du planning repliée sur un compteur par jour. */
  planningTodosCollapsed: boolean;
  /** Cran de zoom de la grille du planning, indice dans `ZOOM_LEVELS`. */
  planningZoom: number;
  /**
   * Les trois entrées de la barre du bas, sur mobile : gauche, centre, droite (adresses du
   * menu). Propre à l'appareil, comme le reste des préférences : c'est le téléphone qui
   * porte cette barre.
   */
  mobileNav: [string, string, string];
}

const DEFAULTS: AppPreferences = {
  sidebarCollapsed: false,
  compactQueue: false,
  planningTodosCollapsed: false,
  // `DEFAULT_ZOOM` : le cran qui reproduit l'ancienne hauteur fixe de 56 px par heure.
  planningZoom: 3,
  mobileNav: [...DEFAULT_MOBILE_NAV],
};

export const usePreferences = () => {
  const [stored, setStored] = useLocalStorage<AppPreferences>('acs.preferences', DEFAULTS);
  // Un état persisté d'une version antérieure peut manquer de champs.
  const preferences = { ...DEFAULTS, ...stored };

  return {
    preferences,
    set: (patch: Partial<AppPreferences>) =>
      setStored((current) => ({ ...DEFAULTS, ...current, ...patch })),
  };
};
