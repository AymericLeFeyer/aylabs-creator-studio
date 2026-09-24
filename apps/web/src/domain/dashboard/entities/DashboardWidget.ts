/**
 * Un bloc posé sur le dashboard — contrat dupliqué de l'API.
 *
 * Le dashboard ne possède aucune donnée : `blockId` désigne un bloc du catalogue
 * (`presentation/dashboard/registry.ts`), qui continue de vivre sur sa page d'origine.
 * `title` / `description` / `icon` à `null` = ceux du bloc d'origine.
 */
export interface DashboardWidget {
  id: string;
  blockId: string;
  title: string | null;
  description: string | null;
  icon: string | null;
  /** Colonnes occupées sur une grille de 6, au large. */
  width: number;
  /** Style d'un titre de section (`HeadingVariant`), `null` pour un bloc. */
  variant: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardWidgetUpdate {
  title?: string | null;
  description?: string | null;
  icon?: string | null;
  width?: number;
  variant?: string | null;
}

export interface DashboardWidgetCreate {
  blockId: string;
  width?: number;
  title?: string | null;
  icon?: string | null;
  variant?: string | null;
}

/**
 * Les **titres de section** : des lignes du dashboard comme les blocs, mais qui ne
 * désignent rien du catalogue. Leur identifiant porte ce préfixe suivi d'un aléatoire, ce
 * qui permet d'en poser autant qu'on veut malgré l'unicité de `block_id`.
 */
export const HEADING_PREFIX = 'heading.';

export const isHeading = (blockId: string): boolean => blockId.startsWith(HEADING_PREFIX);

export const newHeadingId = (): string =>
  `${HEADING_PREFIX}${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

export const HEADING_VARIANTS = ['h1', 'h2', 'h3', 'label', 'divider'] as const;
export type HeadingVariant = (typeof HEADING_VARIANTS)[number];

export const HEADING_VARIANT_LABELS: Record<HeadingVariant, string> = {
  h1: 'Grand titre',
  h2: 'Section',
  h3: 'Sous-section',
  label: 'Intitulé',
  divider: 'Séparateur',
};

export const headingVariant = (value: string | null): HeadingVariant =>
  HEADING_VARIANTS.includes(value as HeadingVariant) ? (value as HeadingVariant) : 'h2';

export const WIDGET_WIDTHS = [1, 2, 3, 4, 5, 6] as const;
