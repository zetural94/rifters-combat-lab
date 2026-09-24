# Combat Lab — engine

Pure ES modules. No `fs`, no Node-only APIs. Same kernel for sandbox + Monte Carlo.

Implements [../RULES-CANON.md](../RULES-CANON.md). Card numbers come from [../cards/](../cards/) (printed EQ / monster values), not the Mechanika band table.

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

Serve the repo over HTTP when importing from the browser:

```bash
npx --yes serve .
```
