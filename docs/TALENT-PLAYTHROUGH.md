# Rank-1 Dummy talent playthrough

Scope: every `FEAT_SMOKE_STUBS` talent, one at a time on `train_<class>` (two copies of that class vs the Training Dummy). Each pressable ability is resolved through the engine the lab calls. Riposte and Hidden Bola use `engine/reactPrompt.js`, which is what the reaction window buttons call.

Talents: **56 OK**, **0 FAIL**, **56 checked**.

Base kit Strikes (including Shield Bash): **16 OK**, **0 FAIL**, **16 checked**.

Checks: numbers (resolved damage, both kits for WD), confirm/prompt, AP/stress, bonus stress, targeting, effect.

## Reaction window

- `assassin-riposte`: OK. reaction window: 5 reduce, then Accept; 0 HP opens free OA Practice Blow raw 8 → 3 (−2 HP after DEF). OA not expected on this 8-damage hit. Power Swing raw 6 → 1 (−0 HP) offers free OA.
- `scout-hidden-bola`: OK. reaction window offers Hidden Bola (free reaction, Knockdown) then Accept raw 8 → 3 (−2 HP). Knockdown on Dummy (STR 1 ≤ DEX 1)

## Talents

### Acolyte

| Talent | Numbers | Confirm | AP / stress | Bonus stress | Target | Effect |
| --- | --- | --- | --- | --- | --- | --- |
| `acolyte-bless` | OK — n/a — no damage card | OK — target prompt — click a highlighted token, then the click resolves; also listed: Bless (Upcast) | OK — AP 3→3 (want −0), stress 6→6 (want −0), mana 10→9 (want −1) | OK — n/a | OK — 2 legal targets; bogus id blocked (bad-target) | OK — heal 2 |
| `acolyte-enfeeble` | OK — flat 0/0/0 | OK — roll confirm (Help or accept) before resolve | OK — AP 3→2 (want −1), stress 6→6 (want −0), mana 10→9 (want −1) | OK — n/a | OK — Dummy in range; ally is not highlighted; out of range R4 blocks Dummy (button disabled in the lab) | OK — raw 0 T1 · −0 HP · status ×1 · Intimidate 3, Vulnerable 1 (Physical) |
| `acolyte-purge-wicked` | OK — flat 6/10/14 | OK — roll confirm (Help or accept) before resolve | OK — AP 3→1 (want −2), stress 6→6 (want −0), mana 10→9 (want −1) | OK — n/a | OK — Dummy in range; ally is not highlighted; out of range R4 blocks Dummy (button disabled in the lab) | OK — raw 6 T1 · −1 HP |
| `acolyte-summon-archer` | OK — n/a — no damage card | OK — no extra prompt — Summon · Archer resolves on click | OK — AP 3→1 (want −2), stress 6→6 (want −0), mana 10→8 (want −2) | OK — n/a | OK — n/a — no target | OK — summon added · self flag |
| `acolyte-summon-mage` | OK — n/a — no damage card | OK — no extra prompt — Summon · Mage resolves on click | OK — AP 3→1 (want −2), stress 6→6 (want −0), mana 10→8 (want −2) | OK — n/a | OK — n/a — no target | OK — summon added · self flag |
| `acolyte-summon-warrior` | OK — n/a — no damage card | OK — no extra prompt — Summon · Warrior resolves on click | OK — AP 3→1 (want −2), stress 6→6 (want −0), mana 10→8 (want −2) | OK — n/a | OK — n/a — no target | OK — summon added · self flag |
| `acolyte-systems-bargain` | OK — n/a — no damage card | OK — no extra prompt — System's Bargain resolves on click | OK — AP 3→1 (want −2), stress 6→6 (want −0), mana 10→8 (want −2) | OK — n/a | OK — n/a — no target | OK — self flag |
| `acolyte-toxic-cloud` | OK — flat 4/4/4 | OK — roll confirm (Help or accept) before resolve | OK — AP 3→1 (want −2), stress 6→6 (want −0), mana 10→8 (want −2) | OK — n/a | OK — Dummy in range; ally is not highlighted; out of range R4 blocks Dummy (button disabled in the lab) | OK — raw 4 T1 · −0 HP |

### Assassin

| Talent | Numbers | Confirm | AP / stress | Bonus stress | Target | Effect |
| --- | --- | --- | --- | --- | --- | --- |
| `assassin-cold-blooded` | OK — n/a — passive | OK — n/a — nothing to confirm | OK — n/a — no button | OK — n/a | OK — n/a | OK — applied on grant: coldBlooded, stress, stressMax |
| `assassin-dirty-trick` | OK — Dual Daggers 4/6/9 (active) · Stiletto 2/5/7 | OK — roll confirm (Help or accept) before resolve | OK — AP 3→1 (want −2), stress 4→4 (want −0) | OK — n/a | OK — Dummy in range; ally is not highlighted; out of range R1 blocks Dummy (button disabled in the lab) | OK — raw 4 T1 · −0 HP |
| `assassin-expose-weakness` | OK — Dual Daggers 6/12/18 (active) · Stiletto 2/10/14 | OK — roll confirm (Help or accept) before resolve | OK — AP 3→1 (want −2), stress 4→3 (want −1) | OK — n/a | OK — Dummy in range; ally is not highlighted; out of range R1 blocks Dummy (button disabled in the lab) | OK — raw 6 T1 · −2 HP |
| `assassin-flurry-daggers` | OK — Dual Daggers 4/7/18 (active) · Stiletto 2/6/14 | OK — extra-target prompt; roll confirm (Help or accept) before resolve | OK — AP 3→1 (want −2), stress 4→3 (want −1) | OK — n/a | OK — Dummy in range; ally is not highlighted; out of range R4 blocks Dummy (button disabled in the lab) | OK — raw 4 T1 · −0 HP |
| `assassin-perfectionist` | OK — n/a — passive | OK — n/a — nothing to confirm | OK — n/a — no button | OK — n/a | OK — n/a | OK — applied on grant: perfectionist |
| `assassin-riposte` | OK — n/a — mitigation is 5×DEX (Assassin DEX 1 → −5), not a WD card | OK — reaction window: 5 reduce, then Accept; 0 HP opens free OA | OK — free action · stress 4→3 · AP 3→3 | OK — n/a | OK — melee R1 offers Riposte; ranged explained (melee RANGE 1 only) | OK — Practice Blow raw 8 → 3 (−2 HP after DEF). OA not expected on this 8-damage hit. Power Swing raw 6 → 1 (−0 HP) offers free OA. |
| `assassin-shadow-dash` | OK — n/a — no damage card | OK — cell prompt — 48 highlighted cells, then the click resolves | OK — AP 3→2 (want −1), stress 4→3 (want −1) | OK — n/a | OK — 48 legal cells | OK — landed |
| `assassin-stealth` | OK — n/a — no damage card | OK — no extra prompt — Stealth resolves on click | OK — AP 3→3 (want −0), stress 4→3 (want −1) | OK — n/a | OK — n/a — no target | OK — self flag |

### Brawler

| Talent | Numbers | Confirm | AP / stress | Bonus stress | Target | Effect |
| --- | --- | --- | --- | --- | --- | --- |
| `brawler-flurry-blows` | OK — Fighting Gloves 13/18/33 (active) · Quarterstaff 15/20/33 | OK — roll confirm (Help or accept) before resolve | OK — AP 3→0 (want −3), stress 4→3 (want −1) | OK — n/a | OK — Dummy in range; ally is not highlighted; out of range R1 blocks Dummy (button disabled in the lab) | OK — raw 13 T1 · −9 HP |
| `brawler-full-contact` | OK — n/a — passive | OK — n/a — nothing to confirm | OK — n/a — no button | OK — n/a | OK — n/a | OK — applied on grant: fullContact |
| `brawler-grapple` | OK — Fighting Gloves 6/8/11 (active) · Quarterstaff 7/9/11 | OK — roll confirm (Help or accept) before resolve | OK — AP 3→1 (want −2), stress 4→3 (want −1) | OK — n/a | OK — Dummy in range; ally is not highlighted; out of range R1 blocks Dummy (button disabled in the lab) | OK — raw 6 T1 · −2 HP · status ×1 · Restrain, Vulnerable 1 (Physical) |
| `brawler-guard` | OK — n/a — no damage card | OK — no extra prompt — Guard resolves on click | OK — AP 3→3 (want −0), stress 4→3 (want −1) | OK — n/a | OK — n/a — no target | OK — self flag |
| `brawler-martial-artist` | OK — n/a — no damage card | OK — cell prompt — 77 highlighted cells, then the click resolves | OK — AP 3→2 (want −1), stress 4→4 (want −0) | OK — n/a | OK — 77 legal cells | OK — landed |
| `brawler-pugilist` | OK — n/a — passive | OK — n/a — nothing to confirm | OK — n/a — no button | OK — n/a | OK — n/a | OK — applied on grant: def, pugilist, stability, stabilityBase |
| `brawler-tough` | OK — n/a — passive | OK — n/a — nothing to confirm | OK — n/a — no button | OK — n/a | OK — n/a | OK — applied on grant: hp, hpMax, maxHp, recoveries, recoveriesMax |
| `brawler-uppercut` | OK — Fighting Gloves 6/8/11 (active) · Quarterstaff 7/9/11 | OK — stress boost prompt (Spend / No boost); roll confirm (Help or accept) before resolve | OK — AP 3→2 (want −1), stress 4→4 (want −0) | OK — prompt Spend 1 / No boost; applied −1 stress, Adv 2 | OK — Dummy in range; ally is not highlighted; out of range R1 blocks Dummy (button disabled in the lab) | OK — raw 6 T1 · −2 HP |

### Fighter

| Talent | Numbers | Confirm | AP / stress | Bonus stress | Target | Effect |
| --- | --- | --- | --- | --- | --- | --- |
| `fighter-courage` | OK — n/a — passive | OK — n/a — nothing to confirm | OK — n/a — no button | OK — n/a | OK — n/a | OK — applied on grant: courage, def |
| `fighter-eye-for-an-eye` | OK — n/a — free OA, no damage card | OK — after a T3 hit the lab asks: free OA or pass | OK — n/a until the OA is taken (0 AP) | OK — n/a | OK — OA target is the Dummy that landed T3 | OK — T3 hit −3 HP, then optional free OA |
| `fighter-forceful-push` | OK — Heavy Sword 6/13/18 (active) · Longsword + Shield 7/11/15 | OK — push direction after the roll; roll confirm (Help or accept) before resolve | OK — AP 3→1 (want −2), stress 3→2 (want −1) | OK — n/a | OK — Dummy in range; ally is not highlighted; out of range R1 blocks Dummy (button disabled in the lab) | OK — raw 6 T1 · −2 HP · push prompt |
| `fighter-frontliner` | OK — n/a — passive | OK — n/a — nothing to confirm | OK — n/a — no button | OK — n/a | OK — n/a | OK — applied on grant: frontliner, hp, hpMax, maxHp |
| `fighter-heavy-swing` | OK — Heavy Sword 7/12/26 (active) · Longsword + Shield 8/10/20 | OK — stress boost prompt (Spend / No boost); roll confirm (Help or accept) before resolve | OK — AP 3→1 (want −2), stress 3→2 (want −1) | OK — prompt Spend 1 / No boost; applied −1 stress, Adv 1 | OK — Dummy in range; ally is not highlighted; out of range R1 blocks Dummy (button disabled in the lab) | OK — raw 7 T1 · −3 HP |
| `fighter-intimidating-shout` | OK — flat 0/0/0 | OK — roll confirm (Help or accept) before resolve | OK — AP 3→2 (want −1), stress 3→2 (want −1) | OK — n/a | OK — self AoE — no target pick; foes in the radius are hit | OK — raw 0 T1 · Intimidate 2, Vulnerable 1 (Physical) |
| `fighter-precise-strike` | OK — Heavy Sword 6/10/13 (active) · Longsword + Shield 7/8/10 | OK — roll confirm (Help or accept) before resolve | OK — AP 3→1 (want −2), stress 3→2 (want −1) | OK — n/a | OK — Dummy in range; ally is not highlighted; out of range R1 blocks Dummy (button disabled in the lab) | OK — raw 6 T1 · −2 HP |
| `fighter-weaponmaster` | OK — n/a — passive | OK — n/a — nothing to confirm | OK — n/a — no button | OK — n/a | OK — n/a | OK — applied on grant: weaponmaster |

### Mystic

| Talent | Numbers | Confirm | AP / stress | Bonus stress | Target | Effect |
| --- | --- | --- | --- | --- | --- | --- |
| `mystic-blink` | OK — n/a — no damage card | OK — cell prompt — 24 highlighted cells, then the click resolves; also listed: Blink (Upcast) | OK — AP 3→2 (want −1), stress 6→6 (want −0), mana 10→9 (want −1) | OK — n/a | OK — 24 legal cells | OK — landed |
| `mystic-enhance-weapon` | OK — n/a — no damage card | OK — no extra prompt — Enhance Weapon resolves on click | OK — AP 3→2 (want −1), stress 6→6 (want −0), mana 10→9 (want −1) | OK — n/a | OK — n/a — no target | OK — self flag |
| `mystic-game-knowledge` | OK — n/a — passive | OK — n/a — nothing to confirm | OK — n/a — no button | OK — n/a | OK — n/a | OK — applied on grant: gameKnowledge; OOC stub (system rolls / XP) |
| `mystic-ice-wall` | OK — n/a — no damage card | OK — no extra prompt — Ice Wall resolves on click | OK — AP 3→3 (want −0), stress 6→6 (want −0), mana 10→8 (want −2) | OK — n/a | OK — n/a — no target | OK — object placed · self flag |
| `mystic-lightning-bolt` | OK — flat 8/12/14 | OK — roll confirm (Help or accept) before resolve | OK — AP 3→1 (want −2), stress 6→6 (want −0), mana 10→9 (want −1) | OK — n/a | OK — Dummy in range; ally is not highlighted; out of range R6 blocks Dummy (button disabled in the lab) | OK — raw 8 T1 · −3 HP |
| `mystic-living-bomb` | OK — flat 0/0/0 | OK — roll confirm (Help or accept) before resolve | OK — AP 3→1 (want −2), stress 6→6 (want −0), mana 10→8 (want −2) | OK — n/a | OK — Dummy in range; ally is not highlighted; out of range R5 blocks Dummy (button disabled in the lab) | OK — raw 0 T1 · −0 HP · status ×1 · Burn 2, Vulnerable 1 (Physical) |
| `mystic-magic-shield` | OK — n/a — no damage card | OK — target prompt — click a highlighted token, then the click resolves | OK — AP 3→3 (want −0), stress 6→6 (want −0), mana 10→9 (want −1) | OK — n/a | OK — 2 legal targets; bogus id blocked (bad-target) | OK — landed |
| `mystic-shadowplay` | OK — flat 0/0/0 | OK — roll confirm (Help or accept) before resolve | OK — AP 3→2 (want −1), stress 6→6 (want −0), mana 10→9 (want −1) | OK — n/a | OK — Dummy in range; ally is not highlighted; out of range R3 blocks Dummy (button disabled in the lab) | OK — raw 0 T1 · −0 HP · status ×1 · Fear ← Mystic A, Vulnerable 1 (Physical) |

### Primalist

| Talent | Numbers | Confirm | AP / stress | Bonus stress | Target | Effect |
| --- | --- | --- | --- | --- | --- | --- |
| `primalist-barkskin` | OK — n/a — no damage card | OK — target prompt — click a highlighted token, then the click resolves; also listed: Barkskin (Upcast) | OK — AP 3→2 (want −1), stress 6→6 (want −0), mana 10→9 (want −1) | OK — n/a | OK — 2 legal targets; bogus id blocked (bad-target) | OK — landed |
| `primalist-entangle` | OK — flat 4/8/10 | OK — roll confirm (Help or accept) before resolve | OK — AP 3→1 (want −2), stress 6→6 (want −0), mana 10→8 (want −2) | OK — n/a | OK — Dummy in range; ally is not highlighted; out of range R5 blocks Dummy (button disabled in the lab) | OK — raw 4 T1 · −0 HP |
| `primalist-feral-invocation` | OK — n/a — no damage card | OK — cell prompt — 77 highlighted cells, then the click resolves | OK — AP 3→2 (want −1), stress 6→6 (want −0) | OK — n/a | OK — 77 legal cells | OK — landed |
| `primalist-frost-shock` | OK — flat 5/8/10 | OK — roll confirm (Help or accept) before resolve | OK — AP 3→2 (want −1), stress 6→6 (want −0), mana 10→9 (want −1) | OK — n/a | OK — Dummy in range; ally is not highlighted; out of range R5 blocks Dummy (button disabled in the lab) | OK — raw 5 T1 · −0 HP |
| `primalist-healing-water` | OK — n/a — no damage card | OK — target prompt — click a highlighted token, then the click resolves; also listed: Healing Water (Upcast) | OK — AP 3→2 (want −1), stress 6→6 (want −0), mana 10→9 (want −1) | OK — n/a | OK — 2 legal targets; bogus id blocked (bad-target) | OK — heal 2 |
| `primalist-primal-instinct` | OK — n/a — passive | OK — n/a — nothing to confirm | OK — n/a — no button | OK — n/a | OK — n/a | OK — applied on grant: def, primalInstinct, stability, stabilityBase |
| `primalist-summon-elemental` | OK — n/a — no damage card | OK — no extra prompt — Summon · Elemental resolves on click | OK — AP 3→1 (want −2), stress 6→6 (want −0), mana 10→8 (want −2) | OK — n/a | OK — n/a — no target | OK — summon added · self flag |
| `primalist-wind-gale` | OK — flat 4/6/8 | OK — push direction after the roll; roll confirm (Help or accept) before resolve | OK — AP 3→1 (want −2), stress 6→6 (want −0), mana 10→8 (want −2) | OK — n/a | OK — Dummy in range; ally is not highlighted; out of range R4 blocks Dummy (button disabled in the lab) | OK — raw 4 T1 · −0 HP |

### Scout

| Talent | Numbers | Confirm | AP / stress | Bonus stress | Target | Effect |
| --- | --- | --- | --- | --- | --- | --- |
| `scout-barrage` | OK — Shortbow 7/11/14 (active) · Glaive 8/11/14 | OK — extra-target prompt; roll confirm (Help or accept) before resolve | OK — AP 3→0 (want −3), stress 4→3 (want −1) | OK — n/a | OK — Dummy in range; ally is not highlighted; out of range R8 blocks Dummy (button disabled in the lab) | OK — raw 7 T1 · −3 HP |
| `scout-hidden-bola` | OK — n/a — mitigation is 5×DEX (Scout DEX 1 → −5), not a WD card | OK — reaction window offers Hidden Bola (free reaction, Knockdown) then Accept | OK — light-armor free reaction · stress 4→3 · AP 3→3 | OK — n/a | OK — in R3 offered; far: attacker beyond RANGE 3; no stress: needs 1 stress | OK — raw 8 → 3 (−2 HP). Knockdown on Dummy (STR 1 ≤ DEX 1) |
| `scout-hunters-knowledge` | OK — n/a — passive | OK — n/a — nothing to confirm | OK — n/a — no button | OK — n/a | OK — n/a | OK — applied on grant: huntersKnowledge |
| `scout-pin-shot` | OK — Shortbow 6/9/11 (active) · kit-locked shortbow | OK — stress boost prompt (Spend / No boost); roll confirm (Help or accept) before resolve | OK — AP 3→2 (want −1), stress 4→3 (want −1) | OK — prompt Spend 1 / No boost; applied −1 stress, Adv 1 | OK — Dummy in range; ally is not highlighted; out of range R8 blocks Dummy (button disabled in the lab) | OK — raw 6 T1 · −2 HP · status ×1 · Slow 1, Vulnerable 1 (Physical) |
| `scout-ranger` | OK — n/a — passive | OK — n/a — nothing to confirm | OK — n/a — no button | OK — n/a | OK — n/a | OK — applied on grant: ranger, rangerFreeHelps, scoutingAdv, stress, stressMax |
| `scout-spotter` | OK — n/a — no damage card | OK — target prompt — click a highlighted token, then the click resolves | OK — AP 3→2 (want −1), stress 4→3 (want −1) | OK — n/a | OK — 1 legal target; bogus id blocked (bad-target) | OK — Spotter Mark, Vulnerable 1 (Physical) |
| `scout-survival-tactics` | OK — n/a — passive | OK — n/a — nothing to confirm | OK — n/a — no button | OK — n/a | OK — n/a | OK — applied on grant: def, recoveries, recoveriesMax, survivalTactics |
| `scout-vigilant` | OK — n/a — passive | OK — n/a — nothing to confirm | OK — n/a — no button | OK — n/a | OK — n/a | OK — applied on grant: stability, stabilityBase, vigilant; MOVE 1 safe arms after this hero takes an OA |

## Base kit

### Fighter

| Talent | Numbers | Confirm | AP / stress | Bonus stress | Target | Effect |
| --- | --- | --- | --- | --- | --- | --- |
| `fighter-heavy-sword-strike` | OK — flat 6/10/13 | OK — roll confirm (Help or accept) before resolve | OK — AP 3→2 (want −1), stress 3→3 (want −0) | OK — n/a | OK — Dummy in range; ally is not highlighted; out of range R1 blocks Dummy (button disabled in the lab) | OK — raw 6 T1 · −2 HP |
| `fighter-longsword-strike` | OK — flat 7/8/10 | OK — roll confirm (Help or accept) before resolve | OK — AP 3→2 (want −1), stress 3→3 (want −0) | OK — n/a | OK — Dummy in range; ally is not highlighted | OK — raw 7 T1 · −3 HP |
| `fighter-shield-bash` | OK — flat 3/5/7 · not WD | OK — roll confirm (Help or accept) before resolve | OK — AP 3→2 (want −1), stress 3→3 (want −0) | OK — n/a | OK — Dummy in range; ally is not highlighted | OK — raw 3 T1 · −0 HP |

### Brawler

| Talent | Numbers | Confirm | AP / stress | Bonus stress | Target | Effect |
| --- | --- | --- | --- | --- | --- | --- |
| `brawler-fighting-gloves-strike` | OK — flat 6/8/11 | OK — push direction after the roll; roll confirm (Help or accept) before resolve | OK — AP 3→2 (want −1), stress 4→4 (want −0) | OK — n/a | OK — Dummy in range; ally is not highlighted; out of range R1 blocks Dummy (button disabled in the lab) | OK — raw 6 T1 · −2 HP |
| `brawler-quarterstaff-strike` | OK — flat 7/9/11 | OK — roll confirm (Help or accept) before resolve | OK — AP 3→2 (want −1), stress 4→4 (want −0) | OK — n/a | OK — Dummy in range; ally is not highlighted | OK — raw 7 T1 · −3 HP |

### Assassin

| Talent | Numbers | Confirm | AP / stress | Bonus stress | Target | Effect |
| --- | --- | --- | --- | --- | --- | --- |
| `assassin-dual-daggers-strike` | OK — flat 4/6/9 | OK — roll confirm (Help or accept) before resolve | OK — AP 3→2 (want −1), stress 4→4 (want −0) | OK — n/a | OK — Dummy in range; ally is not highlighted; out of range R1 blocks Dummy (button disabled in the lab) | OK — raw 4 T1 · −0 HP |
| `assassin-dual-daggers-twin-strike` | OK — flat 4/6/9 | OK — roll confirm (Help or accept) before resolve | OK — AP 3→1 (want −2), stress 4→4 (want −0) | OK — n/a | OK — Dummy in range; ally is not highlighted; out of range R1 blocks Dummy (button disabled in the lab) | OK — raw 13 T3 · −9 HP · status ×1 · Bleed 2, Vulnerable 1 (Physical) |
| `assassin-stiletto-strike` | OK — flat 2/5/7 | OK — roll confirm (Help or accept) before resolve | OK — AP 3→2 (want −1), stress 4→4 (want −0) | OK — n/a | OK — Dummy in range; ally is not highlighted | OK — raw 2 T1 · −0 HP |

### Scout

| Talent | Numbers | Confirm | AP / stress | Bonus stress | Target | Effect |
| --- | --- | --- | --- | --- | --- | --- |
| `scout-shortbow-strike` | OK — flat 6/9/11 | OK — roll confirm (Help or accept) before resolve | OK — AP 3→2 (want −1), stress 4→4 (want −0) | OK — n/a | OK — Dummy in range; ally is not highlighted; out of range R8 blocks Dummy (button disabled in the lab) | OK — raw 6 T1 · −2 HP |
| `scout-glaive-strike` | OK — flat 7/9/11 | OK — roll confirm (Help or accept) before resolve | OK — AP 3→2 (want −1), stress 4→4 (want −0) | OK — n/a | OK — Dummy in range; ally is not highlighted | OK — raw 7 T1 · −3 HP |

### Mystic

| Talent | Numbers | Confirm | AP / stress | Bonus stress | Target | Effect |
| --- | --- | --- | --- | --- | --- | --- |
| `mystic-pyre-focus-ember` | OK — flat 4/6/8 | OK — roll confirm (Help or accept) before resolve | OK — AP 3→2 (want −1), stress 6→6 (want −0) | OK — n/a | OK — Dummy in range; ally is not highlighted; out of range R5 blocks Dummy (button disabled in the lab) | OK — raw 4 T1 · −0 HP · status ×1 · Burn 1, Vulnerable 1 (Physical) |
| `mystic-storm-focus-spark` | OK — flat 4/6/8 | OK — roll confirm (Help or accept) before resolve | OK — AP 3→2 (want −1), stress 6→6 (want −0) | OK — n/a | OK — Dummy in range; ally is not highlighted | OK — raw 4 T1 · −0 HP · status ×1 · Shock 2, Vulnerable 1 (Physical) |

### Acolyte

| Talent | Numbers | Confirm | AP / stress | Bonus stress | Target | Effect |
| --- | --- | --- | --- | --- | --- | --- |
| `acolyte-symbol-strike` | OK — flat 3/5/7 | OK — roll confirm (Help or accept) before resolve | OK — AP 3→2 (want −1), stress 6→6 (want −0) | OK — n/a | OK — Dummy in range; ally is not highlighted; out of range R5 blocks Dummy (button disabled in the lab) | OK — raw 3 T1 · −0 HP |
| `acolyte-hex-knife-strike` | OK — flat 4/6/8 | OK — roll confirm (Help or accept) before resolve | OK — AP 3→2 (want −1), stress 6→6 (want −0) | OK — n/a | OK — Dummy in range; ally is not highlighted | OK — raw 4 T1 · −0 HP |

### Primalist

| Talent | Numbers | Confirm | AP / stress | Bonus stress | Target | Effect |
| --- | --- | --- | --- | --- | --- | --- |
| `primalist-elemental-spear-strike` | OK — flat 6/7/10 | OK — element type prompt; roll confirm (Help or accept) before resolve | OK — AP 3→2 (want −1), stress 6→6 (want −0) | OK — n/a | OK — Dummy in range; ally is not highlighted; out of range R1 blocks Dummy (button disabled in the lab) | OK — raw 6 T1 · −2 HP |
| `primalist-tide-focus-droplet` | OK — flat 3/5/7 | OK — roll confirm (Help or accept) before resolve | OK — AP 3→2 (want −1), stress 6→6 (want −0) | OK — n/a | OK — Dummy in range; ally is not highlighted | OK — raw 3 T1 · −0 HP · status ×1 · Slow 2, Vulnerable 1 (Physical) |

## Failures

None.

## How this was run

- Harness: `node scripts/talent-playthrough.mjs`. Strikes dry-run first (the lab's declare / Help-or-accept step), then resolve with that declaration and `spendStressAdv: false` unless the bonus-stress check is applying the boost.
- Out-of-range: hero parked at (0,0) and Dummy at (11,7). The lab disables that strike button (`out of range`).
- Riposte: Dummy Practice Blow (8) clicks Riposte (−5, 1 stress, 0 AP) then Accept. A Power Swing raw 6 (T1) mitigates to 0 HP and the lab offers the free weapon OA.
- Hidden Bola: same Practice Blow. Light Armor makes the first reaction free. Dummy STR 1 ≤ Scout DEX 1, so Knockdown lands. RANGE 3 and stress are required.
- Passives have no button. Effect is the grant itself (the flag or stat the stub sets).

<!-- browser-appendix:start -->
- Spotter Mark is printed on the token (`Spotter Mark` in the status line) so the mark is visible after the click.
- Browser (live sandbox, Rank 1 ladder n=4, Lab / Dummy): `train_assassin` vs Dummy offered **Assassin A · Riposte (free · −1 stress · −5)** next to Defend / Catch Breath / Interpose. Clicking it logged `Riposte (−5 · raw 0) · free · −1 stress` and, after Accept on Menacing Glare (0 HP), opened **Riposte · free weapon OA**. `train_scout` offered **Scout A · Hidden Bola (free reaction · −1 stress · −5 · Knockdown)**. After the click, Defend dropped from free reaction to −1 AP (Light Armor free reaction spent). Accept logged Knockdown; the Dummy then Stood.
<!-- browser-appendix:end -->
