# Audit remediation (public repo)

This repository root is the playable source of truth for GitHub Pages (`main` `/`). Adrian's local combat-lab dump still has the older dual tree; that copy is not in this repo and is not what Pages publishes. This repo does not contain `Rifters_*` or `_inbox`.

Password: **not rotated**. Still the designer password already in use. It is not stored in the repo.

Pages URL: https://zetural94.github.io/rifters-combat-lab/

## What changed

- **Pages gate.** `index.html` decrypts `lab.enc` (AES-256-GCM, PBKDF2-SHA256, 120000 iterations) and only then hands sandbox, `engine/*`, `mc/*`, and `cards/*` to a service worker in memory. `sandbox.html` does not import the engine until that session exists. `_config.yml` tells Jekyll not to publish plaintext `engine/`, `cards/`, `mc/`, or `sandbox.html` (`.nojekyll` removed so that exclude applies). `robots.txt` and `noindex` are set. Direct requests for those paths 404 on a Jekyll publish; wrong password stays on the gate.
- **Local server.** `serve.py` is in the repo again. It binds `127.0.0.1`, reflects CORS only for localhost origins (never `*`), caps POST bodies, and writes logs only for loopback clients (or `X-Lab-Token` when `LAB_TOKEN` is set). No `log_kpi` import. `ODPAL.md` matches this and also documents `npx serve`.
- **Cards.** `cards/card.schema.json` covers engine fields `xStat`, `xStatMult`, `breakStat`, `maxTargets`, gate `n`, and status `x`. `scripts/check-card-schema.mjs` walks the schema (required, types, enums, patterns, `oneOf`, `additionalProperties`) instead of a top-level key list. **82 / 82** card files pass. No card bodies were invented.
- **Tests.** `node --test tests/*.test.mjs` — **17** cases (schema, reactPrompt gates, playSummons handoff, puppeteer path, seal). `.github/workflows/test.yml` runs them. Puppeteer UI scripts resolve `puppeteer-core` from `PUPPETEER_CORE`, `PUPPETEER_RUN`, or `os.tmpdir()/puppeteer-run`.
- **Cache bust.** HTML and card fetches use `20260924labqa`.
- **Docs.** README, ODPAL, and `engine/README.md` name this root as the Pages source. The dead `RULES-CANON.md` link in the engine readme (and the sandbox header) now points at `docs/` that actually exist. Soft bands and stairs v0.3g are unchanged. Help stays a lower-d10 reroll.

## Counts from this tree

| Check | Result |
| --- | --- |
| `node --test tests/*.test.mjs` | 17 pass |
| `scripts/check-card-schema.mjs` | 82 pass, 0 fail |
| `scripts/lab-qa-pass.mjs` | 50 OK, 0 fail |
| `scripts/help-and-minions-check.mjs` | exit 0 |
| Sealed files in `lab.enc` | 111 |
| Card schema failures left | 0 |

The earlier “63 tests” figure does not match this repo. `lab-qa-pass.mjs` reports 50 checks. The new unit file is separate. Nothing was padded to 63.

## What remains

- **Public git.** This GitHub repo is public. The Pages share link no longer serves plaintext engine/cards, but `github.com/zetural94/rifters-combat-lab` still has the source. Making the repo private is the remaining step if the rules must stay off GitHub. Not done here.
- **Local `serve.py` / `npx serve`.** They serve the working tree, including plaintext, on the machine that has the clone. Documented. Pages is the encrypted share link.
- **Campaign logs.** Not in this repo. Not deleted.
- **One-shot `_patch_*` / `_fix_*` / `_diag_*` / `.bak`.** None were in this repo.
- **Dual tree on Adrian's disk.** Out of scope. Fix that copy on his machine; do not copy it into Pages.
- **Jekyll publish.** The exclude list is what hides plaintext on Pages. After merge, confirm the Pages build is green and `https://zetural94.github.io/rifters-combat-lab/engine/index.js` is 404.
