import { Router } from 'express';
import type { Container } from '../../container.ts';
import {
  mailAiSchema,
  mailThreadsQuerySchema,
  sendMailSchema,
  updateMailSettingsSchema,
  updateMailThreadSchema,
} from '../validation.ts';
import { param } from '../helpers.ts';

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
    res.json(read === undefined ? mail.thread(id) : await mail.setRead(id, read));
  });

  router.post('/threads/:id/ai', async (req, res) => {
    const text = await container.mailAssistant.run(param(req, 'id'), mailAiSchema.parse(req.body));
    res.json({ text });
  });

  router.post('/threads/:id/video-note', async (req, res) => {
    res.json(await container.mailAssistant.writeVideoNote(param(req, 'id')));
  });

  router.post('/messages/:id/summarize', async (req, res) => {
    res.json({ text: await container.mailAssistant.summarizeMessage(param(req, 'id')) });
  });

  router.post('/send', async (req, res) => {
    const { to, cc, subject, text, threadId } = sendMailSchema.parse(req.body);
    res.json(await mail.send({ to, cc, subject, text, threadId }));
  });

  return router;
};
