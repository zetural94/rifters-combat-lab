import { inRange, footprintKeys } from "./grid.js";
import { activeKitRef, kitMatchesAbility } from "./kits.js";
import { statusExtraApCost, isMonsterSpecialAbility } from "./status.js";
import { isMonsterEconomy, canReact } from "./turn.js";
import { objectBlockKeys } from "./terrain.js";
import { reachableCells } from "./move.js";
import { hordeStackInRange } from "./horde.js";
import { canPayMana, activateGuard, applyMagicShield, ICE_WALL_NOTE } from "./feats.js";
import { placeSummon, SUMMON_TEMPLATES } from "./summon.js";

function living(actors, side) {
  return (actors || []).filter((a) => {
    if (!a || a.dead || a.alive === false) return false;
    if (side && a.side !== side) return false;
    if (a.side === "enemy" && (a.hp | 0) <= 0) return false;
    return true;
  });
}

function occupied(actors) {
  const s = new Set();
  for (const a of actors || []) {
    if (!a || a.dead) continue;
    if (a.side === "enemy" && (a.hp | 0) <= 0) continue;
    for (const k of footprintKeys(a)) s.add(k);
  }
  return s;
}

function selfBloodied(a) {
  return (a.hp | 0) <= Math.floor((a.hpMax | 0) / 2);
}

function inBounds(state, c) {
  const b = state && state.bounds;
  if (!b) return true;
  return (
    (c.x | 0) >= b.minX &&
    (c.x | 0) <= b.maxX &&
    (c.y | 0) >= b.minY &&
    (c.y | 0) <= b.maxY
  );
}

/**
 * List legal actions for the acting combatant.
 * Heroes: AP pool. Monsters: 1 Move + 1 Action (no Careful/Defend/kit swap).
 * @param {object} state encounter state
 * @param {object} actor
 * @param {Record<string, object>} abilityById
 */
export function legalActions(state, actor, abilityById) {
  const actions = [];
  if (!actor) return actions;
  if (actor.dead || ((actor.hp | 0) <= 0 && (actor.wounds | 0) >= 5)) {
    actions.push({ type: "endTurn", label: "End turn", apCost: 0 });
    return actions;
  }
  // Horde followers never act — primary stack activation covers the pack.
  if (actor.hordeFollower) {
    actions.push({ type: "endTurn", label: "End turn", apCost: 0 });
    return actions;
  }
  const monster = isMonsterEconomy(actor);
  const ap = actor.ap | 0;
  const actors = state.actors || [];
  // Stealth: single-target untargetable beyond Range 2; AoE still includes them.
  const foesAll = living(actors).filter((a) => a.side !== actor.side);
  const foes = foesAll.filter((f) => !f.stealthed || inRange(actor, f, 2));
  const occ = occupied(actors);
  for (const k of objectBlockKeys(state.objects)) occ.add(k);
  const hazards = state.hazards || [];

  actions.push({ type: "endTurn", label: "End turn", apCost: 0 });

  const knocked = !!(actor.st && actor.st.knockdown);
  const restrained = !!(actor.st && actor.st.restrain);

  // Heroes: paying 1 AP for Move once unlocks Speed for the rest of the turn
  // (split freely: Move 2 → Strike → Move 2 with no extra AP). Careful Step
  // is always 1 AP → up to 3 spaces, OA-safe, independent of the Speed pool.
  // Monsters: 1 Move slot → up to Speed (Speed 0 = immobile).
  // Knockdown: Stand costs 3 Speed first; remaining Speed may still Move.
  if (knocked) {
    if (monster) {
      if ((actor.moveLeft | 0) >= 1) {
        const spd = Math.max(0, actor.speed | 0);
        const budget =
          actor.moveBudget != null ? Math.max(0, actor.moveBudget | 0) : spd;
        if (budget >= 3) {
          actions.push({
            type: "stand",
            label: "Stand · 3 move",
            apCost: 0,
            slot: "move",
            moveCost: 3,
          });
        }
      }
    } else {
      const budget = Math.max(
        0,
        actor.moveBudget != null ? actor.moveBudget | 0 : actor.speed | 0
      );
      const unlocked = !!actor.moveUnlocked;
      const moveCost = unlocked ? 0 : 1;
      if (budget >= 3 && (unlocked || ap >= 1)) {
        actions.push({
          type: "stand",
          label: unlocked
            ? "Stand · 3 move (" + (budget - 3) + " left after)"
            : "Stand · unlock + 3 move (1 AP)",
          apCost: moveCost,
          moveCost: 3,
          moveUnlock: !unlocked,
        });
      }
    }
  } else if (restrained) {
    // Restrain: no Move / Careful until cleared at beginTurn
  } else if (monster) {
    if ((actor.moveLeft | 0) >= 1) {
      const spd = Math.max(
        0,
        actor.moveBudget != null ? actor.moveBudget | 0 : actor.speed | 0
      );
      if (spd >= 1) {
        const moveCells = reachableCells(actor, spd, occ, state.bounds, hazards).filter((c) =>
          inBounds(state, c)
        );
        actions.push({
          type: "move",
          label: "Move",
          apCost: 0,
          slot: "move",
          cells: moveCells,
          moveBudget: spd,
        });
      }
    }
  } else {
    const budget = Math.max(
      0,
      actor.moveBudget != null ? actor.moveBudget | 0 : actor.speed | 0
    );
    const unlocked = !!actor.moveUnlocked;
    const moveCost = unlocked ? 0 : 1;
    if (budget >= 1 && (unlocked || ap >= 1)) {
      const moveCells = reachableCells(actor, budget, occ, state.bounds, hazards).filter((c) =>
        inBounds(state, c)
      );
      actions.push({
        type: "move",
        label: unlocked
          ? "Move · " + budget + " left"
          : "Move · unlock Speed " + budget + " (1 AP)",
        apCost: moveCost,
        cells: moveCells,
        moveBudget: budget,
        moveUnlock: !unlocked,
      });
    }
    if (ap >= 1) {
      const carefulCells = reachableCells(actor, 3, occ, state.bounds, hazards).filter((c) =>
        inBounds(state, c)
      );
      actions.push({
        type: "carefulStep",
        label: "Careful Step · 3",
        apCost: 1,
        cells: carefulCells,
        moveBudget: 3,
      });
    }
    // Martial artist: once per turn after an attack — MOVE 2 safely (0 AP, no OA)
    if (actor.martialArtist && actor.martialMoveReady && !actor.martialMoveUsedThisTurn) {
      const cells = reachableCells(actor, 2, occ, state.bounds, hazards).filter((c) =>
        inBounds(state, c)
      );
      actions.push({
        type: "martialStep",
        label: "Martial artist · MOVE 2 safe",
        apCost: 0,
        cells,
        moveBudget: 2,
        feat: true,
      });
    }
    // Vigilant: MOVE 1 safely after OA
    if (actor.vigilant && actor.vigilantMoveReady) {
      const cells = reachableCells(actor, 1, occ, state.bounds, hazards).filter((c) =>
        inBounds(state, c)
      );
      actions.push({
        type: "vigilantStep",
        label: "Vigilant · MOVE 1 safe",
        apCost: 0,
        cells,
        moveBudget: 1,
        feat: true,
      });
    }
  }

  if (!monster && ap >= 1) {
    actions.push({
      type: "steelYourself",
      label: "Steel Yourself",
      apCost: 1,
    });
    actions.push({
      type: "createOpening",
      label: "Line Up the Strike",
      apCost: 1,
    });
    actions.push({
      type: "askQuestion",
      label: "Ask a Question",
      apCost: 1,
    });
    const shoveTargets = foes.filter((f) => inRange(actor, f, 1));
    actions.push({
      type: "shove",
      label: "Shove",
      apCost: 1,
      targets: shoveTargets.map((t) => t.id),
      noTargets: !shoveTargets.length,
      range: 1,
    });
  }

  // Aim (Shortbow feat) — 0 AP, arms next shortbow Strike for ADV 1
  if (!monster) {
    const kit = activeKitRef(actor);
    const bowOut =
      kit === "shortbow" ||
      (Array.isArray(kit) && kit.indexOf("shortbow") >= 0);
    if (
      bowOut &&
      !actor.movedThisTurn &&
      !actor.aimUsedThisRound &&
      !actor.aimArmed
    ) {
      actions.push({
        type: "aim",
        label: "Aim (Shortbow)",
        apCost: 0,
        feat: true,
      });
    }
  }

  // System's Bargain — 2 AP + 2 mana, 1/fight
  if (
    !monster &&
    actor.hasSystemsBargain &&
    !actor.systemsBargain &&
    !actor.systemsBargainUsed &&
    (actor.ap | 0) >= 2 &&
    canPayMana(actor, 2)
  ) {
    actions.push({
      type: "systemsBargain",
      label: "System's Bargain",
      apCost: 2,
      manaCost: 2,
      feat: true,
    });
  }

  // Summons — 2 AP + 2 mana, max 1
  if (!monster && (actor.ap | 0) >= 2 && canPayMana(actor, 2)) {
    const kinds = [];
    if (actor.hasSummonWarrior) kinds.push("warrior");
    if (actor.hasSummonMage) kinds.push("mage");
    if (actor.hasSummonArcher) kinds.push("archer");
    if (actor.hasSummonElemental) kinds.push("elemental");
    for (const kind of kinds) {
      const tpl = SUMMON_TEMPLATES[kind];
      actions.push({
        type: "summon",
        label: "Summon · " + (tpl && tpl.name ? tpl.name.replace("Summon · ", "") : kind),
        apCost: 2,
        manaCost: 2,
        feat: true,
        summonKind: kind,
      });
    }
  }

  // Ice Wall — 2 AP + 3 mana. Human may cast again. The AI picker, not this list, is once per fight.
  if (!monster && actor.hasIceWall && (actor.ap | 0) >= 2 && canPayMana(actor, 3)) {
    actions.push({
      type: "iceWall",
      label: "Ice Wall",
      apCost: 2,
      manaCost: 3,
      feat: true,
      note: ICE_WALL_NOTE,
    });
    if (canPayMana(actor, 4)) {
      actions.push({
        type: "iceWall",
        label: "Ice Wall (Upcast +3 spaces)",
        apCost: 2,
        manaCost: 4,
        feat: true,
        upcast: true,
        upcastMode: "spaces",
        note: ICE_WALL_NOTE,
      });
      actions.push({
        type: "iceWall",
        label: "Ice Wall (Upcast +2 destroy)",
        apCost: 2,
        manaCost: 4,
        feat: true,
        upcast: true,
        upcastMode: "damage",
        note: ICE_WALL_NOTE,
      });
    }
  }

  // Spotter Mark — 1 AP + 1 stress, WR (weapon/ability max range, min 8)
  if (
    !monster &&
    actor.hasSpotter &&
    (actor.ap | 0) >= 1 &&
    (actor.stress | 0) >= 1
  ) {
    let markRange = 8;
    const ids = actor.abilityIds || actor.abilities || [];
    for (const id of ids) {
      const ab = abilityById && abilityById[id];
      if (!ab || ab.isAttack === false) continue;
      const ar = ab.range != null ? ab.range | 0 : 1;
      if (ar > markRange) markRange = ar;
    }
    const markTargets = foes.filter((f) => inRange(actor, f, markRange));
    if (markTargets.length) {
      actions.push({
        type: "spotterMark",
        label: "Spotter · Mark",
        apCost: 1,
        stressCost: 1,
        feat: true,
        range: markRange,
        targets: markTargets.map((t) => t.id),
      });
    }
  }

  // Magic Shield — 1 mana free 1/turn
  if (!monster && actor.hasMagicShield && !actor.magicShieldUsedThisTurn && canPayMana(actor, 1)) {
    const allies = living(actors, actor.side).filter(
      (a) => a === actor || inRange(actor, a, 5)
    );
    const shieldIds = allies.map((a) => a.id);
    actions.push({
      type: "magicShield",
      label: "Magic Shield",
      apCost: 0,
      manaCost: 1,
      feat: true,
      targets: shieldIds,
    });
    if (canPayMana(actor, 2)) {
      actions.push({
        type: "magicShield",
        label: "Magic Shield (Upcast)",
        apCost: 0,
        manaCost: 2,
        feat: true,
        upcast: true,
        targets: shieldIds.slice(),
      });
    }
  }

  // Bless — free 1 mana 1/turn (UPCAST +1 mana → Recovery +2×INT)
  if (!monster && actor.hasBless && !actor.blessUsedThisTurn && canPayMana(actor, 1)) {
    // Recovery REQUIRED — only allies with Recovery > 0 (heal + INT value + reroll).
    const allies = living(actors, actor.side).filter(
      (a) =>
        (a === actor || inRange(actor, a, 3)) && (a.recoveries | 0) >= 1
    );
    if (allies.length) {
      const ids = allies.map((a) => a.id);
      actions.push({
        type: "bless",
        label: "Bless",
        apCost: 0,
        manaCost: 1,
        feat: true,
        targets: ids,
      });
      if (canPayMana(actor, 2)) {
        actions.push({
          type: "bless",
          label: "Bless (Upcast)",
          apCost: 0,
          manaCost: 2,
          feat: true,
          upcast: true,
          targets: ids,
        });
      }
    }
  }

  // Barkskin — 1 AP + 1 mana (UPCAST +1 mana → +INT Stability)
  if (
    !monster &&
    actor.hasBarkskin &&
    (actor.ap | 0) >= 1 &&
    canPayMana(actor, 1)
  ) {
    const allies = living(actors, actor.side).filter(
      (a) => a === actor || inRange(actor, a, 4)
    );
    const ids = allies.map((a) => a.id);
    actions.push({
      type: "barkskin",
      label: "Barkskin",
      apCost: 1,
      manaCost: 1,
      feat: true,
      targets: ids,
    });
    if (canPayMana(actor, 2)) {
      actions.push({
        type: "barkskin",
        label: "Barkskin (Upcast)",
        apCost: 1,
        manaCost: 2,
        feat: true,
        upcast: true,
        targets: ids,
      });
    }
  }

  // Enhance Weapon — 1 AP + 1 mana, 1/fight
  if (
    !monster &&
    actor.hasEnhanceWeapon &&
    !actor.enhanceWeaponBonus &&
    (actor.ap | 0) >= 1 &&
    canPayMana(actor, 1)
  ) {
    actions.push({
      type: "enhanceWeapon",
      label: "Enhance Weapon",
      apCost: 1,
      manaCost: 1,
      feat: true,
    });
    if (canPayMana(actor, 2)) {
      actions.push({
        type: "enhanceWeapon",
        label: "Enhance Weapon (Upcast)",
        apCost: 1,
        manaCost: 2,
        feat: true,
        upcast: true,
      });
    }
  }

  // Healing Water — 1 AP + 1 mana (UPCAST +1 → Recovery +2×INT)
  if (
    !monster &&
    actor.hasHealingWater &&
    (actor.ap | 0) >= 1 &&
    canPayMana(actor, 1)
  ) {
    const allies = living(actors, actor.side).filter(
      (a) =>
        (a === actor || inRange(actor, a, 4)) && (a.recoveries | 0) >= 1
    );
    if (allies.length) {
      const ids = allies.map((a) => a.id);
      actions.push({
        type: "healingWater",
        label: "Healing Water",
        apCost: 1,
        manaCost: 1,
        feat: true,
        targets: ids,
      });
      if (canPayMana(actor, 2)) {
        actions.push({
          type: "healingWater",
          label: "Healing Water (Upcast)",
          apCost: 1,
          manaCost: 2,
          feat: true,
          upcast: true,
          targets: ids,
        });
      }
    }
  }

  // Feral Invocation — 1 AP + 2 stress
  if (
    !monster &&
    actor.hasFeralInvocation &&
    !actor.feralActive &&
    (actor.ap | 0) >= 1 &&
    (actor.stress | 0) >= 2
  ) {
    actions.push({
      type: "feralInvocation",
      label: "Feral Invocation",
      apCost: 1,
      stressCost: 2,
      feat: true,
    });
  }

  // Stealth — 0 AP + 1 stress, once per round, allowed even after attacking this turn.
  // Attacks still break stealth.
  if (
    !monster &&
    actor.hasStealth &&
    !actor.stealthed &&
    !actor.stealthUsedThisRound &&
    (actor.stress | 0) >= 1
  ) {
    actions.push({
      type: "stealth",
      label: "Stealth",
      apCost: 0,
      stressCost: 1,
      feat: true,
      note: "1/round, allowed even after attacking this turn; attacks still break stealth.",
    });
  }

  // Blink — 1 AP + 1 mana · teleport ≤ half SPEED · SHIELD 3×INT (Rozwój)
  if (!monster && actor.hasBlink && (actor.ap | 0) >= 1 && canPayMana(actor, 1)) {
    const maxR = Math.max(1, Math.floor((actor.speed | 0) / 2));
    const cells = [];
    for (let dx = -maxR; dx <= maxR; dx++) {
      for (let dy = -maxR; dy <= maxR; dy++) {
        if (dx === 0 && dy === 0) continue;
        if (Math.max(Math.abs(dx), Math.abs(dy)) > maxR) continue;
        const x = (actor.x | 0) + dx;
        const y = (actor.y | 0) + dy;
        if (!inBounds(state, { x, y })) continue;
        cells.push({ x, y });
      }
    }
    if (cells.length) {
      actions.push({
        type: "blink",
        label: "Blink",
        apCost: 1,
        manaCost: 1,
        feat: true,
        cells,
      });
    }
    // UPCAST 1: +1 mana → full SPEED cells
    if (canPayMana(actor, 2)) {
      const spd = Math.max(1, actor.speed | 0);
      const cellsU = [];
      for (let dx = -spd; dx <= spd; dx++) {
        for (let dy = -spd; dy <= spd; dy++) {
          if (dx === 0 && dy === 0) continue;
          if (Math.max(Math.abs(dx), Math.abs(dy)) > spd) continue;
          const x = (actor.x | 0) + dx;
          const y = (actor.y | 0) + dy;
          if (!inBounds(state, { x, y })) continue;
          cellsU.push({ x, y });
        }
      }
      if (cellsU.length) {
        actions.push({
          type: "blink",
          label: "Blink (Upcast)",
          apCost: 1,
          manaCost: 2,
          feat: true,
          upcast: true,
          cells: cellsU,
        });
      }
    }
  }

  // Guard — 1 stress, +1 DEF until next turn start
  if (!monster && actor.hasGuard && !actor.guardUp && (actor.stress | 0) >= 1) {
    actions.push({
      type: "guard",
      label: "Guard",
      apCost: 0,
      stressCost: 1,
      feat: true,
    });
  }

  // Shadow Dash — 1 AP + 1 stress blink ≤3
  if (
    !monster &&
    actor.hasShadowDash &&
    !actor.shadowDashUsedThisTurn &&
    (actor.ap | 0) >= 1 &&
    (actor.stress | 0) >= 1
  ) {
    const cells = [];
    for (let dx = -3; dx <= 3; dx++) {
      for (let dy = -3; dy <= 3; dy++) {
        if (dx === 0 && dy === 0) continue;
        if (Math.max(Math.abs(dx), Math.abs(dy)) > 3) continue;
        const x = (actor.x | 0) + dx;
        const y = (actor.y | 0) + dy;
        if (!inBounds(state, { x, y })) continue;
        cells.push({ x, y });
      }
    }
    if (cells.length) {
      actions.push({
        type: "shadowDash",
        label: "Shadow Dash",
        apCost: 1,
        stressCost: 1,
        feat: true,
        cells,
      });
    }
  }

  // Reactions usable on your turn (cost AP; Light free only in off-turn window)
  if (!monster && (canReact(actor) || (actor.ap | 0) >= 1)) {
    actions.push({ type: "defend", label: "Defend · Reaction", apCost: 1, reaction: true });
    if ((actor.recoveries | 0) >= 1) {
      actions.push({
        type: "catchBreath",
        label: "CATCH BREATH · Reaction",
        apCost: 1,
        reaction: true,
      });
    }
  }

  // Kit swap (heroes only)
  if (!monster) {
    const kits = actor.weaponOptions || [];
    if (kits.length > 1) {
      for (let i = 0; i < kits.length; i++) {
        if (i === (actor.activeKit | 0)) continue;
        const free = (actor.kitSwapsThisTurn | 0) === 0;
        const cost = free ? 0 : 1;
        if (!free && ap < 1) continue;
        actions.push({
          type: "weaponSwap",
          label: "Weapon Swap → kit " + (i + 1),
          apCost: cost,
          kitIndex: i,
          free,
        });
      }
    }
  }

  const canAct = monster ? (actor.actionLeft | 0) >= 1 : true;
  if (canAct) {
    const abilityIds = actor.abilityIds || actor.abilities || [];
    for (const id of abilityIds) {
      const ab = abilityById[id];
      if (!ab || (ab.traits && ab.traits.some((t) => t.id === "reaction"))) continue;
      if (!kitMatchesAbility(actor, ab)) continue;
      if ((ab.traits || []).some((t) => t.require && t.require.selfBloodied) && !selfBloodied(actor)) {
        continue;
      }
      if (
        (ab.traits || []).some((t) => t.require && t.require.heroTier3Seen) &&
        !(state && state.heroTier3Seen)
      ) {
        continue;
      }
      if ((ab.traits || []).some((t) => t.id === "once-per-round")) {
        if (actor.roundUsed && actor.roundUsed[ab.id]) continue;
      }
      if ((ab.traits || []).some((t) => t.id === "once-per-fight")) {
        const t = (ab.traits || []).find((x) => x.id === "once-per-fight");
        const max = Math.max(1, (t && (t.x != null ? t.x : t.uses)) | 0 || 1);
        const used = (actor.fightUsed && actor.fightUsed[ab.id]) | 0;
        if (used >= max) continue;
      }
      if ((ab.traits || []).some((t) => t.id === "not-consecutive")) {
        const cd = (actor.abilityCooldown && actor.abilityCooldown[ab.id]) | 0;
        if (cd > 0) continue;
      }
      // Twin / normal strikes — skip pure flurry-only here
      let cost = ab.costAp | 0;
      if (!monster) cost += statusExtraApCost(actor, ab);
      else cost = Math.max(1, cost || 1);
      if (!monster && ap < cost) continue;
      const stressNeed = ab.costStress != null ? ab.costStress | 0 : ab.stressCost | 0;
      // Summons use slot economy but still spend Stress on specials.
      if ((!monster || actor.summon) && stressNeed > 0 && (actor.stress | 0) < stressNeed) continue;
      const manaNeed = ab.costMana != null ? ab.costMana | 0 : ab.manaCost | 0;
      if (!monster && manaNeed > 0 && !canPayMana(actor, manaNeed)) continue;
      // Disarm / Silence on monsters: hard-block specials (Charge / Howl / AoE …).
      // Basics stay legal. (Adrian lock 2026-09-24: Silence mirrors Disarm.)
      if (
        monster &&
        actor.st &&
        (actor.st.disarm || actor.st.silence) &&
        isMonsterSpecialAbility(ab)
      ) {
        continue;
      }
      const selfAoe =
        !!ab.selfAoe ||
        /intimidating-shout|self-aoe/i.test(String(ab.id || ab.name || ""));
      // Click / primary-target range is ability.range.
      // aoe.range and tier aoeRange are blast radius only (resolveStrike).
      const range = ab.range != null ? ab.range | 0 : 1;
      if (ab.allySource) {
        const blast = (ab.aoe && ab.aoe.range != null ? ab.aoe.range : range) | 0;
        const sources = actors.filter(
          (a) =>
            a &&
            a.side === actor.side &&
            !a.dead &&
            (a.hp | 0) > 0 &&
            (a === actor || inRange(actor, a, range))
        );
        const targets = foesAll.filter((f) => sources.some((s) => inRange(s, f, blast)));
        actions.push({
          type: "strike",
          label: ab.name,
          apCost: monster ? 0 : cost,
          slot: monster ? "action" : null,
          stressCost: (!monster || actor.summon) && stressNeed > 0 ? stressNeed : 0,
          abilityId: ab.id,
          targets: targets.map((t) => t.id),
          noTargets: !targets.length,
          selfAoe: false,
          allySource: true,
          range,
          canAim: false,
        });
        continue;
      }
      // selfAoe / AoE: include stealthed (area still hits). Single-target: foes (R2 gate).
      const pool =
        selfAoe ||
        (ab.aoe &&
          (ab.aoe.range != null || ab.aoe.shape === "cube" || ab.aoe.size != null))
          ? foesAll
          : foes;
      const targets = pool.filter((f) =>
        actor.hordeStackId
          ? hordeStackInRange(actor, f, range, actors)
          : inRange(actor, f, range)
      );
      // Heroes: list Strikes out of range. Monsters: AoE tools too (AI repositions for Howl).
      // Summons are played by hand in the lab, so a melee strike stays visible (disabled) until they Move.
      if (!targets.length && monster) {
        const isAoe =
          selfAoe ||
          (ab.aoe && (ab.aoe.range != null || ab.aoe.shape === "cube" || ab.aoe.size != null));
        if (!isAoe && !actor.summon) continue;
      }
      const strike = {
        type: "strike",
        label: ab.name,
        apCost: monster ? 0 : cost,
        slot: monster ? "action" : null,
        stressCost: (!monster || actor.summon) && stressNeed > 0 ? stressNeed : 0,
        manaCost: !monster && manaNeed > 0 ? manaNeed : 0,
        abilityId: ab.id,
        targets: targets.map((t) => t.id),
        noTargets: !targets.length,
        selfAoe,
        range,
        canAim:
          !monster &&
          ab.weaponId === "shortbow" &&
          !actor.movedThisTurn &&
          !actor.aimUsedThisRound,
        aimArmed: !!actor.aimArmed,
      };
      actions.push(strike);
      const upMana = !monster ? ab.upcastMana | 0 : 0;
      if (upMana > 0 && canPayMana(actor, manaNeed + upMana) && (monster || ap >= cost)) {
        let upRange = range;
        let upTargets = strike.targets.slice();
        if (ab.upcastRange != null) {
          upRange = ab.upcastRange | 0;
          upTargets = pool
            .filter((f) =>
              actor.hordeStackId
                ? hordeStackInRange(actor, f, upRange, actors)
                : inRange(actor, f, upRange)
            )
            .map((t) => t.id);
        }
        actions.push(
          Object.assign({}, strike, {
            label: ab.name + " (Upcast)",
            manaCost: manaNeed + upMana,
            upcast: true,
            range: upRange,
            targets: upTargets,
            noTargets: !upTargets.length,
          })
        );
      }
    }
  }

  // Chase: if no Attack can hit anyone, Action may become a second Move (full Speed).
  // Only listed after Move slot is spent — pattern still prefers any legal strike first.
  if (monster && (actor.actionLeft | 0) >= 1 && (actor.moveLeft | 0) < 1) {
    const hasHit = actions.some(
      (a) => a.type === "strike" && a.targets && a.targets.length
    );
    if (!hasHit) {
      const spd = Math.max(0, actor.speed | 0);
      if (spd < 1) {
        // immobile (Speed 0) — no Chase Move
      } else {
      const chaseCells = reachableCells(actor, spd, occ, state.bounds, hazards).filter((c) =>
        inBounds(state, c)
      );
      if (chaseCells.length) {
        actions.push({
          type: "move",
          label: "Chase · Action→Move " + spd,
          apCost: 0,
          slot: "action",
          chase: true,
          cells: chaseCells,
          moveBudget: spd,
        });
      }
      }
    }
  }

  // Flurry follow-up (0 AP, rushed) — Dual Daggers
  if (!monster && actor.flurryReady && !actor.flurryUsedThisRound) {
    const abilityIds = actor.abilityIds || actor.abilities || [];
    for (const id of abilityIds) {
      const ab = abilityById[id];
      if (!ab || !(ab.traits || []).some((t) => t.id === "flurry")) continue;
      if (!kitMatchesAbility(actor, ab)) continue;
      if ((ab.traits || []).some((t) => t.id === "twinStrike")) continue;
      const range = ab.range != null ? ab.range | 0 : 1;
      const targets = foes.filter((f) => inRange(actor, f, range));
      if (!targets.length) continue;
      actions.push({
        type: "strike",
        label: ab.name + " · Flurry",
        apCost: 0,
        flurry: true,
        abilityId: ab.id,
        targets: targets.map((t) => t.id),
      });
    }
  }

  return actions;
}

export function packHunterBonus(attacker, actors) {
  if (!attacker || !attacker.tags || attacker.tags.indexOf("Wolf") < 0) {
    // also by name
    if (!/wolf/i.test(attacker.name || "")) return null;
  }
  const allyWolf = (actors || []).some(
    (a) =>
      a &&
      a !== attacker &&
      !a.dead &&
      (a.hp | 0) > 0 &&
      (/wolf/i.test(a.name || "") || (a.tags || []).indexOf("Wolf") >= 0) &&
      inRange(attacker, a, 1)
  );
  if (!allyWolf) return null;
  // Deterministic: caller maps Power Roll → ADV 1, flat → +1 DMG
  return { rule: "powerRoll->adv1; flat->bonusDmg1" };
}
