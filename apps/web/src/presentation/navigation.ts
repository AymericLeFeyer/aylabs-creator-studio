import {
  BarChart3,
  CalendarClock,
  Clapperboard,
  Handshake,
  Instagram,
  PlaySquare,
  ScrollText,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  /** L'adresse, et **l'identifiant** de l'entrée dans l'ordre persisté. */
  to: string;
  label: string;
  icon: LucideIcon;
  end: boolean;
}

/**
 * Les écrans de travail, dans leur ordre **par défaut**.
 *
 * Ce fichier n'exporte aucun composant, et c'est volontaire : `AppLayout` en exporte un,
 * et y placer ces données déclencherait `react-refresh/only-export-components` — même
 * découpage que `videoMarkers.tsx` / `VideoTooltipList.tsx`.
 */
export const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: BarChart3, end: true },
  { to: '/contenu', label: 'Contenu', icon: PlaySquare, end: false },
  { to: '/instagram', label: 'Instagram', icon: Instagram, end: false },
  { to: '/planning', label: 'Planning', icon: CalendarClock, end: false },
  { to: '/production', label: 'Production', icon: Clapperboard, end: false },
  { to: '/partenariats', label: 'Partenariats', icon: Handshake, end: false },
  { to: '/chiffre-affaires', label: "Chiffre d'affaires", icon: Wallet, end: false },
  { to: '/legal', label: 'Légal', icon: ScrollText, end: false },
];

/**
 * Applique l'ordre choisi par l'utilisateur.
 *
 * Les entrées **inconnues de l'ordre persisté ferment la marche**, dans leur ordre par
 * défaut : un écran ajouté par une mise à jour doit apparaître, pas disparaître parce
 * qu'un ordre enregistré l'an dernier ne le mentionnait pas. Symétriquement, une adresse
 * persistée qui n'existe plus est simplement ignorée.
 */
export const orderedNav = (order: string[]): NavItem[] => {
  const byPath = new Map(NAV.map((item) => [item.to, item]));
  const ordered: NavItem[] = [];

  for (const path of order) {
    const item = byPath.get(path);
    if (item) {
      ordered.push(item);
      byPath.delete(path);
    }
  }

  return [...ordered, ...NAV.filter((item) => byPath.has(item.to))];
};
