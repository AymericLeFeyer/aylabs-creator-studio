import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchesKeywords, renderDmMessage } from '../src/domain/postDraft/services/autoDm.ts';

test('sans mot-clé, tout commentaire déclenche', () => {
  assert.equal(matchesKeywords('super vidéo', ''), true);
});

test('les mots-clés ignorent casse et accents', () => {
  assert.equal(matchesKeywords('Je veux le LIEN !', 'lien, guide'), true);
  assert.equal(matchesKeywords('le guidé', 'guide'), true);
  assert.equal(matchesKeywords('bravo', 'lien, guide'), false);
});

test('le message remplace {prenom}', () => {
  assert.equal(renderDmMessage('Salut {prenom} !', 'jane'), 'Salut jane !');
  assert.equal(renderDmMessage('Salut {prenom} !', null), 'Salut !');
});
