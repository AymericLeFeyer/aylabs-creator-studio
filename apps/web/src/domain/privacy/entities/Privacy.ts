/**
 * La confidentialité : ce qu'on accepte de laisser voir.
 *
 * Le besoin est celui d'un écran qu'on montre — un partage d'écran, une capture, un
 * direct, un ordinateur ouvert dans un train. Tout le reste de l'outil est fait pour
 * mettre l'argent sous les yeux ; il faut donc un geste qui l'en retire, et un seul.
 *
 * C'est une **préférence d'affichage** et rien d'autre : rien n'est chiffré, rien n'est
 * retiré de l'API, et le masquage ne survit pas à l'ouverture des outils de
 * développement. Il protège d'un regard, pas d'un attaquant.
 */

/**
 * Ce qui peut être masqué, une clé par nature d'information.
 *
 * Le découpage suit les questions qu'on se pose vraiment (« je veux bien montrer mes
 * vues, pas ce que me paient mes sponsors ») et non la structure des tables : `adsense`,
 * `affiliation` et `sponsorships` sont trois catégories de revenus, mais ce sont surtout
 * trois choses qu'on ne cache pas pour les mêmes raisons.
 */
export type PrivacyKey =
  | 'adsense'
  | 'sponsorships'
  | 'affiliation'
  | 'inKind'
  | 'otherRevenue'
  | 'expenses'
  | 'totals'
  | 'views'
  | 'subscribers'
  | 'company';

export type PrivacyMasks = Record<PrivacyKey, boolean>;

/**
 * Les composantes d'argent.
 *
 * En masquer **une seule** suffit à masquer les totaux : le chiffre d'affaires est la
 * somme des composantes, et l'afficher à côté de celles qui restent visibles rendrait la
 * masquée déductible par soustraction. C'est la règle qui donne son sens à tout le reste,
 * et elle est appliquée par `resolveMasks` plutôt que laissée à l'utilisateur.
 */
export const MONEY_COMPONENT_KEYS: PrivacyKey[] = [
  'adsense',
  'sponsorships',
  'affiliation',
  'inKind',
  'otherRevenue',
  'expenses',
];

export const PRIVACY_LABELS: Record<PrivacyKey, string> = {
  adsense: 'Revenus AdSense',
  sponsorships: 'Montants des sponsos',
  affiliation: "Revenus d'affiliation",
  inKind: 'Valeur des produits reçus',
  otherRevenue: 'Autres revenus',
  expenses: 'Dépenses et abonnements',
  totals: "Chiffre d'affaires et bénéfices",
  views: 'Vues, heures vues et engagement',
  subscribers: 'Abonnés',
  company: 'Identité de la société',
};

export const PRIVACY_HINTS: Record<PrivacyKey, string> = {
  adsense: 'Cartes, graphiques, tableau des vidéos et fiche de la dernière sortie.',
  sponsorships: 'Montants des sponsos, ce qui reste à encaisser et le classement des sponsors.',
  affiliation: 'Revenus de la catégorie Affiliation et gains par plateforme.',
  inKind: 'Valeur des produits reçus, dans les fiches comme dans les classements de marques.',
  otherRevenue: 'Tout revenu qui ne relève d’aucune des trois catégories ci-dessus.',
  expenses: 'Dépenses saisies, échéances à venir et coût des abonnements.',
  totals: 'Les deux montants composés. Forcé dès qu’une composante est masquée.',
  views: 'Vues, heures vues, likes et commentaires — YouTube comme Instagram.',
  subscribers: 'Abonnés gagnés, total d’abonnés et abonnés Instagram.',
  company: 'SIRET, numéro de TVA et adresse sur la fiche société.',
};

export interface PrivacyGroup {
  title: string;
  keys: PrivacyKey[];
}

/** L'ordre des cases dans les réglages : l'argent d'abord, c'est ce qu'on vient masquer. */
export const PRIVACY_GROUPS: PrivacyGroup[] = [
  { title: 'Argent', keys: [...MONEY_COMPONENT_KEYS, 'totals'] },
  { title: 'Audience', keys: ['views', 'subscribers'] },
  { title: 'Entreprise', keys: ['company'] },
];

export const NO_MASKS: PrivacyMasks = {
  adsense: false,
  sponsorships: false,
  affiliation: false,
  inKind: false,
  otherRevenue: false,
  expenses: false,
  totals: false,
  views: false,
  subscribers: false,
  company: false,
};

/** Ce qu'on affiche à la place d'un montant masqué. */
export const MASKED_TEXT = '•••';

/**
 * Ce qui s'applique réellement, à partir de ce qui a été coché.
 *
 * Deux règles, et elles sont la raison d'être de cette fonction :
 * - confidentialité désactivée, plus rien n'est masqué — les cases restent cochées pour
 *   le jour où on la réactive, mais elles ne valent rien tant qu'elle dort ;
 * - une composante masquée entraîne les totaux (voir `MONEY_COMPONENT_KEYS`).
 */
export const resolveMasks = (enabled: boolean, masks: PrivacyMasks): PrivacyMasks => {
  if (!enabled) return NO_MASKS;
  const anyComponent = MONEY_COMPONENT_KEYS.some((key) => masks[key]);
  return { ...masks, totals: masks.totals || anyComponent };
};
