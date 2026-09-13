import type {
  CreateExternalAppInput,
  ExternalApp,
  ExternalAppView,
  UpdateExternalAppInput,
} from '../../../domain/externalApp/entities/ExternalApp.ts';
import type { ExternalAppRepository } from '../../../domain/externalApp/repositories/ExternalAppRepository.ts';
import { badRequest } from '../../../shared/errors.ts';

/**
 * Les applications externes du menu.
 *
 * Presque un CRUD, à une règle près — et c'est elle qui justifie le use case : **l'adresse
 * d'une app Todo retombe sur celle de sa connexion** quand elle n'en porte pas. Le repli
 * est résolu ici, une fois, plutôt que dans l'écran : le menu, la page iframe et les
 * réglages lisent tous `frameUrl` et ne peuvent pas diverger.
 */
export class ManageExternalApps {
  private readonly repo: ExternalAppRepository;
  private readonly todoBaseUrl: () => string | null;

  constructor(repo: ExternalAppRepository, todoBaseUrl: () => string | null) {
    this.repo = repo;
    this.todoBaseUrl = todoBaseUrl;
  }

  list(): ExternalAppView[] {
    const todo = this.todoBaseUrl();
    return this.repo.findAll().map((app) => this.toView(app, todo));
  }

  create(input: CreateExternalAppInput): ExternalAppView {
    return this.toView(this.repo.create(input), this.todoBaseUrl());
  }

  update(id: string, input: UpdateExternalAppInput): ExternalAppView {
    const existing = this.repo.findById(id);
    // Vider l'adresse d'une app `link` la rendrait impossible à ouvrir.
    if (existing?.kind === 'link' && input.url === null) {
      throw badRequest('L’adresse est obligatoire pour cette application.');
    }
    return this.toView(this.repo.update(id, input), this.todoBaseUrl());
  }

  delete(id: string): void {
    this.repo.delete(id);
  }

  private toView(app: ExternalApp, todoBaseUrl: string | null): ExternalAppView {
    return { ...app, frameUrl: app.url ?? (app.kind === 'todo' ? todoBaseUrl : null) };
  }
}
