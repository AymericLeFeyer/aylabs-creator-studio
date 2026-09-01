/** Contrat de `/api/production-steps`. */

export interface ProductionStep {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductionStepInput {
  name: string;
  color?: string;
  sortOrder?: number;
  isArchived?: boolean;
}
