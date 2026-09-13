import type {
  CreateExternalAppInput,
  ExternalApp,
  UpdateExternalAppInput,
} from '../entities/ExternalApp.ts';

export interface ExternalAppRepository {
  /** Ordre du menu : `sort_order`, puis nom. */
  findAll(): ExternalApp[];
  findById(id: string): ExternalApp | null;
  /** Lève 409 pour une seconde app `todo`. */
  create(input: CreateExternalAppInput): ExternalApp;
  update(id: string, input: UpdateExternalAppInput): ExternalApp;
  delete(id: string): void;
}
