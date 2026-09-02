import type { DatabaseSync } from 'node:sqlite';

interface SeedObligation {
  id: string;
  label: string;
  dayOfMonth: number | null;
  sortOrder: number;
}

/**
 * Les obligations de départ, à identifiants fixes pour rester reconnaissables entre
 * deux redéploiements. Elles restent renommables, redatables, archivables et
 * supprimables depuis les paramètres — c'est tout l'intérêt de les stocker en lignes.
 *
 * `dayOfMonth: null` = pas d'échéance dans le mois : c'est le mois entier qui fait foi.
 */
const DEFAULTS: SeedObligation[] = [
  {
    id: 'factures-affiliation',
    label: 'Factures manuelles affiliation',
    dayOfMonth: null,
    sortOrder: 1,
  },
  { id: 'declaration-produits', label: 'Déclaration des produits', dayOfMonth: null, sortOrder: 2 },
  { id: 'urssaf', label: 'Déclaration de revenus Urssaf', dayOfMonth: 15, sortOrder: 3 },
  { id: 'des', label: 'Déclaration DES', dayOfMonth: 15, sortOrder: 4 },
];

export const seedLegalObligations = (db: DatabaseSync): void => {
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT INTO legal_obligations
       (id, label, day_of_month, notes, sort_order, is_archived, created_at, updated_at)
     VALUES (?, ?, ?, NULL, ?, 0, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  );

  for (const obligation of DEFAULTS) {
    stmt.run(
      obligation.id,
      obligation.label,
      obligation.dayOfMonth,
      obligation.sortOrder,
      now,
      now,
    );
  }
};
