/** Contrat de `/api/post-drafts`, dupliqué depuis l'API. */

/**
 * Une publication Instagram avant sa parution : un titre, une description, une date
 * prévue. Pour organiser son calendrier, rien de plus — ce qui est paru se lit dans
 * Audience → Instagram.
 */
export interface PostDraft {
  id: string;
  title: string;
  /** Jamais `null` : un champ vide est une chaîne vide. */
  description: string;
  plannedDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PostDraftInput {
  title: string;
  description?: string;
  /** `null` efface la date, absent la conserve. */
  plannedDate?: string | null;
}

/** La limite d'une légende Instagram, celle que l'API applique aussi. */
export const CAPTION_MAX_LENGTH = 2200;

/**
 * Nombre de jours entre aujourd'hui et la date prévue — négatif si elle est passée.
 * Des jours de calendrier, jamais des heures écoulées : les deux bornes sont des dates
 * sans heure, lues au même minuit.
 */
export const daysUntil = (date: string, today: string): number =>
  Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
