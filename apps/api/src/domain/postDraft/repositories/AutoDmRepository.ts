export interface AutoDmLogEntry {
  draftId: string;
  commentId: string;
  /** Identifiant (sinon pseudo) du commentateur : une seule réponse par personne et par reel. */
  commenterKey: string;
  commenterUsername: string | null;
  status: 'sent' | 'failed';
  error: string | null;
}

export interface AutoDmStats {
  sent: number;
  failed: number;
  lastError: string | null;
}

export interface AutoDmRepository {
  /** Ce commentaire, ou cette personne sur ce reel, a-t-il déjà reçu une réponse (ou un refus) ? */
  hasHandled(draftId: string, commentId: string, commenterKey: string): boolean;
  record(entry: AutoDmLogEntry): void;
  stats(draftId: string): AutoDmStats;
}
