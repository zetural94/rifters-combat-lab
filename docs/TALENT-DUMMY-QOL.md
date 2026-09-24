# Rank-1 talent dummy QoL audit

Scope: every `FEAT_SMOKE_STUBS` talent except Warrior, one at a time on `train_<class>` (two copies of that class vs the Training Dummy). Damage numbers use `resolveAbilityTierDamage` — the same helper a strike uses.

Counts: **54 OK**, **2 issues**, **56 checked**.

Locked preview checks passed (Uppercut 6/8/11 vs 7/9/11, Heavy Swing, Precise Strike, Forceful Push, Flurry 13/18/33 vs 15/20/33, Shield Bash still 3/5/7 and not `useWeapon`).

## Uppercut before / after

Before, the inspect card printed the token: `T1 WD · T2 WD · BREAK 2 · T3 WD · BREAK 5`, and the meta badge was `WD`.

After, with Fighting Gloves active (Brawler STR 1):

- Tier lines: `T1 6 · T2 8 · BREAK 2 · T3 11 · BREAK 5`
- Both kits: `Fighting Gloves 6/8/11 (active) · Quarterstaff 7/9/11`
- Meta badge is the kit name (`Fighting Gloves`), not `WD`
- Attack button: `Uppercut · Fighting Gloves 6/8/11 (active) · Quarterstaff 7/9/11 · R1 (1 AP)`

Shield Bash is unchanged: `3 / 5 / 7` plus Taunt. It is not a WD talent.

## WD talents (resolved)

- **assassin-dirty-trick** — Dual Daggers 4/6/9 · Stiletto 2/5/7
- **assassin-expose-weakness** — Dual Daggers 6/12/18 · Stiletto 2/10/14
- **assassin-flurry-daggers** — Dual Daggers 4/7/18 · Stiletto 2/6/14
- **brawler-flurry-blows** — Fighting Gloves 13/18/33 · Quarterstaff 15/20/33
- **brawler-grapple** — Fighting Gloves 6/8/11 · Quarterstaff 7/9/11
- **brawler-uppercut** — Fighting Gloves 6/8/11 · Quarterstaff 7/9/11
- **fighter-forceful-push** — Heavy Sword 6/13/18 · Longsword + Shield 7/11/15
- **fighter-heavy-swing** — Heavy Sword 7/12/26 · Longsword + Shield 8/10/20
- **fighter-precise-strike** — Heavy Sword 6/10/13 · Longsword + Shield 7/8/10
- **scout-barrage** — Shortbow 7/11/14 · Glaive 8/11/14
- **scout-pin-shot** — Shortbow 6/9/11

## Per talent


### Acolyte

- **OK** `acolyte-bless` — fires Bless; also listed: Bless (Upcast)
- **OK** `acolyte-enfeeble` — flat 0/0/0; fires kit 1 T1 raw 0
- **OK** `acolyte-purge-wicked` — flat 6/10/14; fires kit 1 T1 raw 6
- **OK** `acolyte-summon-archer` — fires Summon · Archer
- **OK** `acolyte-summon-mage` — fires Summon · Mage
- **OK** `acolyte-summon-warrior` — fires Summon · Warrior
- **OK** `acolyte-systems-bargain` — fires System's Bargain
- **OK** `acolyte-toxic-cloud` — flat 4/4/4; fires kit 1 T1 raw 4

### Assassin

- **OK** `assassin-cold-blooded` — passive: coldBlooded, stress, stressMax
- **OK** `assassin-dirty-trick` — fires kit 1 T1 raw 4; fires kit 2 T3 raw 7
- **OK** `assassin-expose-weakness` — fires kit 1 T1 raw 6; fires kit 2 T3 raw 14
- **OK** `assassin-flurry-daggers` — fires kit 1 T1 raw 4; fires kit 2 T3 raw 14
- **OK** `assassin-perfectionist` — passive: perfectionist
- **ISSUE** `assassin-riposte` — Riposte grants hasRiposte, but the lab reaction window only lists Defend / Catch Breath / Interpose. askReactions skips auto-mitigation, so the player cannot fire it.
- **OK** `assassin-shadow-dash` — fires Shadow Dash
- **OK** `assassin-stealth` — fires Stealth

### Brawler

- **OK** `brawler-flurry-blows` — fires kit 1 T1 raw 13; fires kit 2 T3 raw 33
- **OK** `brawler-full-contact` — passive: fullContact
- **OK** `brawler-grapple` — fires kit 1 T1 raw 6; fires kit 2 T3 raw 11
- **OK** `brawler-guard` — fires Guard
- **OK** `brawler-martial-artist` — passive: martialArtist, moveBudget, rushIgnoreLeft, speed; MOVE 2 safe arms after an attack, not on the opening list
- **OK** `brawler-pugilist` — passive: def, pugilist, stability, stabilityBase
- **OK** `brawler-tough` — passive: hp, hpMax, maxHp, recoveries, recoveriesMax
- **OK** `brawler-uppercut` — fires kit 1 T1 raw 6; fires kit 2 T3 raw 11

### Fighter

- **OK** `fighter-courage` — passive: courage, def
- **OK** `fighter-eye-for-an-eye` — reactive: lab offers free OA after an enemy T3 hit
- **OK** `fighter-forceful-push` — fires kit 1 T1 raw 6; fires kit 2 T3 raw 15
- **OK** `fighter-frontliner` — passive: frontliner, hp, hpMax, maxHp
- **OK** `fighter-heavy-swing` — fires kit 1 T1 raw 7; fires kit 2 T3 raw 20
- **OK** `fighter-intimidating-shout` — flat 0/0/0; fires kit 1 T1 raw 0
- **OK** `fighter-precise-strike` — fires kit 1 T1 raw 6; fires kit 2 T3 raw 10
- **OK** `fighter-weaponmaster` — passive: weaponmaster

### Mystic

- **OK** `mystic-blink` — fires Blink; also listed: Blink (Upcast)
- **OK** `mystic-enhance-weapon` — fires Enhance Weapon
- **OK** `mystic-game-knowledge` — passive: gameKnowledge; OOC stub (system rolls / XP) — no combat action
- **OK** `mystic-ice-wall` — fires Ice Wall
- **OK** `mystic-lightning-bolt` — flat 8/12/14; fires kit 1 T1 raw 8
- **OK** `mystic-living-bomb` — flat 0/0/0; fires kit 1 T1 raw 0
- **OK** `mystic-magic-shield` — fires Magic Shield
- **OK** `mystic-shadowplay` — flat 0/0/0; fires kit 1 T1 raw 0

### Primalist

- **OK** `primalist-barkskin` — fires Barkskin; also listed: Barkskin (Upcast)
- **OK** `primalist-entangle` — flat 4/8/10; fires kit 1 T1 raw 4
- **OK** `primalist-feral-invocation` — fires Feral Invocation
- **OK** `primalist-frost-shock` — flat 5/8/10; fires kit 1 T1 raw 5
- **OK** `primalist-healing-water` — fires Healing Water; also listed: Healing Water (Upcast)
- **OK** `primalist-primal-instinct` — passive: def, primalInstinct, stability, stabilityBase
- **OK** `primalist-summon-elemental` — fires Summon · Elemental
- **OK** `primalist-wind-gale` — flat 4/6/8; fires kit 1 T1 raw 4

### Scout

- **OK** `scout-barrage` — fires kit 1 T1 raw 7; fires kit 2 T3 raw 14
- **ISSUE** `scout-hidden-bola` — Hidden Bola grants hasHiddenBola, but the lab reaction window does not offer it (same askReactions skip as Riposte).
- **OK** `scout-hunters-knowledge` — passive: huntersKnowledge
- **OK** `scout-pin-shot` — kit-locked to Shortbow (weaponId shortbow); fires kit 1 T1 raw 6
- **OK** `scout-ranger` — passive: ranger, rangerFreeHelps, scoutingAdv, stress, stressMax
- **OK** `scout-spotter` — fires Spotter · Mark
- **OK** `scout-survival-tactics` — passive: def, recoveries, recoveriesMax, survivalTactics
- **OK** `scout-vigilant` — passive: stability, stabilityBase, vigilant; MOVE 1 safe arms after this hero takes an OA

## Still failing mechanically

- `assassin-riposte`: Riposte grants hasRiposte, but the lab reaction window only lists Defend / Catch Breath / Interpose. askReactions skips auto-mitigation, so the player cannot fire it.
- `scout-hidden-bola`: Hidden Bola grants hasHiddenBola, but the lab reaction window does not offer it (same askReactions skip as Riposte).

## Display notes

- Inspect tier lines and the attack buttons resolve `WD` / `2WD` / `3WD` (including `+stat` and `+bonus`) through `previewTierDamage` → `resolveAbilityTierDamage`. `3WD` used to render as `0` because `"3WD" | 0` is 0.
- Both class kits are listed when the talent is legal on both. A `weaponId` lock (Pin Shot → Shortbow) shows only that kit.
- `breakStat`, status `xStat`, Vulnerable `xStat`, and Push `xStat` on the card now use the hero's stat, matching the strike.
- Full Contact's extra +1 Push is applied when the strike resolves. It is not baked into the weapon card's printed push.
- Picker stub labels still contain the authored shorthand (`WD+STR`, `2WD`). The card text under the label now adds the resolved kit line.
- Zero-damage tiers that only apply a status (Intimidating Shout, Enfeeble) no longer lead with a bare `0`.
