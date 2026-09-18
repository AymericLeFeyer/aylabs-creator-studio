import type { IsoDate } from '../../../shared/dates.ts';

/**
 * Une publication Instagram **avant** qu'elle paraisse : un titre, une description, une
 * date prévue.
 *
 * Volontairement pauvre, comme une idée : c'est un outil pour organiser son calendrier de
 * publication, pas une production. Une fois parue, la publication se lit dans
 * Audience → Instagram — relevée sur le profil public — et le brouillon se supprime.
 *
 * `description` est toujours une chaîne, jamais `null` : même règle que `script`, un
 * champ de formulaire n'a pas à distinguer « vide » de « pas encore renseigné ».
 * `plannedDate` est facultative : on note souvent une publication avant de savoir quand
 * elle sortira.
 */
export interface PostDraft {
  id: string;
  title: string;
  description: string;
  plannedDate: IsoDate | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePostDraftInput {
  title: string;
  description?: string;
  plannedDate?: IsoDate | null;
}

export type UpdatePostDraftInput = Partial<CreatePostDraftInput>;
