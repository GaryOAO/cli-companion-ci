# CLI Companion CI

Public native test orchestration for the private CLI Companion project. This repository contains no application source, private tests, credentials, or plaintext diagnostic artifacts.

Only the owner can dispatch the workflows on `main`. Public runner availability is checked independently before private tests are enabled. macOS ARM64 and Intel are checked separately.

GitHub-hosted runners execute a sparse, blob-filtered source export. The runner explicitly excludes `ci/secrets/**`, verifies that the excluded paths are absent, removes the `.git` metadata before executing private code, and never promises that a full private checkout is safe. Keeping a repository private does not hide source that is intentionally fetched from GitHub infrastructure.

## Private verification

The manually dispatched workflow accepts an exact private commit SHA. It uses a dedicated **read-only deploy key**, not a personal access token. The key and GitHub host key configuration are removed before the private entry point runs. The source is fetched with `--filter=blob:none` and sparse-checkout rules that exclude `ci/secrets/**`; the runner verifies those paths are absent and removes `.git` before execution. It does not use submodules, Git LFS, recursive actions, or persisted checkout credentials. Only trusted owner dispatches on `main` execute. Fork pull requests never receive credentials. Third-party actions are pinned to full commits.

The public log contains fixed stage outcomes. Private process output and JSON/log diagnostics are encrypted with AES-256-GCM and an RSA-OAEP-SHA256 wrapped random key before upload. Only `sealed-diagnostics/diagnostics.enc` is uploaded, retained for one day. A green run also seals the preview archive it extracted, installed and launched (`cli-companion-preview-<target>.zip`) with the same public key and uploads it as `sealed-client-<target>`, retained for seven days. Only ciphertext is uploaded; no source, npm packages, caches, plaintext logs, reports or binaries are published. The private key is never materialized by the public runner; decryption happens offline with `node scripts/decrypt.mjs PRIVATE_KEY diagnostics.enc OUTPUT.json` for diagnostics, or `node scripts/decrypt.mjs PRIVATE_KEY client.enc client.zip` for a sealed client package.

Required repository secret: `SOURCE_DEPLOY_KEY`. The private source must provide `ci/macos-private.mjs` or `ci/windows-private.mjs` for its platform, with diagnostic JSON/log files in `PRIVATE_DIAGNOSTICS_DIR`. Rotate the read-only deploy key when required; do not treat every run as a session key. The public runner must never execute a full checkout containing tracked private key files.

Public metadata includes runner architecture, timing, pass/fail, and the requested commit SHA. The runner and trusted workflow maintainers can access fetched source while the job executes. This design reduces accidental public disclosure; it is not a guarantee against a compromised runner, malicious workflow edits, or credential theft.

## Verified run

The [2026-10-15 native verification](https://github.com/GaryOAO/cli-companion-ci/actions/runs/38675576332) passed on both macOS ARM64 and Intel. Detailed reports remain private. After diagnosis, the session deploy key was revoked and both source secrets were removed, with API verification. A future private run requires a newly provisioned read-only key.

The private verification matrix also includes Windows x64 for client lifecycle, ACL and installed command checks. These checks do not claim a production kernel guard or process-tree containment.
