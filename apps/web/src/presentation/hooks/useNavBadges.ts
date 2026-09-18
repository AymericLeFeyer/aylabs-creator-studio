import { useMemo } from 'react';
import { useProductionOverview } from '../../application/production/usecases/useProductions.ts';
import { useLegalOverview } from '../../application/legal/usecases/useLegal.ts';
import {
  useExternalApps,
  useTodayTodos,
} from '../../application/externalApp/usecases/useExternalApps.ts';
import { externalAppPath } from '../../domain/externalApp/entities/ExternalApp.ts';
import { usePostDraftSummary } from '../../application/postDraft/usecases/usePostDrafts.ts';
import {
  useInstagramAccounts,
  useStoryCount,
} from '../../application/instagram/usecases/useInstagram.ts';
import { localToday } from '../../application/planning/usecases/usePlanning.ts';
import { buildNavBadges, publicationBadge, storyBadge, type NavBadge } from '../navBadges.ts';

/**
 * Les pastilles du menu, et les raisons qui les expliquent.
 *
 * Lit l'aperçu de production **sans format** — celui qui porte toutes les alertes et
 * toute la file — et l'aperçu légal. Ce sont les mêmes clés de cache que le dashboard et
 * les écrans concernés : le menu et l'écran ouvert ne peuvent pas se contredire, et
 * cocher une case ou changer un statut fait bouger la pastille dans la foulée.
 *
 * S'y ajoute l'entrée **Todo** quand elle est au menu : le nombre de tâches encore
 * ouvertes aujourd'hui, en orange s'il y en a en retard. C'est un compte, pas une alerte —
 * elle ne porte aucune raison, et l'écran ouvert est l'app elle-même.
 */
export const useNavBadges = (): Record<string, NavBadge> => {
  const { data: overview } = useProductionOverview();
  const { data: legal } = useLegalOverview();
  const { data: apps } = useExternalApps();
  const todoApp = apps?.find((app) => app.kind === 'todo' && app.enabled) ?? null;
  const { data: today } = useTodayTodos(todoApp !== null);
  const { data: publications } = usePostDraftSummary();
  // Le jour local, relu à chaque rendu : la pastille doit basculer à minuit sans recharger.
  const localDay = localToday();
  // Le rappel de story ne vaut que si un profil Instagram est suivi.
  const { data: igAccounts } = useInstagramAccounts();
  const followsInstagram = (igAccounts?.length ?? 0) > 0;
  const { data: stories } = useStoryCount(localDay, followsInstagram);

  return useMemo(() => {
    const badges = buildNavBadges(overview, legal?.alerts);
    const publicationsBadge = publications ? publicationBadge(publications, localDay) : null;
    if (publicationsBadge) badges['/publications'] = publicationsBadge;
    const instagramBadge = followsInstagram && stories ? storyBadge(stories.count) : null;
    if (instagramBadge) badges['/instagram'] = instagramBadge;
    if (todoApp && today?.connected && !today.error) {
      badges[externalAppPath(todoApp)] = {
        count: today.tasks.length,
        tone: today.tasks.some((task) => task.overdue) ? 'warning' : 'neutral',
        reasons: [],
      };
    }
    return badges;
  }, [overview, legal, todoApp, today, publications, localDay, followsInstagram, stories]);
};
