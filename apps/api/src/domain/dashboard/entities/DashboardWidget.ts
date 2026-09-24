/**
 * Un bloc posé sur le dashboard.
 *
 * Le dashboard ne possède **aucune donnée** : il désigne un bloc qui vit ailleurs dans
 * l'application par son identifiant (`blockId`, ex. `youtube.views`, `domadoo.total.balance`)
 * et ne garde que sa mise en page et ses retouches d'affichage. Le catalogue des blocs vit
 * côté front, qui seul sait les dessiner : l'API ne valide que la forme de l'identifiant,
 * et un bloc inconnu (retiré du code) est simplement ignoré à l'affichage.
 *
 * `title`, `description`, `icon` à `null` = ceux du bloc d'origine. Une chaîne vide n'est
 * pas `null` : elle efface volontairement le sous-titre.
 */
export interface DashboardWidget {
  id: string;
  blockId: string;
  title: string | null;
  description: string | null;
  /** Clé d'un jeu fermé d'icônes, côté front. */
  icon: string | null;
  /** Colonnes occupées sur une grille de 6, au large. */
  width: number;
  /**
   * Variante d'affichage, libre pour l'API. Sert aux **titres de section**
   * (`blockId` `heading.…`) : `h1`, `h2`, `h3`, `label`, `divider`. `null` ailleurs.
   */
  variant: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export const WIDGET_MIN_WIDTH = 1;
export const WIDGET_MAX_WIDTH = 6;

export interface CreateDashboardWidgetInput {
  blockId: string;
  width?: number;
  /** Un titre de section naît avec son texte, son icône et sa variante. */
  title?: string | null;
  icon?: string | null;
  variant?: string | null;
}

export interface UpdateDashboardWidgetInput {
  title?: string | null;
  description?: string | null;
  icon?: string | null;
  width?: number;
  variant?: string | null;
}
