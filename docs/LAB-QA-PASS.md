# Lab QA pass

Full playtest of the sandbox wizard and Lab. Soft/BP stairs v0.3g and the password gate are unchanged. Help stays a reroll of the lower d10 (already covered in `docs/HELP-AND-MINIONS.md`; this pass did not re-audit Help).

Two checkers:

- Browser: `scripts/lab-qa-ui.mjs` drives the real wizard and Lab (Chrome). **33 OK, 0 FAIL.**
- Engine: `scripts/lab-qa-pass.mjs` calls the same encounter code the page uses. **50 OK, 0 FAIL.**

Combined **83 OK, 0 FAIL.**

## Fixes in this pass

- Rift rooms were built with the room id (`bear_w4`, `w1`, …). Pad only applies to `rift_easy` / `rift_medium` / `rift_hard`, so every room showed pad 0. The lab now passes that room's share from `splitPadBpAcrossFights` (`padBpAdd`) and the rift id as `chain`. Title and status show `BP spent (base+pad)` and `rift base+pad=total`.
- Roster and status show Wounds, and Dying / Dead when those states are true. Defeat is still wounds ≥ 5 on every hero. Dying (0 HP, wounds under 5) is not defeat.
- Bless, Blink, Barkskin, and Healing Water upcast buttons called the base action. The click now sends `upcast: true`.
- Vigilant / Martial artist / Fast Footwork safe steps are move buttons and map clicks. They were legal in the engine and missing from the move list.
- Foe inspect splits Basics and Specials with `isMonsterSpecialAbility`. Specials are tagged, and tagged blocked when that foe has Disarm or Silence.
- Auto-play on the opening kit prompt could apply Weapon Swap. That action is illegal until a kit is chosen, so the tick never left “wybierz kit” (Hard room, Scout, round 2). The tick now picks a kit first.

## 1) Full Rift Easy / Medium / Hard

Wizard quotes (Rank 1, party Fighter / Brawler / Assassin / Scout). UI text matched the stairs.

| n | Easy | Medium | Hard | UI |
| --- | --- | --- | --- | --- |
| 1 | 27+2=29 | 30+4=34 | 34+6=40 | OK |
| 3 | 27+4=31 | 30+6=36 | 34+8=42 | OK |
| 4 | 27+5=32 | 30+7=37 | 34+9=43 | OK |

Hard room 1 on the map (not Dummy):

| n | Room BP | Rift pool | UI |
| --- | --- | --- | --- |
| 3 | 13 (base 11+pad 2) on `bear_w4` | 34+8=42 | OK |
| 4 | 13 (base 11+pad 2) on `bear_w4` | 34+9=43 | OK |

Played rooms (Rank 1, n=1, auto-play, then Next room):

| Lane | Room 1 | End | Next | UI |
| --- | --- | --- | --- | --- |
| Easy | `horde_pack` BP 8 (base 8+pad 0), rift 27+2=29, Wounds 0 on the roster | Victory | Room 2/3 `bear_w2` BP 7, Round 1 starts | OK |
| Medium | `w1` BP 10 (base 8+pad 2), rift 30+4=34 | Victory | Room 2/3 `bear_w4` BP 13 (base 11+pad 2) | OK |
| Hard | `bear_w4` BP 13 (base 11+pad 2), rift 34+6=40 | Victory, Wounds 5, Dead 1 | Room 2/3 `hard` BP 16 (base 12+pad 4). One dead hero did not end the rift | OK |

Engine room spends for n=1, 3, and 4 match those quotes. Solo Tortoise takes no pad. An odd leftover pad (n=4 Easy 32, Medium 37, Hard 43) spends 1 BP less on the map because the only pad unit is a 2 BP wolf. The quote on screen stays the stair total. That is the engine, not a lab bug.

Defeat (engine, `checkOver` via end turn): every hero at 0 HP and wounds 4 stays in the fight (`over=false`). One hero at wounds 5 with the others still Dying stays in the fight. All four at wounds ≥ 5 ends it, winner enemy.

## 2) Reactions beyond Riposte / Hidden Bola

Clicked in Lab / Dummy.

| Check | Evidence | Result |
| --- | --- | --- |
| Defend, Light Armor | Scout ×2. Button `Defend · Reaction · free reaction`. Log `Scout A Defends (reaction)`. AP stayed 3 | OK |
| Catch Breath | Same turn, after the free reaction was spent. Button `CATCH BREATH · Reaction · 1 AP`. Accept `+5 HP`. Log `CATCH BREATH 5+5 → +5 HP (higher) (rec 3) · −1 AP` | OK |
| Defend, heavy armor | Fighter ×2. Button `Defend · Reaction · 1 AP`. Status AP 2 | OK |
| Interpose | Assassin ×2, incoming Menacing Glare. `Assassin B · Interpose (free reaction)` then a destination cell. Log `Assassin B Interposes for Assassin A → (3,3); Assassin A → (2,2) · free` | OK |
| Stack | Same window listed Defend, Catch Breath, Riposte (free · −1 stress · −5), Interpose, Accept | OK |

Engine, same rules: Light Armor Defend spends the free reaction and 0 AP. Heavy Defend spends 1 AP. Catch Breath heals the higher d10 (dice 4 and 9 → 9) and spends a reaction. Interpose retargets onto the interposer; Light Armor can pay that reaction for free. Vigilant sets `vigilant=true` on the Scout. Eye for an Eye sets the fighter flag. The Eye button is the post-T3 free OA prompt (`Eye OA (free)`), not a button on your own turn. The Vigilant safe step is the move button `Vigilant · MOVE 1 safe` after an OA.

## 3) Upcasts, Aim, Weapon Swap, multi-target

Train Lab, ladder n=2, clicked:

| Action | Button | Log | Result |
| --- | --- | --- | --- |
| Blink (Upcast) | `1 AP · 2 mana` | `Blink → (8,7) · SHIELD 4` | OK |
| Bless (Upcast) | `0 AP · 2 mana` | `heal 8 · +3 INT · reroll +1` | OK |
| Barkskin (Upcast) | `1 AP · 2 mana` | `SHIELD 5 · immune Bleed · +1 Stability` | OK |
| Healing Water (Upcast) | `1 AP · 2 mana` | `heal 8 · Cleanse 3 · Adv 1` | OK |
| Aim then Strike | `Aim (Shortbow) · 0 AP · ADV 1 on next Strike`, then `Shortbow · Strike · R8 (1 AP) · Aim ready` | `Aims (Shortbow) — next Strike ADV 1`. Dummy OA from melee opened before the roll confirm | OK |
| Weapon Swap | `Weapon Swap → longsword + shield (free)` | Heavy Sword strike list replaced by Longsword strike | OK |

Engine mana: Bless base 1 mana, bonus INT; upcast 2 mana, bonus 3×INT. Blink upcast 2 mana, more cells, shield base+INT. Barkskin upcast adds Stability. Healing Water upcast 2 mana, bonus 3×INT. Both the base and the upcast button are listed before the spell is spent. Aim arms the next strike and the strike log includes `+1 Aim`, then the flag clears.

Multi-target, manual n=1 (Flurry of Daggers, Barrage, Eye for an Eye, Blink) on Easy 4× Wolf:

| Strike | UI | Result |
| --- | --- | --- |
| Flurry of Daggers | Moved to a cell at distance 2. Primary (8,2), extra (8,3), `Confirm (2 targets)`, one accept. Log `Flurry of Daggers → Ember Wolf 2` and `AoE → Ember Wolf 3` | OK |
| Barrage | Scout kit shortbow. Primary (8,1), extra (8,2), `Confirm (2 targets)`. Log `Barrage → Ember Wolf 1: 11 Physical` and `AoE → Ember Wolf 2 8 dmg`. A wolf Magma Tail OA resolved first because the shot was from melee | OK |

Engine: Flurry 2 AP + 1 stress (AP 3→1, stress 4→3) and both targets in one resolution. Barrage 3 AP + 1 stress (AP 3→0, stress 4→3) the same way. Passing `flurry: true` on the talent strike is the 0 AP follow-up and is rejected with `no-flurry`. The button is the 2 AP talent.

## 4) Rank 0 and a mixed Rank 1 party

| Check | Evidence | Result |
| --- | --- | --- |
| Rank 0 path | Steps are Ranga, Party, Trudność. No Talenty step. Diff `Rank 0 · n=0 · bez talentów · Fighter/Mystic/Acolyte/Primalist`. Pad 0: Easy 27, Medium 30, Hard 34 | OK |
| Class picker | fighter, brawler, assassin, scout, mystic, acolyte, primalist. No Warrior | OK |
| Rank 0 fight | Easy 4× Wolf. Hero buttons for all four. Hint includes Rank 0 | OK |
| Rank 1 mixed | Assassin / Mystic / Primalist / Scout, ladder n=1, not a `train_X` pair. All four on the roster with shadow-dash, blink, healing-water, hidden-bola | OK |

Engine Rank 0: those four classes are eligible and Fighter still has Heavy Sword · Strike with no talents. A manual mix of Fighter, Scout, Mystic, and Primalist equips one talent each and does not insert Warrior.

## 5) Silence, Disarm, specials on live foes

Not Dummy. Lab `Hard — 3W+Alpha` (live wolves and an Alpha).

| Check | Evidence | Result |
| --- | --- | --- |
| Alpha card | Inspect shows **Basics** (Ember Claws, tagged basic) and **Specials**. Piercing Howl is the special (range 2, name howl) | OK |
| Wolf card | **Basics**: Bite and Savage Claws (range 1, so a basic under the engine). **Specials** heading is on the card. Magma Tail is the ranged special | OK |
| Special fires | During the Barrage click, `Ember Wolf 4 declares Magma Tail` and the OA deals 8 Fire. That is a live special with no Disarm and no Silence | OK |
| Silence blocks the same set as Disarm | Engine, Alpha in range: Piercing Howl resolves when clean. With Silence, resolve reason `silenced` and the button is not legal. With Disarm, reason `disarmed`. Basics stay legal | OK |

There is no hero Silence card in the pack. Disarm is Dirty Trick (Assassin, DEX gate) on a live foe. The inspect line reads `special · blocked` when that foe has either status.

## What was not changed

- Stair tables v0.3g (Easy pad 0/2/3/4/5, Medium 0/4/5/6/7, Hard 0/6/7/8/9).
- Designer password (not rotated). The session flag is no longer a password hash.
- Help = reroll the lower d10.

The plain static server logs a 404/501 for `/api/sandbox-log`. That route belongs to `serve.py`. It is not a fight bug.
