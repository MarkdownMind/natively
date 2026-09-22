// Guard: Codex CLI must never become a `private_vision` destination.
//
// Settings > AI Providers > Privacy promises, for "Keep screenshots on this
// device": "Use a local vision model (Ollama) only. Cloud vision is never
// called."
//
// VisionProviderFallbackChain implements private_vision as a single predicate
// (VisionProviderFallbackChain.ts:222):
//     if (params.mode === 'private_vision' && !provider.isLocal) -> skip
//
// Codex CLI sends image requests to chatgpt.com/backend-api/codex/responses. It
// is therefore a cloud-backed vision provider even though the executable is
// installed locally. The registry must keep that distinction explicit.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const dist = (p) => path.join(__dirname, '../../../dist-electron/electron', p);

const electronPath = require.resolve('electron');
require.cache[electronPath] = {
  id: electronPath, filename: electronPath, loaded: true,
  exports: {
    app: { isReady: () => true, getPath: () => os.tmpdir(), getVersion: () => '0.0.0-test' },
    safeStorage: { isEncryptionAvailable: () => false },
  },
};

const { isLocalVisionProvider } = require(dist('llm/visionPolicy.js'));

describe('Codex is never treated as an on-device vision provider', () => {
  test('visionPolicy does not count Codex as local', () => {
    assert.equal(isLocalVisionProvider('codex'), false);
    assert.equal(isLocalVisionProvider('codex-cli'), false);
    assert.equal(isLocalVisionProvider('codex_cli'), false);
    // The control: the one provider that genuinely is on-device.
    assert.equal(isLocalVisionProvider('ollama'), true);
  });

  test('the Codex registry entry is not simultaneously vision-capable and marked local', () => {
    const src = require('node:fs').readFileSync(
      path.join(__dirname, '../screen/VisionProviderRegistry.ts'), 'utf8',
    );
    // Isolate the codex() builder's returned config.
    const start = src.indexOf("id: 'codex_cli'");
    assert.ok(start > 0, 'could not locate the codex_cli registry entry — update this guard');
    const entry = src.slice(start, src.indexOf('};', start));

    const marksLocal = /isLocal:\s*true/.test(entry);
    const supportsVision = /supportsVision:\s*true/.test(entry);

    assert.ok(
      !(marksLocal && supportsVision),
      'Codex CLI routes to chatgpt.com. Marking it isLocal:true AND supportsVision:true makes it '
      + 'a private_vision-eligible destination (VisionProviderFallbackChain.ts:222 skips only '
      + '!isLocal), which would send screenshots to the cloud while Settings says "Cloud vision '
      + 'is never called." If you enabled CLI vision, set isLocal:false in the same change.',
    );
  });

  test('the enabled Codex vision entry remains cloud-only and wired', () => {
    const src = require('node:fs').readFileSync(
      path.join(__dirname, '../screen/VisionProviderRegistry.ts'), 'utf8',
    );
    const start = src.indexOf("id: 'codex_cli'");
    assert.ok(start > 0, 'could not locate the codex_cli registry entry — update this guard');
    const entry = src.slice(start, src.indexOf('};', start));
    assert.match(entry, /isLocal:\s*false/, 'Codex images go to chatgpt.com, so the registry must mark it cloud-backed');
    assert.match(entry, /supportsVision:\s*configured/, 'the implemented Responses API image path must be enabled when Codex is available');
    assert.match(entry, /callLLMHelperVision\('codex_cli'/, 'the registry must invoke the implemented Codex image adapter');
  });
});
