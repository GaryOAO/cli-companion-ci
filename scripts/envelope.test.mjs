import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { open, seal } from './envelope.mjs';
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
test('diagnostics stay confidential and reject tampering and wrong recipients', () => {
  const plaintext = Buffer.from('PRIVATE_SOURCE_CANARY_中文\n::error::private trace');
  const envelope = seal(plaintext, publicKey);
  assert(!envelope.includes('PRIVATE_SOURCE_CANARY'));
  assert.deepEqual(open(envelope, privateKey), plaintext);
  const altered = JSON.parse(envelope);
  const bytes = Buffer.from(altered.data, 'base64'); bytes[0] ^= 1;
  altered.data = bytes.toString('base64');
  assert.throws(() => open(JSON.stringify(altered), privateKey));
  const wrong = generateKeyPairSync('rsa', { modulusLength: 2048 });
  assert.throws(() => open(envelope, wrong.privateKey));
});
test('preflight failure exposes only fixed status and encrypted diagnostics', { skip: process.platform === 'darwin' }, () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'ci-envelope-test-'));
  try {
    const result = spawnSync(process.execPath, ['scripts/run-private.mjs'], { encoding: 'utf8', env: { PATH: process.env.PATH, RUNNER_TEMP: root, SOURCE_DEPLOY_KEY: 'PRIVATE_SOURCE_CANARY', SOURCE_REPOSITORY: 'private/canary', SOURCE_SHA: 'a'.repeat(40), EXPECTED_TARGET: 'darwin-arm64' } });
    assert.equal(result.status, 1);
    assert.equal(result.stderr, '');
    assert.equal(result.stdout, 'Private verification: FAIL (details encrypted)\nEncrypted diagnostics: READY\n');
    const encrypted = readFileSync(path.join(root, 'sealed-diagnostics/diagnostics.enc'), 'utf8');
    assert(!encrypted.includes('PRIVATE_SOURCE_CANARY'));
    assert.equal(JSON.parse(encrypted).version, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
