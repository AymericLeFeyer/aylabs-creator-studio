import assert from 'node:assert/strict';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { ManageAi } from '../src/application/ai/usecases/ManageAi.ts';
import { loadConfig } from '../src/config.ts';
import { buildContainer } from '../src/container.ts';
import { SqliteAiSettingsRepository } from '../src/infrastructure/ai/repositories/SqliteAiSettingsRepository.ts';
import { closeDatabase, getDatabase } from '../src/infrastructure/db/database.ts';
import { runMigrations } from '../src/infrastructure/db/migrations.ts';
import { SecretBox } from '../src/infrastructure/integration/secrets/SecretBox.ts';
import { createServer } from '../src/presentation/server.ts';

const secretsKey = 'test-key-for-local-fixtures-only';
const claudeKey = 'anthropic-test-key';
const openAiKey = 'openai-test-key';

test('la migration préserve les identifiants, le modèle et les crédits Anthropic', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`
      CREATE TABLE ai_settings (
        id TEXT PRIMARY KEY, api_key TEXT, model TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        credit_balance_cents INTEGER, credit_set_at TEXT,
        credit_spent_micros INTEGER NOT NULL DEFAULT 0, credit_exhausted_at TEXT
      );
      CREATE TABLE mail_settings (id TEXT PRIMARY KEY);
      PRAGMA user_version = 68;
    `);
    const cipher = new SecretBox(secretsKey);
    // La clé héritée du module mail se déchiffre sous son ancien contexte.
    db.prepare(
      `INSERT INTO ai_settings (id, api_key, model, created_at, updated_at,
                                credit_balance_cents, credit_spent_micros)
       VALUES ('default', ?, 'claude-sonnet-5', datetime('now'), datetime('now'), 1000, 20000)`,
    ).run(cipher.encrypt(claudeKey, 'mail:aiKey'));
    assert.equal(runMigrations(db), false);
    const settings = new SqliteAiSettingsRepository(db);
    const ai = new ManageAi(settings, cipher, { anthropic: null, openai: null });
    assert.deepEqual(ai.credentials(), {
      provider: 'anthropic',
      apiKey: claudeKey,
      model: 'claude-sonnet-5',
    });
    assert.equal(ai.view().credit.remainingCents, 998);
    const gpt = ai.update({
      defaultProvider: 'openai',
      provider: 'openai',
      apiKey: openAiKey,
      creditBalance: 20,
    });
    assert.equal(gpt.providers[1].credit.remainingCents, 2000);
    assert.equal(cipher.decrypt(settings.get('openai').encryptedApiKey, 'ai:openaiKey'), openAiKey);
    assert.equal(ai.update({ defaultProvider: 'anthropic' }).credit.remainingCents, 998);
    ai.update({ provider: 'openai', model: 'gpt-6-luna' });
    assert.equal(ai.view().defaultProvider, 'anthropic');
    const luna = ai.update({ defaultProvider: 'openai' });
    assert.equal(luna.providers[1].model, 'gpt-6-luna');

    const managed = new ManageAi(settings, cipher, { anthropic: null, openai: 'key-from-env' });
    assert.equal(managed.view().providers[1].keySource, 'env');
    assert.throws(() => managed.update({ provider: 'openai', apiKey: null }), { status: 409 });
    assert.equal(managed.credentials().apiKey, 'key-from-env');
  } finally {
    db.close();
  }
});

test('les routes de production et de mails utilisent le fournisseur actif', async (t) => {
  const config = {
    ...loadConfig(),
    databasePath: ':memory:',
    secretsKey,
    anthropicApiKey: null,
    openaiAssistantApiKey: null,
    openaiApiKey: 'thumbnail-only-test-key',
    todoBaseUrl: null,
    todoApiKey: null,
  };
  const container = buildContainer(config);
  const db = getDatabase(config.databasePath);
  const server = createServer(container).listen(0, '127.0.0.1');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    closeDatabase();
  });
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const fetchLocal = globalThis.fetch;
  const request = async (method, path, body, expected = 200) => {
    const response = await fetchLocal(base + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(5_000),
    });
    const json = await response.json();
    assert.equal(response.status, expected, JSON.stringify(json));
    return json;
  };

  let nextResponse;
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const endpoint = new URL(url);
    const payload = JSON.parse(options.body);
    if (endpoint.origin === 'https://api.anthropic.com' && endpoint.pathname === '/v1/messages') {
      assert.equal(new Headers(options.headers).get('authorization'), `Bearer ${claudeKey}`);
      return Response.json({
        model: payload.model,
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Réponse Claude' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });
    }
    assert.equal(String(url), 'https://api.openai.com/v1/responses');
    assert.equal(new Headers(options.headers).get('authorization'), `Bearer ${openAiKey}`);
    assert.equal(payload.model, 'gpt-6.1-sol');
    assert.equal(payload.store, false);
    assert.equal(payload.tools, undefined);
    assert.ok(payload.instructions && payload.input);
    calls++;
    if (nextResponse) {
      const response = nextResponse;
      nextResponse = undefined;
      return response;
    }
    const format = payload.text?.format;
    if (format) {
      assert.equal(format.type, 'json_schema');
      assert.equal(format.strict, true);
    }
    const fields = format?.schema.properties;
    let text = '<p>Réponse de test.</p>';
    if (fields?.titles) text = JSON.stringify({ titles: ['Premier', 'Deuxième', 'Troisième'] });
    if (fields?.tags) text = JSON.stringify({ tags: ['studio'], hashtags: ['création'] });
    if (fields?.deadlines) {
      text = JSON.stringify({
        summary: 'Un brouillon est attendu.',
        urgent: false,
        deadlines: [
          {
            title: 'Envoyer le brouillon',
            dueDate: '2026-11-20',
            urgent: false,
            startDate: null,
            duration: null,
            quote: 'Merci pour un brouillon avant le 20 novembre.',
          },
        ],
        incoherences: [],
      });
    }
    return Response.json({
      status: 'completed',
      model: 'gpt-6.1-sol-2026-11-01',
      output: [
        { type: 'reasoning' },
        { type: 'message', content: [{ type: 'output_text', text }] },
      ],
      usage: {
        input_tokens: 20000,
        output_tokens: 3000,
        input_tokens_details: { cached_tokens: 1000 },
      },
    });
  });

  const settings = '/api/ai/settings';
  assert.equal((await request('GET', settings)).defaultProvider, 'anthropic');
  const enabled = await request('PATCH', settings, {
    defaultProvider: 'openai',
    provider: 'openai',
    apiKey: openAiKey,
    creditBalance: 10,
  });
  assert.equal(enabled.providers[1].keySource, 'app');
  assert.ok(!JSON.stringify(enabled).includes(openAiKey));
  const production = await request(
    'POST',
    '/api/productions',
    { title: 'Vidéo test', script: '<p>Script initial</p>' },
    201,
  );
  const ai = `/api/productions/${production.id}/ai`;
  assert.match((await request('POST', ai + '/script', { prompt: 'Réécris' })).html, /Réponse/);
  assert.equal((await request('POST', ai + '/titles', {})).titles.length, 3);
  assert.equal((await request('POST', ai + '/tags', {})).hashtags.length, 1);
  assert.match((await request('POST', ai + '/description', {})).description, /Réponse/);
  assert.equal(
    (await request('GET', '/api/productions/' + production.id)).script,
    '<p>Script initial</p>',
  );

  db.prepare(
    `INSERT INTO mail_threads (id, production_id, created_at, updated_at)
              VALUES ('thread', ?, '2026-11-15', '2026-11-15')`,
  ).run(production.id);
  db.exec(`
    INSERT INTO mail_messages (id, folder, uid, message_id, thread_id, from_address,
                               subject, date, text_body, created_at)
      VALUES ('mail', 'INBOX', 1, '<test@example.test>', 'thread', 'brand@example.test',
        'Essai', '2026-11-15T09:00:00Z', 'Merci pour un brouillon avant le 20 novembre.', '2026-11-15');
  `);
  await request('POST', '/api/mails/messages/mail/summarize', {});
  const mail = '/api/mails/threads/thread';
  for (const body of [
    { action: 'summarize' },
    { action: 'follow_up' },
    { action: 'draft', intent: 'interested' },
    { action: 'translate', text: 'Merci', language: 'anglais' },
    { action: 'refine', text: 'Merci', instruction: 'Ajoute une formule de politesse' },
  ]) {
    assert.match((await request('POST', mail + '/ai', body)).text, /Réponse/);
  }
  const dates = await request('POST', mail + '/check-dates?today=2026-11-15', {});
  assert.equal(dates.tasks[0].dueDate, '2026-11-20');
  await request('POST', mail + '/video-note', {});
  const draft = await container.manageMailDrafts.prepare('thread', { kind: 'follow_up' });
  assert.match(draft.draft.body, /Réponse/);
  assert.equal(calls, 13);
  assert.equal((await request('GET', settings)).credit.spentCents, 89);

  nextResponse = Response.json({
    status: 'incomplete',
    model: 'gpt-6.1-sol',
    output: [],
    incomplete_details: { reason: 'max_output_tokens' },
  });
  assert.match((await request('POST', ai + '/titles', {}, 502)).error, /coupée/);
  nextResponse = Response.json({
    status: 'completed',
    model: 'gpt-6.1-sol',
    output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'Refus' }] }],
  });
  assert.match((await request('POST', ai + '/titles', {}, 502)).error, /refusé/);

  await request('PATCH', settings, {
    defaultProvider: 'anthropic',
    provider: 'anthropic',
    apiKey: claudeKey,
  });
  assert.equal((await request('POST', ai + '/description', {})).description, 'Réponse Claude');
  assert.equal((await request('GET', settings)).credit.spentCents, 1);

  // Un fournisseur par tâche : les titres partent chez OpenAI, la description reste chez Claude.
  const routed = await request('PATCH', settings, { routes: { titles: 'openai' } });
  assert.equal(routed.tasks.find((task) => task.task === 'titles').effectiveProvider, 'openai');
  assert.equal(routed.tasks.find((task) => task.task === 'tags').provider, null);
  assert.equal((await request('POST', ai + '/titles', {})).titles.length, 3);
  assert.equal((await request('POST', ai + '/description', {})).description, 'Réponse Claude');
  const cleared = await request('PATCH', settings, { routes: { titles: null } });
  assert.equal(cleared.tasks.find((task) => task.task === 'titles').provider, null);
});

test('un choix par tâche exige une clé, et retombe sur le défaut si elle disparaît', () => {
  const db = new DatabaseSync(':memory:');
  try {
    runMigrations(db);
    const cipher = new SecretBox(secretsKey);
    const ai = new ManageAi(new SqliteAiSettingsRepository(db), cipher, {
      anthropic: null,
      openai: null,
    });
    ai.update({ provider: 'anthropic', apiKey: claudeKey });
    assert.throws(() => ai.update({ routes: { titles: 'openai' } }), { status: 400 });
    ai.update({ provider: 'openai', apiKey: openAiKey });
    ai.update({ routes: { titles: 'openai' } });
    assert.equal(ai.credentials('titles').provider, 'openai');
    assert.equal(ai.credentials('tags').provider, 'anthropic');
    // La clé d'OpenAI part : la tâche retombe sur Claude au lieu de se couper.
    ai.update({ provider: 'openai', apiKey: null });
    assert.equal(ai.credentials('titles').provider, 'anthropic');
    assert.equal(ai.view().tasks.find((task) => task.task === 'titles').provider, 'openai');
  } finally {
    db.close();
  }
});

test('la clé OpenAI des miniatures sert aussi à l’assistant, et la dépense réelle se lit avec la clé admin', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    runMigrations(db);
    const cipher = new SecretBox(secretsKey);
    const today = new Date().toISOString().slice(0, 10);
    const requested = [];
    const costs = {
      dailyCostsMicros: async (adminKey, since) => {
        requested.push([adminKey, since.toISOString().slice(0, 10)]);
        return [{ day: today, micros: 3_500_000 }];
      },
    };
    const ai = new ManageAi(
      new SqliteAiSettingsRepository(db),
      cipher,
      { anthropic: null, openai: null },
      { sharedOpenAiKey: () => 'thumbnail-key', costs },
    );
    const openai = () => ai.view().providers.find((entry) => entry.provider === 'openai');
    assert.equal(openai().keySource, 'shared');
    assert.equal(
      ai.update({ provider: 'openai', model: 'gpt-6-luna' }) && ai.credentials('script').apiKey,
      'thumbnail-key',
    );
    // La propre clé de l'assistant l'emporte sur celle des miniatures.
    ai.update({ provider: 'openai', apiKey: openAiKey });
    assert.equal(openai().keySource, 'app');
    assert.equal(ai.credentials('script').apiKey, openAiKey);

    assert.equal((await ai.spend()).available, false);
    ai.update({ provider: 'openai', adminKey: 'admin-key', creditBalance: 20 });
    assert.equal(openai().adminKeySource, 'app');
    assert.ok(!JSON.stringify(ai.view()).includes('admin-key'));
    const spend = await ai.spend();
    assert.equal(spend.monthCents, 350);
    assert.equal(spend.sinceNoteCents, 350);
    assert.equal(spend.remainingCents, 1650);
    assert.deepEqual(requested[0][0], 'admin-key');
    // Gardée en mémoire : pas de second appel à OpenAI.
    await ai.spend();
    assert.equal(requested.length, 1);
  } finally {
    db.close();
  }
});

test('un fournisseur désactivé ne répond plus nulle part, mais garde ses réglages', () => {
  const db = new DatabaseSync(':memory:');
  try {
    runMigrations(db);
    const cipher = new SecretBox(secretsKey);
    const settings = new SqliteAiSettingsRepository(db);
    const ai = new ManageAi(settings, cipher, { anthropic: null, openai: null });
    ai.update({ provider: 'anthropic', apiKey: claudeKey });
    ai.update({ provider: 'openai', apiKey: openAiKey });
    ai.update({ routes: { titles: 'openai' } });
    assert.equal(ai.credentials('titles').provider, 'openai');

    // OpenAI désactivé : sa tâche retombe sur Claude, la clé reste en base, les miniatures s'arrêtent.
    const off = ai.update({ provider: 'openai', enabled: false });
    assert.equal(off.providers[1].enabled, false);
    assert.equal(off.providers[1].configured, true);
    assert.equal(ai.credentials('titles').provider, 'anthropic');
    assert.equal(ai.openAiEnabled(), false);
    assert.equal(off.tasks.find((task) => task.task === 'thumbnails').effectiveProvider, null);
    assert.throws(() => ai.update({ routes: { tags: 'openai' } }), { status: 400 });
    assert.throws(() => ai.update({ defaultProvider: 'openai' }), { status: 400 });
    assert.throws(() => ai.update({ routes: { thumbnails: 'anthropic' } }), { status: 400 });

    // Désactiver le fournisseur par défaut passe le défaut à l'autre.
    ai.update({ provider: 'openai', enabled: true });
    ai.update({ defaultProvider: 'openai' });
    assert.equal(ai.update({ provider: 'openai', enabled: false }).defaultProvider, 'anthropic');

    // Tout désactivé : plus aucune IA, et l'écran le sait.
    const none = ai.update({ provider: 'anthropic', enabled: false });
    assert.equal(none.configured, false);
    assert.throws(() => ai.credentials('script'), { status: 400 });
    // Réactiver rend tout tel quel : la clé n'a jamais bougé.
    assert.equal(ai.update({ provider: 'anthropic', enabled: true }).configured, true);
    assert.equal(ai.credentials('script').apiKey, claudeKey);
  } finally {
    db.close();
  }
});
