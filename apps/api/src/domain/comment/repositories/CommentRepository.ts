import type { DateRange } from '../../metrics/repositories/MetricsRepository.ts';
import type {
  CommentCounts,
  CommentStatus,
  CommentView,
  UpsertCommentInput,
} from '../entities/Comment.ts';

export interface CommentFilter {
  /** Vide ou absent = tous les statuts, file de tri comprise. */
  statuses?: CommentStatus[];
  /** Vide ou absent = toutes les chaînes. */
  channelIds?: string[];
  range?: DateRange;
  /** Recherche libre sur le texte et le nom de l'auteur. */
  search?: string;
  limit?: number;
}

export interface CommentRepository {
  findAll(filter?: CommentFilter): CommentView[];
  findById(id: string): CommentView | null;
  /**
   * Insère ce qui manque et rafraîchit le reste. **Ne touche jamais au statut** :
   * c'est la seule garantie qu'un commentaire écarté le reste, alors que la collecte
   * le redescend à chaque passage. Renvoie le nombre de lignes réellement créées.
   */
  upsertMany(comments: UpsertCommentInput[]): number;
  /** `true` si ce commentaire est déjà archivé : ce qui permet à la collecte de s'arrêter tôt. */
  isKnown(channelId: string, externalId: string): boolean;
  setStatus(id: string, status: CommentStatus): CommentView;
  countByStatus(channelIds?: string[]): CommentCounts;
  /**
   * Rattache les commentaires orphelins aux vidéos désormais collectées.
   * Renvoie le nombre de rattachements posés.
   */
  linkVideos(channelId: string): number;
}
