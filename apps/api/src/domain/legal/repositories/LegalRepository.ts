import type { Company, UpdateCompanyInput } from '../entities/Company.ts';
import type {
  CreateLegalObligationInput,
  LegalCheck,
  LegalObligation,
  UpdateLegalObligationInput,
} from '../entities/LegalObligation.ts';

export interface CompanyRepository {
  /** Toujours une ligne : la table est créée avec `default` par la migration. */
  get(): Company;
  update(input: UpdateCompanyInput): Company;
}

export interface LegalObligationRepository {
  findAll(includeArchived?: boolean): LegalObligation[];
  findById(id: string): LegalObligation | null;
  create(input: CreateLegalObligationInput): LegalObligation;
  update(id: string, input: UpdateLegalObligationInput): LegalObligation;
  /** Supprime l'obligation ; les cases cochées partent en cascade. */
  delete(id: string): void;

  /** Toutes les cases cochées, ou seulement celles d'un mois donné. */
  findChecks(month?: string): LegalCheck[];
  /** Idempotent : recocher ne repousse pas la date de réalisation. */
  check(obligationId: string, month: string): void;
  uncheck(obligationId: string, month: string): void;
}
