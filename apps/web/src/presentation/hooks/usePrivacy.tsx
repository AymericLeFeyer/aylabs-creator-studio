import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useLocalStorage } from './useLocalStorage.ts';
import {
  MASKED_TEXT,
  NO_MASKS,
  resolveMasks,
  type PrivacyKey,
  type PrivacyMasks,
} from '../../domain/privacy/entities/Privacy.ts';
import { manualCashMasked, maskMoneyParts } from '../../domain/privacy/services/privacy.ts';
import {
  formatHours,
  formatMoney,
  formatMoneyCompact,
  formatNumber,
  formatSigned,
} from '../../shared/format.ts';

/**
 * Deux cibles qui ne sont pas des cases à cocher, parce que l'API n'expose pas de
 * granularité plus fine à ces endroits-là :
 * - `manualCash` est ce que les cumuls agrègent sous `manualCashCents` — affiliation,
 *   sponsos et le reste réunis ;
 * - `cash` est l'encaissé, soit l'AdSense plus le précédent.
 *
 * Chacune est masquée dès qu'une des familles qu'elle agrège l'est : sur une somme, le
 * maillon le plus discret décide.
 */
export type PrivacyTarget = PrivacyKey | 'manualCash' | 'cash';

interface PrivacyState {
  enabled: boolean;
  masks: PrivacyMasks;
}

const DEFAULT_STATE: PrivacyState = { enabled: false, masks: NO_MASKS };

interface PrivacyContextValue {
  /** Le grand interrupteur. Décoché, plus rien n'est masqué. */
  enabled: boolean;
  /** Ce qui a été coché, tel quel — c'est ce que l'écran de réglages affiche. */
  masks: PrivacyMasks;
  /** Ce qui s'applique réellement : les totaux y sont forcés par leurs composantes. */
  effective: PrivacyMasks;
  setEnabled: (value: boolean) => void;
  setMask: (key: PrivacyKey, value: boolean) => void;
  clear: () => void;

  isMasked: (target: PrivacyTarget) => boolean;
  /** Au moins une information est masquée : de quoi prévenir sans énumérer. */
  anyMasked: boolean;

  /** Montant formaté, ou les points de suspension quand il est masqué. */
  money: (cents: number, target: PrivacyTarget) => string;
  moneyCompact: (cents: number, target: PrivacyTarget) => string;
  count: (value: number, target: PrivacyTarget) => string;
  /**
   * Une variation en pourcentage, effacée quand la valeur qu'elle commente est masquée.
   *
   * Elle ne livre aucun montant, mais elle raconte quand même la courbe — et masquer un
   * chiffre en laissant lire « +140 % » n'est pas masquer grand-chose.
   */
  change: (value: number | null, target: PrivacyTarget) => number | null;
  signed: (value: number, target: PrivacyTarget) => string;
  hours: (hours: number, target: PrivacyTarget) => string;

  /**
   * La valeur **numérique** à passer à un graphique : zéro quand elle est masquée.
   *
   * C'est la moitié importante du module. Retirer une barre d'une pile dont le total
   * reste affiché revient à l'annoncer par soustraction ; la poser à zéro ne dit rien.
   */
  amount: (value: number, target: PrivacyTarget) => number;
  /** Les quatre composantes d'argent d'un point de série ou d'un cumul, mises à zéro. */
  parts: <
    T extends {
      adsenseCents: number;
      manualCashCents: number;
      inKindCents: number;
      expenseCents: number;
    },
  >(
    parts: T,
  ) => T;
}

const PrivacyContext = createContext<PrivacyContextValue | null>(null);

/**
 * L'état de confidentialité, partagé par toute l'application.
 *
 * Il passe par un contexte et non par `usePreferences` parce qu'il doit s'appliquer
 * **partout à la fois** : cocher une case dans les réglages doit masquer les montants du
 * dashboard sans recharger la page, et deux `useLocalStorage` montés côte à côte gardent
 * chacun leur état.
 */
/**
 * Tout ce que le contexte expose, construit hors de React.
 *
 * Cette fonction est **pure** — elle ne prend que l'état persisté et son écriture — et
 * c'est délibéré : le compilateur React refuse de mémoïser une valeur dont il ne peut
 * pas suivre les fermetures, et la construire ici lui laisse un simple appel à traiter.
 * Elle est aussi testable sans monter le moindre composant.
 */
const buildPrivacy = (
  stored: PrivacyState,
  setStored: (next: (current: PrivacyState) => PrivacyState) => void,
): PrivacyContextValue => {
  // Un état persisté par une version antérieure peut ignorer une clé ajoutée depuis.
  const masks = { ...NO_MASKS, ...stored.masks };
  const enabled = stored.enabled === true;
  const effective = resolveMasks(enabled, masks);

  const manualCash = manualCashMasked((key) => effective[key]);
  const isMasked = (target: PrivacyTarget): boolean => {
    if (target === 'manualCash') return manualCash;
    if (target === 'cash') return manualCash || effective.adsense;
    return effective[target];
  };

  /** Un formateur qui rend les points de suspension au lieu de la valeur, si elle est masquée. */
  const guard =
    <T,>(format: (value: T) => string) =>
    (value: T, target: PrivacyTarget): string =>
      isMasked(target) ? MASKED_TEXT : format(value);

  return {
    enabled,
    masks,
    effective,
    setEnabled: (next) => setStored((current) => ({ ...current, enabled: next })),
    setMask: (key, next) =>
      setStored((current) => ({
        ...current,
        masks: { ...NO_MASKS, ...current.masks, [key]: next },
      })),
    clear: () => setStored((current) => ({ ...current, masks: NO_MASKS })),

    isMasked,
    anyMasked: enabled && Object.values(effective).some(Boolean),

    change: (value, target) => (isMasked(target) ? null : value),

    money: guard(formatMoney),
    moneyCompact: guard(formatMoneyCompact),
    count: guard(formatNumber),
    signed: guard(formatSigned),
    hours: guard(formatHours),

    amount: (value, target) => (isMasked(target) ? 0 : value),
    parts: (parts) => maskMoneyParts(parts, (key) => effective[key]),
  };
};

/**
 * L'état de confidentialité, partagé par toute l'application.
 *
 * Il passe par un contexte et non par `usePreferences` parce qu'il doit s'appliquer
 * **partout à la fois** : cocher une case dans les réglages doit masquer les montants du
 * dashboard sans recharger la page, et deux `useLocalStorage` montés côte à côte gardent
 * chacun leur état.
 */
export const PrivacyProvider = ({ children }: { children: ReactNode }) => {
  const [stored, setStored] = useLocalStorage<PrivacyState>('acs.privacy', DEFAULT_STATE);
  const value = useMemo(() => buildPrivacy(stored, setStored), [stored, setStored]);

  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
};

export const usePrivacy = (): PrivacyContextValue => {
  const context = useContext(PrivacyContext);
  if (!context) throw new Error('usePrivacy doit être utilisé dans un PrivacyProvider');
  return context;
};
