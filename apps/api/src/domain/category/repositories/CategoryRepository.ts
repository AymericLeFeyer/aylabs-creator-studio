import type {
  Category,
  CategoryScope,
  CreateCategoryInput,
  UpdateCategoryInput,
} from '../entities/Category.ts';

export interface CategoryFilter {
  includeArchived?: boolean;
  /** Ne garde que les catégories utilisables de ce côté (`both` passe toujours). */
  scope?: CategoryScope;
}

export interface CategoryRepository {
  findAll(filter?: CategoryFilter): Category[];
  findById(id: string): Category | null;
  create(input: CreateCategoryInput): Category;
  update(id: string, input: UpdateCategoryInput): Category;
  delete(id: string): void;
  /** Nombre d'écritures rattachées, revenus et dépenses confondus. */
  countEntries(categoryId: string): number;
}
