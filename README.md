# Rifters Combat Lab (designer)

This repository **root** is the playable source of truth for GitHub Pages. Pages builds from `main` `/`. There is no second tree here: no `Rifters_*` dump and no `_inbox`.

Soft bands (locked): Easy 0–4 · Medium 0–6 · Hard 4–10. Soft/BP stairs stay at v0.3g. Help stays a reroll of the lower d10.

## Pages share link

https://zetural94.github.io/rifters-combat-lab/

The password decrypts one sealed pack (`lab.enc`: sandbox, `engine/*`, `mc/*`, `cards/*`). It is shared privately — not written in this README — and was **not rotated**.

GitHub Pages runs Jekyll (`_config.yml`) and does **not** publish plaintext `engine/`, `cards/`, `mc/`, or `sandbox.html`. Those paths 404 on the share link until the password unlocks the pack in the browser.

The GitHub repository itself is public, so the same source is still readable on github.com. Encryption protects the Pages share link, not a clone of this repo.

## Run locally

From this folder (the repo root):

```bash
python3 serve.py
```

That prints `http://127.0.0.1:8765/`. Without the log API:

```bash
npx --yes serve . -l 8765
```

Open that URL and enter the password. Do not open `sandbox.html` as a file.

`serve.py` binds `127.0.0.1`, allows CORS only for localhost, and caps POST bodies. Log writes (`/api/sandbox-log`, `/api/playtest`) are accepted from loopback only. A LAN bind (`HOST=0.0.0.0`) refuses those writes unless `LAB_TOKEN` is set and sent as `X-Lab-Token`. See `ODPAL.md`.

A local server still has the plaintext files on disk. That is expected for play and tests. It is not how the public Pages URL is published.

## Tests

```bash
node --test tests/*.test.mjs
```
