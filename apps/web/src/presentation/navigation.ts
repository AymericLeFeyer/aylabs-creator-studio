import {
  BarChart3,
  CalendarClock,
  Clapperboard,
  Handshake,
  Instagram,
  MessagesSquare,
  PlaySquare,
  ScrollText,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  /** L'adresse, et **l'identifiant** de l'entrée. */
  to: string;
  label: string;
  /**
   * Libellé court, pour la barre du bas sur mobile — cinq colonnes n'ont pas la place
   * d'écrire « Chiffre d'affaires ». Absent, c'est `label` qui sert.
   */
  short?: string;
  icon: LucideIcon;
  end: boolean;
}

export interface NavSection {
  /** `null` pour l'entrée de tête, qui n'appartient à aucune famille. */
  label: string | null;
  items: NavItem[];
}

/**
 * Les écrans de travail, **groupés par ce à quoi ils servent**.
 *
 * À neuf entrées, une liste à plat oblige à lire tous les libellés pour en trouver un :
 * rien ne dit que « Contenu » et « Instagram » répondent à la même question, ni que
 * « Partenariats » et « Chiffre d'affaires » se consultent l'un après l'autre. Quatre
 * familles courtes se balaient d'un regard, et le titre suffit à savoir dans laquelle
 * chercher : **Production**, **Audience**, **Revenus**, **Entreprise**.
 *
 * Le dashboard reste **hors famille**, en tête et sans titre : c'est la vue d'ensemble,
 * il n'appartient à aucun des métiers et lui donner un intitulé à lui seul ferait une
 * rubrique d'une ligne.
 *
 * « Entreprise » n'en porte qu'un, et c'est assumé : le suivi administratif ne répond pas
 * à la même question que l'argent gagné, et le ranger sous « Revenus » ferait chercher
 * l'Urssaf au milieu des sponsos.
 *
 * L'ordre est **fixe**. Il était réglable — deux flèches dans Paramètres → Application —,
 * et ça ne tenait plus : un ordre libre à plat n'a pas d'équivalent une fois les entrées
 * groupées (déplacer un écran hors de sa famille le rendrait introuvable), et la position
 * d'un écran est justement ce à quoi on se fie pour le retrouver sans lire. Un menu qui
 * ne bouge pas s'apprend une fois.
 *
 * Ce fichier n'exporte aucun composant, et c'est volontaire : `AppLayout` en exporte un,
 * et y placer ces données déclencherait `react-refresh/only-export-components` — même
 * découpage que `videoMarkers.tsx` / `VideoTooltipList.tsx`.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    label: null,
    items: [{ to: '/', label: 'Dashboard', icon: BarChart3, end: true }],
  },
  {
    label: 'Production',
    items: [
      { to: '/planning', label: 'Planning', icon: CalendarClock, end: false },
      // « En cours » et non « Production » : la famille porte déjà le mot, et le répéter
      // à l'identique juste en dessous ne dirait rien de ce que l'écran contient. C'est
      // la file de ce sur quoi on travaille.
      { to: '/production', label: 'En cours', icon: Clapperboard, end: false },
    ],
  },
  {
    label: 'Audience',
    items: [
      { to: '/contenu', label: 'Contenu', icon: PlaySquare, end: false },
      { to: '/instagram', label: 'Instagram', icon: Instagram, end: false },
      {
        to: '/commentaires',
        label: 'Commentaires',
        short: 'Retours',
        icon: MessagesSquare,
        end: false,
      },
    ],
  },
  {
    label: 'Revenus',
    items: [
      { to: '/partenariats', label: 'Partenariats', icon: Handshake, end: false },
      {
        to: '/chiffre-affaires',
        label: "Chiffre d'affaires",
        short: 'CA',
        icon: Wallet,
        end: false,
      },
    ],
  },
  {
    // Le suivi administratif n'est pas un revenu : cocher sa déclaration d'Urssaf ne
    // répond pas à la même question que « combien ai-je gagné ». Une famille à part, qui
    // accueillera ce qui relève de la société plutôt que des chaînes.
    label: 'Entreprise',
    items: [{ to: '/legal', label: 'Légal', icon: ScrollText, end: false }],
  },
];

/** Toutes les entrées à plat, dans l'ordre d'affichage. */
export const NAV: NavItem[] = NAV_SECTIONS.flatMap((section) => section.items);

/**
 * Les cinq écrans de la barre du bas, sur mobile.
 *
 * **Cinq et pas plus** : au-delà, les cibles deviennent trop étroites pour un pouce et
 * les libellés illisibles. Ce sont ceux qu'on ouvre en déplacement — regarder où on en
 * est, ce qu'il y a à faire aujourd'hui, ce que ça rapporte, et ce qu'on nous écrit. Le
 * reste (Contenu, Instagram, Partenariats, Légal, Paramètres) se consulte assis, et reste
 * dans le tiroir du menu — qui, lui, contient **tout**, ces cinq-là compris : chercher
 * dans le menu ne doit jamais donner un trou.
 */
const MOBILE_PATHS = ['/', '/planning', '/production', '/chiffre-affaires', '/commentaires'];

export const MOBILE_NAV: NavItem[] = MOBILE_PATHS.map((path) =>
  NAV.find((item) => item.to === path)!,
).filter(Boolean);

/**
 * Le titre de l'écran courant, pour la barre d'application mobile.
 *
 * Dérivé de l'adresse plutôt que remonté par chaque page : faire circuler un titre
 * demanderait un contexte et une ligne dans les dix écrans, pour une chaîne de caractères
 * que l'URL porte déjà.
 *
 * Il ne reprend pas toujours le libellé du menu : une fiche de vidéo n'en a aucun. Le
 * plus long préfixe gagne, ce qui lui donne son propre titre sans avoir à énumérer les
 * identifiants.
 */
const TITLES: Array<[string, string]> = [
  ['/production/', 'Vidéo'],
  // « En cours », comme dans le menu : « Production » en haut de l'écran redisait le
  // titre de famille sans rien apprendre, et mangeait une ligne de barre d'application.
  ['/production', 'En cours'],
  ['/planning', 'Planning'],
  ['/contenu', 'Contenu'],
  ['/instagram', 'Instagram'],
  ['/commentaires', 'Commentaires'],
  ['/partenariats', 'Partenariats'],
  ['/chiffre-affaires', "Chiffre d'affaires"],
  ['/legal', 'Légal'],
  ['/parametres', 'Paramètres'],
];

export const pageTitle = (pathname: string): string =>
  TITLES.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? 'Dashboard';
