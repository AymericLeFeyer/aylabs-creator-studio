import {
  ADSENSE_CATEGORY_ID,
  AFFILIATE_CATEGORY_ID,
  SPONSOR_CATEGORY_ID,
  type CategoryNature,
} from '../../category/entities/Category.ts';
import type { PrivacyKey } from '../entities/Privacy.ts';

/**
 * La clé de confidentialité qui couvre un revenu.
 *
 * Elle se déduit de l'identifiant **fixe** de la catégorie, jamais de son libellé :
 * renommer « Sponsors » en « Partenariats » est permis et ne doit pas démasquer les
 * montants. Une catégorie créée à la main tombe dans `otherRevenue` si elle est en cash,
 * et dans `inKind` si elle valorise des produits reçus — c'est la nature qui tranche,
 * parce que c'est elle qui décide déjà de tout le reste du calcul.
 */
export const revenueMaskKey = (categoryId: string, nature: CategoryNature): PrivacyKey => {
  if (categoryId === ADSENSE_CATEGORY_ID) return 'adsense';
  if (categoryId === AFFILIATE_CATEGORY_ID) return 'affiliation';
  if (categoryId === SPONSOR_CATEGORY_ID) return 'sponsorships';
  if (nature === 'in_kind') return 'inKind';
  return 'otherRevenue';
};

/**
 * Les composantes d'argent d'un point de série ou d'un cumul, mises à zéro là où elles
 * sont masquées.
 *
 * **Zéro et non `null`** : c'est ce qui permet aux graphiques de continuer à empiler, et
 * surtout ce qui empêche de deviner. Une barre absente au milieu d'une pile dont le total
 * est connu se lit aussi bien qu'une barre affichée.
 *
 * `manualCashCents` réunit l'affiliation, les sponsos et le reste : il n'existe pas de
 * granularité plus fine dans les cumuls de l'API, et il suffit donc qu'**une** des trois
 * soit masquée pour que la somme le soit.
 */
export interface MaskableMoney {
  adsenseCents: number;
  manualCashCents: number;
  inKindCents: number;
  expenseCents: number;
}

export const maskMoneyParts = <T extends MaskableMoney>(
  parts: T,
  isMasked: (key: PrivacyKey) => boolean,
): T => ({
  ...parts,
  adsenseCents: isMasked('adsense') ? 0 : parts.adsenseCents,
  manualCashCents: manualCashMasked(isMasked) ? 0 : parts.manualCashCents,
  inKindCents: isMasked('inKind') ? 0 : parts.inKindCents,
  expenseCents: isMasked('expenses') ? 0 : parts.expenseCents,
});

/** Le cash saisi à la main est masqué dès qu'une des trois familles qu'il agrège l'est. */
export const manualCashMasked = (isMasked: (key: PrivacyKey) => boolean): boolean =>
  isMasked('affiliation') || isMasked('sponsorships') || isMasked('otherRevenue');
