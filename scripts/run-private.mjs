// Never forward child output or exception messages to the public Actions log.
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { seal } from './envelope.mjs';
const EXPECTED_SOURCE_REPOSITORY = 'GaryOAO/cli-companion';
function main() {
const env = { ...process.env };
const desktop = env.PRIVATE_JOB === 'desktop';
delete process.env.SOURCE_DEPLOY_KEY;
let root, source, keyFile, diagnostics;
const logs = [];
let passed = false;
function execute(command, args, options = {}) {
  const child = spawnSync(command, args, { encoding: 'utf8', timeout: 900000, maxBuffer: 32 * 1024 * 1024, ...options });
  logs.push({ stdout: child.stdout ?? '', stderr: child.stderr ?? '', error: String(child.error ?? ''), status: child.status });
  if (child.status !== 0 || child.error) throw new Error('Stage failed');
  return child.stdout.trim();
}
try {
  if (!['darwin', 'win32'].includes(process.platform) || `${process.platform}-${process.arch}` !== env.EXPECTED_TARGET || !/^[a-f0-9]{40}$/.test(env.SOURCE_SHA ?? '') || env.SOURCE_REPOSITORY !== EXPECTED_SOURCE_REPOSITORY) throw new Error();
  if (env.PRIVATE_JOB !== undefined && !['native', 'desktop'].includes(env.PRIVATE_JOB)) throw new Error();
  if (!env.SOURCE_DEPLOY_KEY || !env.RUNNER_TEMP || !path.isAbsolute(env.RUNNER_TEMP)) throw new Error();
  root = mkdtempSync(path.join(env.RUNNER_TEMP, 'private-ci-'));
  chmodSync(root, 0o700);
  source = path.join(root, 'source'); diagnostics = path.join(root, 'diagnostics');
  mkdirSync(source); mkdirSync(diagnostics);
  keyFile = path.join(root, 'fetch-key');
  writeFileSync(keyFile, env.SOURCE_DEPLOY_KEY + '\n', { mode: 0o600 });
  delete env.SOURCE_DEPLOY_KEY;
  // Official GitHub ED25519 host key; never accept a runtime keyscan.
  const known = path.join(root, 'known-hosts');
  writeFileSync(known, 'github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl\n');
  const safeEnv = Object.fromEntries(['PATH', 'HOME', 'USER', 'LOGNAME', 'TMPDIR', 'LANG', 'SystemRoot', 'SYSTEMROOT', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'TEMP', 'TMP', 'COMSPEC', 'PATHEXT'].filter(name => env[name]).map(name => [name, env[name]]));
  const fetchEnv = { ...safeEnv, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_SSH_COMMAND: `ssh -i "${keyFile.replaceAll('\\', '/')}" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile="${known.replaceAll('\\', '/')}" -o HostKeyAlgorithms=ssh-ed25519 -o IdentityAgent=none` };
  execute('git', ['init', '-q', source], { env: fetchEnv });
  // Fetch commit/tree metadata without downloading blobs that are excluded by
  // sparse-checkout. The public runner must never materialize tracked private
  // keys from the source repository.
  const sourceRemote = `git@github.com:${env.SOURCE_REPOSITORY}.git`;
  execute('git', ['-C', source, 'remote', 'add', 'origin', sourceRemote], { env: fetchEnv });
  execute('git', ['-C', source, 'fetch', '--quiet', '--no-tags', '--filter=blob:none', '--depth=1', 'origin', env.SOURCE_SHA], { env: fetchEnv });
  if (execute('git', ['-C', source, 'config', '--get', 'remote.origin.promisor'], { env: safeEnv }) !== 'true' ||
      execute('git', ['-C', source, 'config', '--get', 'remote.origin.partialclonefilter'], { env: safeEnv }) !== 'blob:none') throw new Error();
  execute('git', ['-C', source, 'sparse-checkout', 'init', '--no-cone'], { env: fetchEnv });
  execute('git', ['-C', source, 'sparse-checkout', 'set', '--no-cone', '/*', '!/ci/secrets/', '!/ci/secrets/**'], { env: fetchEnv });
  // Read the tree for excluded paths, then compare their blob IDs with the
  // local object database without invoking a promisor fetch. If any excluded
  // private blob is present locally, abort before checkout and execution.
  const secretTree = execute('git', ['-C', source, 'ls-tree', '-r', '--full-tree', 'FETCH_HEAD', '--', 'ci/secrets'], { env: safeEnv });
  const secretObjects = secretTree.split('\n').map(line => line.trim().split(/\s+/)[2]).filter(value => /^[a-f0-9]{40}$/.test(value));
  const localObjects = new Set(execute('git', ['-C', source, 'cat-file', '--batch-all-objects', '--batch-check'], { env: safeEnv })
    .split('\n').map(line => line.split(' ')[0]).filter(value => /^[a-f0-9]{40}$/.test(value)));
  if (secretObjects.some(value => localObjects.has(value))) throw new Error();
  execute('git', ['-C', source, 'checkout', '--quiet', '--detach', 'FETCH_HEAD'], { env: fetchEnv });
  if (execute('git', ['-C', source, 'rev-parse', 'HEAD'], { env: safeEnv }) !== env.SOURCE_SHA) throw new Error();
  if (existsSync(path.join(source, 'ci', 'secrets')) ||
      existsSync(path.join(source, 'ci', 'secrets', 'source-deploy-key')) ||
      existsSync(path.join(source, 'ci', 'secrets', 'diagnostics-private.pem'))) throw new Error();
  // The private entrypoints do not need Git metadata. Removing it prevents
  // source code from recovering excluded blobs with git cat-file.
  rmSync(path.join(source, '.git'), { recursive: true, force: true });
  rmSync(keyFile, { force: true }); keyFile = undefined;
  rmSync(known, { force: true });
  console.log('Private checkout: PASS');
  const entrypoint = desktop ? 'ci/desktop-tauri.mjs' : `ci/${process.platform === 'darwin' ? 'macos' : 'windows'}-private.mjs`;
  execute(process.execPath, [entrypoint], { cwd: source, env: { ...safeEnv, PRIVATE_DIAGNOSTICS_DIR: diagnostics }, timeout: desktop ? 2700000 : 900000 });
  passed = true;
} catch {
  console.log('Private verification: FAIL (details encrypted)');
} finally {
  if (keyFile) rmSync(keyFile, { force: true });
  try {
    const files = {};
    if (diagnostics && existsSync(diagnostics)) {
      for (const name of readdirSync(diagnostics)) {
        // Fixed diagnostic directory only, no source/binary/archive uploads.
        const file = path.join(diagnostics, name);
        const stat = lstatSync(file);
        if (!stat.isSymbolicLink() && stat.isFile() && /\.(json|log)$/.test(name) && stat.size <= 32 * 1024 * 1024) files[name] = readFileSync(file, 'utf8');
      }
    }
    const publicKey = readFileSync(new URL('../diagnostics-public.pem', import.meta.url));
    const blob = seal(Buffer.from(JSON.stringify({ target: env.EXPECTED_TARGET, sourceSha: env.SOURCE_SHA, passed, logs, files })), publicKey);
    const output = path.join(env.RUNNER_TEMP, 'sealed-diagnostics');
    mkdirSync(output, { recursive: true, mode: 0o700 });
    writeFileSync(path.join(output, 'diagnostics.enc'), blob, { mode: 0o600 });
    console.log('Encrypted diagnostics: READY');
    // A green native run has already extracted, installed and launched the
    // preview archive. Seal that exact archive with the same public key; the
    // public runner never writes plaintext source or binaries.
    if (passed) {
      try {
        const name = `cli-companion-${desktop ? 'desktop' : 'preview'}-${env.EXPECTED_TARGET}.zip`;
        const archive = path.join(diagnostics, 'packages', name);
        if (!existsSync(archive)) throw new Error();
        const stat = lstatSync(archive);
        if (stat.isSymbolicLink() || !stat.isFile() || stat.size < 1 || stat.size > 512 * 1024 * 1024) throw new Error();
        const clientOutput = path.join(env.RUNNER_TEMP, 'sealed-client');
        mkdirSync(clientOutput, { recursive: true, mode: 0o700 });
        writeFileSync(path.join(clientOutput, name + '.enc'), seal(readFileSync(archive), publicKey), { mode: 0o600 });
        console.log('Encrypted client package: READY');
      } catch { passed = false; console.log('Encrypted client package: FAIL'); }
    }
  } catch { passed = false; console.log('Encrypted diagnostics: FAIL'); }
  if (root) rmSync(root, { recursive: true, force: true });
}
if (passed) console.log('Private verification: PASS');
process.exitCode = passed ? 0 : 1;

}
try { main(); } catch { console.log("Private runner: FAIL (output suppressed)"); process.exitCode = 1; }
