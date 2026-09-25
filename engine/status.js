import { inRange } from "./grid.js";

/** Weapon / melee attack for Disarm (+1 AP on heroes). */
export function isWeaponAttack(ability, actor) {
  if (!ability || ability.isAttack === false) return false;
  if (ability.weaponId || ability.kitId) return true;
  const name = String(ability.name || ability.id || "");
  if (/strike|weapon|attack|maul|bite|swipe|claw|slash|swing|shot|arrow/i.test(name)) {
    return true;
  }
  const monsterish =
    actor &&
    (actor.economy === "slots" || (actor.side === "enemy" && !actor.summon));
  if (
    monsterish &&
    (ability.range == null || (ability.range | 0) <= 1) &&
    ability.costMana == null &&
    ability.manaCost == null &&
    !isMonsterSpecialAbility(ability)
  ) {
    return true;
  }
  return false;
}

/**
 * Monster "special" (Charge, Howl, AoE spikes, …) — blocked by Disarm or Silence
 * on slot-economy monsters (same hard-block; Adrian lock 2026-09-24).
 * Basics (flat melee workhorses) stay legal.
 */
export function isMonsterSpecialAbility(ability) {
  if (!ability) return false;
  const traits = ability.traits || [];
  if (
    traits.some(
      (t) =>
        t &&
        /once-per-fight|once-per-round|not-consecutive|meleeCharge|charge/i.test(
          String(t.id || "")
        )
    )
  ) {
    return true;
  }
  if (ability.aoe) return true;
  if ((ability.range | 0) > 1) return true;
  if (ability.costMana != null || ability.manaCost != null) return true;
  // Role words only. An id prefix such as summon-* is not a special:
  // warrior pet melee (range 1, no AoE) stays a basic under Silence/Disarm.
  if (/howl|charge|eruption|barrage|nova|storm|focus/i.test(ability.id || ability.name || "")) {
    return true;
  }
  const tiers = ability.tiers || {};
  for (const k of Object.keys(tiers)) {
    const ex = tiers[k] && tiers[k].extras;
    const list = Array.isArray(ex) ? ex : ex ? [ex] : [];
    if (list.some((e) => e && (e.id === "approach" || e.id === "chargeMove"))) return true;
  }
  return false;
}

/**
 * Status helpers (RULES-CANON §6).
 * Duration default: until Cleanse or end of fight.
 */
export function freshStatuses() {
  return {
    burn: 0,
    bleed: 0,
    poison: 0,
    shock: 0,
    shield: 0,
    unsteady: 0,
    slow: 0,
    stun: false,
    silence: false,
    disarm: false,
    fearSource: null,
    tauntSource: null,
    knockdown: false,
    restrain: false,
    blind: false,
    intimidate: 0,
    gloom: 0,
    cannotBeCrit: false,
  };
}

export function gatePass(target, gate, opts = {}) {
  if (!gate || !gate.stat) return true;
  const key = String(gate.stat).toLowerCase();
  const val =
    key === "str"
      ? target.str | 0
      : key === "dex"
        ? target.dex | 0
        : key === "int"
          ? target.int | 0
          : 0;
  let n = gate.n;
  const statOfActor = (a, k) =>
    k === "str" ? a.str | 0 : k === "dex" ? a.dex | 0 : k === "int" ? a.int | 0 : 0;
  // Cross-stat: "STR ≤ YOUR INT" via gate.vsStat
  if (gate.vsStat && opts.vsActor) {
    n = statOfActor(opts.vsActor, String(gate.vsStat).toLowerCase());
  } else if ((n == null || gate.vs === "attacker") && opts.vsActor) {
    // Draft "DEX ≤ YOUR DEX[+N]": resolve vs attacker when gate.vs === "attacker"
    n = statOfActor(opts.vsActor, key);
  } else {
    n = n | 0;
  }
  n += gate.nBonus | 0;
  return val <= n;
}

/** Stackable harmful statuses that Perfectionist can amp (X / stacks). */
const STACK_HARMFUL = new Set([
  "burn",
  "bleed",
  "poison",
  "shock",
  "unsteady",
  "slow",
  "intimidate",
  "gloom",
]);

/** Perfectionist: INT times per fight, 1 stress each, add +INT to a harmful stack. */
export function perfectionistAmp(source) {
  if (!source || !source.perfectionist) return 0;
  const INT = Math.max(0, source.int | 0);
  if (INT <= 0) return 0;
  if (source.perfectionistLeft == null) source.perfectionistLeft = INT;
  if ((source.perfectionistLeft | 0) <= 0) return 0;
  if ((source.stress | 0) < 1) return 0;
  return INT;
}

function commitPerfectionist(source) {
  if (!source) return;
  source.stress = (source.stress | 0) - 1;
  source.perfectionistLeft = (source.perfectionistLeft | 0) - 1;
}

/** Apply one status from card DSL (`statusApply`). Damage always separate. */
export function applyStatus(target, status, opts = {}) {
  if (!status) return false;
  const source =
    opts.sourceActor ||
    (opts.sourceId && Array.isArray(opts.actors)
      ? opts.actors.find((a) => a && a.id === opts.sourceId)
      : null);
  if (status.gate && !gatePass(target, status.gate, { vsActor: source || opts.vsActor })) {
    return false;
  }
  const id = String(status.id || "").toLowerCase();
  if (
    target.immuneStatuses &&
    target.immuneStatuses.some((s) => String(s).toLowerCase() === id)
  ) {
    return false;
  }
  if (!target.st) target.st = freshStatuses();
  const st = target.st;
  let x = Number(status.x) || 0;
  const amp =
    !opts.dryRun && STACK_HARMFUL.has(id) ? perfectionistAmp(source) : 0;
  if (amp > 0) {
    x = Math.max(1, x || 1) + amp;
    status.x = x;
    status.perfectionistAmp = amp;
  }

  switch (id) {
    case "burn":
    case "bleed":
    case "poison":
    case "shock":
    case "unsteady":
    case "slow":
      st[id] = (st[id] | 0) + Math.max(1, x || 1);
      if (amp) commitPerfectionist(source);
      return true;
    case "stun":
      st.stun = true;
      return true;
    case "silence":
      st.silence = true;
      return true;
    case "disarm":
      st.disarm = true;
      return true;
    case "shield":
      st.shield = (st.shield | 0) + Math.max(1, x || 1);
      return true;
    case "fear":
      st.fearSource = opts.sourceId || status.sourceId || true;
      return true;
    case "taunt":
      st.tauntSource = opts.sourceId || status.sourceId || true;
      return true;
    case "knockdown":
    case "knock down":
      st.knockdown = true;
      return true;
    case "restrain":
      st.restrain = true;
      return true;
    case "blind":
      st.blind = true;
      return true;
    case "intimidate":
      // Stacks like Burn/Bleed; consumed on your next attack (−X damage).
      st.intimidate = (st.intimidate | 0) + Math.max(1, x || 1);
      if (amp) commitPerfectionist(source);
      return true;
    case "gloom":
      // Stacks add; at start of turn → DISADV = stacks for that turn, then −1.
      st.gloom = (st.gloom | 0) + Math.max(1, x || 1);
      if (amp) commitPerfectionist(source);
      return true;
    default:
      st[id] = (st[id] | 0) + x;
      return true;
  }
}

/**
 * Fear DISADV on an attack:
 * - DISADV 2 if attacking the Fear source (no range limit)
 * - Additionally DISADV 1 while within RANGE 1 of the Fear source
 * Melee vs source → 3.
 */
export function fearDisadv(attacker, target, actors) {
  if (!attacker || !attacker.st || !attacker.st.fearSource) return 0;
  if (attacker.courage || courageAuraNear(attacker, actors)) {
    attacker._courageFearIgnore = true;
    return 0;
  }
  const src = attacker.st.fearSource;
  let d = 0;
  if (target && (target.id === src || src === true)) d += 2;
  const sourceActor =
    src && src !== true && Array.isArray(actors)
      ? actors.find((a) => a && a.id === src)
      : null;
  if (sourceActor && inRange(attacker, sourceActor, 1)) d += 1;
  else if (src === true && target && inRange(attacker, target, 1) && d >= 2) d += 1;
  return d;
}

function courageAuraNear(actor, actors) {
  for (const a of actors || []) {
    if (!a || a === actor || a.side !== actor.side || a.dead) continue;
    if (a.courage && inRange(actor, a, 1)) return true;
  }
  return false;
}

/** Taunt: DISADV 2 if attacking anyone other than the Taunt source. */
export function tauntDisadv(attacker, target) {
  if (!attacker || !attacker.st || !attacker.st.tauntSource || !target) return 0;
  if (target.id === attacker.st.tauntSource) return 0;
  return 2;
}

/** Stress at 0 → DISADV 1. */
export function stressDisadv(attacker) {
  if (!attacker || attacker.stress == null) return 0;
  return (attacker.stress | 0) <= 0 ? 1 : 0;
}

/** Wounds ≥ 1 → DISADV 1 (Tier 1 playtest). */
export function woundDisadv(attacker) {
  if (!attacker) return 0;
  return (attacker.wounds | 0) >= 1 ? 1 : 0;
}

/** Gloom: DISADV equal to stacks active this turn (set at beginTurn). */
export function gloomDisadv(attacker) {
  if (!attacker) return 0;
  return attacker.gloomDisadvThisTurn | 0;
}

/**
 * Start-of-turn Gloom tick: DISADV X for this turn, then gloom -= 1 (min 0).
 * Returns the DISADV applied this turn.
 */
export function tickGloomAtStartOfTurn(actor) {
  if (!actor) return 0;
  if (!actor.st) actor.st = freshStatuses();
  const g = actor.st.gloom | 0;
  actor.gloomDisadvThisTurn = g > 0 ? g : 0;
  if (g > 0) actor.st.gloom = Math.max(0, g - 1);
  return actor.gloomDisadvThisTurn | 0;
}

/**
 * Extra AP from Silence / Disarm (flat +1) — heroes / AP economy only.
 * Silence → mana skills; Disarm → weapon attacks.
 * Monsters: no AP tax; Disarm/Silence hard-block specials via isMonsterSpecialAbility.
 */
export function statusExtraApCost(actor, ability) {
  if (!actor || !actor.st || !ability) return 0;
  let extra = 0;
  const isWeapon = isWeaponAttack(ability, actor);
  const isMana =
    ability.costMana != null ||
    ability.manaCost != null ||
    /mana|cast|focus|spell/i.test(ability.kind || "") ||
    /mana/i.test(String(ability.cost || ""));
  if (actor.st.disarm && isWeapon) extra += 1;
  if (actor.st.silence && isMana) extra += 1;
  return extra;
}

export function tickStartOfTurnDots(target, applyUnprevHp) {
  const ticks = [];
  if (!target || !target.st) return ticks;
  const st = target.st;
  // Bleed is NOT a DoT — on-hit Physical unprev only (lexicon).
  for (const id of ["burn", "poison"]) {
    const x = st[id] | 0;
    if (x <= 0) continue;
    if (typeof applyUnprevHp === "function") applyUnprevHp(target, x, id);
    ticks.push({ id, x });
    st[id] = Math.max(0, x - 1);
  }
  return ticks;
}

/**
 * Shock X: on the sufferer's next willing Move / Careful Step / Chase
 * (1× per activation), take X Lightning unpreventable. Does not trigger
 * on forced movement (Push/Pull/Slide) or reactions.
 */
export function shockOnWillingMove(target, applyUnprevHp) {
  const x = (target && target.st && target.st.shock) || 0;
  if (x <= 0) return 0;
  if (target.shockProcThisTurn) return 0;
  target.shockProcThisTurn = true;
  if (typeof applyUnprevHp === "function") applyUnprevHp(target, x, "shock");
  return x;
}

/** @deprecated Shock no longer triggers on reactions — use shockOnWillingMove. */
export function shockOnReaction(_target, _applyUnprevHp) {
  return 0;
}

/** Cleanse: peel stacks; binary statuses cost 2. */
export function cleanse(target, points, preferIds) {
  let left = points | 0;
  if (!target || !target.st || left <= 0) return 0;
  const st = target.st;
  const order = preferIds || [
    "burn",
    "bleed",
    "poison",
    "shock",
    "unsteady",
    "slow",
    "intimidate",
    "gloom",
  ];
  let used = 0;
  for (const id of order) {
    if (left <= 0) break;
    const cur = st[id] | 0;
    if (cur <= 0) continue;
    const take = Math.min(cur, left);
    st[id] = cur - take;
    left -= take;
    used += take;
  }
  const binaries = [
    ["blind", "blind"],
    ["knockdown", "knockdown"],
    ["stun", "stun"],
    ["silence", "silence"],
    ["disarm", "disarm"],
  ];
  for (const [key] of binaries) {
    if (left < 2) break;
    if (st[key]) {
      st[key] = false;
      left -= 2;
      used += 2;
    }
  }
  if (left >= 2 && st.fearSource) {
    st.fearSource = null;
    left -= 2;
    used += 2;
  }
  if (left >= 2 && st.tauntSource) {
    st.tauntSource = null;
    left -= 2;
    used += 2;
  }
  return used;
}

/** Short label for a status apply DSL object (`{ id, x }`). */
export function formatStatusTag(status) {
  if (!status) return "";
  const id = String(status.id || "").toLowerCase();
  const x = Number(status.x) || 0;
  switch (id) {
    case "fear":
      return "Fear";
    case "taunt":
      return "Taunt";
    case "intimidate":
      return "Intimidate " + Math.max(1, x || 1);
    case "gloom":
      return "Gloom " + Math.max(1, x || 1);
    case "burn":
    case "bleed":
    case "poison":
    case "shock":
    case "unsteady":
    case "slow":
    case "shield": {
      const base = id.charAt(0).toUpperCase() + id.slice(1) + (x ? " " + x : "");
      return status.perfectionistAmp ? base + " · Perfectionist" : base;
    }
    case "knockdown":
    case "knock down":
      return "Knockdown";
    case "vulnerable":
      return (
        "Vulnerable " +
        Math.max(1, x || 1) +
        (status.dmgType ? " (" + status.dmgType + ")" : "")
      );
    case "cannotbecrit":
    case "cannot_be_crit":
      return "no-crit";
    default:
      return id ? id.charAt(0).toUpperCase() + id.slice(1) + (x ? " " + x : "") : "";
  }
}

/**
 * Human-readable STAT ≤ N / STAT ≤ YOUR STAT[+N] for logs and UI.
 * @param {object} gate
 * @param {{ vsActor?: object }} [opts] — when vsActor set, also show resolved number
 */
export function formatGateLabel(gate, opts = {}) {
  if (!gate || gate.stat == null) return "";
  const stat = String(gate.stat).toUpperCase();
  const bonus = gate.nBonus | 0;
  const bonusTxt = bonus
    ? (bonus > 0 ? "+" : "−") + Math.abs(bonus)
    : "";
  let rhs;
  if (gate.vs === "attacker" || (gate.n == null && gate.vs !== "fixed")) {
    rhs = "YOUR " + stat + bonusTxt;
    if (opts.vsActor) {
      const a = opts.vsActor;
      const key = String(gate.stat).toLowerCase();
      const av =
        key === "str" ? a.str | 0 : key === "dex" ? a.dex | 0 : key === "int" ? a.int | 0 : 0;
      rhs = av + bonus + " (" + rhs + ")";
    }
  } else {
    rhs = String((gate.n | 0) + bonus);
  }
  return stat + "≤" + rhs;
}

/** Human-readable active statuses on an actor (for UI / logs). */
export function listActorStatusLabels(actor, actors) {
  if (!actor) return [];
  const st = actor.st || freshStatuses();
  const out = [];
  const stack = (id, label) => {
    const n = st[id] | 0;
    if (n > 0) out.push(label + " " + n);
  };
  stack("bleed", "Bleed");
  stack("burn", "Burn");
  stack("poison", "Poison");
  stack("shock", "Shock");
  stack("unsteady", "Unsteady");
  stack("slow", "Slow");
  stack("shield", "Shield");
  stack("intimidate", "Intimidate");
  stack("gloom", "Gloom");
  if (st.fearSource) {
    const src =
      Array.isArray(actors) && st.fearSource !== true
        ? actors.find((a) => a && a.id === st.fearSource)
        : null;
    out.push(src ? "Fear ← " + src.name : "Fear");
  }
  if (st.tauntSource) {
    const src =
      Array.isArray(actors) && st.tauntSource !== true
        ? actors.find((a) => a && a.id === st.tauntSource)
        : null;
    out.push(src ? "Taunt ← " + src.name : "Taunt");
  }
  if (st.stun) out.push("Stun");
  if (st.silence) out.push("Silence");
  if (st.disarm) out.push("Disarm");
  if (st.knockdown) out.push("Knockdown");
  if (actor.spotterMarked) out.push("Spotter Mark");
  if (st.restrain) out.push("Restrain");
  if (st.blind) out.push("Blind");
  if (st.cannotBeCrit) out.push("no-crit");
  if (actor.vulnerable && typeof actor.vulnerable === "object") {
    for (const k of Object.keys(actor.vulnerable)) {
      const n = actor.vulnerable[k] | 0;
      if (n > 0) out.push("Vulnerable " + n + " (" + k + ")");
    }
  }
  if (actor.nextAttack && !actor.nextAttack._needsPick) {
    const n = actor.nextAttack;
    const bits = [];
    if (n.break) bits.push("BREAK " + (n.break | 0));
    if (n.adv) bits.push("ADV " + (n.adv | 0));
    if (n.critX) bits.push("CRIT " + (n.critX | 0));
    if (n.disadv) bits.push("DISADV " + (n.disadv | 0));
    if (bits.length) out.push("Opening " + bits.join("/"));
  } else if (actor.nextAttack && actor.nextAttack._needsPick) {
    out.push("Opening (pick CRIT/ADV)");
  }
  return out;
}
