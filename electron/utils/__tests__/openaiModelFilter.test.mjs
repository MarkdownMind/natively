// OpenAI's model list is account-scoped, so the app must recognize new GPT
// generations without a release-specific allow-list. This pins the filter's
// broad GPT rule and its audio/realtime exclusions.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const { isOpenAIChatModelId } = await import(
  pathToFileURL(path.join(root, 'dist-electron/electron/utils/modelFetcher.js')).href,
);

describe('isOpenAIChatModelId', () => {
  test('accepts current and future general-purpose GPT generations', () => {
    for (const id of ['gpt-5.6', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-6-astra']) {
      assert.equal(isOpenAIChatModelId(id), true, id);
    }
  });

  test('keeps chat-capable legacy families and excludes audio/realtime o-series ids', () => {
    assert.equal(isOpenAIChatModelId('gpt-4o'), true);
    assert.equal(isOpenAIChatModelId('o4-mini'), true);
    assert.equal(isOpenAIChatModelId('o4-mini-realtime'), false);
    assert.equal(isOpenAIChatModelId('o3-audio'), false);
  });
});
