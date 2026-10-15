# CLI Companion CI

Public macOS test orchestration for the private CLI Companion project. This repository contains no application source, private tests, credentials, or plaintext diagnostic artifacts.

Only the owner can dispatch the workflows on `main`. Public runner availability is checked independently before private tests are enabled. macOS ARM64 and Intel are checked separately.

GitHub-hosted runners are trusted with any source fetched during a test. Keeping a repository private does not hide that source from GitHub infrastructure.
