import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { buildContainer } from '../src/container.ts';
import { loadConfig } from '../src/config.ts';
import { closeDatabase, getDatabase } from '../src/infrastructure/db/database.ts';

test('Gmail OAuth chiffre les identifiants et utilise les jetons pour IMAP et SMTP', async (t) => {
  const databasePath = ':memory:';
  const config = {
    ...loadConfig(),
    databasePath,
    secretsKey: 'secret-for-gmail-oauth-fixtures',
    mailPassword: null,
  };
  const { manageMail } = buildContainer(config);
  t.after(closeDatabase);
  const credentials = {
    clientId: 'studio-fixture.apps.googleusercontent.com',
    clientSecret: 'client-secret-fixture',
    refreshToken: 'refresh-token-fixture',
  };
  let revoked = false;
  let refreshes = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://oauth2.googleapis.com/token');
    assert.equal(options.method, 'POST');
    assert.deepEqual(Object.fromEntries(options.body), {
      grant_type: 'refresh_token',
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: credentials.refreshToken,
    });
    refreshes += 1;
    if (revoked) {
      return Response.json(
        { error: 'invalid_grant', error_description: 'Provider detail' },
        { status: 400 },
      );
    }
    return Response.json({ access_token: 'access-token-fixture' });
  });

  let imap;
  t.mock.method(ImapFlow.prototype, 'connect', async function () {
    imap = this.options;
  });
  t.mock.method(ImapFlow.prototype, 'list', async () => []);
  t.mock.method(ImapFlow.prototype, 'logout', async () => {});
  t.mock.method(ImapFlow.prototype, 'getMailboxLock', async () => ({ release() {} }));
  t.mock.method(ImapFlow.prototype, 'search', async () => []);
  let smtp;
  const sendMail = t.mock.fn(async () => {});
  t.mock.method(nodemailer, 'createTransport', (options) => {
    smtp = options;
    return { sendMail, close() {} };
  });

  const username = 'creator@example.test';
  const original = manageMail.update({
    username,
    imapHost: 'imap.example.test',
    smtpHost: 'smtp.example.test',
    password: 'legacy-mail-fixture',
  });
  assert.equal(original.authMode, 'password');
  assert.equal(original.configured, true);
  await manageMail.test();
  assert.equal(imap.auth.pass, 'legacy-mail-fixture');
  assert.equal(refreshes, 0);

  const view = manageMail.update({ authMode: 'gmail_oauth', gmailOAuth: credentials });
  assert.equal(view.configured, true);
  assert.equal(view.gmailOAuthSource, 'app');
  const row = getDatabase(databasePath)
    .prepare('SELECT gmail_oauth FROM mail_settings WHERE id = ?')
    .get('default');
  for (const secret of Object.values(credentials)) {
    assert.ok(!JSON.stringify(view).includes(secret));
    assert.ok(!row.gmail_oauth.includes(secret));
  }

  // Les mises à jour des hôtes ne peuvent détourner un jeton Gmail.
  manageMail.update({
    imapHost: 'imap.example.test',
    smtpHost: 'smtp.example.test',
    allowSelfSigned: true,
  });
  assert.deepEqual(await manageMail.test(), { folders: ['INBOX (réception)'] });
  assert.deepEqual(imap.auth, { user: username, accessToken: 'access-token-fixture' });
  assert.equal(imap.host, 'imap.gmail.com');
  assert.equal(imap.secure, true);
  assert.equal(imap.tls, undefined);
  assert.equal(sendMail.mock.callCount(), 0);
  await manageMail.send({
    to: [{ address: 'recipient@example.test', name: 'Test' }],
    cc: [],
    subject: 'Test',
    text: 'Message fictif',
    threadId: null,
    from: null,
  });
  assert.equal(smtp.host, 'smtp.gmail.com');
  assert.equal(smtp.secure, true);
  assert.equal(smtp.tls, undefined);
  assert.deepEqual(smtp.auth, {
    type: 'OAuth2',
    user: username,
    accessToken: 'access-token-fixture',
  });
  assert.equal(sendMail.mock.callCount(), 1);
  assert.equal(refreshes, 3);

  revoked = true;
  await assert.rejects(manageMail.test(), /Autorisation Gmail expirée ou révoquée/);
  manageMail.update({ authMode: 'password' });
  await manageMail.test();
  assert.equal(imap.auth.pass, 'legacy-mail-fixture');
  assert.equal(refreshes, 4);
});
