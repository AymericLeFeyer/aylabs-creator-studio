import type { DatabaseSync } from 'node:sqlite';
import { isFreshDatabase } from '../../../infrastructure/db/database.ts';

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

/**
 * Un référentiel ne se sème qu'une fois : **à la création de la base, et plus jamais.**
 *
 * Le seed tournait à chaque démarrage en n'insérant que ce qui manquait
 * (`ON CONFLICT DO NOTHING`), ce qui ressuscitait tout ce qu'on avait supprimé au
 * redéploiement suivant. Le raisonnement d'origine — « c'est l'archivage qui retire
 * durablement » — se défendait sur le papier, mais en pratique il rendait la suppression
 * inopérante : il fallait tout re-supprimer après chaque mise à jour.
 *
 * La condition est **la base neuve**, pas la table vide : la migration 2 insère la
 * catégorie « impots » avant que le moindre seed n'ait tourné, et se fier au décompte
 * sauterait alors le seed des catégories — AdSense comprise, qui est structurelle. La
 * table vide reste un filet en second : sans aucune ligne, l'écran correspondant se lit
 * comme une panne, et repartir des valeurs de départ vaut mieux qu'une page blanche.
 *
 * Le prix assumé : un futur défaut ajouté au code n'apparaîtra pas sur une base déjà
 * remplie. C'est le bon sens de l'échange — passé la première ouverture, le référentiel
 * appartient à celui qui l'utilise, pas à celui qui l'a livré.
 */
const shouldSeed = (db: DatabaseSync, table: string): boolean =>
  isFreshDatabase() ||
  (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n === 0;

export const seedLegalObligations = (db: DatabaseSync): void => {
  if (!shouldSeed(db, 'legal_obligations')) return;

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
