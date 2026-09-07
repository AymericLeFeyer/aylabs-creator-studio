/**
 * Un **gabarit de script** : le rappel d'abonnement, l'appel à l'action de fin, la
 * mention de partenariat — tout ce qu'on réécrit à l'identique d'une vidéo à l'autre.
 *
 * C'est un gabarit et non une référence : son contenu est **copié** dans le script à
 * l'insertion. Le bloc inséré se retouche pour la vidéo qu'on écrit et ne bouge plus
 * jamais tout seul. Duplique le contrat de l'API.
 */
export interface ScriptPreset {
  id: string;
  label: string;
  description: string | null;
  /** Du HTML, comme le script lui-même : c'est le même éditeur qui l'écrit. */
  content: string;
  color: string;
  sortOrder: number;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ScriptPresetInput {
  label: string;
  description?: string | null;
  content?: string;
  color?: string;
}
