export interface AutoDmLogEntry {
  draftId: string;
  commentId: string;
  /** Identifiant (sinon pseudo) du commentateur : une seule réponse par personne et par reel. */
  commenterKey: string;
  commenterUsername: string | null;
  status: 'sent' | 'failed';
  error: string | null;
  /** `null` : aucune réponse publique tentée. */
  replyStatus: 'sent' | 'failed' | null;
  replyError: string | null;
}

export interface AutoDmStats {
  sent: number;
  failed: number;
  /** Réponses publiques postées / refusées. */
  replied: number;
  replyFailed: number;
  lastError: string | null;
}

export interface AutoDmRepository {
  /** Ce commentaire, ou cette personne sur ce reel, a-t-il déjà reçu une réponse (ou un refus) ? */
  hasHandled(draftId: string, commentId: string, commenterKey: string): boolean;
  record(entry: AutoDmLogEntry): void;
  /** Combien de réponses publiques ce reel a déjà reçues : le rang de la prochaine dans la rotation. */
  repliesSent(draftId: string): number;
  stats(draftId: string): AutoDmStats;
}
