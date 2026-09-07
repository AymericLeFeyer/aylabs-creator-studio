/**
 * Un **gabarit de script** : le rappel d'abonnement, l'appel à l'action de fin, la
 * mention de collaboration commerciale — tout ce qu'on réécrit à l'identique d'une vidéo
 * à l'autre.
 *
 * C'est un **gabarit et non une référence** : son contenu est *copié* dans le script au
 * moment de l'insertion, il n'y reste pas lié. Même parti pris que « Charger depuis la
 * précédente vidéo » — un appel à l'action se retouche pour la vidéo qu'on écrit (le
 * produit du jour, le nom de la marque), et un bloc qui se réécrirait tout seul depuis
 * les paramètres emporterait ces retouches sans prévenir. C'est aussi ce qui permet de
 * *lire* le script à voix haute sans avoir à aller chercher ailleurs ce qu'il contient.
 *
 * `content` est du HTML, exactement comme `productions.script` : c'est le même éditeur
 * qui l'écrit, et convertir d'un format à l'autre à l'insertion finirait par perdre une
 * couleur ou une liste.
 */
export interface ScriptPreset {
  id: string;
  label: string;
  /** À quoi il sert, pour le retrouver dans une liste de quinze. Facultatif. */
  description: string | null;
  content: string;
  /** Sert au liseré du bloc inséré : c'est ce qui le distingue du corps du script. */
  color: string;
  sortOrder: number;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateScriptPresetInput {
  label: string;
  description?: string | null;
  content?: string;
  color?: string;
  sortOrder?: number;
}

export type UpdateScriptPresetInput = Partial<CreateScriptPresetInput> & {
  isArchived?: boolean;
};
