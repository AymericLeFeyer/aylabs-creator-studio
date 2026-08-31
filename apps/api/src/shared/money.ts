/**
 * Tous les montants circulent et sont stockés en centimes entiers.
 * Les flottants sont interdits en base : 0.1 + 0.2 !== 0.3 fausserait les cumuls annuels.
 */
export type Cents = number;

export const toCents = (amount: number): Cents => Math.round(amount * 100);
export const fromCents = (cents: Cents): number => Math.round(cents) / 100;
