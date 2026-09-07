import type {
  CreateScriptPresetInput,
  ScriptPreset,
  UpdateScriptPresetInput,
} from '../entities/ScriptPreset.ts';
import type {
  CreateProductionShotAngleInput,
  CreateShotAngleInput,
  ProductionShotAngle,
  ShotAngle,
  ShotAngleItem,
  UpdateProductionShotAngleInput,
  UpdateShotAngleInput,
} from '../entities/ShotAngle.ts';

export interface ScriptPresetRepository {
  findAll(includeArchived?: boolean): ScriptPreset[];
  findById(id: string): ScriptPreset | null;
  create(input: CreateScriptPresetInput): ScriptPreset;
  update(id: string, input: UpdateScriptPresetInput): ScriptPreset;
  /** Réécrit l'ordre complet : le rang est la position dans le tableau reçu. */
  reorder(ids: string[]): void;
  delete(id: string): void;
}

/**
 * Un seul dépôt pour les deux origines, comme `SqliteTodoRepository`.
 *
 * Les séparer obligerait l'appelant à assembler lui-même la liste à plat, et deux
 * assemblages finiraient par trier différemment — or c'est cet ordre qui décide de la
 * position d'un angle dans le menu de l'éditeur.
 */
export interface ShotAngleRepository {
  findGlobal(includeArchived?: boolean): ShotAngle[];
  findGlobalById(id: string): ShotAngle | null;
  createGlobal(input: CreateShotAngleInput): ShotAngle;
  updateGlobal(id: string, input: UpdateShotAngleInput): ShotAngle;
  reorderGlobal(ids: string[]): void;
  deleteGlobal(id: string): void;

  findForProduction(productionId: string): ProductionShotAngle[];
  createForProduction(input: CreateProductionShotAngleInput): ProductionShotAngle;
  updateForProduction(id: string, input: UpdateProductionShotAngleInput): ProductionShotAngle;
  deleteForProduction(id: string): void;

  /**
   * Ce que l'éditeur propose : le référentiel actif puis les angles de la vidéo.
   *
   * `productionId` absent — le script d'une sponso sans production rattachée — ne rend
   * que le référentiel : il n'y a alors aucune fiche à laquelle rattacher un angle
   * ponctuel.
   */
  listItems(productionId?: string): ShotAngleItem[];
}
