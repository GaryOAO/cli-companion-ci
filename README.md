# CLI Companion CI

Public macOS test orchestration for the private CLI Companion project. This repository contains no application source, private tests, credentials, or plaintext diagnostic artifacts.

Only the owner can dispatch the workflows on `main`. Public runner availability is checked independently before private tests are enabled. macOS ARM64 and Intel are checked separately.

GitHub-hosted runners are trusted with any source fetched during a test. Keeping a repository private does not hide that source from GitHub infrastructure.

## Private verification

The manually dispatched workflow accepts an exact private commit SHA. It uses a dedicated **read-only deploy key**, not a personal access token. The key and GitHub host key configuration are removed before the private entry point runs. The source is fetched without submodules, Git LFS, recursive actions, or persisted checkout credentials. Only trusted owner dispatches on `main` execute. Fork pull requests never receive credentials. Third-party actions are pinned to full commits.

The public log contains fixed stage outcomes. Private process output and JSON/log diagnostics are encrypted with AES-256-GCM and an RSA-OAEP-SHA256 wrapped random key before upload. Only `sealed-diagnostics/diagnostics.enc` is uploaded, retained for one day. No source, npm packages, caches, plaintext logs, or plaintext reports are uploaded. The decryption key is held outside GitHub and never sent to a runner. Decrypt locally with `node scripts/decrypt.mjs PRIVATE_KEY diagnostics.enc OUTPUT.json`.

Required repository secrets: `SOURCE_REPOSITORY` and `SOURCE_DEPLOY_KEY`. The private source must provide `ci/macos-private.mjs`, with diagnostic JSON/log files in `PRIVATE_DIAGNOSTICS_DIR`. Remove the deploy key from the private repository and delete both public repository secrets after an ad hoc test session. Subsequent sessions need a new key.

Public metadata includes runner architecture, timing, pass/fail, and the requested commit SHA. The runner and trusted workflow maintainers can access fetched source while the job executes. This design reduces accidental public disclosure; it is not a guarantee against a compromised runner, malicious workflow edits, or credential theft.

## Verified run

The [2026-10-15 native verification](https://github.com/GaryOAO/cli-companion-ci/actions/runs/38675576332) passed on both macOS ARM64 and Intel. Detailed reports remain private. After diagnosis, the session deploy key was revoked and both source secrets were removed, with API verification. A future private run requires a newly provisioned read-only key.
