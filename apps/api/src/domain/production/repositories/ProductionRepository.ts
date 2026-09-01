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

  /** Sorties déjà collectées qu'aucune production ne revendique, pour la suggestion. */
  findUnlinkedVideos(limit: number): Array<{
    id: string;
    channelId: string;
    title: string;
    date: IsoDate;
  }>;
}

export interface ProductionStepRepository {
  findAll(includeArchived?: boolean): ProductionStep[];
  findById(id: string): ProductionStep | null;
  create(input: CreateProductionStepInput): ProductionStep;
  update(id: string, input: UpdateProductionStepInput): ProductionStep;
  /** Supprime l'étape et toutes les cases cochées qui la référencent (cascade SQL). */
  delete(id: string): void;
}

export interface ProductionSlotFilter {
  productionIds?: string[];
  range?: { from: IsoDate; to: IsoDate };
  /** `false` = uniquement les créneaux pas encore faits. */
  includeDone?: boolean;
}

export interface ProductionSlotRepository {
  findAll(filter?: ProductionSlotFilter): ProductionSlotView[];
  findById(id: string): ProductionSlot | null;
  create(input: CreateProductionSlotInput): ProductionSlot;
  update(id: string, input: UpdateProductionSlotInput): ProductionSlot;
  delete(id: string): void;
}
