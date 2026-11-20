import type { PostDraft } from '../../../domain/postDraft/entities/PostDraft.ts';
import type { AutoDmRepository } from '../../../domain/postDraft/repositories/AutoDmRepository.ts';
import type { PostDraftRepository } from '../../../domain/postDraft/repositories/PostDraftRepository.ts';
import { matchesKeywords, renderDmMessage } from '../../../domain/postDraft/services/autoDm.ts';
import type { InstagramAccountRepository } from '../../../domain/instagram/repositories/InstagramRepository.ts';
import { InstagramClient } from '../../../infrastructure/instagram/api/InstagramClient.ts';

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Envoi impossible';

const TICK_MS = 2 * 60_000;
/** Meta n'admet une réponse privée que dans les 7 jours qui suivent le commentaire. */
const REPLY_WINDOW_MS = 7 * 24 * 3_600_000;

/**
 * Commentaire → DM automatique, sur les reels publiés par Production → Verticaux.
 *
 * **Par relevé, pas par webhook** : un webhook demanderait une adresse publique, et le
 * studio n'en a pas (et ne doit pas en avoir). Toutes les 2 minutes, on relit les
 * commentaires des reels dont la règle est active ; chaque commentaire neuf qui contient un
 * mot-clé reçoit une **réponse privée** (`sendPrivateReply`).
 *
 * Garde-fous : un commentaire ne déclenche qu'**une fois** (`comment_id` unique), une
 * personne n'est écrite qu'**une fois par reel**, ses propres commentaires sont ignorés, et
 * rien de ce qui précède l'activation de la règle (`enabledAt`) ne part. Un refus de Meta
 * (permission manquante, fenêtre passée) est **journalisé et jamais retenté** : sans ça, la
 * même erreur reviendrait toutes les 2 minutes.
 */
export class ManageAutoDm {
  private readonly postDrafts: PostDraftRepository;
  private readonly log: AutoDmRepository;
  private readonly accounts: InstagramAccountRepository;
  private running = false;

  constructor(
    postDrafts: PostDraftRepository,
    log: AutoDmRepository,
    accounts: InstagramAccountRepository,
  ) {
    this.postDrafts = postDrafts;
    this.log = log;
    this.accounts = accounts;
  }

  start(): void {
    const tick = () =>
      void this.tick().catch((error) => console.error('[auto-dm] relevé interrompu :', error));
    setInterval(tick, TICK_MS).unref();
  }

  stats(draftId: string) {
    return this.log.stats(draftId);
  }

  /** Le reel Instagram publié d'une publication, avec son compte, s'il est encore dans la fenêtre. */
  private target(draft: PostDraft): { mediaId: string; accountId: string } | null {
    const attempt = draft.attempts.find(
      (entry) => entry.platform === 'instagram' && entry.status === 'published' && entry.externalId,
    );
    if (!attempt?.externalId) return null;
    if (Date.now() - Date.parse(attempt.updatedAt) > REPLY_WINDOW_MS) return null;
    return { mediaId: attempt.externalId, accountId: attempt.targetId };
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (const draft of this.postDrafts.findAll({ archived: false })) {
        const rule = draft.options.instagram.autoDm;
        if (!rule.enabled || !rule.message.trim()) continue;
        const target = this.target(draft);
        if (!target) continue;
        try {
          await this.process(draft, target);
        } catch (error) {
          // Une panne sur un reel (jeton, réseau) ne bloque pas les autres.
          console.warn(
            `[auto-dm] « ${draft.title} » : ${error instanceof Error ? error.message : error}`,
          );
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async process(
    draft: PostDraft,
    target: { mediaId: string; accountId: string },
  ): Promise<void> {
    const rule = draft.options.instagram.autoDm;
    const account = this.accounts.findById(target.accountId);
    if (!account?.accessToken) return;
    const client = new InstagramClient(account.accessToken);
    const since = rule.enabledAt ? Date.parse(rule.enabledAt) : 0;
    const now = Date.now();

    const comments = await client.fetchComments(target.mediaId);
    // Du plus ancien au plus récent : le premier commentaire d'une personne est celui qui répond.
    for (const comment of comments.reverse()) {
      const postedAt = Date.parse(comment.timestamp);
      if (Number.isNaN(postedAt) || postedAt < since || now - postedAt > REPLY_WINDOW_MS) continue;
      if (comment.username && comment.username === account.username) continue;
      if (!matchesKeywords(comment.text, rule.keywords)) continue;

      const key = comment.userId ?? comment.username ?? comment.id;
      if (this.log.hasHandled(draft.id, comment.id, key)) continue;

      // Le DM et la réponse publique sont indépendants : l'un refusé n'empêche pas l'autre.
      let dm: { status: 'sent' | 'failed'; error: string | null };
      try {
        await client.sendPrivateReply(
          account.igUserId,
          comment.id,
          renderDmMessage(rule.message, comment.username),
        );
        dm = { status: 'sent', error: null };
      } catch (error) {
        dm = { status: 'failed', error: errorMessage(error) };
      }

      // Journalisé AVANT la réponse publique : plus rien ne doit pouvoir faire renvoyer ce DM.
      this.log.record({
        draftId: draft.id,
        commentId: comment.id,
        commenterKey: dm.status === 'sent' ? key : `${key}#${comment.id}`,
        commenterUsername: comment.username,
        status: dm.status,
        error: dm.error,
        replyStatus: null,
        replyError: null,
      });

      // La rotation suit le nombre de réponses déjà postées sur ce reel : 1, 2, 3, 1, 2…
      const replies = rule.publicReplies.map((text) => text.trim()).filter(Boolean);
      if (replies.length > 0) {
        const text = replies[this.log.repliesSent(draft.id) % replies.length]!;
        try {
          await client.replyToComment(comment.id, renderDmMessage(text, comment.username));
          this.log.setReply(comment.id, 'sent', null);
        } catch (error) {
          this.log.setReply(comment.id, 'failed', errorMessage(error));
        }
      }
    }
  }
}
