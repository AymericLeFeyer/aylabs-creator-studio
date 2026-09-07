import type { DatabaseSync } from 'node:sqlite';
import { isFreshDatabase } from '../../../infrastructure/db/database.ts';

/**
 * Un référentiel ne se sème qu'une fois : **à la création de la base, et plus jamais.**
 *
 * Le filet de la table vide reste, et il sert ici plus que partout ailleurs : ces deux
 * tables naissent vides sur une base déjà remplie (migration 24), et livrer les menus
 * « Gabarits » et « Angles de vue » sans une seule entrée les ferait passer pour cassés.
 *
 * Voir `SeedDefaultSteps` pour le raisonnement complet.
 */
const shouldSeed = (db: DatabaseSync, table: string): boolean =>
  isFreshDatabase() ||
  (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n === 0;

/**
 * Les angles de départ, à identifiants fixes pour rester reconnaissables entre deux
 * redéploiements. Renommables, recolorables, archivables — et rien n'empêche d'en
 * ajouter, c'est tout l'intérêt de les stocker en lignes.
 */
const ANGLES = [
  {
    id: 'face-camera',
    label: 'Face caméra',
    description: "On s'adresse directement au spectateur.",
    color: '#3b82f6',
  },
  {
    id: 'plan-large',
    label: 'Plan large',
    description: 'On voit la scène entière, le contexte.',
    color: '#22c55e',
  },
  {
    id: 'plan-serre',
    label: 'Plan serré',
    description: 'Gros plan sur le sujet ou sur le visage.',
    color: '#f59e0b',
  },
  {
    id: 'insert',
    label: 'Insert',
    description: 'Détail filmé à part : les mains, un écran, un objet.',
    color: '#a855f7',
  },
  {
    id: 'b-roll',
    label: 'B-roll',
    description: 'Images d’illustration, texte dit en voix off.',
    color: '#14b8a6',
  },
];

/**
 * Deux gabarits de départ, volontairement **courts et à réécrire**.
 *
 * Ils ne prétendent pas être les bons appels à l'action : ils montrent à quoi sert la
 * fonctionnalité, ce qu'un menu vide ne peut pas faire. Le premier qu'on ouvre, on le
 * réécrit — et c'est exactement l'usage attendu.
 */
const PRESETS = [
  {
    id: 'cta-abonnement',
    label: 'Rappel abonnement',
    description: 'Le rappel de milieu de vidéo.',
    color: '#22c55e',
    content:
      '<p>Si cette vidéo te plaît, un petit abonnement m’aide énormément — et ça te coûte deux secondes.</p>',
  },
  {
    id: 'cta-fin',
    label: 'Appel à l’action de fin',
    description: 'Le bloc de conclusion : prochaine vidéo, liens, remerciements.',
    color: '#3b82f6',
    content:
      '<p>Merci d’avoir regardé jusqu’au bout. Tous les liens sont en description, et on se retrouve très vite pour la suite.</p>',
  },
  {
    id: 'mention-sponso',
    label: 'Mention de partenariat',
    description: 'La mention obligatoire quand la vidéo est sponsorisée.',
    color: '#f59e0b',
    content: '<p>Cette vidéo est réalisée en partenariat avec [marque].</p>',
  },
];

export const seedScriptReferentials = (db: DatabaseSync): void => {
  const now = new Date().toISOString();

  if (shouldSeed(db, 'shot_angles')) {
    const stmt = db.prepare(
      `INSERT INTO shot_angles
         (id, label, description, color, sort_order, is_archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    );
    ANGLES.forEach((angle, index) => {
      stmt.run(angle.id, angle.label, angle.description, angle.color, index + 1, now, now);
    });
  }

  if (shouldSeed(db, 'script_presets')) {
    const stmt = db.prepare(
      `INSERT INTO script_presets
         (id, label, description, content, color, sort_order, is_archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    );
    PRESETS.forEach((preset, index) => {
      stmt.run(
        preset.id,
        preset.label,
        preset.description,
        preset.content,
        preset.color,
        index + 1,
        now,
        now,
      );
    });
  }
};
