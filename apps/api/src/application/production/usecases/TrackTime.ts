import type { SqliteTimeEntryRepository } from '../../../infrastructure/production/repositories/SqliteTimeEntryRepository.ts';
import type { TimeEntry, TimeEntryView } from '../../../domain/production/entities/TimeEntry.ts';
import { conflict, notFound } from '../../../shared/errors.ts';

/**
 * Le chronomètre.
 *
 * **Une seule session tourne à la fois.** Démarrer un chronomètre alors qu'un autre
 * court arrête le précédent au lieu de refuser : on ne travaille pas sur deux vidéos en
 * même temps, et un refus obligerait à retrouver soi-même la session oubliée de la
 * veille — qui aurait alors compté douze heures de montage.
 *
 * L'état vit en base (`endedAt IS NULL`) et non dans le navigateur : recharger la page,
 * fermer l'onglet ou reprendre sur une autre machine ne perd rien.
 */
export class TrackTime {
  private readonly entries: SqliteTimeEntryRepository;

  constructor(entries: SqliteTimeEntryRepository) {
    this.entries = entries;
  }

  /** La session en cours, `null` s'il n'y en a pas. */
  running(): TimeEntryView | null {
    return this.entries.findRunning();
  }

  start(productionId: string, stepId: string | null): TimeEntryView {
    const current = this.entries.findRunning();
    if (current) this.stop(current.id);

    const entry = this.entries.create({
      productionId,
      stepId,
      startedAt: new Date().toISOString(),
    });

    return this.entries.findAll({ productionIds: [productionId] }).find((e) => e.id === entry.id)!;
  }

  /**
   * Arrête une session et **fige** sa durée.
   *
   * Une minute au minimum : un démarrage suivi d'un arrêt immédiat (mauvais bouton,
   * mauvaise étape) laisserait sinon une ligne à zéro dans l'historique — la corriger
   * coûte plus cher que de la supprimer, ce que l'écran permet.
   */
  stop(id: string, notes?: string | null): TimeEntry {
    const entry = this.entries.findById(id);
    if (!entry) throw notFound('Session de travail');
    if (entry.endedAt) throw conflict('Cette session est déjà arrêtée.');

    const endedAt = new Date().toISOString();
    const minutes = Math.max(
      1,
      Math.round((Date.parse(endedAt) - Date.parse(entry.startedAt)) / 60_000),
    );

    return this.entries.update(id, {
      endedAt,
      minutes,
      ...(notes !== undefined ? { notes } : {}),
    });
  }

  /**
   * Ajoute une session à la main : « j'ai monté 2 h hier soir ».
   *
   * `endedAt` est déduit de la durée pour que la ligne se lise comme les autres dans
   * l'historique, mais c'est bien `minutes` qui fait foi dans les cumuls.
   */
  addManual(input: {
    productionId: string;
    stepId?: string | null;
    startedAt: string;
    minutes: number;
    notes?: string | null;
  }): TimeEntry {
    const endedAt = new Date(Date.parse(input.startedAt) + input.minutes * 60_000).toISOString();
    return this.entries.create({
      productionId: input.productionId,
      stepId: input.stepId ?? null,
      startedAt: input.startedAt,
      endedAt,
      minutes: input.minutes,
      notes: input.notes ?? null,
    });
  }

  /**
   * Supprime une session.
   *
   * Passe par le use case et non par le dépôt : une approbation de créneau annulée doit
   * retirer le temps qu'elle avait enregistré, et ce chemin-là doit rester le même que
   * celui de l'écran d'historique.
   */
  remove(id: string): void {
    this.entries.delete(id);
  }

  /**
   * Corrige une session existante.
   *
   * Changer la durée recale `endedAt` sur le début : les deux ne doivent jamais se
   * contredire dans l'historique. Une session **en cours** garde son `endedAt` à `null`
   * — on ne corrige pas une durée qui court encore.
   */
  update(
    id: string,
    input: { stepId?: string | null; startedAt?: string; minutes?: number; notes?: string | null },
  ): TimeEntry {
    const existing = this.entries.findById(id);
    if (!existing) throw notFound('Session de travail');

    const startedAt = input.startedAt ?? existing.startedAt;
    const minutes = input.minutes ?? existing.minutes;
    const running = existing.endedAt === null && input.minutes === undefined;

    return this.entries.update(id, {
      ...(input.stepId !== undefined ? { stepId: input.stepId } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      startedAt,
      minutes,
      endedAt:
        running || minutes === null
          ? null
          : new Date(Date.parse(startedAt) + minutes * 60_000).toISOString(),
    });
  }
}
