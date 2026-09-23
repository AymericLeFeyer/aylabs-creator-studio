import {
  BarChart3,
  CalendarClock,
  Gift,
  Handshake,
  Hash,
  Images,
  Instagram,
  Link2,
  MessagesSquare,
  Music2,
  ScrollText,
  Wallet,
  Youtube,
  type LucideIcon,
} from 'lucide-react';
import { FORMAT_ICONS } from './components/production/formatIcons.ts';
import {
  EXTERNAL_APP_SECTIONS,
  externalAppPath,
  type ExternalApp,
} from '../domain/externalApp/entities/ExternalApp.ts';
import { externalAppIcon } from './externalAppIcons.ts';

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
 * rien ne dit que « YouTube » et « Instagram » répondent à la même question, ni que
 * « Sponsors » et « Chiffre d'affaires » se consultent l'un après l'autre. Quatre
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
      // Deux files, un seul module : les vidéos longues et les formats courts se
      // préparent pareil (script, créneaux, partenaires) mais ne se pilotent pas au même
      // rythme, et les mêler faisait disparaître les shorts sous les gros projets. Le
      // planning, lui, les montre ensemble — c'est le même temps de travail.
      { to: '/production', label: 'Vidéos', icon: FORMAT_ICONS.video, end: false },
      {
        to: '/shorts',
        label: 'Shorts & Réels',
        short: 'Shorts',
        icon: FORMAT_ICONS.short,
        end: false,
      },
      // Les brouillons de publication Instagram : de la préparation, donc ici, et non
      // sous Audience → Instagram qui ne montre que ce qui est réellement paru.
      { to: '/publications', label: 'Publications', icon: Images, end: false },
    ],
  },
  {
    label: 'Audience',
    items: [
      { to: '/youtube', label: 'YouTube', icon: Youtube, end: false },
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
      // Le chiffre d'affaires en tête : c'est la question qu'on vient poser en premier
      // (« combien j'ai gagné »), avant le détail de ce qui reste à tourner ou à relancer.
      {
        to: '/chiffre-affaires',
        label: "Chiffre d'affaires",
        short: 'CA',
        icon: Wallet,
        end: false,
      },
      // Trois entrées et non un écran à onglets : produits, sponsors et affiliations ne
      // posent pas la même question (qu'est-ce que je dois tourner, qui dois-je relancer,
      // où est gérée l'affiliation), et chacun porte sa propre pastille — un onglet
      // n'aurait pas pu la montrer depuis le menu.
      { to: '/produits', label: 'Produits', icon: Gift, end: false },
      { to: '/sponsors', label: 'Sponsors', icon: Handshake, end: false },
      // « Affiliations » : Domadoo (collecté tout seul) et les autres plateformes
      // (rattachées à la main). Deux onglets d'un même écran, plus deux entrées de menu.
      { to: '/affiliations', label: 'Affiliations', icon: Link2, end: false },
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

/**
 * Le menu, augmenté des **applications externes** activées : chacune rejoint la famille
 * choisie dans ses réglages, après les écrans du studio — une app embarquée n'a pas à
 * passer devant ce que le studio fait lui-même.
 *
 * La famille est retrouvée par son **libellé** (`EXTERNAL_APP_SECTIONS`) : le dashboard,
 * sans famille, n'en reçoit jamais.
 */
export const withExternalApps = (apps: ExternalApp[]): NavSection[] =>
  NAV_SECTIONS.map((section) => {
    const sectionId = EXTERNAL_APP_SECTIONS.find((entry) => entry.label === section.label)?.id;
    const extra: NavItem[] = apps
      .filter((app) => app.enabled && sectionId !== undefined && app.section === sectionId)
      .map((app) => ({
        to: externalAppPath(app),
        label: app.name,
        icon: externalAppIcon(app.icon),
        end: false,
      }));
    return extra.length > 0 ? { ...section, items: [...section.items, ...extra] } : section;
  });

/**
 * Le menu, augmenté de l'entrée **TikTok** — seulement si un profil est configuré
 * (Paramètres → Audience → TikTok). Sans profil renseigné, l'écran n'a rien à montrer :
 * une entrée qui mène à un vide se lit comme une panne, même règle que les pastilles qui
 * restent neutres sans raison à afficher.
 *
 * Insérée juste après Instagram, dans la famille Audience — c'est là qu'elle est réglée.
 */
export const withTikTok = (sections: NavSection[], configured: boolean): NavSection[] => {
  if (!configured) return sections;
  return sections.map((section) => {
    if (section.label !== 'Audience') return section;
    const index = section.items.findIndex((item) => item.to === '/instagram');
    const items = [...section.items];
    items.splice(index + 1, 0, { to: '/tiktok', label: 'TikTok', icon: Music2, end: false });
    return { ...section, items };
  });
};

/**
 * Le menu, augmenté de l'entrée **Discord** — même règle que TikTok, et pour la même
 * raison : sans invitation renseignée, l'écran n'a rien à montrer. Insérée après TikTok
 * s'il est déjà présent, sinon juste après Instagram — appliquer `withTikTok` avant
 * `withDiscord` donne donc Instagram, TikTok, Discord.
 */
export const withDiscord = (sections: NavSection[], configured: boolean): NavSection[] => {
  if (!configured) return sections;
  return sections.map((section) => {
    if (section.label !== 'Audience') return section;
    const tiktokIndex = section.items.findIndex((item) => item.to === '/tiktok');
    const index =
      tiktokIndex >= 0 ? tiktokIndex : section.items.findIndex((item) => item.to === '/instagram');
    const items = [...section.items];
    items.splice(index + 1, 0, { to: '/discord', label: 'Discord', icon: Hash, end: false });
    return { ...section, items };
  });
};

/** Toutes les entrées à plat, dans l'ordre d'affichage. */
export const NAV: NavItem[] = NAV_SECTIONS.flatMap((section) => section.items);

/**
 * Les cinq écrans de la barre du bas, sur mobile.
 *
 * **Cinq et pas plus** : au-delà, les cibles deviennent trop étroites pour un pouce et
 * les libellés illisibles. Ce sont ceux qu'on ouvre en déplacement — regarder où on en
 * est, ce qu'il y a à faire aujourd'hui, ce que ça rapporte, et ce qu'on nous écrit. Le
 * reste (YouTube, Instagram, partenaires, Légal, Paramètres) se consulte assis, et reste
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
  ['/production/', 'Fiche'],
  ['/production', 'Vidéos'],
  ['/shorts', 'Shorts & Réels'],
  ['/publications', 'Publications'],
  ['/planning', 'Planning'],
  ['/youtube', 'YouTube'],
  ['/instagram', 'Instagram'],
  ['/tiktok', 'TikTok'],
  ['/discord', 'Discord'],
  ['/commentaires', 'Commentaires'],
  ['/produits', 'Produits'],
  ['/sponsors', 'Sponsors'],
  ['/affiliations', 'Affiliations'],
  ['/chiffre-affaires', "Chiffre d'affaires"],
  ['/legal', 'Légal'],
  ['/parametres', 'Paramètres'],
  // Repli seulement : `AppLayout` affiche le nom de l'app ouverte.
  ['/apps/', 'Application'],
];

export const pageTitle = (pathname: string): string =>
  TITLES.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? 'Dashboard';
