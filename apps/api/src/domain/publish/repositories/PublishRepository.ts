import type {
  CreateAttemptInput,
  PublishAttempt,
  PublishUpload,
  PublishUploadView,
  UpdateAttemptInput,
} from '../entities/Publish.ts';

export interface PublishRepository {
  listUploads(): PublishUploadView[];
  findUpload(id: string): PublishUpload | null;
  findUploadByToken(token: string): PublishUpload | null;
  createUpload(input: Omit<PublishUpload, 'createdAt'>): PublishUpload;
  deleteUpload(id: string): void;
  findAttempt(id: string): PublishAttempt | null;
  createAttempt(input: CreateAttemptInput): PublishAttempt;
  updateAttempt(id: string, input: UpdateAttemptInput): PublishAttempt;
  /** Au démarrage : ce qui était en cours a été interrompu. */
  failInterrupted(message: string): number;
}
