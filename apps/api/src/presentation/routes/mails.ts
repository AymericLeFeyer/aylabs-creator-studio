import { Router } from 'express';
import type { Container } from '../../container.ts';
import {
  mailAiSchema,
  mailThreadsQuerySchema,
  moveMailThreadSchema,
  sendMailSchema,
  todayQuerySchema,
  updateMailSettingsSchema,
  updateMailThreadSchema,
} from '../validation.ts';
import { param } from '../helpers.ts';
import { todayIn } from '../../shared/dates.ts';

/**
 * La boîte mail. Les réglages ne laissent jamais sortir un secret (`passwordSource`,
 * `aiKeySource`), et **`POST /send` est le seul chemin d'envoi** du studio : il exige
 * `confirm: true`, que seul le bouton de confirmation de l'écran pose.
 */
export const mailsRouter = (container: Container): Router => {
  const router = Router();
  const mail = container.manageMail;

  router.get('/settings', (_req, res) => {
    res.json(mail.view());
  });

  router.patch('/settings', (req, res) => {
    res.json(mail.update(updateMailSettingsSchema.parse(req.body)));
  });

  router.post('/settings/test', async (_req, res) => {
    res.json(await mail.test());
  });

  // Lus en direct sur le serveur : les dossiers se créent dans Proton, pas ici.
  router.get('/folders', async (_req, res) => {
    res.json(await mail.folders());
  });

  router.get('/attachments/:id', async (req, res) => {
    const attachment = await mail.attachment(param(req, 'id'));
    res.setHeader('Content-Type', attachment.contentType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
    );
    // Le contenu ne change jamais : une fois téléchargée, la pièce est servie du cache.
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(attachment.data);
  });

  router.get('/addresses', (_req, res) => {
    res.json(mail.addressCandidates());
  });

  router.get('/stats', (_req, res) => {
    res.json(mail.stats());
  });

  router.post('/sync', async (_req, res) => {
    const result = await mail.sync();
    res.json({ ...result, stats: mail.stats() });
  });

  router.get('/threads', (req, res) => {
    res.json(mail.listThreads(mailThreadsQuerySchema.parse(req.query)));
  });

  router.get('/threads/:id', (req, res) => {
    res.json(mail.thread(param(req, 'id')));
  });

  router.patch('/threads/:id', async (req, res) => {
    const id = param(req, 'id');
    const { read, ...links } = updateMailThreadSchema.parse(req.body);
    if (links.brandId !== undefined || links.productionId !== undefined) mail.link(id, links);
    // Rattacher à une vidéo y fait naître la note des pièces jointes déjà reçues.
    if (links.productionId) await container.mailVideoNotes.refresh(id);
    res.json(read === undefined ? mail.thread(id) : await mail.setRead(id, read));
  });

  router.post('/threads/:id/move', async (req, res) => {
    res.json(await mail.move(param(req, 'id'), moveMailThreadSchema.parse(req.body).folder));
  });

  router.post('/threads/:id/ai', async (req, res) => {
    const text = await container.mailAssistant.run(param(req, 'id'), mailAiSchema.parse(req.body));
    res.json({ text });
  });

  // Le jour **local** du navigateur : l'API tourne en UTC, et « mercredi » se lit depuis lui.
  router.post('/threads/:id/check-dates', async (req, res) => {
    const today = todayQuerySchema.parse(req.query).today ?? todayIn(container.config.timeZone);
    res.json(await container.mailAssistant.checkDates(param(req, 'id'), today));
  });

  router.post('/threads/:id/video-note', async (req, res) => {
    res.json(await container.mailAssistant.writeVideoNote(param(req, 'id')));
  });

  router.post('/messages/:id/summarize', async (req, res) => {
    res.json({ text: await container.mailAssistant.summarizeMessage(param(req, 'id')) });
  });

  router.post('/send', async (req, res) => {
    const { to, cc, subject, text, threadId, from, draftId } = sendMailSchema.parse(req.body);
    const sent = await mail.send({ to, cc, subject, text, threadId, from: from ?? null });
    if (draftId) container.manageMailDrafts.discard(draftId);
    res.json(sent);
  });

  // Ce que le lien du MCP ouvre : le brouillon repris dans le composeur de l'écran.
  router.get('/drafts/:id', (req, res) => {
    res.json(container.manageMailDrafts.find(param(req, 'id')));
  });

  router.delete('/drafts/:id', (req, res) => {
    container.manageMailDrafts.discard(param(req, 'id'));
    res.status(204).end();
  });

  return router;
};
