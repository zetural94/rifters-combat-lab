# Combat Lab — engine

Pure ES modules. No `fs`, no Node-only APIs. Same kernel for sandbox + Monte Carlo.

The full rules canon is **not in this repository** (no `RULES-CANON.md` on the Pages tree). Lab behavior that is written down here lives in [../docs/](../docs/): [HELP-AND-MINIONS.md](../docs/HELP-AND-MINIONS.md), [LAB-QA-PASS.md](../docs/LAB-QA-PASS.md). Card numbers come from [../cards/](../cards/) (printed EQ / monster values), not a Mechanika band table.

```
rng.js        → seeded RNG
powerRoll.js  → 2d10 + STAT ± ADV, tiers, crit
grid.js       → Chebyshev distance, flanking
damage.js     → BREAK → DEF (±Defend×2) → Resist/Vulnerable → SHIELD → HP
status.js     → gates, DoT tick helpers
kits.js       → activeKit + Weapon Swap costing
turn.js       → AP refresh, reaction window, rushed attacks
actor.js      → makeHero / makeMob combatants
index.js      → public surface
```

Serve **this repo root** over HTTP. Same instructions as [../ODPAL.md](../ODPAL.md) and [../README.md](../README.md):

```bash
python3 serve.py
```

```bash
npx --yes serve .
```

Open `http://127.0.0.1:8765/` and enter the designer password. GitHub Pages serves an encrypted pack of this folder, not a second tree.
