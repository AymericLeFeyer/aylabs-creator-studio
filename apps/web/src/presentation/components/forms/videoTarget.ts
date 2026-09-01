/**
 * Encodage du rattachement « à quelle vidéo ? » d'un produit ou d'une sponso.
 *
 * Deux natures cohabitent dans un seul `Select` : une vidéo **en préparation**
 * (`production`) ou une sortie **déjà publiée** (`video`). Les séparer en deux champs
 * obligerait à savoir d'avance dans quel monde chercher, alors qu'on cherche simplement
 * « la vidéo concernée » — parfois faite, parfois pas.
 *
 * Le préfixe est nécessaire parce que les deux mondes ont leurs propres identifiants :
 * sans lui, un `Select` ne saurait pas laquelle des deux tables l'utilisateur a désignée.
 *
 * Ce fichier n'exporte aucun composant (règle `react-refresh/only-export-components`) :
 * le champ vit dans `VideoTargetSelect.tsx`.
 */
import { NONE } from './selectNone.ts';

export const PRODUCTION_PREFIX = 'prod:';
export const VIDEO_PREFIX = 'video:';

/** Ce que le champ renvoie, avec la chaîne de la cible pour que le formulaire la reprenne. */
export type VideoTarget =
  | { kind: 'none' }
  | { kind: 'production'; id: string; channelId: string | null }
  | { kind: 'video'; id: string; channelId: string };

/** Rattachement courant → valeur de `Select`. */
export const toTargetValue = (
  productionId: string | null | undefined,
  videoId: string | null | undefined,
): string => {
  if (productionId) return `${PRODUCTION_PREFIX}${productionId}`;
  if (videoId) return `${VIDEO_PREFIX}${videoId}`;
  return NONE;
};

/**
 * Valeur de `Select` → les deux colonnes de la base.
 * **Un seul des deux est jamais renseigné** : le champ ne propose qu'un rattachement.
 */
export const fromTargetValue = (
  value: string,
): { productionId: string | null; videoId: string | null } => {
  if (value.startsWith(PRODUCTION_PREFIX)) {
    return { productionId: value.slice(PRODUCTION_PREFIX.length), videoId: null };
  }
  if (value.startsWith(VIDEO_PREFIX)) {
    return { productionId: null, videoId: value.slice(VIDEO_PREFIX.length) };
  }
  return { productionId: null, videoId: null };
};

/** `VideoTarget` → valeur de `Select`, pour ranger ce que le champ vient de renvoyer. */
export const targetToValue = (target: VideoTarget): string => {
  if (target.kind === 'production') return `${PRODUCTION_PREFIX}${target.id}`;
  if (target.kind === 'video') return `${VIDEO_PREFIX}${target.id}`;
  return NONE;
};
