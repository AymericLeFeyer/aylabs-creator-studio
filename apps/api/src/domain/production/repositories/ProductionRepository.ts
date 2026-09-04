import type { IsoDate } from '../../../shared/dates.ts';
import type {
  CreateProductionInput,
  Production,
  ProductionStatus,
  ProductionView,
  UpdateProductionInput,
} from '../entities/Production.ts';
import type {
  CreateProductionSlotInput,
  ProductionSlot,
  ProductionSlotView,
  SlotOrigin,
  UpdateProductionSlotInput,
} from '../entities/ProductionSlot.ts';
import type {
  CreateProductionStepInput,
  ProductionStep,
  UpdateProductionStepInput,
} from '../entities/ProductionStep.ts';

export interface ProductionFilter {
  /** Vide ou absent = tous les statuts. */
  statuses?: ProductionStatus[];
  channelIds?: string[];
  /** Fenêtre sur `plannedDate`, pour le planning. Ignore les productions sans date. */
  range?: { from: IsoDate; to: IsoDate };
  search?: string;
}

export interface ProductionRepository {
  findAll(filter?: ProductionFilter): ProductionView[];
  findById(id: string): Production | null;
  findViewById(id: string): ProductionView | null;
  create(input: CreateProductionInput): Production;
  update(id: string, input: UpdateProductionInput): Production;
  delete(id: string): void;
  /** Réécrit l'ordre de la file d'attente d'un coup, dans l'ordre des identifiants reçus. */
  reorder(ids: string[]): void;

  /** Coche une étape (idempotent : recocher ne change pas la date de complétion). */
  checkStep(productionId: string, stepId: string): void;
  uncheckStep(productionId: string, stepId: string): void;
}

export interface ProductionStepRepository {
  findAll(includeArchived?: boolean): ProductionStep[];
  findById(id: string): ProductionStep | null;
  create(input: CreateProductionStepInput): ProductionStep;
  update(id: string, input: UpdateProductionStepInput): ProductionStep;
  /** Réécrit l'ordre complet : le rang est la position dans le tableau reçu. */
  reorder(ids: string[]): void;
  /** Supprime l'étape et toutes les cases cochées qui la référencent (cascade SQL). */
  delete(id: string): void;
}

export interface ProductionSlotFilter {
  productionIds?: string[];
  range?: { from: IsoDate; to: IsoDate };
  /** `false` = uniquement les créneaux pas encore faits. */
  includeDone?: boolean;
  /** Vide ou absent = les deux origines. */
  origins?: SlotOrigin[];
}

export interface ProductionSlotRepository {
  findAll(filter?: ProductionSlotFilter): ProductionSlotView[];
  findById(id: string): ProductionSlot | null;
  create(input: CreateProductionSlotInput): ProductionSlot;
  update(id: string, input: UpdateProductionSlotInput): ProductionSlot;
  delete(id: string): void;
  /**
   * Efface les suggestions déplaçables d'une fenêtre, préalable de tout replan.
   * `from` à `null` remonte jusqu'au début : un replan complet balaie aussi les
   * suggestions passées jamais approuvées, qui n'ont rien raconté.
   */
  clearSuggestions(from: IsoDate | null, to: IsoDate): number;
}
