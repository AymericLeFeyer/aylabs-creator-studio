import type { TodoTask } from '../../planning/entities/Planning.ts';

/**
 * Les applications externes ouvertes dans le studio (iframe). Duplique le contrat de
 * l'API — toute évolution doit être répercutée des deux côtés.
 */
export type ExternalAppKind = 'todo' | 'link';

export type ExternalAppSection = 'production' | 'audience' | 'revenus' | 'entreprise';

/**
 * Les familles du menu où une app peut se ranger. Les libellés sont **exactement** ceux
 * de `NAV_SECTIONS` : c'est par eux que l'entrée rejoint sa famille.
 */
export const EXTERNAL_APP_SECTIONS: Array<{ id: ExternalAppSection; label: string }> = [
  { id: 'production', label: 'Production' },
  { id: 'audience', label: 'Audience' },
  { id: 'revenus', label: 'Revenus' },
  { id: 'entreprise', label: 'Entreprise' },
];

export type ExternalAppIcon =
  'list-checks' | 'app-window' | 'globe' | 'notebook' | 'calendar' | 'chart';

export interface ExternalApp {
  id: string;
  kind: ExternalAppKind;
  name: string;
  /** Adresse propre. `null` pour une app Todo = celle de la connexion Todo. */
  url: string | null;
  /** Adresse sur le réseau local, préférée quand le studio est ouvert par une IP privée. */
  localUrl: string | null;
  icon: ExternalAppIcon;
  section: ExternalAppSection;
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  /** L'adresse réellement chargée, repli résolu par l'API. `null` = rien à ouvrir. */
  frameUrl: string | null;
}

export interface ExternalAppInput {
  kind: ExternalAppKind;
  name: string;
  url?: string | null;
  localUrl?: string | null;
  icon?: ExternalAppIcon;
  section?: ExternalAppSection;
  enabled?: boolean;
}

const PRIVATE_IPV4 = /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

/**
 * Le studio est-il ouvert depuis le réseau local ? IP privée, `localhost`, ou un nom sans
 * domaine public (`nas`, `serveur.local`, `box.lan`, `*.home.arpa`).
 */
export const isLocalHostname = (hostname: string): boolean => {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return (
    host === 'localhost' ||
    host === '::1' ||
    PRIVATE_IPV4.test(host) ||
    !host.includes('.') ||
    /\.(local|lan|home\.arpa)$/.test(host)
  );
};

/**
 * L'adresse que **ce navigateur** doit ouvrir. Sur le réseau local, l'adresse locale ;
 * depuis un nom de domaine, l'externe (`frameUrl`, qui porte déjà le repli sur la
 * connexion Todo). Chacune retombe sur l'autre quand elle manque : une app qui n'a qu'une
 * adresse s'ouvre partout où elle est joignable.
 *
 * Décidé ici et pas dans l'API : derrière nginx, l'API ne sait pas par quelle adresse le
 * navigateur l'a jointe.
 */
export const resolveFrameUrl = (
  app: Pick<ExternalApp, 'frameUrl' | 'localUrl'>,
  hostname: string = window.location.hostname,
): string | null =>
  isLocalHostname(hostname) ? (app.localUrl ?? app.frameUrl) : (app.frameUrl ?? app.localUrl);

/** L'adresse de l'écran qui ouvre une app : c'est aussi la clé de sa pastille. */
export const externalAppPath = (app: Pick<ExternalApp, 'id'>): string => `/apps/${app.id}`;

/** Ce qui reste à faire aujourd'hui dans Todo : la pastille de l'entrée Todo. */
export interface TodayTodos {
  connected: boolean;
  error: string | null;
  /** Tâches ouvertes du jour, en retard comprises. */
  tasks: TodoTask[];
}
