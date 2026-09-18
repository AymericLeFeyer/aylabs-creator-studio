/**
 * Une étape ou une tâche du référentiel ne s'applique qu'aux vidéos **créées après
 * elle**.
 *
 * Ajouter « sous-titres » aujourd'hui ne doit pas rouvrir les vidéos sorties l'an
 * dernier : elles n'ont jamais eu cette étape, et l'alerte « publiée avec des tâches non
 * cochées » crierait sur toutes les sorties récentes. La vidéo garde le processus qui
 * existait le jour où on l'a lancée.
 *
 * `appliesFrom` à `null` = toutes les vidéos. C'est le cas de tout ce qui existait avant
 * la règle (migration 33) et de ce qu'on étend à la main depuis les paramètres.
 *
 * Une case **déjà cochée** reste toujours affichée, même hors période : cacher un travail
 * fait ferait mentir l'avancement de la fiche.
 */
export interface Applicable {
  appliesFrom: string | null;
}

export const appliesTo = (
  item: Applicable,
  productionCreatedAt: string,
  checked = false,
): boolean => checked || item.appliesFrom === null || productionCreatedAt >= item.appliesFrom;
