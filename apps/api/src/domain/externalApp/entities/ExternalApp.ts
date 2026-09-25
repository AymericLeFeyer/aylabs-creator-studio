/**
 * Une application externe, ouverte **dans** Creator Studio (iframe) depuis une entrée du
 * menu.
 *
 * Le besoin : piloter l'app Todo — et, plus tard, d'autres outils du même genre — sans
 * quitter le studio ni multiplier les onglets. Le studio n'en connaît que ce qu'il faut
 * pour les ranger : un nom, une adresse, une icône et la **famille du menu** où les
 * afficher. Ce qui se passe dans l'iframe ne le regarde pas.
 *
 * Deux sortes :
 *
 * - `todo` — l'app Todo déjà connectée au planning. Son adresse retombe sur celle de la
 *   connexion quand `url` est vide, et son entrée de menu porte la **pastille des tâches
 *   du jour**. Une seule par base (index unique partiel) : deux entrées « Tâches » ne
 *   diraient rien de plus.
 * - `link` — n'importe quelle autre page à embarquer. Une adresse au moins, externe ou
 *   locale.
 */
export type ExternalAppKind = 'todo' | 'link';

/** Les familles du menu principal : une app s'y range comme un écran du studio. */
export const EXTERNAL_APP_SECTIONS = ['production', 'audience', 'revenus', 'entreprise'] as const;
export type ExternalAppSection = (typeof EXTERNAL_APP_SECTIONS)[number];

/** Un petit jeu fermé : le front traduit chaque clé en icône lucide. */
export const EXTERNAL_APP_ICONS = [
  'list-checks',
  'app-window',
  'globe',
  'notebook',
  'calendar',
  'chart',
] as const;
export type ExternalAppIcon = (typeof EXTERNAL_APP_ICONS)[number];

export interface ExternalApp {
  id: string;
  kind: ExternalAppKind;
  name: string;
  /**
   * Adresse chargée dans l'iframe. `null` n'est permis que pour `todo` : on reprend alors
   * l'adresse de la connexion Todo. Elle peut différer — l'API du studio joint Todo par
   * une adresse interne au réseau Docker, le navigateur par son adresse publique.
   */
  url: string | null;
  /**
   * Adresse sur le réseau local (`http://192.168.1.20:3000`), facultative. C'est le
   * **navigateur** qui choisit (`resolveFrameUrl`, côté front) : ouvert par une IP privée
   * ou `localhost`, le studio charge celle-ci ; ouvert par un nom de domaine, il charge
   * `url` (l'adresse externe). L'API ne peut pas trancher : elle ne sait pas par quelle
   * adresse le navigateur l'a jointe derrière nginx.
   */
  localUrl: string | null;
  icon: ExternalAppIcon;
  section: ExternalAppSection;
  /** Décochée, l'app n'apparaît plus dans le menu, sans perdre son réglage. */
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** Ce que les routes renvoient : l'adresse réellement ouverte, une fois le repli résolu. */
export interface ExternalAppView extends ExternalApp {
  /** `null` = rien à ouvrir (une app Todo sans adresse, et Todo non connecté). */
  frameUrl: string | null;
}

export interface CreateExternalAppInput {
  kind: ExternalAppKind;
  name: string;
  url?: string | null;
  localUrl?: string | null;
  icon?: ExternalAppIcon;
  section?: ExternalAppSection;
  enabled?: boolean;
}

export type UpdateExternalAppInput = Partial<Omit<CreateExternalAppInput, 'kind'>> & {
  sortOrder?: number;
};
