import { useLocalStorage } from './useLocalStorage.ts';

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
  /**
   * Ordre des entrées de la barre latérale, par adresse.
   *
   * Vide = l'ordre par défaut. On stocke les **adresses** et non des index : un écran
   * ajouté ou retiré par une mise à jour décalerait tous les rangs suivants, et le menu
   * se retrouverait mélangé sans que personne n'y ait touché.
   */
  navOrder: string[];
}

const DEFAULTS: AppPreferences = {
  sidebarCollapsed: false,
  compactQueue: false,
  navOrder: [],
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
