import { readFileSync } from 'node:fs';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { MailReplyRequest } from '../../application/mail/usecases/ManageMailDrafts.ts';
import type { Container } from '../../container.ts';
import { clockIn } from '../../shared/dates.ts';
import { badRequest } from '../../shared/errors.ts';
import { asJson, registerTool } from './tooling.ts';

const CARD_URI = 'ui://aylabs-studio/mail-confirm.html';
const CARD_MIME_TYPE = 'text/html;profile=mcp-app';
/** Le jeton passe par `_meta`, que l'hôte remet à la carte sans le montrer au modèle. */
const CONFIRM_TOKEN_META = 'acs/confirmToken';
const CARD_HTML = readFileSync(new URL('./mailConfirmCard.html', import.meta.url), 'utf8');

/** Outils que seule la carte peut appeler : l'hôte ne les propose pas au modèle. */
const CARD_ONLY = { ui: { visibility: ['app'] } };

const replyRequest = (args: {
  action: 'not_interested' | 'interested' | 'rates' | 'follow_up' | 'custom';
  notes?: string;
  text?: string;
}): MailReplyRequest => {
  if (args.action === 'follow_up') return { kind: 'follow_up' };
  if (args.action === 'custom') {
    if (!args.text?.trim()) throw badRequest('`text` est obligatoire avec `custom`.');
    return { kind: 'text', text: args.text };
  }
  return { kind: 'intent', intent: args.action, notes: args.notes };
};

/** Les écritures du MCP : le chronomètre, et la préparation d'une réponse. */
export const registerActionTools = (server: McpServer, container: Container): void => {
  const { timeZone, publicUrl } = container.config;

  /**
   * Le jour et l'heure locaux que le navigateur enverrait. Passer par `stopTimer` et non
   * par `TrackTime` : c'est lui qui pose le créneau et le publie dans l'agenda.
   */
  const stopRunning = async (entryId: string, startedAt: string) => {
    const now = clockIn(timeZone);
    const start = clockIn(timeZone, new Date(startedAt));
    return container.managePlanning.stopTimer(entryId, {
      from: now.date,
      nowDate: now.date,
      nowMinutes: now.minutes,
      startDate: start.date,
      startTime: start.time,
    });
  };

  registerTool(
    server,
    'timer_status',
    {
      description: 'Le chronomètre en cours, `null` s’il n’y en a pas.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    () => asJson({ timer: container.trackTime.running(), now: clockIn(timeZone) }),
  );

  registerTool(
    server,
    'timer_start',
    {
      description:
        'Démarre le chronomètre sur une vidéo (`productions_search` pour trouver son identifiant). Celui qui tournait est arrêté d’abord. Qualifier par `stepId` ou `todoId` quand c’est possible.',
      inputSchema: {
        productionId: z.string(),
        stepId: z.string().optional().describe('L’étape, visible dans `production_get`.'),
        todoId: z.string().optional().describe('La sous-étape, visible dans `production_get`.'),
      },
    },
    async ({ productionId, stepId, todoId }) => {
      const running = container.trackTime.running();
      const stopped = running ? await stopRunning(running.id, running.startedAt) : null;
      const entry = container.trackTime.start(productionId, stepId ?? null, todoId ?? null);
      return asJson({ started: container.trackTime.find(entry.id), stopped: stopped?.entry });
    },
  );

  registerTool(
    server,
    'timer_stop',
    {
      description:
        'Arrête le chronomètre en cours : la session est enregistrée, et son créneau posé dans le planning et l’agenda. `completable` dit ce qui peut être coché dans le studio si le travail est fini.',
      inputSchema: {},
    },
    async () => {
      const running = container.trackTime.running();
      if (!running) return asJson({ stopped: null, message: 'Aucun chronomètre ne tourne.' });
      return asJson(await stopRunning(running.id, running.startedAt));
    },
  );

  server.registerResource(
    'mail-confirm',
    CARD_URI,
    { mimeType: CARD_MIME_TYPE, description: 'Carte de confirmation d’un mail' },
    () => ({ contents: [{ uri: CARD_URI, mimeType: CARD_MIME_TYPE, text: CARD_HTML }] }),
  );

  registerTool(
    server,
    'mail_prepare_reply',
    {
      title: 'Préparer une réponse',
      description: [
        'Prépare une réponse à un fil, sans rien envoyer.',
        'Actions rapides de l’écran : `not_interested`, `interested`, `rates` (mes tarifs), `follow_up` (relance) — rédigées par l’assistant du studio, `notes` pour l’orienter. `custom` : ton propre texte dans `text`, sans signature.',
        'L’envoi demande un clic de l’utilisateur sur la carte affichée, ou dans le studio par le lien rendu : tu ne peux pas envoyer toi-même. Ne dis jamais qu’un mail est parti.',
      ].join(' '),
      inputSchema: {
        threadId: z.string(),
        action: z.enum(['not_interested', 'interested', 'rates', 'follow_up', 'custom']),
        notes: z.string().max(5_000).optional(),
        text: z.string().max(50_000).optional(),
      },
      _meta: { ui: { resourceUri: CARD_URI } },
    },
    async ({ threadId, ...args }) => {
      const { draft, token } = await container.manageMailDrafts.prepare(
        threadId,
        replyRequest(args),
      );
      const link = `${publicUrl ?? ''}/mails?fil=${threadId}&brouillon=${draft.id}`;
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'draft_ready_nothing_sent',
              to: draft.to,
              subject: draft.subject,
              body: draft.body,
              studioLink: link,
              next: 'Montre le brouillon : l’utilisateur l’envoie depuis la carte, ou depuis le lien du studio si aucune carte ne s’affiche.',
            }),
          },
        ],
        structuredContent: { draft, link },
        _meta: { [CONFIRM_TOKEN_META]: token },
      };
    },
  );

  registerTool(
    server,
    'mail_confirm_send',
    {
      description: 'Réservé au bouton Envoyer de la carte de confirmation.',
      inputSchema: { draftId: z.string(), token: z.string(), text: z.string().min(1).max(100_000) },
      _meta: CARD_ONLY,
    },
    async ({ draftId, token, text }) =>
      asJson(await container.manageMailDrafts.confirm(draftId, token, text)),
  );

  registerTool(
    server,
    'mail_cancel_draft',
    {
      description: 'Réservé au bouton Abandonner de la carte de confirmation.',
      inputSchema: { draftId: z.string(), token: z.string() },
      _meta: CARD_ONLY,
    },
    ({ draftId, token }) => {
      container.manageMailDrafts.cancel(draftId, token);
      return asJson({ cancelled: true });
    },
  );
};
