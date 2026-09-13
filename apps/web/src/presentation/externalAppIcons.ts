import {
  AppWindow,
  BarChart3,
  CalendarDays,
  Globe,
  ListChecks,
  Notebook,
  type LucideIcon,
} from 'lucide-react';
import type { ExternalAppIcon } from '../domain/externalApp/entities/ExternalApp.ts';

/**
 * Les icônes proposées pour une application externe. Un jeu fermé : l'API ne stocke
 * qu'une clé, et une icône libre n'aurait aucune équivalence côté serveur.
 *
 * Ce fichier n'exporte aucun composant (`react-refresh/only-export-components`).
 */
export const EXTERNAL_APP_ICONS: Array<{ id: ExternalAppIcon; label: string; icon: LucideIcon }> = [
  { id: 'list-checks', label: 'Tâches', icon: ListChecks },
  { id: 'app-window', label: 'Application', icon: AppWindow },
  { id: 'globe', label: 'Site', icon: Globe },
  { id: 'notebook', label: 'Notes', icon: Notebook },
  { id: 'calendar', label: 'Agenda', icon: CalendarDays },
  { id: 'chart', label: 'Statistiques', icon: BarChart3 },
];

export const externalAppIcon = (id: ExternalAppIcon): LucideIcon =>
  EXTERNAL_APP_ICONS.find((entry) => entry.id === id)?.icon ?? AppWindow;
