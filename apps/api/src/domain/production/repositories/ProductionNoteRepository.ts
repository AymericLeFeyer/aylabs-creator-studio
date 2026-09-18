import type {
  CreateProductionNoteInput,
  ProductionNote,
  UpdateProductionNoteInput,
} from '../entities/ProductionNote.ts';

export interface ProductionNoteRepository {
  /**
   * Les notes d'une vidéo, **dans l'ordre de création**. Pas au dernier modifié : la
   * liste bougerait sous le curseur à chaque enregistrement automatique. 404 si la vidéo
   * n'existe pas.
   */
  findByProduction(productionId: string): ProductionNote[];
  create(productionId: string, input: CreateProductionNoteInput): ProductionNote;
  /** 404 si la note n'appartient pas à cette vidéo. */
  update(productionId: string, id: string, input: UpdateProductionNoteInput): ProductionNote;
  delete(productionId: string, id: string): void;
}
