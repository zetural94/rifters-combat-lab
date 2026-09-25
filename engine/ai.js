import { listLegal, applyAction, currentActor, actorById } from "./encounter.js";
import { chebyshev, inRange, atAnchor } from "./grid.js";
import { activeKitRef, normalizeKitParts } from "./kits.js";
import { reachableCells } from "./move.js";
import { objectBlockKeys } from "./terrain.js";
import { cubeCellsIncluding, cellKey } from "./terrain.js";
import { canPayMana } from "./feats.js";
import { oaRangeFor } from "./turn.js";
import { cellInToxicCloud, findCloud } from "./clouds.js";
import { listLegalPushDirs } from "./forced.js";
import { isMonsterSpecialAbility } from "./status.js";

/** Bought combat strike ids — kit defaults must not override these picks. */
function isBoughtCombatAbilityId(id) {
  return /forceful-push|grapple|intimidating-shout|lightning-bolt|living-bomb|shadowplay|enfeeble|toxic-cloud|purge-wicked|frost-shock|entangle|wind-gale|flurry-blows|barrage|pin-shot|dirty-trick|expose-weakness|flurry-daggers|heavy-swing|precise-strike|uppercut|hidden-bola|diving-slash|furious-blows/i.test(
    String(id || "")
  );
}

/** Hero counts as Ranged Rifter if active kit has a Strike with RANGE ≥ 5 (bow etc.). */
export function isRangedRifter(hero, state) {
  if (!hero || hero.side !== "hero") return false;
  const parts = normalizeKitParts(activeKitRef(hero));
  if (parts.indexOf("shortbow") >= 0) return true;
  const ids = hero.abilityIds || hero.abilities || [];
  for (const id of ids) {
    const ab = state.abilityById && state.abilityById[id];
    if (!ab || ab.isAttack === false) continue;
    if (ab.weaponId && parts.length && parts.indexOf(ab.weaponId) < 0) continue;
    const r = ab.range != null ? ab.range | 0 : 1;
    if (r >= 5) return true;
  }
  return false;
}

function defaultPattern(actor) {
  if (actor.aiPattern && actor.aiPattern.length) return actor.aiPattern;
  if (actor.monsterType === "boss" || /alpha/i.test(actor.name || "")) {
    return ["aoe", "ranged", "lowestHp"];
  }
  if (actor.monsterType === "brute" || /bear/i.test(actor.name || "")) {
    return ["aggro", "highestHp", "melee"];
  }
  if (actor.monsterType === "horde" || actor.horde) {
    return ["ranged", "aggro"];
  }
  return ["lowestHp", "ranged", "aggro"];
}

/** Sort heroes by pattern keys (first key wins). Mutates copy.
 * lowestHp is soft in lab/MC: prefer low HP, but add a focus penalty so the same
 * hero is not farmed every activation (table MG would retarget). Hard lowest-HP
 * still available via state.focusPolicy === "hard".
 */
export function sortHeroesByPattern(heroes, state, pattern) {
  const list = heroes.slice();
  const keys = pattern || ["lowestHp"];
  const hardFocus = state && state.focusPolicy === "hard";
  list.sort((a, b) => {
    for (const key of keys) {
      if (key === "aoe") continue; // positioning, not target sort
      if (key === "melee") continue;
      if (key === "ranged") {
        const ar = isRangedRifter(a, state) ? 0 : 1;
        const br = isRangedRifter(b, state) ? 0 : 1;
        if (ar !== br) return ar - br;
      } else if (key === "lowestHp") {
        const score = (h) => {
          const hp = h.hp | 0;
          if (hardFocus) return hp;
          // ~half a typical bite: each prior focus this round pushes you down the queue
          return hp + (h.timesTargetedThisRound | 0) * 6;
        };
        const sa = score(a);
        const sb = score(b);
        if (sa !== sb) return sa - sb;
      } else if (key === "highestHp") {
        if ((a.hp | 0) !== (b.hp | 0)) return (b.hp | 0) - (a.hp | 0);
      } else if (key === "aggro") {
        // Soft: prefer whoever has deal more recently — fall back to lowest HP
        if ((a.hp | 0) !== (b.hp | 0)) return (a.hp | 0) - (b.hp | 0);
      }
    }
    return (a.x | 0) - (b.x | 0) || (a.y | 0) - (b.y | 0);
  });
  return list;
}

/** Blast radius for Howl positioning. Not the click / cast range. */
function howlAoeRange(state, howlAction) {
  const ab = howlAction && state.abilityById && state.abilityById[howlAction.abilityId];
  if (ab && ab.aoe && ab.aoe.range != null) return ab.aoe.range | 0;
  if (ab && ab.range != null) return ab.range | 0;
  return 2;
}

function countHowlValue(cell, heroes, aoeR, preferRanged, state) {
  let n = 0;
  let needFear = 0;
  let ranged = 0;
  let proximity = 0;
  for (const h of heroes) {
    const d = chebyshev(cell, h);
    if (d <= aoeR) {
      n += 1;
      if (!(h.st && h.st.fearSource)) needFear += 1;
      if (preferRanged && isRangedRifter(h, state)) ranged += 1;
    } else {
      // Soft pull toward the pack when blast isn't reachable this Move
      proximity += Math.max(0, 12 - d);
    }
  }
  // Maximize bodies in blast first; then unfeared; then ranged; then approach pack
  return n * 1000 + needFear * 100 + ranged * 30 + proximity;
}

/** Move (or stay) to maximize Howl AoE coverage. */
function pickAoeSetup(actor, legal, heroes, state, howlAction) {
  const aoeR = howlAoeRange(state, howlAction);
  const preferRanged = true;
  const here = countHowlValue(actor, heroes, aoeR, preferRanged, state);
  const move = legal.find((a) => a.type === "move");
  let best = { score: here, dest: null, stay: true, covered: 0 };
  for (const h of heroes) {
    if (inRange(actor, h, aoeR)) best.covered += 1;
  }
  if (move && move.cells) {
    for (const c of move.cells) {
      const s = countHowlValue(c, heroes, aoeR, preferRanged, state);
      let covered = 0;
      for (const h of heroes) {
        if (inRange(c, h, aoeR)) covered += 1;
      }
      if (s > best.score || (s === best.score && covered > best.covered)) {
        best = { score: s, dest: c, stay: false, covered };
      }
    }
  }
  return best;
}

function pickMoveToward(actor, legal, targets, state) {
  const move = legal.find((a) => a.type === "move");
  if (!move || !move.cells || !move.cells.length || !targets.length) return null;

  const meleeCells = move.cells.filter((c) =>
    targets.some((t) => inRange(atAnchor(actor, c), t, 1))
  );
  const preferred = targets[0];
  const meleePreferred = preferred
    ? meleeCells.filter((c) => inRange(atAnchor(actor, c), preferred, 1))
    : [];
  const pool = meleePreferred.length
    ? meleePreferred
    : meleeCells.length
      ? meleeCells
      : move.cells;

  const ranked = pool
    .map((c) => {
      const pos = atAnchor(actor, c);
      let d = Infinity;
      for (const t of targets) d = Math.min(d, chebyshev(pos, t));
      const prefD = preferred ? chebyshev(pos, preferred) : d;
      let rangedBonus = 0;
      for (const t of targets) {
        if (isRangedRifter(t, state) && inRange(pos, t, 2)) rangedBonus -= 0.2;
      }
      return {
        c,
        score: d + prefD * 0.01 + rangedBonus + (cellInToxicCloud(c.x, c.y, state) ? 40 : 0),
        melee: targets.some((t) => inRange(pos, t, 1)),
      };
    })
    .sort((a, b) => a.score - b.score);
  if (ranked.length) return { type: "move", dest: ranked[0].c, entersMelee: !!ranked[0].melee };
  return null;
}

/**
 * Enemy policy — uses card.aiPattern when present.
 * Alpha: AoE → Ranged Rifters → Lowest Current HP
 * Wolf: Lowest HP → Ranged → Aggro
 * Bear: Aggro → Highest HP → Melee
 */
export function chooseEnemyAction(state) {
  const actor = currentActor(state);
  if (!actor || actor.side !== "enemy") return { type: "endTurn" };
  // Stun: monsters skip their whole turn.
  if (actor.stunnedSkipTurn) {
    actor.stunnedSkipTurn = false;
    return { type: "endTurn" };
  }

  const legal = listLegal(state);
  const stand = legal.find((a) => a.type === "stand");
  if (stand) return { type: "stand" };

  let heroes = state.actors.filter(
    (a) =>
      a.side === "hero" &&
      !a.dead &&
      (a.hp | 0) > 0 &&
      (!a.stealthed || inRange(actor, a, 2))
  );
  if (!heroes.length) return { type: "endTurn" };

  const pattern = defaultPattern(actor);
  const wantsAoe = pattern.indexOf("aoe") >= 0;
  heroes = sortHeroesByPattern(heroes, state, pattern);
  const preferred = heroes[0];
  const meleeHeroes = heroes.filter((h) => inRange(actor, h, 1));

  const isBear =
    /bear/i.test(actor.name || "") || (actor.tags || []).indexOf("Brute") >= 0;
  const isDummy =
    /training.?dummy/i.test(actor.name || "") ||
    /training-dummy/i.test(actor.id || "");
  const isBoss = actor.monsterType === "boss" || /alpha/i.test(actor.name || "");
  const isSoloBoss = String(actor.bossMode || "").toLowerCase() === "solo";
  const bloodied = (actor.hp | 0) <= Math.floor((actor.hpMax | 0) / 2);

  const strikes = legal.filter(
    (a) => a.type === "strike" && !a.noTargets && a.targets && a.targets.length
  );
  // Howl may be listed with noTargets so we can still AoE-reposition
  const strikeHowl =
    legal.find(
      (a) => a.type === "strike" && /howl/i.test(a.abilityId || a.label || "")
    ) || null;
  const strikeEruption =
    legal.find(
      (a) => a.type === "strike" && /eruption/i.test(a.abilityId || a.label || "")
    ) || null;
  const strikeSlam = strikes.find((a) =>
    /hot-steam|shell-slam|slam/i.test(a.abilityId || a.label || "")
  );
  // Spikes = ranged artillery (provokes OA in melee). Bite = true melee basic.
  const strikeSpikes = strikes.find((a) => /spikes/i.test(a.abilityId || a.label || ""));
  const strikeBite = strikes.find(
    (a) =>
      /bite/i.test(a.abilityId || a.label || "") &&
      !/heavy/i.test(a.abilityId || "") &&
      !/spikes/i.test(a.abilityId || "")
  );
  const strikeClaws = strikes.find((a) => /claw/i.test(a.abilityId || a.label || ""));
  const strikeCharge = strikes.find((a) => /charge/i.test(a.abilityId || a.label || ""));
  const strikeBasicFire = strikes.find(
    (a) => a.abilityId === "burning-bear-basic" || /ember-swipe/i.test(a.abilityId || a.label || "")
  );
  const strikeBasicPhys = strikes.find(
    (a) => a.abilityId === "burning-bear-maul" || /maul/i.test(a.abilityId || a.label || "")
  );
  const strikeDummyBasic = strikes.find((a) =>
    /training-dummy-basic/i.test(a.abilityId || "")
  );
  const strikeDummyCripple = strikes.find((a) =>
    /training-dummy-cripple|crippling|ember.?slap/i.test(a.abilityId || a.label || "")
  );
  const strikeDummyMenace = strikes.find((a) =>
    /training-dummy-menace/i.test(a.abilityId || "")
  );
  const strikeDummyPower = strikes.find((a) =>
    /training-dummy-power-swing/i.test(a.abilityId || "")
  );
  const strikeBasic =
    strikeBasicFire ||
    strikeBasicPhys ||
    strikeDummyBasic ||
    strikes.find((a) => /basic/i.test(a.abilityId || a.label || ""));

  /** Bear dual basic: pick Fire vs Phys by lower target DEF (tie → Fire / Ember theme). */
  function pickBearBasicStrike(targetId) {
    const fire = strikeBasicFire;
    const phys = strikeBasicPhys;
    if (!fire && !phys) return strikeBasic;
    if (!fire) return phys;
    if (!phys) return fire;
    const tgt = actorById(state, targetId);
    if (!tgt) return fire;
    const fireDef =
      tgt.def && tgt.def.Fire != null ? tgt.def.Fire | 0 : 0;
    const physDef =
      tgt.def && tgt.def.Physical != null ? tgt.def.Physical | 0 : 0;
    if (physDef < fireDef) return phys;
    return fire;
  }

  function isMeleeStrike(strike) {
    if (!strike) return false;
    const ab =
      (state.abilityById && state.abilityById[strike.abilityId]) || null;
    const r =
      strike.range != null
        ? strike.range | 0
        : ab && ab.range != null
          ? ab.range | 0
          : 1;
    return r <= 1;
  }

  function pickTarget(strike, preferIds) {
    if (!strike || !strike.targets || !strike.targets.length) return null;
    const pool =
      preferIds && preferIds.length
        ? strike.targets.filter((id) => preferIds.indexOf(id) >= 0)
        : strike.targets;
    const use = pool.length ? pool : strike.targets;
    // Respect pattern order among legal targets
    for (const h of heroes) {
      if (use.indexOf(h.id) >= 0) return h.id;
    }
    return use[0] || null;
  }

  const meleeIds = meleeHeroes.map((h) => h.id);

  // --- Alpha / AoE: Howl to seed Fear; at most once / round; after weak Howl → attack ---
  if (wantsAoe && strikeHowl && (actor.actionLeft | 0) >= 1) {
    const mem = actor.aiMemory || (actor.aiMemory = {});
    const roundMark =
      state.howlUsedInRound && state.howlUsedInRound[actor.id] === (state.round | 0);
    const howlBlocked =
      roundMark ||
      !!mem.howledThisRound ||
      !!mem.skipHowlAfterWeak ||
      !!mem.howledLastActivation;
    const aoeR = howlAoeRange(state, strikeHowl);
    const anyNeedFear = heroes.some((h) => !(h.st && h.st.fearSource));
    if (anyNeedFear && !howlBlocked) {
      const setup = pickAoeSetup(actor, legal, heroes, state, strikeHowl);
      if (!setup.stay && (actor.moveLeft | 0) >= 1 && setup.dest) {
        return { type: "move", dest: setup.dest, entersMelee: false };
      }
      const blastNeedsFear = heroes.some(
        (h) => inRange(actor, h, aoeR) && !(h.st && h.st.fearSource)
      );
      if (blastNeedsFear && !strikeHowl.noTargets) {
        const tid = pickTarget(strikeHowl);
        if (tid) {
          // Mark immediately so a second boss activation in this round cannot Howl again
          // even if the player is still resolving declare→react on the first Howl.
          state.howlUsedInRound = state.howlUsedInRound || {};
          state.howlUsedInRound[actor.id] = state.round | 0;
          mem.howledThisRound = true;
          mem.howledLastActivation = true;
          return { type: "strike", abilityId: strikeHowl.abilityId, targetId: tid };
        }
      }
      // Still hunting unfeared pack — don't burn Action on claws yet if we can still move next
      if ((actor.moveLeft | 0) < 1 && blastNeedsFear) return { type: "endTurn" };
    }
    // All feared / Howl already used this round / weak Howl → fall through to attacks
  }

  // --- Solo Tortoise: Eruption when 2+ heroes in a 2×2 cube (at most once / round).
  // Ranged while adjacent is legal — heroes get OA per standard rules.
  if (wantsAoe && strikeEruption && (actor.actionLeft | 0) >= 1 && !strikeEruption.noTargets) {
    const mem = actor.aiMemory || (actor.aiMemory = {});
    const roundMark =
      state.eruptionUsedInRound && state.eruptionUsedInRound[actor.id] === (state.round | 0);
    if (!roundMark && !mem.eruptedThisRound) {
      const ab =
        (state.abilityById && state.abilityById[strikeEruption.abilityId]) || null;
      const cubeSize = (ab && ab.aoe && ab.aoe.size) || 2;
      const placeR = (strikeEruption.range != null ? strikeEruption.range : 5) | 0;
      let best = null;
      let bestN = 0;
      for (const h of heroes) {
        if (!inRange(actor, h, placeR)) continue;
        const cells = cubeCellsIncluding(h, cubeSize, state.bounds);
        const set = new Set(cells.map((c) => cellKey(c.x, c.y)));
        const n = heroes.filter((x) => set.has(cellKey(x.x, x.y))).length;
        if (n > bestN) {
          bestN = n;
          best = h;
        }
      }
      if (best && bestN >= 2) {
        state.eruptionUsedInRound = state.eruptionUsedInRound || {};
        state.eruptionUsedInRound[actor.id] = state.round | 0;
        mem.eruptedThisRound = true;
        return {
          type: "strike",
          abilityId: strikeEruption.abilityId,
          targetId: best.id,
        };
      }
    }
  }

  // --- Already in melee: prefer melee tools, else artillery (Spikes) — OA is OK ---
  if (meleeHeroes.length) {
    // Training Dummy lab kit priority: Fear → Power Swing (Eye) → Burn → basic.
    if (isDummy && strikeDummyMenace) {
      const tid = pickTarget(strikeDummyMenace, meleeIds);
      const tgt = tid ? actorById(state, tid) : null;
      if (tid && !(tgt && tgt.st && tgt.st.fearSource)) {
        return {
          type: "strike",
          abilityId: strikeDummyMenace.abilityId,
          targetId: tid,
        };
      }
    }
    if (isDummy && strikeDummyPower) {
      const tid = pickTarget(strikeDummyPower, meleeIds);
      if (tid) {
        return {
          type: "strike",
          abilityId: strikeDummyPower.abilityId,
          targetId: tid,
        };
      }
    }
    if (isDummy && strikeDummyCripple) {
      const tid = pickTarget(strikeDummyCripple, meleeIds);
      const tgt = tid ? actorById(state, tid) : null;
      if (tid && !(tgt && tgt.st && (tgt.st.burn | 0) > 0)) {
        return {
          type: "strike",
          abilityId: strikeDummyCripple.abilityId,
          targetId: tid,
        };
      }
    }
    if (isDummy && (strikeDummyBasic || strikeBasic)) {
      const pick = strikeDummyBasic || strikeBasic;
      const tid = pickTarget(pick, meleeIds);
      if (tid) return { type: "strike", abilityId: pick.abilityId, targetId: tid };
    }
    if (isBear && strikeCharge) {
      const tid = pickTarget(strikeCharge, meleeIds);
      if (tid) return { type: "strike", abilityId: strikeCharge.abilityId, targetId: tid };
    }
    // Hot Steam: 1+ adjacent (no OA); legacy Shell Slam: 2+
    if (strikeSlam) {
      const isSteam = /hot-steam/i.test(strikeSlam.abilityId || "");
      const need = isSteam ? 1 : 2;
      if (meleeHeroes.length >= need) {
        const tid = pickTarget(strikeSlam, meleeIds);
        if (tid) return { type: "strike", abilityId: strikeSlam.abilityId, targetId: tid };
      }
    }
    // Solo bosses (and Standards) prefer Bloodied claws; Leader still uses claws as basic
    if (bloodied && strikeClaws && (!isBoss || isSoloBoss)) {
      const tid = pickTarget(strikeClaws, meleeIds);
      if (tid) return { type: "strike", abilityId: strikeClaws.abilityId, targetId: tid };
    }
    if (strikeClaws && isMeleeStrike(strikeClaws)) {
      const tid = pickTarget(strikeClaws, meleeIds);
      if (tid) return { type: "strike", abilityId: strikeClaws.abilityId, targetId: tid };
    }
    if (isBear && strikeBasic) {
      const tid = pickTarget(strikeBasic, meleeIds);
      if (tid) {
        const pick = pickBearBasicStrike(tid) || strikeBasic;
        return { type: "strike", abilityId: pick.abilityId, targetId: tid };
      }
    }
    if (strikeBite && isMeleeStrike(strikeBite)) {
      const tid = pickTarget(strikeBite, meleeIds);
      if (tid) return { type: "strike", abilityId: strikeBite.abilityId, targetId: tid };
    }
    const anyMelee = strikes.find(
      (a) =>
        isMeleeStrike(a) &&
        a.targets.some((id) => meleeIds.indexOf(id) >= 0)
    );
    if (anyMelee) {
      const tid = pickTarget(anyMelee, meleeIds);
      if (tid) return { type: "strike", abilityId: anyMelee.abilityId, targetId: tid };
    }
    // No melee tool left (e.g. Steam spent, not Bloodied) → Spikes anyway; heroes may OA
    if (strikeSpikes) {
      const tid = pickTarget(strikeSpikes);
      if (tid) return { type: "strike", abilityId: strikeSpikes.abilityId, targetId: tid };
    }
    if ((actor.actionLeft | 0) < 1) return { type: "endTurn" };
  }

  // --- Move into melee on preferred (ranged → lowest HP) if Action still available ---
  if ((actor.moveLeft | 0) >= 1 && (actor.actionLeft | 0) >= 1) {
    const mv = pickMoveToward(actor, legal, heroes, state);
    if (mv && mv.entersMelee) return mv;
  }

  // Howl leftover if AoE pattern didn't fire (e.g. already covering)
  if (!meleeHeroes.length && strikeHowl && !wantsAoe) {
    const mem = actor.aiMemory || {};
    const roundMark =
      state.howlUsedInRound && state.howlUsedInRound[actor.id] === (state.round | 0);
    if (
      !(
        roundMark ||
        mem.howledThisRound ||
        mem.skipHowlAfterWeak ||
        mem.howledLastActivation
      )
    ) {
      const needsFear = (strikeHowl.targets || []).some((id) => {
        const t = actorById(state, id);
        return t && !(t.st && t.st.fearSource);
      });
      if (needsFear) {
        const tid = pickTarget(strikeHowl);
        if (tid) {
          state.howlUsedInRound = state.howlUsedInRound || {};
          state.howlUsedInRound[actor.id] = state.round | 0;
          return { type: "strike", abilityId: strikeHowl.abilityId, targetId: tid };
        }
      }
    }
  }

  if (isBear && strikeCharge) {
    const tid = pickTarget(strikeCharge);
    if (tid) return { type: "strike", abilityId: strikeCharge.abilityId, targetId: tid };
  }
  if (bloodied && strikeClaws && !isBoss) {
    const tid = pickTarget(strikeClaws);
    if (tid) return { type: "strike", abilityId: strikeClaws.abilityId, targetId: tid };
  }
  if (strikeClaws) {
    const tid = pickTarget(strikeClaws);
    if (tid) return { type: "strike", abilityId: strikeClaws.abilityId, targetId: tid };
  }
  if (isBear && strikeBasic) {
    const tid = pickTarget(strikeBasic);
    if (tid) {
      const pick = pickBearBasicStrike(tid) || strikeBasic;
      return { type: "strike", abilityId: pick.abilityId, targetId: tid };
    }
  }
  // Artillery / bite at range (safe — not adjacent)
  if (strikeSpikes) {
    const tid = pickTarget(strikeSpikes);
    if (tid) return { type: "strike", abilityId: strikeSpikes.abilityId, targetId: tid };
  }
  if (strikeBite) {
    const tid = pickTarget(strikeBite);
    if (tid) return { type: "strike", abilityId: strikeBite.abilityId, targetId: tid };
  }
  if (strikes.length) {
    const pick = strikes[0];
    const tid = pickTarget(pick);
    if (tid) return { type: "strike", abilityId: pick.abilityId, targetId: tid };
  }

  if ((actor.moveLeft | 0) >= 1) {
    const mv = pickMoveToward(actor, legal, heroes, state);
    if (mv) return mv;
  }

  // --- Chase: no Attack hits anyone this activation → Action = bonus Move (full Speed).
  // Aggro pattern still ranks heroes for the destination; we never skip a legal strike.
  if ((actor.actionLeft | 0) >= 1 && !strikes.length) {
    const chaseFromLegal = legal.find((a) => a.type === "move" && a.chase);
    if (chaseFromLegal && chaseFromLegal.cells && chaseFromLegal.cells.length) {
      const mv = pickMoveToward(actor, [chaseFromLegal], heroes, state);
      if (mv) return { type: "move", dest: mv.dest, chase: true, entersMelee: !!mv.entersMelee };
    } else if ((actor.moveLeft | 0) < 1) {
      // legalActions may not have rebuilt chase yet mid-AI — synthesize cells
      const occ = new Set();
      for (const a of state.actors || []) {
        if (!a || a.dead || a.id === actor.id) continue;
        if ((a.hp | 0) <= 0 && a.side === "enemy") continue;
        occ.add(a.x + "," + a.y);
      }
      for (const k of objectBlockKeys(state.objects)) occ.add(k);
      const spd = Math.max(1, actor.speed | 0);
      const cells = reachableCells(actor, spd, occ, state.bounds || null);
      if (cells.length) {
        const mv = pickMoveToward(
          actor,
          [{ type: "move", cells, chase: true }],
          heroes,
          state
        );
        if (mv) return { type: "move", dest: mv.dest, chase: true, entersMelee: !!mv.entersMelee };
      }
    }
  }

  return { type: "endTurn" };
}


/** Boss / Brute / named elite. */
export function isEliteFoe(f) {
  if (!f) return false;
  if (f.canCrit) return true;
  const t = String(f.monsterType || "").toLowerCase();
  if (t === "boss" || t === "brute") return true;
  return /bear|alpha|boss|brute/i.test(f.name || "");
}

/** True if foe has ≥1 ability Dirty Disarm is worth cutting (Charge / Howl / AoE…). */
export function foeHasCuttableSpecials(state, foe) {
  if (!foe) return false;
  const ids = foe.abilityIds || foe.abilities || [];
  for (const raw of ids) {
    const ab =
      typeof raw === "string"
        ? state && state.abilityById && state.abilityById[raw]
        : raw;
    if (ab && isMonsterSpecialAbility(ab)) return true;
  }
  return false;
}

/**
 * Dirty Trick Disarm gates: T2 DEX≤yours−1, T3 DEX≤yours.
 * "Reasonable chance" = T3 Disarm is possible (foe.DEX ≤ attacker.DEX).
 */
export function dirtyDisarmDexOk(actor, foe) {
  if (!actor || !foe) return false;
  return (foe.dex | 0) <= (actor.dex | 0);
}

/**
 * Dirty when Disarm is useful: cuttable specials + DEX gate, not already Disarmed.
 * coldOpen (Cold Blooded / Expose mark) is a priority boost at call sites — not required.
 * Natural-only melee (no specials) → false (Disarm ≈ worthless).
 */
export function dirtyTrickWorthIt(state, actor, foe) {
  if (!actor || !foe) return false;
  if (foe.st && foe.st.disarm) return false;
  if (!foeHasCuttableSpecials(state, foe)) return false;
  if (!dirtyDisarmDexOk(actor, foe)) return false;
  return true;
}


/** Peelable status burden: stack X, or binary (= 2 cleanse pts). */
export function statusCleanseValue(actor) {
  const st = actor && actor.st;
  if (!st) return 0;
  let v =
    (st.burn | 0) +
    (st.bleed | 0) +
    (st.poison | 0) +
    (st.shock | 0) +
    (st.intimidate | 0) +
    (st.unsteady | 0) +
    (st.slow | 0);
  if (st.fearSource) v += 2;
  if (st.tauntSource) v += 2;
  if (st.blind) v += 2;
  if (st.knockdown) v += 2;
  if (st.stun) v += 2;
  if (st.silence) v += 2;
  if (st.disarm) v += 2;
  return v;
}

/**
 * Control / binary-style statuses (and Shock): peel at turn start while AP is still full (3).
 * Canon: Fear / Silence / Disarm / Blind / … are binary (2 cleanse pts); Shock stacks but
 * plays like “get it off me now” for table AI.
 */
export function wantsSteelControl(actor) {
  const st = actor && actor.st;
  if (!st) return false;
  if (st.fearSource || st.tauntSource) return true;
  if (st.silence || st.disarm || st.blind || st.knockdown || st.stun) return true;
  if ((st.shock | 0) >= 1) return true;
  return false;
}

/**
 * DoT / stack statuses: Steel when any is 3+ (no full-AP requirement).
 */
export function wantsSteelDots(actor) {
  const st = actor && actor.st;
  if (!st) return false;
  return (
    (st.burn | 0) >= 3 ||
    (st.bleed | 0) >= 3 ||
    (st.poison | 0) >= 3 ||
    (st.intimidate | 0) >= 3 ||
    (st.unsteady | 0) >= 3 ||
    (st.slow | 0) >= 3
  );
}

/** @deprecated use wantsSteelControl / wantsSteelDots */
export function wantsSteelCleanse(actor) {
  return wantsSteelControl(actor) || wantsSteelDots(actor);
}

/** Printed Physical DEF (primary armor signal for BREAK / Opening). */
export function foePhysicalDef(f) {
  if (!f || !f.def) return 0;
  if (typeof f.def.Physical === "number") return f.def.Physical | 0;
  return 0;
}

/** High armor: Phys DEF ≥ 4 — BREAK 5 fully covers DEF 4 (bloodied Tortoise) and helps vs DEF 5. */
const HIGH_ARMOR_DEF = 4;

/** Max Push spaces from ability tier extras (gloves T2/T3 etc.). */
function abilityPushSpaces(ability) {
  if (!ability) return 0;
  const tiers = ability.tiers || ability.effects || {};
  let best = 0;
  for (const key of Object.keys(tiers)) {
    const eff = tiers[key];
    if (!eff) continue;
    const extras = Array.isArray(eff.extras) ? eff.extras : eff.extras ? [eff.extras] : [];
    for (const ex of extras) {
      if (ex && ex.id === "push") best = Math.max(best, ex.x | 0);
    }
  }
  return best;
}

/**
 * Look ahead along a push dir: leftover spaces after Stability collide with
 * edge / object / creature? (listLegalPushDirs only flags first-step hits.)
 */
function pushDirCollides(pusher, target, dx, dy, spaces, state) {
  const left = Math.max(0, (spaces | 0) - Math.max(0, target.stability | 0));
  if (left <= 0 || (!dx && !dy)) return false;
  const bounds = state.bounds || null;
  const objs = state.objects || [];
  const size = Math.max(1, target.size | 0 || 1);
  let x = target.x | 0;
  let y = target.y | 0;
  for (let i = 0; i < left; i++) {
    x += dx;
    y += dy;
    if (bounds) {
      if (x < (bounds.minX | 0) || y < (bounds.minY | 0)) return true;
      if (x + size - 1 > (bounds.maxX | 0) || y + size - 1 > (bounds.maxY | 0)) return true;
    }
    for (let oy = 0; oy < size; oy++) {
      for (let ox = 0; ox < size; ox++) {
        const cx = x + ox;
        const cy = y + oy;
        for (const o of objs) {
          if (!o || o.destroyed) continue;
          if ((o.hp != null && (o.hp | 0) <= 0)) continue;
          if ((o.x | 0) === cx && (o.y | 0) === cy) return true;
        }
        for (const a of state.actors || []) {
          if (!a || a === target || a.dead || (a.hp | 0) <= 0) continue;
          const asz = Math.max(1, a.size | 0 || 1);
          if (cx >= (a.x | 0) && cx < (a.x | 0) + asz && cy >= (a.y | 0) && cy < (a.y | 0) + asz) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

/** Prefer a legal push dir that collides (wall / edge / creature) for unpreventable. */
function pickPushDirTowardCollision(pusher, target, spaces, state) {
  if (!pusher || !target || !state) return null;
  const left = Math.max(0, (spaces | 0) - Math.max(0, target.stability | 0));
  if (left <= 0) return null;
  const dirs = listLegalPushDirs(pusher, target, spaces, {
    actors: state.actors,
    objects: state.objects,
    bounds: state.bounds,
  });
  if (!dirs.length) return null;
  let best = null;
  let bestScore = -1;
  for (const d of dirs) {
    const dx = d.dx | 0;
    const dy = d.dy | 0;
    // Skip dirs whose first step lands on the pusher (not a useful slam).
    const nx = (target.x | 0) + dx;
    const ny = (target.y | 0) + dy;
    if (nx === (pusher.x | 0) && ny === (pusher.y | 0)) continue;
    const firstHit = !!(d.hitsTerrain || d.hitsCreature);
    const pathHit = firstHit || pushDirCollides(pusher, target, dx, dy, spaces, state);
    if (!pathHit) continue;
    // Prefer edge/object terrain over creature; cardinals slightly preferred.
    let score = 0;
    if (d.hitsTerrain) score += 6;
    else if (pathHit && !d.hitsCreature) score += 5;
    if (d.hitsCreature) score += 2;
    if (dx === 0 || dy === 0) score += 1;
    // Prefer pushing farther from pusher when scores tie-ish
    const away =
      Math.abs(nx - (pusher.x | 0)) + Math.abs(ny - (pusher.y | 0)) >
      Math.abs((target.x | 0) - (pusher.x | 0)) + Math.abs((target.y | 0) - (pusher.y | 0));
    if (away) score += 2;
    if (score > bestScore) {
      bestScore = score;
      best = { dx, dy };
    }
  }
  return best;
}


function expectedShoveSpaces(actor) {
  return (actor.str | 0) + 3;
}

/**
 * Small Shove heuristic: preferred in R1, Stability < expected push, collision
 * dir exists, tanky Phys DEF or Brawler-on-gloves; skip finishers ≤8 HP.
 */
function considerShoveAction(state, actor, preferred, legal) {
  if (!preferred || !legal) return null;
  if ((preferred.hp | 0) <= 8) return null;
  // Spend Opening buff on a strike, not on Shove.
  if (actor.nextAttack && !actor.nextAttack._needsPick) return null;
  const shove = legal.find(
    (a) =>
      a.type === "shove" &&
      !a.noTargets &&
      a.targets &&
      a.targets.indexOf(preferred.id) >= 0
  );
  if (!shove) return null;
  if (chebyshev(actor, preferred) > 1) return null;
  const spaces = expectedShoveSpaces(actor);
  const stab = preferred.stability | 0;
  if (stab >= spaces) return null;
  const dir = pickPushDirTowardCollision(actor, preferred, spaces, state);
  if (!dir) return null;
  const def = foePhysicalDef(preferred);
  const isBrawler = /brawler/i.test(actor.id || actor.name || "");
  const glovesLegal = legal.some(
    (a) =>
      a.type === "strike" &&
      /gloves/i.test(a.abilityId || a.label || "") &&
      a.targets &&
      a.targets.indexOf(preferred.id) >= 0
  );
  // Gloves T2 Push 2 — if Stability already eats that, Shove (STR+3) may still fish a wall.
  const glovesPushLeft = Math.max(0, 2 - stab);
  const shoveLeft = spaces - stab;
  const tankSlam = def >= HIGH_ARMOR_DEF;
  const brawlerWallFish =
    isBrawler && glovesLegal && shoveLeft > 0 && glovesPushLeft <= 0;
  if (!tankSlam && !brawlerWallFish) return null;
  return { type: "shove", targetId: preferred.id, pushDir: dir };
}


const ELEMENT_PICK_TYPES = [
  "Physical",
  "Fire",
  "Air",
  "Water",
  "Earth",
  "Lightning",
  "Dark",
  "Light",
  "Toxic",
];

function abilityHasTrait(ab, id) {
  return !!(ab && (ab.traits || []).some((t) => t && t.id === id));
}

function extrasFromTier(effect) {
  if (!effect || !effect.extras) return [];
  return Array.isArray(effect.extras) ? effect.extras : [effect.extras];
}

/** Best damage type for elementPick vs foe DEF (lower DEF = better). */
export function pickElementOverride(actor, foe, ability) {
  if (!actor || !foe || !ability) return null;
  if (actor.elementPickedThisTurn) return null;
  if (!abilityHasTrait(ability, "elementPick")) return null;
  let best = ability.dmgType || "Earth";
  let bestDef = 99;
  const def = foe.def || {};
  for (const t of ELEMENT_PICK_TYPES) {
    const d = def[t] != null ? def[t] | 0 : 0;
    if (d < bestDef) {
      bestDef = d;
      best = t;
    }
  }
  return best;
}

function alliesInRange5(atk, actors) {
  const out = [];
  for (const a of actors || []) {
    if (!a || a.side !== atk.side || a === atk || a.dead || (a.hp | 0) <= 0) continue;
    if (chebyshev(atk, a) > 5) continue;
    out.push(a);
  }
  return out;
}

/**
 * Explicit supportPick + supportAllyId for Symbol / Tide (MC parity with sandbox).
 */
export function pickSupportForAbility(actor, state, ability, foe) {
  if (!actor || !ability || !state) return {};
  const tiers = ability.tiers || {};
  const allExtras = [];
  for (const k of ["t1", "t2", "t3"]) {
    for (const ex of extrasFromTier(tiers[k])) {
      if (ex && ex.id) allExtras.push(ex);
    }
  }
  const hasCatch = allExtras.some((e) => e.id === "allyCatchBreath");
  const hasOrCleanse = allExtras.some(
    (e) => e.id === "allyCatchBreath" && e.orCleanse != null
  );
  const hasSlowOr = allExtras.some((e) => e.id === "slowOrAllyCleanse");
  const hasAllyCleanse = allExtras.some((e) => e.id === "allyCleanse");
  if (!hasCatch && !hasSlowOr && !hasAllyCleanse) return {};

  const allies = alliesInRange5(actor, state.actors);
  // Support Catch Breath is expensive (ally Rec) — only when urgently hurt.
  const urgent = allies
    .filter(
      (a) =>
        (a.recoveries | 0) > 0 &&
        ((a.hp | 0) <= Math.floor((a.hpMax | 0) * 0.4) || (a.hp | 0) <= 8)
    )
    .sort((a, b) => (a.hp | 0) - (b.hp | 0));
  const bloodied = allies
    .filter((a) => (a.hp | 0) <= Math.floor((a.hpMax | 0) / 2) && (a.recoveries | 0) > 0)
    .sort((a, b) => (a.hp | 0) - (b.hp | 0));
  const burdened = allies
    .map((a) => ({ a, b: statusCleanseValue(a) }))
    .filter((x) => x.b > 0)
    .sort((x, y) => y.b - x.b);

  if (hasSlowOr) {
    const canSlow =
      foe &&
      (!(foe.st && (foe.st.slow | 0) > 0)) &&
      (foe.dex | 0) <= 1;
    if (canSlow && !urgent.length) {
      return { supportPick: "slow", supportAllyId: null };
    }
    if (burdened.length) {
      return { supportPick: "cleanse", supportAllyId: burdened[0].a.id };
    }
    if (statusCleanseValue(actor) > 0) {
      return { supportPick: "cleanse", supportAllyId: actor.id };
    }
    if (canSlow) return { supportPick: "slow", supportAllyId: null };
    return { supportPick: "cleanse", supportAllyId: actor.id };
  }

  if (hasCatch) {
    if (urgent.length) {
      return { supportPick: "catchBreath", supportAllyId: urgent[0].id };
    }
    if (hasOrCleanse && burdened.length) {
      return { supportPick: "cleanse", supportAllyId: burdened[0].a.id };
    }
    // Mildly hurt + recoveries: still Catch Breath if Cleanse not an option
    if (!hasOrCleanse && bloodied.length) {
      return { supportPick: "catchBreath", supportAllyId: bloodied[0].id };
    }
    // Do not fall through to strike.js AI (would burn Rec on mild chips).
    if (hasOrCleanse || hasCatch) {
      return { supportPick: "skip" };
    }
  }

  if (hasAllyCleanse) {
    if (burdened.length) {
      return { supportPick: "cleanse", supportAllyId: burdened[0].a.id };
    }
    return { supportPick: "cleanse", supportAllyId: actor.id };
  }
  return {};
}

function enrichHeroStrike(state, actor, action) {
  if (!action || action.type !== "strike") return action;
  const ab = state.abilityById && state.abilityById[action.abilityId];
  const foe = actorById(state, action.targetId);
  const support = pickSupportForAbility(actor, state, ab, foe);
  const dmgTypeOverride = pickElementOverride(actor, foe, ab);
  const out = Object.assign({}, action);
  if (support.supportPick) out.supportPick = support.supportPick;
  if (support.supportAllyId) out.supportAllyId = support.supportAllyId;
  if (dmgTypeOverride) out.dmgTypeOverride = dmgTypeOverride;
  // Ranger free Help (2/Rift): attach ally helper so MC AI actually spends the talent.
  // Prefer free ranger helps; do not burn other heroes' reaction AP here.
  if (!out.helpHelperId && ab && ab.isAttack !== false) {
    const helper = (state.actors || []).find(
      (a) =>
        a &&
        a !== actor &&
        a.side === "hero" &&
        !a.dead &&
        (a.hp | 0) > 0 &&
        !a.summon &&
        (a.rangerFreeHelps | 0) > 0
    );
    if (helper) out.helpHelperId = helper.id;
  }
  // Flurry of Blows half-cleave: second melee foe if stress remains after base cost
  if (
    ab &&
    (ab.traits || []).some((t) => t && t.id === "halfCleave") &&
    (actor.stress | 0) >= 2 &&
    foe
  ) {
    const extras = (state.actors || []).filter(
      (a) =>
        a &&
        a !== foe &&
        a.side !== actor.side &&
        !a.dead &&
        (a.hp | 0) > 0 &&
        inRange(actor, a, 1)
    );
    if (extras.length) out.cleaveTargetId = extras[0].id;
  }
  // Push fish: when the strike has Push extras and leftover after Stability,
  // aim into wall/edge/creature for unpreventable collision damage.
  if (ab && foe && !out.pushDir) {
    const pushSpaces = abilityPushSpaces(ab);
    if (pushSpaces > 0) {
      const dir = pickPushDirTowardCollision(actor, foe, pushSpaces, state);
      if (dir) out.pushDir = dir;
    }
  }
  return out;
}

/**
 * Ranged heroes: stay in strike range, prefer not entering melee vs packs/hordes.
 * Melee heroes: unchanged (toward preferred).
 */
function controlRank(f) {
  if (!f) return 9;
  if (f.grappleLock && f.grappleLock.advVsTarget) return 0;
  if (f.st && f.st.restrain) return 0;
  if (f.st && f.st.fearSource) return 1;
  return 2;
}

/** Vigilant: end the turn threatening an OA instead of kiting out of reach. */
function pickVigilantHold(actor, legal, foes, state) {
  const reach = oaRangeFor(actor);
  const preferred = foes[0];
  const threatening = foes.filter((f) => inRange(actor, f, reach));
  const hereCloud = cellInToxicCloud(actor.x, actor.y, state);
  const packed = foes.filter((f) => inRange(actor, f, 1)).length >= 3;
  if (threatening.length && !hereCloud && !packed) return null;

  const move = legal.find((a) => a.type === "move");
  const careful = legal.find((a) => a.type === "carefulStep");
  const cells = [].concat((careful && careful.cells) || [], (move && move.cells) || []);
  if (!cells.length) return null;
  let best = null;
  let bestScore = 1e9;
  const seen = new Set();
  for (const c of cells) {
    const key = (c.x | 0) + "," + (c.y | 0);
    if (seen.has(key)) continue;
    seen.add(key);
    if (cellInToxicCloud(c.x, c.y, state) && !hereCloud) continue;
    const meleeN = foes.filter((f) => inRange(c, f, 1)).length;
    const atReach = preferred && chebyshev(c, preferred) === reach;
    const anyReach = foes.some((f) => {
      const d = chebyshev(c, f);
      return d >= 1 && d <= reach;
    });
    const score =
      meleeN * 8 +
      (atReach ? 0 : anyReach ? 3 : 12) +
      (preferred ? Math.abs(chebyshev(c, preferred) - reach) : 0);
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  if (!best) return null;
  const stayMelee = foes.filter((f) => inRange(actor, f, 1)).length;
  const stayScore =
    (hereCloud ? 80 : 0) +
    stayMelee * 8 +
    (preferred && chebyshev(actor, preferred) === reach ? 0 : threatening.length ? 3 : 12);
  if (bestScore >= stayScore) return null;
  const onCareful =
    careful &&
    careful.cells &&
    careful.cells.some((c) => (c.x | 0) === (best.x | 0) && (c.y | 0) === (best.y | 0));
  if (onCareful) return { type: "carefulStep", dest: best };
  return { type: "move", dest: best };
}

function pickMoveForHero(actor, legal, foes, state) {
  if (actor.vigilant) {
    const reach = oaRangeFor(actor);
    const close = foes.some((f) => chebyshev(actor, f) <= reach + 2);
    if (close || (!actor.pinShot && !actor.barrage)) {
      return pickVigilantHold(actor, legal, foes, state);
    }
  }
  const ranged = isRangedRifter(actor, state);
  if (!ranged) return pickMoveToward(actor, legal, foes, state);

  const preferred = foes[0];
  const move = legal.find((a) => a.type === "move");
  const careful = legal.find((a) => a.type === "carefulStep");
  const abIds = actor.abilityIds || actor.abilities || [];
  let strikeRange = 5;
  for (const id of abIds) {
    const ab = state.abilityById && state.abilityById[id];
    if (!ab || ab.isAttack === false) continue;
    const r = ab.range != null ? ab.range | 0 : 1;
    if (r >= 3) strikeRange = Math.max(strikeRange, r);
  }

  const inMeleeThreat = foes.some((f) => inRange(actor, f, 1));
  const packPressure =
    foes.filter((f) => inRange(actor, f, 3)).length >= 2 ||
    foes.some((f) => f.monsterType === "horde" && inRange(actor, f, 3));

  // Step back out of melee / spike RANGE when pressured
  if ((inMeleeThreat || packPressure) && careful && careful.cells && careful.cells.length) {
    const ranked = careful.cells
      .map((c) => {
        const minD = Math.min(...foes.map((f) => chebyshev(c, f)));
        const prefD = preferred ? chebyshev(c, preferred) : minD;
        const meleeN = foes.filter((f) => inRange(c, f, 1)).length;
        // Prefer distance 3–5 from preferred, zero melee neighbors
        const band =
          prefD >= 3 && prefD <= strikeRange ? 0 : Math.abs(prefD - Math.min(4, strikeRange));
        return {
          c,
          score:
            meleeN * 10 +
            band +
            (strikeRange - Math.min(minD, strikeRange)) * 0.1 +
            (cellInToxicCloud(c.x, c.y, state) ? 30 : 0),
        };
      })
      .sort((a, b) => a.score - b.score);
    if (ranked.length && ranked[0].score < 20) {
      return { type: "carefulStep", dest: ranked[0].c };
    }
  }

  if (!move || !move.cells || !move.cells.length) return null;
  // Approach until preferred is in strike range — do not dive to melee
  const prefD0 = preferred ? chebyshev(actor, preferred) : 99;
  const inOwnCloud = !!(actor.toxicCloud && cellInToxicCloud(actor.x, actor.y, state));
  if (inOwnCloud && move && move.cells && move.cells.length) {
    const outside = move.cells.filter((c) => !cellInToxicCloud(c.x, c.y, state));
    const pool = outside.length ? outside : [];
    if (pool.length) {
      const ranked = pool
        .map((c) => {
          const prefD = preferred ? chebyshev(c, preferred) : 99;
          const inBand = prefD >= 2 && prefD <= strikeRange;
          return { c, score: (inBand ? 0 : 10 + Math.abs(prefD - 4)) + foes.filter((f) => inRange(c, f, 1)).length * 4 };
        })
        .sort((a, b) => a.score - b.score);
      return { type: "move", dest: ranked[0].c };
    }
  }
  if (preferred && prefD0 <= strikeRange) return null;

  const ranked = move.cells
    .map((c) => {
      const prefD = preferred ? chebyshev(c, preferred) : 99;
      const meleeN = foes.filter((f) => inRange(c, f, 1)).length;
      const inBand = prefD >= 2 && prefD <= strikeRange;
      return {
        c,
        score:
          meleeN * 8 +
          (inBand ? prefD * 0.01 : Math.abs(prefD - 4) + 3) +
          (cellInToxicCloud(c.x, c.y, state) ? 30 : 0),
        entersMelee: meleeN > 0,
      };
    })
    .sort((a, b) => a.score - b.score);
  if (!ranked.length) return null;
  return { type: "move", dest: ranked[0].c, entersMelee: !!ranked[0].entersMelee };
}


/**
 * Max RANGE among hero attack abilities (for Blink spell-setup band).
 * Mirrors pickMoveForHero strikeRange default of 5 for ranged kits.
 */
function heroSpellStrikeRange(actor, state) {
  let strikeRange = 5;
  const abIds = actor.abilityIds || actor.abilities || [];
  for (const id of abIds) {
    const ab = state.abilityById && state.abilityById[id];
    if (!ab || ab.isAttack === false) continue;
    const r = ab.range != null ? ab.range | 0 : 1;
    if (r >= 3) strikeRange = Math.max(strikeRange, r);
  }
  return strikeRange;
}

function blinkOccupancy(state, actor) {
  const occ = new Set();
  for (const a of state.actors || []) {
    if (!a || a === actor || a.dead) continue;
    if ((a.hp | 0) <= 0 && a.side === "enemy") continue;
    occ.add((a.x | 0) + "," + (a.y | 0));
  }
  for (const k of objectBlockKeys(state.objects || [])) occ.add(k);
  return occ;
}

/**
 * Blink AI (once/fight): only when needed to
 *  1) leave melee so a ranged cast does not provoke OA, or
 *  2) reposition into spell range / clear band for an optimal cast.
 * Never multi-blink; never spend the last AP (keep 1 for the cast).
 */
function pickBlinkForHero(actor, legal, foes, preferred, state) {
  if (!actor || !actor.hasBlink || actor._blinkUsedThisFight) return null;
  if (!preferred || (actor.ap | 0) < 2 || !canPayMana(actor, 1)) return null;
  if ((actor.attacksThisTurn | 0) !== 0) return null;

  const blink =
    legal.find((a) => a.type === "blink" && a.cells && a.cells.length && !a.upcast) ||
    legal.find((a) => a.type === "blink" && a.cells && a.cells.length);
  if (!blink) return null;

  const occ = blinkOccupancy(state, actor);
  const spellRange = heroSpellStrikeRange(actor, state);
  const inMeleeNow = foes.some((f) => inRange(actor, f, 1));
  const dist = chebyshev(actor, preferred);
  const wantsRanged =
    isRangedRifter(actor, state) ||
    /mystic|acolyte|primalist|scout/i.test(String(actor.id || actor.name || ""));
  const canStrikePreferredNow = legal.some(
    (a) =>
      a.type === "strike" &&
      !a.noTargets &&
      a.targets &&
      a.targets.indexOf(preferred.id) >= 0
  );

  let best = null;
  let bestScore = 1e9;

  for (const c of blink.cells) {
    const key = (c.x | 0) + "," + (c.y | 0);
    if (occ.has(key)) continue;
    const meleeN = foes.filter((f) => inRange(c, f, 1)).length;
    const prefD = chebyshev(c, preferred);
    const inSpellBand = prefD >= 1 && prefD <= spellRange;

    // 1) Anti-OA: leave melee, stay in spell band for a ranged cast
    if (inMeleeNow && wantsRanged && meleeN === 0 && inSpellBand) {
      const score = prefD;
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
      continue;
    }

    // 2) Spell setup: currently out of band (or cannot strike preferred) -> land in band, not melee
    if (meleeN === 0 && inSpellBand && (dist > spellRange || !canStrikePreferredNow)) {
      // Only if blink actually improves vs standing still
      if (prefD >= dist && canStrikePreferredNow) continue;
      const score = 20 + prefD;
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
  }

  if (!best) return null;
  actor._blinkUsedThisFight = true;
  return { type: "blink", dest: best, upcast: !!blink.upcast };
}

/**
 * Shadow Dash AI — Careful Step substitute for Assassin close-to-strike.
 * Use only when it enables a melee attack this turn AND normal MOVE cannot
 * already walk into melee. Do not dash every turn just because dist > 1.
 */
function pickShadowDashForHero(actor, legal, foes, preferred, state) {
  if (!actor || !actor.hasShadowDash || actor.shadowDashUsedThisTurn) return null;
  if (!preferred || (actor.ap | 0) < 2 || (actor.stress | 0) < 1) return null;
  if ((actor.attacksThisTurn | 0) !== 0) return null;

  const dist = chebyshev(actor, preferred);
  if (dist <= 1) return null; // already adjacent — strike, don't dash

  const dash = legal.find((a) => a.type === "shadowDash" && a.cells && a.cells.length);
  if (!dash) return null;

  // Prefer normal MOVE (+ Careful Step) when either already reaches melee
  const move = legal.find((a) => a.type === "move" && a.cells && a.cells.length);
  if (move && move.cells.some((c) => foes.some((f) => inRange(c, f, 1)))) {
    return null;
  }
  const careful = legal.find((a) => a.type === "carefulStep" && a.cells && a.cells.length);
  if (careful && careful.cells.some((c) => foes.some((f) => inRange(c, f, 1)))) {
    return null;
  }

  const occ = blinkOccupancy(state, actor);
  let best = null;
  let bestD = 99;
  for (const c of dash.cells) {
    const key = (c.x | 0) + "," + (c.y | 0);
    if (occ.has(key)) continue;
    // Must enable a melee attack this turn
    if (!foes.some((f) => inRange(c, f, 1))) continue;
    const d = chebyshev(c, preferred);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  // Land in melee (Careful Step substitute = close so we can strike)
  if (!best || bestD > 1) return null;
  return { type: "shadowDash", dest: best };
}

function pickMartialStepDest(actor, cells, foes, preferred) {
  if (!cells || !cells.length) return null;
  const hereMelee = foes.filter((f) => inRange(actor, f, 1)).length;
  const ranked = cells
    .map((c) => {
      const meleeN = foes.filter((f) => inRange(c, f, 1)).length;
      const prefD = preferred ? chebyshev(c, preferred) : 99;
      // Prefer leaving melee, else stay near preferred for next strike
      const leaveBonus = hereMelee > 0 && meleeN < hereMelee ? -5 : 0;
      const stayStrike = preferred && prefD <= 1 ? -2 : Math.abs(prefD - 1);
      return { c, score: meleeN * 4 + stayStrike + leaveBonus };
    })
    .sort((a, b) => a.score - b.score);
  // Skip if best cell isn't better than staying (no cells improve)
  if (!ranked.length) return null;
  const best = ranked[0];
  const stayScore = hereMelee * 4 + (preferred ? Math.abs(chebyshev(actor, preferred) - 1) : 0);
  if (best.score >= stayScore) return null;
  return best.c;
}

/**
 * Hero policy for MC.
 * - table: same combat choices as smart, but callers use a hard round cap (see playFight)
 * - smart / mixKits: kit mix + Catch Breath when bloodied
 *   · Steel control (Fear/Disarm/Silence/Shock/…) at turn start with 3 AP
 *   · Steel DoTs (Burn/Bleed/…) when stack ≥ 3 (any AP)
 *   · Opening vs high DEF
 * - defend1: more Defend reactions
 * All policies finish nearly-dead foes (≤8 HP) before other targeting.
 * Brawler Push is from gloves T2/T3 extras — no separate AI action.
 */
function blastCount(origin, foes, radius, pred) {
  let n = 0;
  for (const f of foes) {
    if (!inRange(origin, f, radius)) continue;
    if (pred && !pred(f)) continue;
    n += 1;
  }
  return n;
}

/** Shadowplay: ally source that fears the most unfeared enemies. Skip a 1-body blast when the pack is larger. */
function pickShadowplayAction(state, actor, legal, foes) {
  const sh =
    legal.find((a) => a.type === "strike" && /shadowplay/i.test(a.abilityId || "") && !a.noTargets) ||
    null;
  if (!sh || !actor.shadowplay || (actor.ap | 0) < 1 || !canPayMana(actor, 1)) return null;
  const range = sh.range != null ? sh.range | 0 : 3;
  const blast = 3;
  const allies = (state.actors || []).filter(
    (a) =>
      a &&
      a.side === "hero" &&
      !a.dead &&
      (a.hp | 0) > 0 &&
      !a.summon &&
      (a === actor || inRange(actor, a, range))
  );
  let best = null;
  let bestScore = -1;
  let bestHits = 0;
  for (const al of allies.length ? allies : [actor]) {
    const hits = blastCount(al, foes, blast);
    const fresh = blastCount(al, foes, blast, (f) => !(f.st && f.st.fearSource));
    const score = fresh * 10 + hits;
    if (fresh > 0 && score > bestScore) {
      bestScore = score;
      best = al;
      bestHits = hits;
    }
  }
  const minHits = foes.length >= 2 ? 2 : 1;
  if (!best || bestHits < minHits) return null;
  const tid = foes
    .filter((f) => inRange(best, f, blast) && !(f.st && f.st.fearSource))
    .sort((a, b) => (a.hp | 0) - (b.hp | 0))[0];
  if (!tid) return null;
  const upcast = canPayMana(actor, 2) && bestHits >= 2;
  return {
    type: "strike",
    abilityId: sh.abilityId,
    targetId: tid.id,
    targets: [tid.id],
    sourceAllyId: best.id,
    upcast,
  };
}

/** Toxic Cloud: center AoE 3 on the enemy cluster, and do not stand in it. */
function pickToxicAction(state, actor, legal, foes) {
  if (!actor.toxicCloud || (actor.ap | 0) < 2 || !canPayMana(actor, 2)) return null;
  const tox = legal.find(
    (a) => a.type === "strike" && /toxic-cloud/i.test(a.abilityId || "") && a.targets && a.targets.length
  );
  if (!tox) return null;
  const existing = findCloud(state, actor.id);
  if (
    existing &&
    blastCount({ x: existing.ax, y: existing.ay }, foes, existing.radius | 0 || 3) >= 1
  ) {
    return null;
  }
  const heroes = (state.actors || []).filter(
    (a) => a && a.side === "hero" && !a.dead && (a.hp | 0) > 0
  );
  let best = null;
  let bestScore = 0;
  for (const f of foes) {
    if (tox.targets.indexOf(f.id) < 0) continue;
    const enemies = blastCount(f, foes, 3);
    const allies = blastCount(f, heroes, 3);
    const score = enemies * 3 - allies * 5;
    if (score > bestScore) {
      bestScore = score;
      best = f;
    }
  }
  // A persistent cloud on one body still ticks all fight. Skip only when allies outweigh the blast.
  if (!best || bestScore <= 0) return null;
  return {
    type: "strike",
    abilityId: tox.abilityId,
    targetId: best.id,
    targets: [best.id],
    upcast: canPayMana(actor, 3),
  };
}

/**
 * Toxic Cloud is Range 4. Symbol/Hex are Range 5, so the caster used to stand
 * one step short and never paint the zone. Step into Range 4 of the best anchor.
 */
function pickToxicApproach(state, actor, legal, foes) {
  if (!actor.toxicCloud || (actor.ap | 0) < 2 || !canPayMana(actor, 2)) return null;
  if ((actor.attacksThisTurn | 0) !== 0) return null;
  const existing = findCloud(state, actor.id);
  if (
    existing &&
    blastCount({ x: existing.ax, y: existing.ay }, foes, existing.radius | 0 || 3) >= 1
  ) {
    return null;
  }
  const heroes = (state.actors || []).filter(
    (a) => a && a.side === "hero" && !a.dead && (a.hp | 0) > 0
  );
  let best = null;
  let bestScore = 0;
  for (const f of foes) {
    const score = blastCount(f, foes, 3) * 3 - blastCount(f, heroes, 3) * 5;
    if (score > bestScore) {
      bestScore = score;
      best = f;
    }
  }
  if (!best || chebyshev(actor, best) <= 4) return null;
  const move = legal.find((a) => a.type === "move");
  const careful = legal.find((a) => a.type === "carefulStep");
  const cells = [].concat((careful && careful.cells) || [], (move && move.cells) || []);
  if (!cells.length) return null;
  let pick = null;
  let pickScore = 1e9;
  const seen = new Set();
  for (const c of cells) {
    const key = (c.x | 0) + "," + (c.y | 0);
    if (seen.has(key)) continue;
    seen.add(key);
    const d = chebyshev(c, best);
    const inside = d <= 3;
    const score = (d <= 4 ? 0 : 20 + d) + (inside ? 8 : 0) + foes.filter((f) => inRange(c, f, 1)).length * 3;
    if (score < pickScore) {
      pickScore = score;
      pick = c;
    }
  }
  if (!pick || chebyshev(pick, best) >= chebyshev(actor, best)) return null;
  const onCareful =
    careful &&
    careful.cells &&
    careful.cells.some((c) => (c.x | 0) === (pick.x | 0) && (c.y | 0) === (pick.y | 0));
  if (onCareful) return { type: "carefulStep", dest: pick };
  return { type: "move", dest: pick };
}

/** Living Bomb: mark the foe most likely to die beside another body. */
function pickLivingBombAction(state, actor, legal, foes) {
  if (!actor.livingBombFeat || (actor.ap | 0) < 2 || !canPayMana(actor, 2)) return null;
  const bomb = legal.find(
    (a) => a.type === "strike" && /living-bomb/i.test(a.abilityId || "") && a.targets && a.targets.length
  );
  if (!bomb) return null;
  const inR = foes.filter((f) => bomb.targets.indexOf(f.id) >= 0 && !f.livingBomb);
  if (!inR.length) return null;
  const withNeighbor = inR.filter((f) => foes.some((o) => o !== f && inRange(f, o, 3)));
  const pool = withNeighbor.length ? withNeighbor : inR;
  pool.sort((a, b) => (a.hp | 0) - (b.hp | 0) || controlRank(a) - controlRank(b));
  return {
    type: "strike",
    abilityId: bomb.abilityId,
    targetId: pool[0].id,
    targets: [pool[0].id],
    upcast: canPayMana(actor, 3),
  };
}

export function chooseHeroAction(state, policy = "smart") {
  const actor = currentActor(state);
  if (!actor || actor.side !== "hero") return { type: "endTurn" };
  const legal = listLegal(state);
  const foes = state.actors.filter((a) => a.side === "enemy" && !a.dead && (a.hp | 0) > 0);
  if (!foes.length) return { type: "endTurn" };

  // Alias: table playbook = smart decisions; honesty comes from MC round cap + p50 report.
  if (policy === "table") policy = "smart";

  foes.sort((a, b) => {
    const finA = (a.hp | 0) <= 8 ? 0 : 1;
    const finB = (b.hp | 0) <= 8 ? 0 : 1;
    if (finA !== finB) return finA - finB;
    const ca = controlRank(a);
    const cb = controlRank(b);
    if (ca !== cb) return ca - cb;
    return (a.hp | 0) - (b.hp | 0);
  });
  const preferred = foes[0];
  const bloodied = (actor.hp | 0) <= Math.floor((actor.hpMax | 0) / 2);
  const urgentHeal = (actor.hp | 0) <= Math.floor((actor.hpMax | 0) * 0.4);
  const pressured = (actor.hp | 0) <= Math.floor((actor.hpMax | 0) * 0.6);
  const mix = policy === "mixKits" || policy === "smart";
  const apMax = Math.max(3, actor.apMax | 0);
  const fullAp = (actor.ap | 0) >= apMax;

  // Martial artist: spend free MOVE 2 safe right after an attack when useful
  if (actor.martialMoveReady && !actor.martialMoveUsedThisTurn) {
    const step = legal.find((a) => a.type === "martialStep");
    if (step && step.cells && step.cells.length) {
      const dest = pickMartialStepDest(actor, step.cells, foes, preferred);
      if (dest) return { type: "martialStep", dest };
    }
    actor.martialMoveReady = false;
  }

  // Vigilant: free MOVE 1 after OA — always take it if any cell exists
  if (actor.vigilantMoveReady) {
    const step = legal.find((a) => a.type === "vigilantStep");
    if (step && step.cells && step.cells.length) {
      const dest =
        pickMartialStepDest(actor, step.cells, foes, preferred) || step.cells[0];
      if (dest) return { type: "vigilantStep", dest };
    }
    actor.vigilantMoveReady = false;
  }

  // System's Bargain: open fight with threshold shift when still full AP
  if (
    (policy === "smart" || policy === "mixKits" || policy === "defend1") &&
    actor.hasSystemsBargain &&
    !actor.systemsBargain &&
    fullAp &&
    (actor.attacksThisTurn | 0) === 0
  ) {
    const barg = legal.find((a) => a.type === "systemsBargain");
    if (barg) return { type: "systemsBargain" };
  }

  // Summon early if no pet yet
  if (
    (policy === "smart" || policy === "mixKits") &&
    (actor.hasSummonWarrior ||
      actor.hasSummonMage ||
      actor.hasSummonArcher ||
      actor.hasSummonElemental) &&
    !(actor.activeSummonId &&
      (state.actors || []).some(
        (a) =>
          a &&
          a.id === actor.activeSummonId &&
          a.summon &&
          !a.dead &&
          (a.hp | 0) > 0
      )) &&
    fullAp &&
    (actor.attacksThisTurn | 0) === 0
  ) {
    const sum = legal.find((a) => a.type === "summon");
    if (sum) return { type: "summon", summonKind: sum.summonKind };
  }

  // Ice Wall: early barrier when 2+ foes. Repeatable if AP and mana remain.
  // Upcast takes the longer wall when 4 mana is payable. Destroy-damage upcast stays a player choice.
  if (
    (policy === "smart" || policy === "mixKits") &&
    actor.hasIceWall &&
    foes.length >= 2 &&
    (actor.attacksThisTurn | 0) === 0
  ) {
    const walls = legal.filter((a) => a.type === "iceWall");
    const wall =
      walls.find((a) => a.upcastMode === "spaces") || walls.find((a) => !a.upcast);
    if (wall) return { type: "iceWall", upcast: !!wall.upcast, upcastMode: wall.upcastMode || null };
  }

  // Combat feats before Spotter/Ask: Pin / Barrage need stress+AP on bow kit
  {
    const earlyStrikes = legal.filter(
      (a) => a.type === "strike" && !a.noTargets && a.targets && a.targets.length
    );
    if (earlyStrikes.length && (actor.attacksThisTurn | 0) === 0 && preferred) {
      // Pin Shot before Barrage as control opener — Barrage was starving Pin on ladder KPI
      if (actor.pinShot && (actor.ap | 0) >= 1 && (actor.stress | 0) >= 1) {
        const pin = earlyStrikes.find((s) => /pin-shot/i.test(s.abilityId || ""));
        const pinFoe = (f) => {
          if (!f || !pin || !pin.targets || pin.targets.indexOf(f.id) < 0) return false;
          const st = f.st || {};
          return !st.knockdown && (st.slow | 0) < 2;
        };
        // Prefer preferred; else any unlocked Pin target (no force-open — Soft-hard risk)
        const tid = pinFoe(preferred)
          ? preferred.id
          : foes.map((f) => (pinFoe(f) ? f.id : null)).find(Boolean);
        if (tid) {
          return enrichHeroStrike(state, actor, {
            type: "strike",
            abilityId: pin.abilityId,
            targetId: tid,
            useAim: !!pin.canAim,
            spendStressAdv: (actor.stress | 0) >= 3,
          });
        }
      }
      if (actor.barrage && (actor.ap | 0) >= 3 && (actor.stress | 0) >= 1) {
        const bar = earlyStrikes.find((s) => /barrage/i.test(s.abilityId || ""));
        if (bar && bar.targets && bar.targets.length >= 2) {
          return enrichHeroStrike(state, actor, {
            type: "strike",
            abilityId: bar.abilityId,
            targetId:
              bar.targets.indexOf(preferred.id) >= 0 ? preferred.id : bar.targets[0],
          });
        }
      }
      if (actor.flurryBlows && (actor.ap | 0) >= 3 && (actor.stress | 0) >= 1) {
        const blows = earlyStrikes.find((s) => /flurry-blows/i.test(s.abilityId || ""));
        if (blows && blows.targets && blows.targets.indexOf(preferred.id) >= 0) {
          return enrichHeroStrike(state, actor, {
            type: "strike",
            abilityId: blows.abilityId,
            targetId: preferred.id,
          });
        }
      }
      // Heavy Swing before Precise when ≥2 foes in melee — otherwise Precise starves AoE
      if (actor.heavySwing && (actor.ap | 0) >= 2 && (actor.stress | 0) >= 1) {
        const swing = earlyStrikes.find((s) => /heavy-swing/i.test(s.abilityId || ""));
        const nearMelee = foes.filter((f) => chebyshev(actor, f) <= 1).length;
        if (
          swing &&
          ((swing.targets && swing.targets.length >= 2) || nearMelee >= 2)
        ) {
          return enrichHeroStrike(state, actor, {
            type: "strike",
            abilityId: swing.abilityId,
            targetId:
              swing.targets && swing.targets.indexOf(preferred.id) >= 0
                ? preferred.id
                : swing.targets[0],
            spendStressAdv: (actor.stress | 0) >= 2,
          });
        }
      }
      // Precise before Forceful — otherwise Push starves the 2 AP feat
      if (actor.preciseStrike && (actor.ap | 0) >= 2) {
        const precise = earlyStrikes.find((s) => /precise-strike/i.test(s.abilityId || ""));
        if (precise && precise.targets && precise.targets.indexOf(preferred.id) >= 0) {
          const wantPush =
            actor.forcefulPush &&
            (actor.stress | 0) >= 1 &&
            !(actor.forcefulUsedThisFight | 0) &&
            (isEliteFoe(preferred) || foes.length >= 3);
          if (!wantPush) {
            return enrichHeroStrike(state, actor, {
              type: "strike",
              abilityId: precise.abilityId,
              targetId: preferred.id,
            });
          }
        }
      }
      if (actor.forcefulPush && (actor.ap | 0) >= 2 && (actor.stress | 0) >= 1) {
        const push = earlyStrikes.find((s) => /forceful-push/i.test(s.abilityId || ""));
        if (push && push.targets && push.targets.indexOf(preferred.id) >= 0) {
          actor.forcefulUsedThisFight = 1;
          return enrichHeroStrike(state, actor, {
            type: "strike",
            abilityId: push.abilityId,
            targetId: preferred.id,
          });
        }
      }
      if (
        actor.intimidatingShout &&
        (actor.ap | 0) >= 1 &&
        (actor.stress | 0) >= 1 &&
        foes.length >= 2
      ) {
        const shout =
          earlyStrikes.find((s) => /intimidating-shout/i.test(s.abilityId || "")) ||
          legal.find(
            (a) =>
              a.type === "strike" &&
              /intimidating-shout/i.test(a.abilityId || "") &&
              a.targets &&
              a.targets.length >= 1
          );
        if (shout && shout.targets && shout.targets.length >= 1) {
          return enrichHeroStrike(state, actor, {
            type: "strike",
            abilityId: shout.abilityId,
            targetId: shout.targets[0],
          });
        }
      }
      if (actor.grapple && (actor.ap | 0) >= 2 && (actor.stress | 0) >= 1) {
        const gr = earlyStrikes.find((s) => /grapple/i.test(s.abilityId || ""));
        if (
          gr &&
          gr.targets &&
          gr.targets.indexOf(preferred.id) >= 0 &&
          !(preferred.st && preferred.st.restrain)
        ) {
          return enrichHeroStrike(state, actor, {
            type: "strike",
            abilityId: gr.abilityId,
            targetId: preferred.id,
          });
        }
      }
      // Expose Weakness before Dirty vs DEF≥2 / elite — not on trash (glass mix Dirty floor)
      if (
        actor.exposeWeakness &&
        (actor.ap | 0) >= 2 &&
        (actor.stress | 0) >= 1
      ) {
        const ex = earlyStrikes.find((s) => /expose-weakness/i.test(s.abilityId || ""));
        const isMarked = (f) =>
          f && f.vulnerable && Object.keys(f.vulnerable).some((k) => (f.vulnerable[k] | 0) > 0);
        const exWorth = (f) => {
          if (!f || !ex || !ex.targets || ex.targets.indexOf(f.id) < 0 || isMarked(f)) return false;
          const d = f.def && f.def.Physical != null ? f.def.Physical | 0 : 0;
          return d >= 2 || isEliteFoe(f);
        };
        const tid = exWorth(preferred)
          ? preferred.id
          : foes.map((f) => (exWorth(f) ? f.id : null)).find(Boolean);
        if (tid) {
          actor.exposeOpenedThisFight = 1;
          return enrichHeroStrike(state, actor, {
            type: "strike",
            abilityId: ex.abilityId,
            targetId: tid,
          });
        }
      }
      if (actor.dirtyTrick && (actor.ap | 0) >= 2) {
        const pDef =
          preferred.def && preferred.def.Physical != null ? preferred.def.Physical | 0 : 0;
        const dirty = earlyStrikes.find((s) => /dirty-trick/i.test(s.abilityId || ""));
        const isMarked = (f) =>
          f && f.vulnerable && Object.keys(f.vulnerable).some((k) => (f.vulnerable[k] | 0) > 0);
        // Cuttable = has specials worth Disarm + DEX gate chance + not already Disarmed.
        // coldOpen (Cold Blooded trash / Expose mark) boosts target priority only.
        const cuttableInRange = (f) =>
          !!(
            f &&
            dirty &&
            dirty.targets &&
            dirty.targets.indexOf(f.id) >= 0 &&
            dirtyTrickWorthIt(state, actor, f)
          );
        const markedCuttable =
          dirty && dirty.targets
            ? foes.find((f) => isMarked(f) && cuttableInRange(f))
            : null;
        const anyCuttable =
          dirty && dirty.targets ? foes.find((f) => cuttableInRange(f)) : null;
        const marked = isMarked(preferred) || !!markedCuttable;
        const coldOpen =
          !(preferred.st && preferred.st.disarm) &&
          ((actor.coldBlooded &&
            (actor.attacksThisTurn | 0) === 0 &&
            pDef < 3 &&
            !isEliteFoe(preferred)) ||
            marked);
        const wantDirty = !!(cuttableInRange(preferred) || markedCuttable || anyCuttable);
        // Save for Expose vs elites only when Dirty is NOT worth it (no specials / DEX fail).
        const saveForExpose =
          !wantDirty &&
          !coldOpen &&
          !(actor.dirtyOpenedThisFight | 0) &&
          actor.exposeWeakness &&
          (actor.stress | 0) >= 1 &&
          isEliteFoe(preferred);
        if (!saveForExpose && wantDirty && dirty && dirty.targets) {
          // Priority boost: Expose-marked / coldOpen cuttable first, then preferred, then any.
          let tid = null;
          if (markedCuttable) tid = markedCuttable.id;
          else if (coldOpen && cuttableInRange(preferred)) tid = preferred.id;
          else if (cuttableInRange(preferred)) tid = preferred.id;
          else if (anyCuttable) tid = anyCuttable.id;
          if (tid) {
            actor.dirtyOpenedThisFight = 1;
            return enrichHeroStrike(state, actor, {
              type: "strike",
              abilityId: dirty.abilityId,
              targetId: tid,
            });
          }
        }
      }
    }
  }

  // Spotter: Mark preferred early (Pin/Barrage already tried above)
  if (
    (policy === "smart" || policy === "mixKits" || policy === "defend1") &&
    actor.hasSpotter &&
    preferred &&
    (actor.ap | 0) >= 1 &&
    (actor.stress | 0) >= 1 &&
    (actor.attacksThisTurn | 0) === 0
  ) {
    const markAlive =
      actor.spotterMarkId &&
      foes.some((f) => f.id === actor.spotterMarkId && !f.dead && (f.hp | 0) > 0);
    if (!markAlive || actor.spotterMarkId !== preferred.id) {
      const mark = legal.find(
        (a) =>
          a.type === "spotterMark" &&
          a.targets &&
          a.targets.indexOf(preferred.id) >= 0
      );
      if (mark) return { type: "spotterMark", targetId: preferred.id };
    }
  }

  // Hunter's Knowledge: Ask once — don't burn 2 AP when Barrage/Pin currently legal
  if (
    (policy === "smart" || policy === "mixKits") &&
    actor.huntersKnowledge &&
    preferred &&
    !actor.huntersMarkId &&
    (actor.attacksThisTurn | 0) === 0 &&
    (actor.ap | 0) >= 2
  ) {
    const pinOrBarLegal = legal.some(
      (a) =>
        a.type === "strike" &&
        a.targets &&
        a.targets.length &&
        ((actor.barrage &&
          (actor.ap | 0) >= 3 &&
          (actor.stress | 0) >= 1 &&
          /barrage/i.test(a.abilityId || "") &&
          a.targets.length >= 2) ||
          (actor.pinShot &&
            (actor.stress | 0) >= 1 &&
            /pin-shot/i.test(a.abilityId || "") &&
            a.targets.indexOf(preferred.id) >= 0))
    );
    if (!pinOrBarLegal) {
    const ask = legal.find((a) => a.type === "askQuestion");
    if (ask) return { type: "askQuestion", targetId: preferred.id };
    }
  }

  // Feral Invocation: open before mana combat burns the turn
  if (
    (policy === "smart" || policy === "mixKits") &&
    actor.hasFeralInvocation &&
    !actor.feralActive &&
    (actor.ap | 0) >= 1 &&
    (actor.stress | 0) >= 2 &&
    (actor.attacksThisTurn | 0) === 0
  ) {
    const fi = legal.find((a) => a.type === "feralInvocation");
    if (fi) return { type: "feralInvocation" };
  }

  // Enhance Weapon: open fight before mana DPS; type = foe lowest DEF
  if (
    (policy === "smart" || policy === "mixKits") &&
    actor.hasEnhanceWeapon &&
    !actor.enhanceWeaponBonus &&
    fullAp &&
    (actor.attacksThisTurn | 0) === 0
  ) {
    const ew = legal.find((a) => a.type === "enhanceWeapon");
    if (ew) {
      const foe = preferred || foes[0];
      const dmgType = foe ? pickElementOverride(
        Object.assign({}, actor, { elementPickedThisTurn: false }),
        foe,
        { traits: [{ id: "elementPick" }], dmgType: "Physical" }
      ) : null;
      // Prefer upcast when mana allows so whole weapon uses the chosen type
      const up = legal.find((a) => a.type === "enhanceWeapon" && a.upcast);
      if (up && dmgType) return { type: "enhanceWeapon", upcast: true, dmgType };
      return dmgType
        ? { type: "enhanceWeapon", dmgType }
        : { type: "enhanceWeapon" };
    }
  }

  // Barkskin before Frost only when already ≤50% or adjacent threat
  if (
    (policy === "smart" || policy === "mixKits") &&
    actor.hasBarkskin &&
    (actor.ap | 0) >= 2 &&
    (actor.attacksThisTurn | 0) === 0 &&
    canPayMana(actor, 1) &&
    ((actor.hp | 0) <= Math.floor((actor.hpMax | 0) * 0.5) ||
      foes.some((f) => inRange(actor, f, 1)))
  ) {
    const bk = legal.find((a) => a.type === "barkskin");
    if (bk) return { type: "barkskin", targetId: actor.id };
  }

  // Blink (once/fight): anti-OA reposition or spell-setup only — see pickBlinkForHero
  if (policy === "smart" || policy === "mixKits") {
    const blinkAct = pickBlinkForHero(actor, legal, foes, preferred, state);
    if (blinkAct) return blinkAct;
  }

  // Healing Water before mana DPS when bloodied (≤50%) — leave mana for Frost/Gale otherwise
  if (
    (policy === "smart" || policy === "mixKits") &&
    actor.hasHealingWater &&
    (actor.ap | 0) >= 1 &&
    canPayMana(actor, 1)
  ) {
    const hw = legal.find((a) => a.type === "healingWater");
    if (hw && hw.targets && hw.targets.length) {
      const hurt = (state.actors || []).find(
        (a) =>
          a.side === "hero" &&
          !a.dead &&
          (a.hp | 0) > 0 &&
          (a.recoveries | 0) >= 1 &&
          (a.hp | 0) <= Math.floor((a.hpMax | 0) * 0.5) &&
          hw.targets.indexOf(a.id) >= 0
      );
      if (hurt) return { type: "healingWater", targetId: hurt.id };
    }
  }

  // Walk into Toxic Cloud range before Symbol/Hex spend the turn one step short.
  if (policy === "smart" || policy === "mixKits" || policy === "defend1") {
    const toxStep = pickToxicApproach(state, actor, legal, foes);
    if (toxStep) return toxStep;
  }

  // Bought mana combat feats before Magic Shield / Bless burn the pool
  {
    const earlyMana = legal.filter(
      (a) => a.type === "strike" && !a.noTargets && a.targets && a.targets.length
    );
    if (earlyMana.length && (actor.attacksThisTurn | 0) === 0 && preferred) {
      {
        const bombAct = pickLivingBombAction(state, actor, legal, foes);
        if (bombAct) return enrichHeroStrike(state, actor, bombAct);
      }
      if (actor.lightningBolt && (actor.ap | 0) >= 2 && canPayMana(actor, 1)) {
        const bolt = earlyMana.find((s) => /lightning-bolt/i.test(s.abilityId || ""));
        if (bolt && bolt.targets && bolt.targets.indexOf(preferred.id) >= 0) {
          return enrichHeroStrike(state, actor, {
            type: "strike",
            abilityId: bolt.abilityId,
            targetId: preferred.id,
          });
        }
      }
      {
        const shAct = pickShadowplayAction(state, actor, legal, foes);
        if (shAct) return enrichHeroStrike(state, actor, shAct);
      }
      if (actor.enfeeble && (actor.ap | 0) >= 1 && canPayMana(actor, 1)) {
        const enf = earlyMana.find((s) => /enfeeble/i.test(s.abilityId || ""));
        if (enf && enf.targets && enf.targets.length >= 2) {
          return enrichHeroStrike(state, actor, {
            type: "strike",
            abilityId: enf.abilityId,
            targetId: enf.targets[0],
          });
        }
      }
      if (actor.purgeWicked && (actor.ap | 0) >= 2 && canPayMana(actor, 1)) {
        const purge = earlyMana.find((s) => /purge-wicked/i.test(s.abilityId || ""));
        if (purge && purge.targets && purge.targets.indexOf(preferred.id) >= 0) {
          return enrichHeroStrike(state, actor, {
            type: "strike",
            abilityId: purge.abilityId,
            targetId: preferred.id,
          });
        }
      }
      // Gale first on big packs; Entangle on ≥2 (before Toxic/Frost eat mana)
      if (
        actor.windGale &&
        (actor.ap | 0) >= 2 &&
        canPayMana(actor, 2) &&
        foes.length >= 3
      ) {
        const gale = earlyMana.find((s) => /wind-gale/i.test(s.abilityId || ""));
        if (gale && gale.targets && gale.targets.length >= 1) {
          return enrichHeroStrike(state, actor, {
            type: "strike",
            abilityId: gale.abilityId,
            targetId:
              gale.targets.indexOf(preferred.id) >= 0 ? preferred.id : gale.targets[0],
          });
        }
      }
      if (
        actor.entangle &&
        (actor.ap | 0) >= 2 &&
        canPayMana(actor, 2) &&
        foes.length >= 2
      ) {
        const ent = earlyMana.find((s) => /entangle/i.test(s.abilityId || ""));
        if (ent && ent.targets && ent.targets.length >= 1) {
          return enrichHeroStrike(state, actor, {
            type: "strike",
            abilityId: ent.abilityId,
            targetId:
              ent.targets.indexOf(preferred.id) >= 0 ? preferred.id : ent.targets[0],
          });
        }
      }
      {
        const toxAct = pickToxicAction(state, actor, legal, foes);
        if (toxAct) return enrichHeroStrike(state, actor, toxAct);
      }
      if (actor.frostShock && (actor.ap | 0) >= 1 && canPayMana(actor, 1)) {
        const frost = earlyMana.find((s) => /frost-shock/i.test(s.abilityId || ""));
        if (frost && frost.targets && frost.targets.indexOf(preferred.id) >= 0) {
          // Prefer Entangle/Gale vs packs when mana allows
          const pack = foes.length >= 2;
          if (
            !(
              pack &&
              actor.entangle &&
              (actor.ap | 0) >= 2 &&
              canPayMana(actor, 2)
            ) &&
            !(
              pack &&
              actor.windGale &&
              (actor.ap | 0) >= 2 &&
              canPayMana(actor, 2)
            )
          ) {
            return enrichHeroStrike(state, actor, {
              type: "strike",
              abilityId: frost.abilityId,
              targetId: preferred.id,
            });
          }
        }
      }
      if (
        actor.entangle &&
        (actor.ap | 0) >= 2 &&
        canPayMana(actor, 2) &&
        !(preferred.st && preferred.st.restrain)
      ) {
        const ent = earlyMana.find((s) => /entangle/i.test(s.abilityId || ""));
        if (ent && ent.targets && ent.targets.length >= 1) {
          return enrichHeroStrike(state, actor, {
            type: "strike",
            abilityId: ent.abilityId,
            targetId:
              ent.targets.indexOf(preferred.id) >= 0 ? preferred.id : ent.targets[0],
          });
        }
      }
      if (actor.windGale && (actor.ap | 0) >= 2 && canPayMana(actor, 2) && foes.length >= 2) {
        const gale = earlyMana.find((s) => /wind-gale/i.test(s.abilityId || ""));
        if (gale && gale.targets && gale.targets.length >= 1) {
          return enrichHeroStrike(state, actor, {
            type: "strike",
            abilityId: gale.abilityId,
            targetId:
              gale.targets.indexOf(preferred.id) >= 0 ? preferred.id : gale.targets[0],
          });
        }
      }
      if (actor.frostShock && (actor.ap | 0) >= 1 && canPayMana(actor, 1)) {
        const frost = earlyMana.find((s) => /frost-shock/i.test(s.abilityId || ""));
        if (frost && frost.targets && frost.targets.indexOf(preferred.id) >= 0) {
          return enrichHeroStrike(state, actor, {
            type: "strike",
            abilityId: frost.abilityId,
            targetId: preferred.id,
          });
        }
      }
    }
  }

  // Magic Shield: open or when bloodied (bloodied ignores combat-mana skip)
  if (
    (policy === "smart" || policy === "mixKits") &&
    actor.hasMagicShield &&
    !actor.magicShieldUsedThisTurn &&
    (actor.attacksThisTurn | 0) === 0
  ) {
    const sh = legal.find((a) => a.type === "magicShield");
    if (sh) {
      const bloodied = (state.actors || []).find(
        (a) =>
          a.side === "hero" &&
          !a.dead &&
          (a.hp | 0) > 0 &&
          (a.hp | 0) <= Math.floor((a.hpMax | 0) / 2) &&
          sh.targets &&
          sh.targets.indexOf(a.id) >= 0
      );
      const combatArmed =
        (actor.lightningBolt && canPayMana(actor, 1) && (actor.ap | 0) >= 2) ||
        (actor.livingBombFeat && canPayMana(actor, 2) && (actor.ap | 0) >= 2);
      if (bloodied || !combatArmed) {
        return { type: "magicShield", targetId: (bloodied && bloodied.id) || actor.id };
      }
    }
  }

  // Bless: bloodied/low ally WITH Recovery (heal requires Rec spend)
  if (
    (policy === "smart" || policy === "mixKits") &&
    actor.hasBless &&
    !actor.blessUsedThisTurn &&
    (actor.attacksThisTurn | 0) === 0
  ) {
    const bl = legal.find((a) => a.type === "bless");
    if (bl && bl.targets && bl.targets.length) {
      const needy = (state.actors || [])
        .filter(
          (a) =>
            a.side === "hero" &&
            !a.dead &&
            (a.hp | 0) > 0 &&
            bl.targets.indexOf(a.id) >= 0 &&
            (a.recoveries | 0) >= 1 &&
            ((a.hp | 0) <= Math.floor((a.hpMax | 0) / 2) ||
              (a.hp | 0) <= Math.floor((a.hpMax | 0) * 0.4))
        )
        .sort((a, b) => (a.hp | 0) - (b.hp | 0));
      const bloodied = needy[0];
      if (bloodied) {
        return { type: "bless", targetId: bloodied.id, spendRecovery: true };
      }
    }
  }

  // Barkskin late fallback removed — handled before mana combat
  if (false && actor.hasBarkskin) {
    const bk = legal.find((a) => a.type === "barkskin");
    if (bk) return { type: "barkskin", targetId: actor.id };
  }

  // Stealth: free 0 AP + 1 stress · 1/round · threat-gated (no idle spam)
  if (
    (policy === "smart" || policy === "mixKits") &&
    actor.hasStealth &&
    !actor.stealthed &&
    !actor.stealthUsedThisRound &&
    (actor.stress | 0) >= 1 &&
    (actor.attacksThisTurn | 0) === 0
  ) {
    const nearMelee = foes.some((f) => inRange(actor, f, 1));
    const rangedThreat = foes.some(
      (f) => !inRange(actor, f, 2) && inRange(actor, f, 8)
    );
    const closePressure = foes.some((f) => inRange(actor, f, 3));
    const approachCrit =
      preferred &&
      chebyshev(actor, preferred) >= 2 &&
      !nearMelee;
    // Prefer hide when threatened or when it enables safer Crit approach; skip if no foes nearby.
    const anyThreat = rangedThreat || closePressure || approachCrit;
    if (anyThreat && (rangedThreat || closePressure || approachCrit)) {
      const st = legal.find((a) => a.type === "stealth");
      if (st) return { type: "stealth" };
    }
  }

  // Blink late path: same once/fight helper (no-ops if already used / not needed)
  if (policy === "smart" || policy === "mixKits") {
    const blinkAct = pickBlinkForHero(actor, legal, foes, preferred, state);
    if (blinkAct) return blinkAct;
  }

  // Guard: early when pressured / bloodied
  if (
    (policy === "smart" || policy === "mixKits" || policy === "defend1") &&
    actor.hasGuard &&
    !actor.guardUp &&
    (actor.stress | 0) >= 1 &&
    (actor.attacksThisTurn | 0) === 0 &&
    ((actor.hp | 0) <= Math.floor((actor.hpMax | 0) * 0.6) || foes.some((f) => inRange(actor, f, 1)))
  ) {
    const g = legal.find((a) => a.type === "guard");
    if (g) return { type: "guard" };
  }

  // Shadow Dash: Careful Step substitute — only when it enables a melee attack
  if (policy === "smart" || policy === "mixKits") {
    const dashAct = pickShadowDashForHero(actor, legal, foes, preferred, state);
    if (dashAct) return dashAct;
  }

  if (mix && (actor.kitSwapsThisTurn | 0) === 0 && (actor.attacksThisTurn | 0) === 0) {
    const swap = pickKitSwap(actor, legal, { bloodied, preferred, foes, state });
    if (swap) return swap;
  }

  const stand = legal.find((a) => a.type === "stand");
  if (stand) return { type: "stand" };

  // Steel · control statuses: only at turn start (still 3 AP, no attack yet).
  if (
    (policy === "smart" || policy === "mixKits" || policy === "defend1") &&
    (actor.attacksThisTurn | 0) === 0 &&
    fullAp &&
    wantsSteelControl(actor)
  ) {
    const steel = legal.find((a) => a.type === "steelYourself");
    if (steel) return { type: "steelYourself", autoPick: true };
  }

  // Steel · DoTs: Burn/Bleed/… at 3+ stacks — any remaining AP.
  if (
    (policy === "smart" || policy === "mixKits" || policy === "defend1") &&
    (actor.attacksThisTurn | 0) === 0 &&
    (actor.ap | 0) >= 1 &&
    wantsSteelDots(actor)
  ) {
    const steel = legal.find((a) => a.type === "steelYourself");
    if (steel) return { type: "steelYourself", autoPick: true };
  }

  // Early CB only when urgently hurt (≤40%); mild bloodied waits until end of actions.
  // Prefer Healing Water over CB when the feat is available.
  if (
    (policy === "smart" || policy === "defend1" || policy === "mixKits") &&
    urgentHeal &&
    (actor.recoveries | 0) > 0 &&
    (actor.attacksThisTurn | 0) === 0 &&
    !(actor.hasHealingWater && canPayMana(actor, 1) && (actor.ap | 0) >= 1)
  ) {
    const cb = legal.find((a) => a.type === "catchBreath");
    if (cb) return { type: "catchBreath" };
  }

  if (policy === "defend1" && pressured && !actor.defendUp) {
    const def = legal.find((a) => a.type === "defend");
    if (def && (actor.attacksThisTurn | 0) === 0) return { type: "defend" };
  }

  // Opening BREAK 5 before striking high-DEF foes (Phys DEF≥4 — bloodied Tortoise / Alpha).
  // Max 1 Opening / turn; skip finishers ≤8 HP.
  // NB: resolveCreateOpening() is a self-buff (BREAK 5 + adv/crit on the next
  // attack) with no target of its own. The original check required the
  // party's globally-lowest-HP "preferred" target to itself be the high-DEF
  // foe, which meant it could only ever fire once every other (lower-HP,
  // lower-DEF) enemy was already dead — starving it far below its usage
  // floor. Fix: also allow it when this actor's real attack this turn won't
  // reach the party's preferred target anyway (e.g. a Fighter stuck adjacent
  // to the Alpha while the rest of the party is still chewing through
  // wolves) — the buff is only worth spending if a high-DEF foe is actually
  // what this actor is about to hit, so we don't Open just because one is
  // somewhere on the board.
  if (
    (policy === "smart" || policy === "mixKits") &&
    (actor.attacksThisTurn | 0) === 0 &&
    !(actor.openingUsedThisTurn) &&
    (actor.ap | 0) >= 2 &&
    !(actor.nextAttack && !actor.nextAttack._needsPick)
  ) {
    const canReach = (f) =>
      legal.some(
        (a) => a.type === "strike" && !a.noTargets && a.targets && a.targets.indexOf(f.id) >= 0
      );
    const preferredReachable = !!(preferred && canReach(preferred));
    const openingTarget = foes.find(
      (f) =>
        (f.hp | 0) > 8 &&
        foePhysicalDef(f) >= HIGH_ARMOR_DEF &&
        (f.id === (preferred && preferred.id) || !preferredReachable) &&
        canReach(f)
    );
    if (openingTarget) {
      const opening = legal.find((a) => a.type === "createOpening");
      if (opening) return { type: "createOpening", autoPick: true };
    }
  }

  if (
    (policy === "smart" || policy === "mixKits") &&
    (actor.attacksThisTurn | 0) === 0 &&
    !(actor.st && actor.st.cannotBeCrit) &&
    (actor.ap | 0) >= 1
  ) {
    const eliteThreat = foes.some((f) => isEliteFoe(f));
    if (
      eliteThreat &&
      ((actor.hp | 0) <= Math.floor((actor.hpMax | 0) * 0.7) ||
        foes.some((f) => {
          const bb = (f.hp | 0) <= Math.floor((f.hpMax | 0) / 2);
          return bb && isEliteFoe(f);
        }))
    ) {
      const steel = legal.find((a) => a.type === "steelYourself");
      if (steel) return { type: "steelYourself", autoPick: true };
    }
  }

  // Shove → wall/creature when leftover push after Stability (tanks / Brawler gloves).
  // Runs after Opening/Steel so we do not skip BREAK buff consumption.
  if (policy === "smart" || policy === "mixKits") {
    const shoveAct = considerShoveAction(state, actor, preferred, legal);
    if (shoveAct) return shoveAct;
  }

  const strikes = legal.filter(
    (a) => a.type === "strike" && !a.noTargets && a.targets && a.targets.length
  );
  // Full-AP bursts before kit fluff: Flurry of Blows / Barrage while still 3 AP
  if (strikes.length && (actor.attacksThisTurn | 0) === 0) {
    if (actor.flurryBlows && (actor.ap | 0) >= 3 && (actor.stress | 0) >= 1) {
      const blows = strikes.find((s) => /flurry-blows/i.test(s.abilityId || ""));
      if (blows && blows.targets && blows.targets.indexOf(preferred.id) >= 0) {
        return enrichHeroStrike(state, actor, {
          type: "strike",
          abilityId: blows.abilityId,
          targetId: preferred.id,
        });
      }
    }
    if (actor.pinShot && (actor.ap | 0) >= 1 && (actor.stress | 0) >= 1) {
      const pin = strikes.find((s) => /pin-shot/i.test(s.abilityId || ""));
      const pinFoe = (f) => {
        if (!f || !pin || !pin.targets || pin.targets.indexOf(f.id) < 0) return false;
        const st = f.st || {};
        return !st.knockdown && (st.slow | 0) < 2;
      };
      const tid = pinFoe(preferred)
        ? preferred.id
        : foes.map((f) => (pinFoe(f) ? f.id : null)).find(Boolean);
      if (tid) {
        return enrichHeroStrike(state, actor, {
          type: "strike",
          abilityId: pin.abilityId,
          targetId: tid,
          useAim: !!pin.canAim,
          spendStressAdv: (actor.stress | 0) >= 3,
        });
      }
    }
    if (actor.barrage && (actor.ap | 0) >= 3 && (actor.stress | 0) >= 1) {
      const bar = strikes.find((s) => /barrage/i.test(s.abilityId || ""));
      if (bar && bar.targets && bar.targets.length >= 2) {
        return enrichHeroStrike(state, actor, {
          type: "strike",
          abilityId: bar.abilityId,
          targetId: bar.targets.indexOf(preferred.id) >= 0 ? preferred.id : bar.targets[0],
        });
      }
    }
  }
  const flurry = strikes.find((a) => a.flurry);
  if (flurry) {
    let tid = preferred.id;
    if (!flurry.targets || flurry.targets.indexOf(tid) < 0) tid = flurry.targets[0];
    return enrichHeroStrike(state, actor, {
      type: "strike",
      abilityId: flurry.abilityId,
      targetId: tid,
      flurry: true,
    });
  }
  if (strikes.length) {
    let pick = strikes.find((s) => s.targets && s.targets.indexOf(preferred.id) >= 0) || strikes[0];
    if (/brawler/i.test(actor.id || actor.name || "")) {
      const gloves = strikes.find((s) => /gloves/i.test(s.abilityId || s.label || ""));
      if (gloves && gloves.targets && gloves.targets.indexOf(preferred.id) >= 0) pick = gloves;
    }
    // Bought combat feats: prefer them when legal (power-delta / table AI).
    // Heavy Swing: ≥2 foes in ability target list (AoE R1) — prefer over Precise when packed
    if (actor.heavySwing && (actor.ap | 0) >= 2 && (actor.stress | 0) >= 1) {
      const swing = strikes.find((s) => /heavy-swing/i.test(s.abilityId || ""));
      if (swing && swing.targets && swing.targets.length >= 2) {
        pick = swing;
      } else if (swing && swing.targets && swing.targets.length >= 1) {
        // Still swing if ≥2 living foes within Chebyshev 1 of actor
        const near = foes.filter((f) => chebyshev(actor, f) <= 1).length;
        if (near >= 2) pick = swing;
      }
      if (pick && /heavy-swing/i.test(pick.abilityId || "") && (actor.stress | 0) >= 2) {
        pick = Object.assign({}, pick, { spendStressAdv: true });
      }
    }
    // Expose Weakness before Dirty vs DEF≥2 / elite (not trash — glass Dirty floor)
    if (actor.exposeWeakness && (actor.ap | 0) >= 2 && (actor.stress | 0) >= 1) {
      const ex = strikes.find((s) => /expose-weakness/i.test(s.abilityId || ""));
      const isMarked = (f) =>
        f && f.vulnerable && Object.keys(f.vulnerable).some((k) => (f.vulnerable[k] | 0) > 0);
      const exWorth = (f) => {
        if (!f || !ex || !ex.targets || ex.targets.indexOf(f.id) < 0 || isMarked(f)) return false;
        const d = f.def && f.def.Physical != null ? f.def.Physical | 0 : 0;
        return d >= 2 || isEliteFoe(f);
      };
      const tid = exWorth(preferred)
        ? preferred.id
        : foes.map((f) => (exWorth(f) ? f.id : null)).find(Boolean);
      if (tid) {
        actor.exposeOpenedThisFight = 1;
        pick = Object.assign({}, ex, { targets: [tid] });
      }
    }
    // Dirty Trick before Flurry of Daggers — cut specials when DEX gate looks workable.
    // coldOpen (Cold Blooded / Expose mark) boosts target priority; not required to cast.
    if (
      actor.dirtyTrick &&
      (actor.ap | 0) >= 2 &&
      !(pick && /expose-weakness/i.test(pick.abilityId || ""))
    ) {
      const pDef =
        preferred.def && preferred.def.Physical != null ? preferred.def.Physical | 0 : 0;
      const dirty = strikes.find((s) => /dirty-trick/i.test(s.abilityId || ""));
      const isMarked = (f) =>
        f && f.vulnerable && Object.keys(f.vulnerable).some((k) => (f.vulnerable[k] | 0) > 0);
      const cuttableInRange = (f) =>
        !!(
          f &&
          dirty &&
          dirty.targets &&
          dirty.targets.indexOf(f.id) >= 0 &&
          dirtyTrickWorthIt(state, actor, f)
        );
      const markedCuttable =
        dirty && dirty.targets
          ? foes.find((f) => isMarked(f) && cuttableInRange(f))
          : null;
      const anyCuttable =
        dirty && dirty.targets ? foes.find((f) => cuttableInRange(f)) : null;
      const marked = isMarked(preferred) || !!markedCuttable;
      const coldOpen =
        !(preferred.st && preferred.st.disarm) &&
        ((actor.coldBlooded &&
          (actor.attacksThisTurn | 0) === 0 &&
          pDef < 3 &&
          !isEliteFoe(preferred)) ||
          marked);
      const wantDirty = !!(cuttableInRange(preferred) || markedCuttable || anyCuttable);
      const saveForExpose =
        !wantDirty &&
        !coldOpen &&
        !(actor.dirtyOpenedThisFight | 0) &&
        actor.exposeWeakness &&
        (actor.stress | 0) >= 1 &&
        isEliteFoe(preferred);
      if (!saveForExpose && wantDirty && dirty && dirty.targets) {
        let tid = null;
        if (markedCuttable) tid = markedCuttable.id;
        else if (coldOpen && cuttableInRange(preferred)) tid = preferred.id;
        else if (cuttableInRange(preferred)) tid = preferred.id;
        else if (anyCuttable) tid = anyCuttable.id;
        if (tid) {
          actor.dirtyOpenedThisFight = 1;
          pick =
            tid === preferred.id
              ? dirty
              : Object.assign({}, dirty, { targets: [tid] });
        }
      }
    }
    // Flurry of Daggers: ≥2 foes in R4
    if (
      actor.flurryDaggers &&
      (actor.ap | 0) >= 2 &&
      (actor.stress | 0) >= 1 &&
      !(
        pick &&
        (/dirty-trick|expose-weakness/i.test(pick.abilityId || ""))
      )
    ) {
      const flurryDg = strikes.find((s) => /flurry-daggers/i.test(s.abilityId || ""));
      if (flurryDg && flurryDg.targets && flurryDg.targets.length >= 2) {
        pick = flurryDg;
      }
    }
    // Flurry of Blows: full-turn burst when 3 AP + stress and in melee
    if (actor.flurryBlows && (actor.ap | 0) >= 3 && (actor.stress | 0) >= 1) {
      const blows = strikes.find((s) => /flurry-blows/i.test(s.abilityId || ""));
      if (blows && blows.targets && blows.targets.indexOf(preferred.id) >= 0) {
        pick = blows;
      }
    }
    // Pin Shot before Barrage in pick path (same starve as early block)
    if (actor.pinShot && (actor.ap | 0) >= 1 && (actor.stress | 0) >= 1) {
      const pin = strikes.find((s) => /pin-shot/i.test(s.abilityId || ""));
      const pinFoe = (f) => {
        if (!f || !pin || !pin.targets || pin.targets.indexOf(f.id) < 0) return false;
        const st = f.st || {};
        return !st.knockdown && (st.slow | 0) < 2;
      };
      const tid = pinFoe(preferred)
        ? preferred.id
        : foes.map((f) => (pinFoe(f) ? f.id : null)).find(Boolean);
      if (tid) {
        pick = Object.assign({}, pin, {
          targets: [tid],
          spendStressAdv: (actor.stress | 0) >= 3,
        });
      }
    }
    // Barrage: ≥2 foes in bow range, 3 AP + stress (after Pin)
    if (
      actor.barrage &&
      (actor.ap | 0) >= 3 &&
      (actor.stress | 0) >= 1 &&
      !(pick && /pin-shot/i.test(pick.abilityId || ""))
    ) {
      const bar = strikes.find((s) => /barrage/i.test(s.abilityId || ""));
      if (bar && bar.targets && bar.targets.length >= 2) pick = bar;
    }
    // Uppercut: cheap Adv1 poke — but not over Flurry of Blows when full AP in melee
    if (
      actor.uppercut &&
      (actor.ap | 0) >= 1 &&
      !(actor.flurryBlows && (actor.ap | 0) >= 3 && (actor.stress | 0) >= 1)
    ) {
      const up = strikes.find((s) => /uppercut/i.test(s.abilityId || ""));
      if (up && up.targets && up.targets.indexOf(preferred.id) >= 0) {
        const pDef =
          preferred.def && preferred.def.Physical != null ? preferred.def.Physical | 0 : 0;
        if (pDef >= 3 || (actor.ap | 0) === 1) pick = up;
      }
    }
    // Expose Weakness: late re-assert vs DEF≥2 / elite if pick was stolen
    if (
      actor.exposeWeakness &&
      (actor.ap | 0) >= 2 &&
      (actor.stress | 0) >= 1 &&
      !(pick && /expose-weakness/i.test(pick.abilityId || ""))
    ) {
      const ex = strikes.find((s) => /expose-weakness/i.test(s.abilityId || ""));
      const isMarked = (f) =>
        f && f.vulnerable && Object.keys(f.vulnerable).some((k) => (f.vulnerable[k] | 0) > 0);
      const exWorth = (f) => {
        if (!f || !ex || !ex.targets || ex.targets.indexOf(f.id) < 0 || isMarked(f)) return false;
        const d = f.def && f.def.Physical != null ? f.def.Physical | 0 : 0;
        return d >= 2 || isEliteFoe(f);
      };
      const tid = exWorth(preferred)
        ? preferred.id
        : foes.map((f) => (exWorth(f) ? f.id : null)).find(Boolean);
      if (tid) {
        actor.exposeOpenedThisFight = 1;
        pick = Object.assign({}, ex, { targets: [tid] });
      }
    }
    // Forceful Push: melee shove when preferred adjacent
    if (actor.forcefulPush && (actor.ap | 0) >= 2 && (actor.stress | 0) >= 1) {
      const push = strikes.find((s) => /forceful-push/i.test(s.abilityId || ""));
      if (push && push.targets && push.targets.indexOf(preferred.id) >= 0) {
        pick = push;
      }
    }
    // Intimidating Shout: AoE soft when ≥2 foes in blast (selfAoe lists them as targets)
    if (
      actor.intimidatingShout &&
      (actor.ap | 0) >= 1 &&
      (actor.stress | 0) >= 1 &&
      foes.length >= 2
    ) {
      const shout =
        strikes.find((s) => /intimidating-shout/i.test(s.abilityId || "")) ||
        legal.find(
          (a) =>
            a.type === "strike" &&
            /intimidating-shout/i.test(a.abilityId || "") &&
            a.targets &&
            a.targets.length >= 1
        );
      if (shout && shout.targets && shout.targets.length >= 1) pick = shout;
    }
    // Grapple: restrain preferred in melee
    if (actor.grapple && (actor.ap | 0) >= 2 && (actor.stress | 0) >= 1) {
      const gr = strikes.find((s) => /grapple/i.test(s.abilityId || ""));
      if (
        gr &&
        gr.targets &&
        gr.targets.indexOf(preferred.id) >= 0 &&
        !(preferred.st && preferred.st.restrain)
      ) {
        pick = gr;
      }
    }
    // Lightning Bolt: prefer vs preferred when 2 AP + mana
    if (actor.lightningBolt && (actor.ap | 0) >= 2 && canPayMana(actor, 1)) {
      const bolt = strikes.find((s) => /lightning-bolt/i.test(s.abilityId || ""));
      if (bolt && bolt.targets && bolt.targets.indexOf(preferred.id) >= 0) pick = bolt;
    }
    {
      const bombAct = pickLivingBombAction(state, actor, legal, foes);
      if (bombAct) pick = bombAct;
    }
    {
      const shAct = pickShadowplayAction(state, actor, legal, foes);
      if (shAct) pick = shAct;
    }
    // Enfeeble: soft packs (≥2 foes)
    if (actor.enfeeble && (actor.ap | 0) >= 1 && canPayMana(actor, 1)) {
      const enf = strikes.find((s) => /enfeeble/i.test(s.abilityId || ""));
      if (enf && enf.targets && enf.targets.length >= 2) pick = enf;
    }
    if (actor.purgeWicked && (actor.ap | 0) >= 2 && canPayMana(actor, 1)) {
      const purge = strikes.find((s) => /purge-wicked/i.test(s.abilityId || ""));
      if (purge && purge.targets && purge.targets.indexOf(preferred.id) >= 0) {
        pick = purge;
      }
    }
    {
      const toxAct = pickToxicAction(state, actor, legal, foes);
      if (toxAct) pick = toxAct;
    }
    // Frost Shock: control poke
    if (actor.frostShock && (actor.ap | 0) >= 1 && canPayMana(actor, 1)) {
      const frost = strikes.find((s) => /frost-shock/i.test(s.abilityId || ""));
      if (frost && frost.targets && frost.targets.indexOf(preferred.id) >= 0) pick = frost;
    }
    // Entangle after Frost so AoE control wins when legal (last-wins pick)
    if (
      actor.entangle &&
      (actor.ap | 0) >= 2 &&
      canPayMana(actor, 2) &&
      (foes.length >= 2 || !(preferred.st && preferred.st.restrain))
    ) {
      const ent = strikes.find((s) => /entangle/i.test(s.abilityId || ""));
      if (ent && ent.targets && ent.targets.length >= 1) pick = ent;
    }
    if (actor.windGale && (actor.ap | 0) >= 2 && canPayMana(actor, 2) && foes.length >= 3) {
      const gale = strikes.find((s) => /wind-gale/i.test(s.abilityId || ""));
      if (gale && gale.targets && gale.targets.length >= 1) pick = gale;
    }
    // Precise Strike: bought feat — use vs DEF≥3 or any non-minion when 2 AP free
    if (actor.preciseStrike && (actor.ap | 0) >= 2) {
      const precise = strikes.find((s) => /precise-strike/i.test(s.abilityId || ""));
      if (precise && precise.targets && precise.targets.indexOf(preferred.id) >= 0) {
        const pDef =
          preferred.def && preferred.def.Physical != null
            ? preferred.def.Physical | 0
            : 0;
        if (pDef >= 3 || isEliteFoe(preferred) || (actor.ap | 0) >= 2) pick = precise;
      }
    }
    // Pin Shot late override: keep over Precise / kit basics when still unlocked
    if (
      actor.pinShot &&
      (actor.ap | 0) >= 1 &&
      (actor.stress | 0) >= 1 &&
      !(pick && /pin-shot/i.test(pick.abilityId || ""))
    ) {
      const pin = strikes.find((s) => /pin-shot/i.test(s.abilityId || ""));
      const pinFoe = (f) => {
        if (!f || !pin || !pin.targets || pin.targets.indexOf(f.id) < 0) return false;
        const st = f.st || {};
        return !st.knockdown && (st.slow | 0) < 2;
      };
      const tid = pinFoe(preferred)
        ? preferred.id
        : foes.map((f) => (pinFoe(f) ? f.id : null)).find(Boolean);
      if (tid) {
        pick = Object.assign({}, pin, {
          targets: [tid],
          spendStressAdv: (actor.stress | 0) >= 3,
        });
      }
    }
    // Acolyte Symbol: prefer when an ally is bloodied or has DoT burden ≥ 3
    // (do not override bought Enfeeble / Toxic Cloud)
    if (
      /acolyte/i.test(actor.id || actor.name || "") &&
      !isBoughtCombatAbilityId(pick && pick.abilityId)
    ) {
      const allies = state.actors.filter(
        (a) => a.side === "hero" && a !== actor && !a.dead && (a.hp | 0) > 0
      );
      const needSupport = allies.some(
        (a) =>
          (a.hp | 0) <= Math.floor((a.hpMax | 0) / 2) ||
          statusCleanseValue(a) >= 3
      );
      const symbol = strikes.find((s) => /symbol/i.test(s.abilityId || s.label || ""));
      const hex = strikes.find((s) => /hex/i.test(s.abilityId || s.label || ""));
      if (needSupport && symbol && symbol.targets && symbol.targets.indexOf(preferred.id) >= 0) {
        pick = symbol;
      } else if (!needSupport && hex && hex.targets && hex.targets.indexOf(preferred.id) >= 0) {
        pick = hex;
      }
    }
    // Primalist: Tide at range, Spear in melee — not over bought control feats
    if (
      /primalist/i.test(actor.id || actor.name || "") &&
      !isBoughtCombatAbilityId(pick && pick.abilityId)
    ) {
      const dist = chebyshev(actor, preferred);
      const spear = strikes.find((s) => /spear/i.test(s.abilityId || s.label || ""));
      const tide = strikes.find((s) => /tide/i.test(s.abilityId || s.label || ""));
      const bear = isEliteFoe(preferred) && /bear/i.test(preferred.name || "");
      if (bear && tide && tide.targets && tide.targets.indexOf(preferred.id) >= 0) {
        pick = tide;
      } else if (dist <= 1 && spear && spear.targets && spear.targets.indexOf(preferred.id) >= 0) {
        pick = spear;
      } else if (dist > 1 && tide && tide.targets && tide.targets.indexOf(preferred.id) >= 0) {
        pick = tide;
      }
    }
    // Mystic: Pyre default — never override Lightning / Living Bomb / Shadowplay
    if (
      /mystic/i.test(actor.id || actor.name || "") &&
      !isBoughtCombatAbilityId(pick && pick.abilityId)
    ) {
      const pyre = strikes.find((s) => /pyre/i.test(s.abilityId || s.label || ""));
      const storm = strikes.find((s) => /storm/i.test(s.abilityId || s.label || ""));
      const fireDef = preferred.def && preferred.def.Fire != null ? preferred.def.Fire | 0 : 0;
      if (fireDef >= 4 && storm && storm.targets && storm.targets.indexOf(preferred.id) >= 0) {
        pick = storm;
      } else if (pyre && pyre.targets && pyre.targets.indexOf(preferred.id) >= 0) {
        pick = pyre;
      }
    }
    // Ranged kits (Mystic / Acolyte / Tide / Scout bow): prefer RANGE ≥ 5 when in reach
    if (isRangedRifter(actor, state) && !isBoughtCombatAbilityId(pick && pick.abilityId)) {
      const ranged = strikes
        .filter((s) => (s.range | 0) >= 5 && s.targets && s.targets.indexOf(preferred.id) >= 0)
        .sort((a, b) => (b.range | 0) - (a.range | 0));
      if (ranged.length) {
        // Don't override Acolyte Symbol / Primalist Tide / Mystic pick already chosen
        const id = String(pick.abilityId || "");
        if (!/symbol|tide|pyre|storm|spear/i.test(id)) pick = ranged[0];
        else if (ranged.some((s) => s.abilityId === pick.abilityId)) {
          /* keep */
        } else if (/hex|gloves/i.test(id) && ranged.length) {
          pick = ranged[0];
        }
      }
    }
    let tid = preferred.id;
    if (!pick.targets || pick.targets.indexOf(tid) < 0) tid = pick.targets[0];
    return enrichHeroStrike(state, actor, {
      type: "strike",
      abilityId: pick.abilityId,
      targetId: tid,
      flurry: !!pick.flurry,
      useAim: !!pick.canAim,
      spendStressAdv: !!pick.spendStressAdv,
      upcast: !!pick.upcast,
      sourceAllyId: pick.sourceAllyId || null,
    });
  }

  const mv = pickMoveForHero(actor, legal, foes, state);
  if (mv) return mv;

  if (bloodied && (actor.recoveries | 0) > 0) {
    const cb = legal.find((a) => a.type === "catchBreath");
    if (cb) return { type: "catchBreath" };
  }

  return { type: "endTurn" };
}

function pickKitSwap(actor, legal, ctx) {
  const swaps = legal.filter((a) => a.type === "weaponSwap");
  if (!swaps.length) return null;
  const kit = actor.activeKit | 0;
  const preferred = ctx.preferred;
  const dist = preferred ? chebyshev(actor, preferred) : 99;
  const id = String(actor.id || actor.name || "").toLowerCase();

  if (!actor._didOpeningSwap) {
    actor._didOpeningSwap = true;
    // Fighter variety flip. Scout: Pin/Barrage stay bow; Vigilant alone prefers glaive (no flip-away).
    const openFlip =
      id.indexOf("fighter") >= 0 ||
      (id.indexOf("scout") >= 0 &&
        !actor.pinShot &&
        !actor.barrage &&
        !actor.vigilant);
    if (openFlip) {
      const other = swaps.find((s) => s.kitIndex !== kit);
      if (other) return { type: "weaponSwap", kitIndex: other.kitIndex };
    }
  }

  let want = null;
  if (id.indexOf("fighter") >= 0) {
    want = ctx.bloodied ? 1 : 0;
  } else if (id.indexOf("scout") >= 0) {
    // Pin/Barrage → bow. Vigilant (no bow feats) → glaive OA reach 2. Else melee→glaive.
    want =
      actor.pinShot || actor.barrage
        ? 0
        : actor.vigilant || dist <= 2
          ? 1
          : 0;
  } else if (id.indexOf("assassin") >= 0) {
    want = null;
  } else if (id.indexOf("brawler") >= 0) {
    want = 0;
  } else if (id.indexOf("mystic") >= 0) {
    // Pyre (Fire+Burn) by default; Storm when Fire is a bad type.
    const fireDef =
      preferred && preferred.def && preferred.def.Fire != null
        ? preferred.def.Fire | 0
        : 0;
    const burnImmune = !!(
      preferred &&
      preferred.immuneStatuses &&
      preferred.immuneStatuses.some((s) => String(s).toLowerCase() === "burn")
    );
    want = fireDef >= 4 || burnImmune ? 1 : 0;
  } else if (id.indexOf("acolyte") >= 0) {
    const allies = (ctx.state && ctx.state.actors) || [];
    const needSupport = allies.some(
      (a) =>
        a &&
        a.side === "hero" &&
        a !== actor &&
        !a.dead &&
        ((a.hp | 0) <= Math.floor((a.hpMax | 0) / 2) || statusCleanseValue(a) >= 3)
    );
    want = needSupport ? 0 : 1; // Symbol vs Hex Knife
  } else if (id.indexOf("primalist") >= 0) {
    want = dist <= 1 ? 0 : 1; // Spear melee / Tide ranged
  }

  if (want == null || want === kit) return null;
  const hit = swaps.find((s) => s.kitIndex === want);
  return hit ? { type: "weaponSwap", kitIndex: hit.kitIndex } : null;
}

export function runEnemyTurns(state) {
  let guard = 0;
  while (!state.over && guard++ < 80) {
    const cur = currentActor(state);
    if (!cur || cur.side !== "enemy") break;
    const action = chooseEnemyAction(state);
    const r = applyAction(state, action);
    if (action.type === "endTurn") continue;
    if (!r || !r.ok) {
      applyAction(state, { type: "endTurn" });
      continue;
    }
  }
}

export function runHeroTurns(state, policy = "smart") {
  const results = [];
  let guard = 0;
  while (!state.over && guard++ < 40) {
    const cur = currentActor(state);
    if (!cur || cur.side !== "hero") break;
    const action = chooseHeroAction(state, policy);
    const r = applyAction(state, action);
    results.push({ action, r });
    if (action.type === "endTurn") break;
    if (!r || !r.ok) {
      applyAction(state, { type: "endTurn" });
      break;
    }
  }
  return results;
}
