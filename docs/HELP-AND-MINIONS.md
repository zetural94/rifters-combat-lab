# Help and minions

Lab QA on Rank-1 train setups (class ×2 vs Training Dummy). Warrior is excluded. Clicked in the sandbox UI. Engine checks in `scripts/help-and-minions-check.mjs`.

Counts from the UI pass: **71 Help flows OK**, **131 N/A**, **0 FAIL**. Four minion types played end to end.

## What Help does

Help is call-for-help on a Power Roll. The ally rerolls the **lower d10**. The tier is rebuilt with the same stat, the same advantage/disadvantage, the same crit window, and the same threshold shift. The fighter check kept `advNet` at 0 while the lower die changed (5+5 → 6+5) and the ally's AP went from 3 to 2.

Pay, in order:

1. **Ranger free Help** — Scout talent `ranger`. 2 free Helps per Rift (they carry between fights). 0 AP. Does not spend the reaction slot. UI: `Ranger free · 0 AP`. Observed log: `· Ranger free 0 AP`.
2. **Light Armor free reaction** — 0 AP, once, until the helper's next turn. UI: `free reaction · 0 AP`. Observed on Assassin B.
3. **Otherwise −1 AP** (a reaction). Observed on Fighter, Brawler, Mystic, Acolyte, and Primalist, and on every minion strike below.

`resolveHelp` rejects a dead helper and any monster-economy actor (enemy, or a summon). A summon can **ask** a hero for Help. A summon cannot **be** the helper.

The lab rerolls in the confirm panel, then commits the rerolled declaration. The button reads `Help from {ally} ({cost}, reroll lower d10)`. Flat effects hide that button. The panel says `Flat — no Power Roll. Help does not apply.`

## When Help is offered

Offered on a Power Roll confirm when a living non-summon hero ally can pay (AP ≥ 1, Light Armor free reaction unused, or Ranger free Helps left). That includes kit strikes, talent strikes, Line Up the Strike, and a summon's own Power Roll.

N/A when the action has no Power Roll, or the roll commits with no Help choice:

| Situation | Examples |
| --- | --- |
| Passive / reaction window | Frontliner, Eye for an eye, Weaponmaster, Courage, Riposte, Hidden Bola, Vigilant, Ranger (the talent itself), Game Knowledge, Primal Instinct |
| Click-resolve or target buff | Guard, Stealth, Ice Wall, Enhance Weapon, Magic Shield, Bless, Barkskin, Healing Water, Spotter, System's Bargain |
| Cell move | Shadow Dash, Blink, Feral Invocation. Martial artist MOVE 2 appears only after an attack and is a cell click, not a roll |
| Summon | Summon Warrior / Mage / Archer / Elemental places the token (2 AP + 2 mana) |
| Self buff | Aim (arms the next strike) |
| Roll with no Help choice | Steel Yourself (SHIELD 2 or CLEANSE), Ask a Question, Shove |
| On-turn reaction | Defend, Catch Breath |
| Flat effect | Elemental Shield |

Shove on the columns map often follows with `No legal Push` (no open cell). That dismisses. Help is not part of Shove.

Ranged strikes from melee open the dummy's opportunity-attack window first (`Accept effect`). Help is on the attacker's roll after that window. Undo now steps back out of that window (snapshot taken when it opens).

`+ Aim` duplicates of the same strike were not clicked separately. The primary strike covers the Help confirm. Aim itself is the N/A row.

## Per-ability results

Setup: wizard Rank 1 → party → n=4 → Lab / Dummy → `{Class} ×2 vs Dummy` → Start → hero A → Kit 1, then Weapon Swap for Kit 2. Ally B clicked Help on every offered roll.


### fighter

Train talents: frontliner, eye-for-an-eye, heavy-swing, weaponmaster, precise-strike, courage, intimidating-shout, forceful-push.

| Kit | Ability | Help offered? | Result | What happened |
| --- | --- | --- | --- | --- |
| kit1 | Heavy Sword · Strike · R1 (1 AP) | yes | OK | Help Fighter B: reroll 5+5 → 6+5 · −1 AP |
| kit1 | Heavy Swing · Heavy Sword 7/12/26 (active) · Longsword + Shield 8/10/20 · R1 (2 AP) · 1 stress | yes | OK | Help Fighter B: reroll 5+5 → 6+5 · −1 AP |
| kit1 | Precise Strike · Heavy Sword 6/10/13 (active) · Longsword + Shield 7/8/10 · R1 (2 AP) · 1 stress | yes | OK | Help Fighter B: reroll 5+5 → 6+5 · −1 AP |
| kit1 | Intimidating Shout · self AoE R1–2 (1 AP) · 1 stress | yes | OK | Help Fighter B: reroll 5+5 → 6+5 · −1 AP |
| kit1 | Forceful Push · Heavy Sword 6/13/18 (active) · Longsword + Shield 7/11/15 · R1 (2 AP) · 1 stress | yes | OK | Help Fighter B: reroll 5+5 → 6+5 · −1 AP |
| kit1 | Steel Yourself · 1 AP | no | N/A | roll resolves to SHIELD/CLEANSE with no Help choice |
| kit1 | Line Up the Strike · 1 AP | yes | OK | Help Fighter B (Opening): reroll 5+5 → 6+5 · −1 AP |
| kit1 | Ask a Question · 1 AP | no | N/A | roll commits without a Help choice |
| kit1 | Shove · 1 AP | no | N/A | roll commits without a Help choice |
| kit1 | Defend · Reaction · 1 AP | no | N/A | reaction — not an action Power Roll |
| kit1 | CATCH BREATH · Reaction · 1 AP | no | N/A | reaction — not an action Power Roll |
| kit2 | Longsword · Strike · R1 (1 AP) | yes | OK | Help Fighter B: reroll 5+5 → 6+5 · −1 AP |
| kit2 | Shield · Bash · R1 (1 AP) | yes | OK | Help Fighter B: reroll 5+5 → 6+5 · −1 AP |
| kit2 | Heavy Swing · Heavy Sword 7/12/26 · Longsword + Shield 8/10/20 (active) · R1 (2 AP) · 1 stress | yes | OK | Help Fighter B: reroll 5+5 → 6+5 · −1 AP |
| kit2 | Precise Strike · Heavy Sword 6/10/13 · Longsword + Shield 7/8/10 (active) · R1 (2 AP) · 1 stress | yes | OK | Help Fighter B: reroll 5+5 → 6+5 · −1 AP |
| kit2 | Intimidating Shout · self AoE R1–2 (1 AP) · 1 stress | yes | OK | Help Fighter B: reroll 5+5 → 6+5 · −1 AP |
| kit2 | Forceful Push · Heavy Sword 6/13/18 · Longsword + Shield 7/11/15 (active) · R1 (2 AP) · 1 stress | yes | OK | Help Fighter B: reroll 5+5 → 6+5 · −1 AP |
| kit2 | Steel Yourself · 1 AP | no | N/A | roll resolves to SHIELD/CLEANSE with no Help choice |
| kit2 | Line Up the Strike · 1 AP | yes | OK | Help Fighter B (Opening): reroll 5+5 → 6+5 · −1 AP |
| kit2 | Ask a Question · 1 AP | no | N/A | roll commits without a Help choice |
| kit2 | Shove · 1 AP | no | N/A | roll commits without a Help choice |
| kit2 | Defend · Reaction · 1 AP | no | N/A | reaction — not an action Power Roll |
| kit2 | CATCH BREATH · Reaction · 1 AP | no | N/A | reaction — not an action Power Roll |
| — | Frontliner | no | N/A | no pressable action on the turn (passive or reaction window) |
| — | Eye for an eye | no | N/A | no pressable action on the turn (passive or reaction window) |
| — | Weaponmaster | no | N/A | no pressable action on the turn (passive or reaction window) |
| — | Courage | no | N/A | no pressable action on the turn (passive or reaction window) |

### brawler

Train talents: martial-artist, flurry-blows, uppercut, guard, full-contact, pugilist, tough, grapple.

| Kit | Ability | Help offered? | Result | What happened |
| --- | --- | --- | --- | --- |
| kit1 | Guard · 0 AP · 1 stress | no | N/A | click-resolves or target buff — no Power Roll |
| kit1 | Fighting Gloves · Strike · R1 (1 AP) | yes | OK | Help Brawler B: reroll 5+5 → 6+5 · −1 AP |
| kit1 | Flurry of Blows · Fighting Gloves 13/18/33 (active) · Quarterstaff 15/20/33 · R1 (3 AP) · 1 stress | yes | OK | Help Brawler B: reroll 5+5 → 6+5 · −1 AP |
| kit1 | Uppercut · Fighting Gloves 6/8/11 (active) · Quarterstaff 7/9/11 · R1 (1 AP) | yes | OK | Help Brawler B: reroll 5+5 → 6+5 · −1 AP |
| kit1 | Grapple · Fighting Gloves 6/8/11 (active) · Quarterstaff 7/9/11 · R1 (2 AP) · 1 stress | yes | OK | Help Brawler B: reroll 5+5 → 6+5 · −1 AP |
| kit1 | Steel Yourself · 1 AP | no | N/A | roll resolves to SHIELD/CLEANSE with no Help choice |
| kit1 | Line Up the Strike · 1 AP | yes | OK | Help Brawler B (Opening): reroll 5+5 → 6+5 · −1 AP |
| kit1 | Ask a Question · 1 AP | no | N/A | roll commits without a Help choice |
| kit1 | Shove · 1 AP | no | N/A | roll commits without a Help choice |
| kit1 | Defend · Reaction · 1 AP | no | N/A | reaction — not an action Power Roll |
| kit1 | CATCH BREATH · Reaction · 1 AP | no | N/A | reaction — not an action Power Roll |
| kit2 | Guard · 0 AP · 1 stress | no | N/A | click-resolves or target buff — no Power Roll |
| kit2 | Quarterstaff · Strike · R1 (1 AP) | yes | OK | Help Brawler B: reroll 5+5 → 6+5 · −1 AP |
| kit2 | Flurry of Blows · Fighting Gloves 13/18/33 · Quarterstaff 15/20/33 (active) · R1 (3 AP) · 1 stress | yes | OK | Help Brawler B: reroll 5+5 → 6+5 · −1 AP |
| kit2 | Uppercut · Fighting Gloves 6/8/11 · Quarterstaff 7/9/11 (active) · R1 (1 AP) | yes | OK | Help Brawler B: reroll 5+5 → 6+5 · −1 AP |
| kit2 | Grapple · Fighting Gloves 6/8/11 · Quarterstaff 7/9/11 (active) · R1 (2 AP) · 1 stress | yes | OK | Help Brawler B: reroll 5+5 → 6+5 · −1 AP |
| kit2 | Steel Yourself · 1 AP | no | N/A | roll resolves to SHIELD/CLEANSE with no Help choice |
| kit2 | Line Up the Strike · 1 AP | yes | OK | Help Brawler B (Opening): reroll 5+5 → 6+5 · −1 AP |
| kit2 | Ask a Question · 1 AP | no | N/A | roll commits without a Help choice |
| kit2 | Shove · 1 AP | no | N/A | roll commits without a Help choice |
| kit2 | Defend · Reaction · 1 AP | no | N/A | reaction — not an action Power Roll |
| kit2 | CATCH BREATH · Reaction · 1 AP | no | N/A | reaction — not an action Power Roll |
| — | Martial artist | no | N/A | no pressable action on the turn (passive or reaction window) |
| — | Full Contact | no | N/A | no pressable action on the turn (passive or reaction window) |
| — | Pugilist | no | N/A | no pressable action on the turn (passive or reaction window) |
| — | Tough | no | N/A | no pressable action on the turn (passive or reaction window) |

### assassin

Train talents: perfectionist, cold-blooded, flurry-daggers, dirty-trick, expose-weakness, shadow-dash, stealth, riposte.

| Kit | Ability | Help offered? | Result | What happened |
| --- | --- | --- | --- | --- |
| kit1 | Stealth · 0 AP · 1 stress | no | N/A | click-resolves or target buff — no Power Roll |
| kit1 | Shadow Dash · 1 AP · 1 stress · pick cell | no | N/A | cell move — no Power Roll |
| kit1 | Dual Daggers · Strike · R1 (1 AP) | yes | OK | Help Assassin B: reroll 5+5 → 6+5 · free reaction 0 AP |
| kit1 | Dual Daggers · Twin Strike · R1 (2 AP) | yes | OK | Help Assassin B (Twin half 1): reroll 5+5 → 2+5 · free reaction 0 AP |
| kit1 | Flurry of Daggers · Dual Daggers 4/7/18 (active) · Stiletto 2/6/14 · R4 (2 AP) · 1 stress | yes | OK | Help Assassin B: reroll 5+5 → 6+5 · free reaction 0 AP |
| kit1 | Dirty Trick · Dual Daggers 4/6/9 (active) · Stiletto 2/5/7 · R1 (2 AP) | yes | OK | Help Assassin B: reroll 5+5 → 6+5 · free reaction 0 AP |
| kit1 | Expose Weakness · Dual Daggers 6/12/18 (active) · Stiletto 2/10/14 · R1 (2 AP) · 1 stress | yes | OK | Help Assassin B: reroll 5+5 → 6+5 · free reaction 0 AP |
| kit1 | Steel Yourself · 1 AP | no | N/A | roll resolves to SHIELD/CLEANSE with no Help choice |
| kit1 | Line Up the Strike · 1 AP | yes | OK | Help Assassin B (Opening): reroll 5+5 → 6+5 · free reaction 0 AP |
| kit1 | Ask a Question · 1 AP | no | N/A | roll commits without a Help choice |
| kit1 | Shove · 1 AP | no | N/A | roll commits without a Help choice |
| kit1 | Defend · Reaction · free reaction | no | N/A | reaction — not an action Power Roll |
| kit1 | CATCH BREATH · Reaction · free reaction | no | N/A | reaction — not an action Power Roll |
| kit2 | Stealth · 0 AP · 1 stress | no | N/A | click-resolves or target buff — no Power Roll |
| kit2 | Shadow Dash · 1 AP · 1 stress · pick cell | no | N/A | cell move — no Power Roll |
| kit2 | Stiletto · Strike · R1 (1 AP) | yes | OK | Help Assassin B: reroll 5+5 → 6+5 · free reaction 0 AP |
| kit2 | Flurry of Daggers · Dual Daggers 4/7/18 · Stiletto 2/6/14 (active) · R4 (2 AP) · 1 stress | yes | OK | Help Assassin B: reroll 5+5 → 6+5 · free reaction 0 AP |
| kit2 | Dirty Trick · Dual Daggers 4/6/9 · Stiletto 2/5/7 (active) · R1 (2 AP) | yes | OK | Help Assassin B: reroll 5+5 → 6+5 · free reaction 0 AP |
| kit2 | Expose Weakness · Dual Daggers 6/12/18 · Stiletto 2/10/14 (active) · R1 (2 AP) · 1 stress | yes | OK | Help Assassin B: reroll 5+5 → 6+5 · free reaction 0 AP |
| kit2 | Steel Yourself · 1 AP | no | N/A | roll resolves to SHIELD/CLEANSE with no Help choice |
| kit2 | Line Up the Strike · 1 AP | yes | OK | Help Assassin B (Opening): reroll 5+5 → 6+5 · free reaction 0 AP |
| kit2 | Ask a Question · 1 AP | no | N/A | roll commits without a Help choice |
| kit2 | Shove · 1 AP | no | N/A | roll commits without a Help choice |
| kit2 | Defend · Reaction · free reaction | no | N/A | reaction — not an action Power Roll |
| kit2 | CATCH BREATH · Reaction · free reaction | no | N/A | reaction — not an action Power Roll |
| — | Perfectionist | no | N/A | no pressable action on the turn (passive or reaction window) |
| — | Cold Blooded | no | N/A | no pressable action on the turn (passive or reaction window) |
| — | Riposte | no | N/A | no pressable action on the turn (passive or reaction window) |

### scout

Train talents: vigilant, spotter, hunters-knowledge, ranger, pin-shot, barrage, survival-tactics, hidden-bola.

| Kit | Ability | Help offered? | Result | What happened |
| --- | --- | --- | --- | --- |
| kit1 | Aim (Shortbow) · 0 AP · ADV 1 on next Strike | no | N/A | self buff — Aim arms the next strike, no Power Roll |
| kit1 | Spotter · Mark · 1 AP · 1 stress · pick target | no | N/A | click-resolves or target buff — no Power Roll |
| kit1 | Shortbow · Strike · R8 (1 AP) | yes | OK | Help Scout B: reroll 5+5 → 6+5 · Ranger free 0 AP |
| kit1 | Pin Shot · Shortbow 6/9/11 (active) · R8 (1 AP) · 1 stress | yes | OK | Help Scout B: reroll 5+5 → 6+5 · Ranger free 0 AP |
| kit1 | Barrage · Shortbow 7/11/14 (active) · Glaive 8/11/14 · R8 (3 AP) · 1 stress | yes | OK | Help Scout B: reroll 5+5 → 6+5 · Ranger free 0 AP |
| kit1 | Steel Yourself · 1 AP | no | N/A | roll resolves to SHIELD/CLEANSE with no Help choice |
| kit1 | Line Up the Strike · 1 AP | yes | OK | Help Scout B (Opening): reroll 5+5 → 6+5 · Ranger free 0 AP |
| kit1 | Ask a Question · 1 AP | no | N/A | roll commits without a Help choice |
| kit1 | Shove · 1 AP | no | N/A | roll commits without a Help choice |
| kit1 | Defend · Reaction · free reaction | no | N/A | reaction — not an action Power Roll |
| kit1 | CATCH BREATH · Reaction · free reaction | no | N/A | reaction — not an action Power Roll |
| kit2 | Spotter · Mark · 1 AP · 1 stress · pick target | no | N/A | click-resolves or target buff — no Power Roll |
| kit2 | Glaive · Strike · R2 (1 AP) | yes | OK | Help Scout B: reroll 5+5 → 6+5 · Ranger free 0 AP |
| kit2 | Barrage · Shortbow 7/11/14 · Glaive 8/11/14 (active) · R8 (3 AP) · 1 stress | yes | OK | Help Scout B: reroll 5+5 → 6+5 · Ranger free 0 AP |
| kit2 | Steel Yourself · 1 AP | no | N/A | roll resolves to SHIELD/CLEANSE with no Help choice |
| kit2 | Line Up the Strike · 1 AP | yes | OK | Help Scout B (Opening): reroll 5+5 → 6+5 · Ranger free 0 AP |
| kit2 | Ask a Question · 1 AP | no | N/A | roll commits without a Help choice |
| kit2 | Shove · 1 AP | no | N/A | roll commits without a Help choice |
| kit2 | Defend · Reaction · free reaction | no | N/A | reaction — not an action Power Roll |
| kit2 | CATCH BREATH · Reaction · free reaction | no | N/A | reaction — not an action Power Roll |
| — | Vigilant | no | N/A | no pressable action on the turn (passive or reaction window) |
| — | Hunter's Knowledge | no | N/A | no pressable action on the turn (passive or reaction window) |
| — | Ranger | no | N/A | no pressable action on the turn (passive or reaction window) |
| — | Survival Tactics | no | N/A | no pressable action on the turn (passive or reaction window) |
| — | Hidden Bola | no | N/A | no pressable action on the turn (passive or reaction window) |

### mystic

Train talents: ice-wall, lightning-bolt, magic-shield, blink, enhance-weapon, living-bomb, shadowplay, game-knowledge.

| Kit | Ability | Help offered? | Result | What happened |
| --- | --- | --- | --- | --- |
| kit1 | Ice Wall · 0 AP · 2 mana | no | N/A | click-resolves or target buff — no Power Roll |
| kit1 | Magic Shield · 0 AP · 1 mana · pick target | no | N/A | click-resolves or target buff — no Power Roll |
| kit1 | Enhance Weapon · 1 AP · 1 mana | no | N/A | click-resolves or target buff — no Power Roll |
| kit1 | Blink · 1 AP · 1 mana · pick cell | no | N/A | cell move — no Power Roll |
| kit1 | Blink (Upcast) · 1 AP · 2 mana · pick cell | no | N/A | cell move — no Power Roll |
| kit1 | Pyre Focus · Ember · R5 (1 AP) | yes | OK | Help Mystic B: reroll 5+5 → 6+5 · −1 AP |
| kit1 | Lightning Bolt · R6 (2 AP) | yes | OK | Help Mystic B: reroll 5+5 → 6+5 · −1 AP |
| kit1 | Living Bomb · R5 (2 AP) | yes | OK | Help Mystic B: reroll 5+5 → 6+5 · −1 AP |
| kit1 | Shadowplay · R3 (1 AP) | yes | OK | Help Mystic B: reroll 5+5 → 6+5 · −1 AP |
| kit1 | Steel Yourself · 1 AP | no | N/A | roll resolves to SHIELD/CLEANSE with no Help choice |
| kit1 | Line Up the Strike · 1 AP | yes | OK | Help Mystic B (Opening): reroll 5+5 → 6+5 · −1 AP |
| kit1 | Ask a Question · 1 AP | no | N/A | roll commits without a Help choice |
| kit1 | Shove · 1 AP | no | N/A | roll commits without a Help choice |
| kit1 | Defend · Reaction · 1 AP | no | N/A | reaction — not an action Power Roll |
| kit1 | CATCH BREATH · Reaction · 1 AP | no | N/A | reaction — not an action Power Roll |
| kit2 | Ice Wall · 0 AP · 2 mana | no | N/A | click-resolves or target buff — no Power Roll |
| kit2 | Magic Shield · 0 AP · 1 mana · pick target | no | N/A | click-resolves or target buff — no Power Roll |
| kit2 | Enhance Weapon · 1 AP · 1 mana | no | N/A | click-resolves or target buff — no Power Roll |
| kit2 | Blink · 1 AP · 1 mana · pick cell | no | N/A | cell move — no Power Roll |
| kit2 | Blink (Upcast) · 1 AP · 2 mana · pick cell | no | N/A | cell move — no Power Roll |
| kit2 | Storm Focus · Spark · R5 (1 AP) | yes | OK | Help Mystic B: reroll 5+5 → 6+5 · −1 AP |
| kit2 | Lightning Bolt · R6 (2 AP) | yes | OK | Help Mystic B: reroll 5+5 → 6+5 · −1 AP |
| kit2 | Living Bomb · R5 (2 AP) | yes | OK | Help Mystic B: reroll 5+5 → 6+5 · −1 AP |
| kit2 | Shadowplay · R3 (1 AP) | yes | OK | Help Mystic B: reroll 5+5 → 6+5 · −1 AP |
| kit2 | Steel Yourself · 1 AP | no | N/A | roll resolves to SHIELD/CLEANSE with no Help choice |
| kit2 | Line Up the Strike · 1 AP | yes | OK | Help Mystic B (Opening): reroll 5+5 → 6+5 · −1 AP |
| kit2 | Ask a Question · 1 AP | no | N/A | roll commits without a Help choice |
| kit2 | Shove · 1 AP | no | N/A | roll commits without a Help choice |
| kit2 | Defend · Reaction · 1 AP | no | N/A | reaction — not an action Power Roll |
| kit2 | CATCH BREATH · Reaction · 1 AP | no | N/A | reaction — not an action Power Roll |
| — | Game Knowledge [passive meta] | no | N/A | no pressable action on the turn (passive or reaction window) |

### acolyte

Train talents: systems-bargain, enfeeble, bless, purge-wicked, toxic-cloud, summon-warrior, summon-mage, summon-archer.

| Kit | Ability | Help offered? | Result | What happened |
| --- | --- | --- | --- | --- |
| kit1 | System's Bargain · 2 AP · 2 mana | no | N/A | no Power Roll confirm |
| kit1 | Summon · Warrior · 2 AP · 2 mana | no | N/A | summon — places a token, no Power Roll |
| kit1 | Summon · Mage · 2 AP · 2 mana | no | N/A | summon — places a token, no Power Roll |
| kit1 | Summon · Archer · 2 AP · 2 mana | no | N/A | summon — places a token, no Power Roll |
| kit1 | Bless · 0 AP · 1 mana · pick target | no | N/A | click-resolves or target buff — no Power Roll |
| kit1 | Bless (Upcast) · 0 AP · 2 mana · pick target | no | N/A | click-resolves or target buff — no Power Roll |
| kit1 | Acolyte Symbol · Strike · R5 (1 AP) | yes | OK | Help Acolyte B: reroll 5+5 → 6+5 · −1 AP |
| kit1 | Enfeeble · R4 (1 AP) | yes | OK | Help Acolyte B: reroll 5+5 → 6+5 · −1 AP |
| kit1 | Purge the Wicked · R4 (2 AP) | yes | OK | Help Acolyte B: reroll 5+5 → 6+5 · −1 AP |
| kit1 | Toxic Cloud · R3 (2 AP) | yes | OK | Help Acolyte B: reroll 5+5 → 6+5 · −1 AP |
| kit1 | Steel Yourself · 1 AP | no | N/A | roll resolves to SHIELD/CLEANSE with no Help choice |
| kit1 | Line Up the Strike · 1 AP | yes | OK | Help Acolyte B (Opening): reroll 5+5 → 6+5 · −1 AP |
| kit1 | Ask a Question · 1 AP | no | N/A | roll commits without a Help choice |
| kit1 | Shove · 1 AP | no | N/A | roll commits without a Help choice |
| kit1 | Defend · Reaction · 1 AP | no | N/A | reaction — not an action Power Roll |
| kit1 | CATCH BREATH · Reaction · 1 AP | no | N/A | reaction — not an action Power Roll |
| kit2 | System's Bargain · 2 AP · 2 mana | no | N/A | no Power Roll confirm |
| kit2 | Summon · Warrior · 2 AP · 2 mana | no | N/A | summon — places a token, no Power Roll |
| kit2 | Summon · Mage · 2 AP · 2 mana | no | N/A | summon — places a token, no Power Roll |
| kit2 | Summon · Archer · 2 AP · 2 mana | no | N/A | summon — places a token, no Power Roll |
| kit2 | Bless · 0 AP · 1 mana · pick target | no | N/A | click-resolves or target buff — no Power Roll |
| kit2 | Bless (Upcast) · 0 AP · 2 mana · pick target | no | N/A | click-resolves or target buff — no Power Roll |
| kit2 | Hex Knife · Strike · R5 (1 AP) | yes | OK | Help Acolyte B: reroll 5+5 → 6+5 · −1 AP |
| kit2 | Enfeeble · R4 (1 AP) | yes | OK | Help Acolyte B: reroll 5+5 → 6+5 · −1 AP |
| kit2 | Purge the Wicked · R4 (2 AP) | yes | OK | Help Acolyte B: reroll 5+5 → 6+5 · −1 AP |
| kit2 | Toxic Cloud · R3 (2 AP) | yes | OK | Help Acolyte B: reroll 5+5 → 6+5 · −1 AP |
| kit2 | Steel Yourself · 1 AP | no | N/A | roll resolves to SHIELD/CLEANSE with no Help choice |
| kit2 | Line Up the Strike · 1 AP | yes | OK | Help Acolyte B (Opening): reroll 5+5 → 6+5 · −1 AP |
| kit2 | Ask a Question · 1 AP | no | N/A | roll commits without a Help choice |
| kit2 | Shove · 1 AP | no | N/A | roll commits without a Help choice |
| kit2 | Defend · Reaction · 1 AP | no | N/A | reaction — not an action Power Roll |
| kit2 | CATCH BREATH · Reaction · 1 AP | no | N/A | reaction — not an action Power Roll |

### primalist

Train talents: frost-shock, barkskin, primal-instinct, entangle, wind-gale, healing-water, feral-invocation, summon-elemental.

| Kit | Ability | Help offered? | Result | What happened |
| --- | --- | --- | --- | --- |
| kit1 | Summon · Elemental · 2 AP · 2 mana | no | N/A | summon — places a token, no Power Roll |
| kit1 | Barkskin · 1 AP · 1 mana · pick target | no | N/A | click-resolves or target buff — no Power Roll |
| kit1 | Barkskin (Upcast) · 1 AP · 2 mana · pick target | no | N/A | click-resolves or target buff — no Power Roll |
| kit1 | Healing Water · 1 AP · 1 mana · pick target | no | N/A | click-resolves or target buff — no Power Roll |
| kit1 | Healing Water (Upcast) · 1 AP · 2 mana · pick target | no | N/A | click-resolves or target buff — no Power Roll |
| kit1 | Feral Invocation · 1 AP · 2 stress | no | N/A | cell move — no Power Roll |
| kit1 | Elemental Spear · Strike · R1 (1 AP) | yes | OK | Help Primalist B: reroll 5+5 → 6+5 · −1 AP |
| kit1 | Frost Shock · R5 (1 AP) | yes | OK | Help Primalist B: reroll 5+5 → 6+5 · −1 AP |
| kit1 | Entangle · R2 (2 AP) | yes | OK | Help Primalist B: reroll 5+5 → 6+5 · −1 AP |
| kit1 | Wind Gale · R4 (2 AP) | yes | OK | Help Primalist B: reroll 5+5 → 6+5 · −1 AP |
| kit1 | Steel Yourself · 1 AP | no | N/A | roll resolves to SHIELD/CLEANSE with no Help choice |
| kit1 | Line Up the Strike · 1 AP | yes | OK | Help Primalist B (Opening): reroll 5+5 → 6+5 · −1 AP |
| kit1 | Ask a Question · 1 AP | no | N/A | roll commits without a Help choice |
| kit1 | Shove · 1 AP | no | N/A | roll commits without a Help choice |
| kit1 | Defend · Reaction · 1 AP | no | N/A | reaction — not an action Power Roll |
| kit1 | CATCH BREATH · Reaction · 1 AP | no | N/A | reaction — not an action Power Roll |
| kit2 | Summon · Elemental · 2 AP · 2 mana | no | N/A | summon — places a token, no Power Roll |
| kit2 | Barkskin · 1 AP · 1 mana · pick target | no | N/A | click-resolves or target buff — no Power Roll |
| kit2 | Barkskin (Upcast) · 1 AP · 2 mana · pick target | no | N/A | click-resolves or target buff — no Power Roll |
| kit2 | Healing Water · 1 AP · 1 mana · pick target | no | N/A | click-resolves or target buff — no Power Roll |
| kit2 | Healing Water (Upcast) · 1 AP · 2 mana · pick target | no | N/A | click-resolves or target buff — no Power Roll |
| kit2 | Feral Invocation · 1 AP · 2 stress | no | N/A | cell move — no Power Roll |
| kit2 | Tide Focus · Droplet · R5 (1 AP) | yes | OK | Help Primalist B: reroll 5+5 → 6+5 · −1 AP |
| kit2 | Frost Shock · R5 (1 AP) | yes | OK | Help Primalist B: reroll 5+5 → 6+5 · −1 AP |
| kit2 | Entangle · R2 (2 AP) | yes | OK | Help Primalist B: reroll 5+5 → 6+5 · −1 AP |
| kit2 | Wind Gale · R4 (2 AP) | yes | OK | Help Primalist B: reroll 5+5 → 6+5 · −1 AP |
| kit2 | Steel Yourself · 1 AP | no | N/A | roll resolves to SHIELD/CLEANSE with no Help choice |
| kit2 | Line Up the Strike · 1 AP | yes | OK | Help Primalist B (Opening): reroll 5+5 → 6+5 · −1 AP |
| kit2 | Ask a Question · 1 AP | no | N/A | roll commits without a Help choice |
| kit2 | Shove · 1 AP | no | N/A | roll commits without a Help choice |
| kit2 | Defend · Reaction · 1 AP | no | N/A | reaction — not an action Power Roll |
| kit2 | CATCH BREATH · Reaction · 1 AP | no | N/A | reaction — not an action Power Roll |
| — | Primal Instinct | no | N/A | no pressable action on the turn (passive or reaction window) |

## Minions

Lab encounters set `playSummons`, so ending the summoner's turn hands you the pet (1 Move, 1 Action, 1 OA). The MC path is unchanged when that flag is absent. INT on these Rank-1 cards is 1, and the pet copies that INT. HP is the template multiplier × INT.

| Check | Archer | Mage | Warrior | Elemental |
| --- | --- | --- | --- | --- |
| Summon button | Summon · Archer · 2 AP · 2 mana | Summon · Mage | Summon · Warrior | Summon · Elemental |
| On board | Summon · Archer, 10/10 HP | 8/8 HP | 14/14 HP | 10/10 HP |
| Stats | STR 0 · DEX 1 · INT 1 · Spd 6 | STR 0 · DEX 0 · INT 1 · Spd 4 | STR 1 · DEX 0 · INT 1 · Spd 3 | STR 0 · DEX 0 · INT 1 · Spd 5 |
| Turn | Mv1 Act1 OA1 after End turn | same | same | same |
| Strike | Archer · Shot in range. Help from Acolyte A (−1 AP). Action 1→0. Dummy 100→97 | Mage · Dark Bolt. Help −1 AP. Action 1→0. Dummy 100→100 (raw 5 vs Dark DEF 5) | Warrior · Strike starts out of R1. Move onto (3,2), then Strike. Help −1 AP. Dummy 100→100. Move slot spent | Elemental · Bolt, element Earth. Help from Primalist A (−1 AP). Dummy 100→100 (raw 4 vs Fire DEF 5) |
| Other action | Bone Arrow. Help −1 AP. Dummy 100→96 | Fireball. Help −1 AP. Dummy 100→98 | Living Shield (in range). Help −1 AP. Dummy 100→99. Stress spent | Elemental Shield. Earth, ally Primalist A. **Help absent** (flat). Action spent |
| Call Help? | Yes — button `Help from Acolyte A` | same | same | Bolt yes. Shield no |
| Be the helper? | No. Hero strike listed only `Help from Acolyte B` / `Help from Primalist B` | same | same | same |
| Death | Not reached vs Dummy DEF 5 / HP 100 | same | same | same |

Death is the monster-out rule: 0 HP sets `dead`, clears `activeSummonId`, and the lab drops the token from the grid and roster. `scripts/help-and-minions-check.mjs` applies lethal damage for each of the four and checks that. No kill control was added.

## Fixes in this pass

- Help confirm tells the truth: reroll the lower d10, with the real pay (Ranger free, free reaction, or −1 AP). Flat rolls do not offer Help. Threshold shift is kept on the reroll.
- Train / Dummy loads that class's full Rank-1 talent list (8 each), so the ally and the buttons match the class.
- Summon HP labels match the engine multipliers (Warrior 14×INT, Mage 8×INT, Archer 10×INT, Elemental 10×INT).
- Summons in the lab take a human turn after the summoner. Dead summons leave the map. Their strikes stay listed when out of range, with the Action slot and stress cost on the button.
- Elemental Bolt and Shield pick Earth / Fire / Lightning / Water. Shield then picks an ally in R4 and does not offer Help.
- Undo snapshots the ranged-from-melee OA window, so Undo returns to the attack instead of leaving that prompt stuck.

Soft/BP stairs and the password gate are unchanged.

## How to re-check

```
node scripts/help-and-minions-check.mjs
node scripts/help-minion-ui.mjs
```

The UI script expects the lab at `http://127.0.0.1:8765/sandbox.html`.
