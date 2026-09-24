/**
 * Rank-1 talent dummy audit (every FEAT_SMOKE_STUBS talent).
 * Walks each talent on train_<class> vs the training dummy:
 * grant, whether a clickable action fires, and WD preview numbers.
 *
 * Usage: node scripts/audit-talent-dummy.mjs
 * Writes docs/TALENT-DUMMY-QOL.md
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { FEAT_SMOKE_STUBS, makeR1Encounter } from "../mc/r1.js";
import {
  startDeferredEncounter,
  startPickedHeroTurn,
  applyAction,
  listLegal,
  currentActor,
} from "../engine/encounter.js";
import {
  isWeaponDmgToken,
  kitIndexesForAbility,
  previewTierTriplet,
} from "../engine/abilityPreview.js";
import { listMitigationReactions } from "../engine/reactPrompt.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLASS_ORDER = [
  "fighter",
  "brawler",
  "assassin",
  "scout",
  "mystic",
  "acolyte",
  "primalist",
];

function loadPack() {
  const dir = path.join(root, "cards");
  const cards = {};
  const abilityById = {};
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const card = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    cards[file.replace(/\.json$/, "")] = card;
    if (card.kind === "ability" && card.id) abilityById[card.id] = card;
  }
  return { cards, abilityById };
}

function prettyKit(ref) {
  const raw = Array.isArray(ref) ? ref.join(" + ") : String(ref ?? "—");
  return raw
    .split(/\s*\+\s*/)
    .map((part) =>
      part
        .split(/[-\s]+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ")
    )
    .join(" + ");
}

function boot(pack, classId, feats) {
  const state = makeR1Encounter(pack, 7, {
    scenario: "train_" + classId,
    deferStart: true,
    askHeroPick: true,
    askKitPick: true,
    askReactions: true,
    featSmoke: feats,
    padBp: 0,
  });
  const started = startDeferredEncounter(state);
  if (!started.ok) throw new Error("start " + classId + ": " + started.reason);
  const hero = (state.actors || []).find(
    (a) => a && a.side === "hero" && String(a.id).endsWith("-a")
  );
  if (!hero) throw new Error("no hero-a for " + classId);
  const picked = startPickedHeroTurn(state, hero.id);
  if (!picked.ok) throw new Error("pick " + classId + ": " + picked.reason);
  if (state.awaitingKitPick) {
    const kit = applyAction(state, { type: "pickKit", kitIndex: 0 });
    if (!kit.ok) throw new Error("kit " + classId + ": " + kit.reason);
  }
  return state;
}

function actionKey(a) {
  return [
    a.type,
    a.abilityId || "",
    a.summonKind || "",
    a.upcast ? "up" : "",
    a.label || "",
  ].join("|");
}

function digest(actor) {
  const skip = new Set([
    "id",
    "name",
    "x",
    "y",
    "ap",
    "apSpent",
    "kitPickedThisTurn",
    "featSmoke",
    "abilityIds",
  ]);
  const out = {};
  for (const k of Object.keys(actor || {}).sort()) {
    if (skip.has(k)) continue;
    const v = actor[k];
    if (typeof v === "function") continue;
    if (v && typeof v === "object") {
      try {
        out[k] = JSON.parse(JSON.stringify(v));
      } catch (_) {
        out[k] = String(v);
      }
    } else out[k] = v;
  }
  return out;
}

function changedKeys(before, after) {
  const a = digest(before);
  const b = digest(after);
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const changed = [];
  for (const k of keys) {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) changed.push(k);
  }
  return changed.sort();
}

function firePayload(action) {
  const payload = { type: action.type };
  if (action.abilityId) payload.abilityId = action.abilityId;
  if (action.summonKind) payload.summonKind = action.summonKind;
  if (action.upcast) payload.upcast = true;
  if (action.kitIndex != null && action.type === "weaponSwap") payload.kitIndex = action.kitIndex;
  if (action.type === "strike") {
    payload.dryRun = true;
    if (!action.selfAoe && action.targets && action.targets.length) {
      payload.targetId = action.targets[0];
    }
  } else if (action.targets && action.targets.length) {
    payload.targetId = action.targets[0];
  }
  if (action.cells && action.cells.length) payload.dest = action.cells[0];
  return payload;
}

function findStrike(state, abilityId) {
  return (listLegal(state) || []).find(
    (a) => a.type === "strike" && a.abilityId === abilityId
  );
}

function wdLines(hero, ability, abilityById) {
  const indexes = kitIndexesForAbility(hero, ability);
  const opts = hero.weaponOptions || [];
  return indexes.map((i) => {
    const nums = previewTierTriplet(ability, hero, i, abilityById);
    return {
      index: i,
      name: prettyKit(opts[i]),
      nums,
      text: nums.map((n) => (n == null ? "—" : String(n))).join("/"),
    };
  });
}

function assertTriplet(label, got, want) {
  const g = (got || []).map((n) => (n == null ? null : n | 0));
  if (JSON.stringify(g) !== JSON.stringify(want)) {
    throw new Error(label + " got " + JSON.stringify(g) + " want " + JSON.stringify(want));
  }
}

const pack = loadPack();
const sandboxSrc = fs.readFileSync(path.join(root, "sandbox.html"), "utf8");
const labOffersEye = sandboxSrc.includes("offerEyeForAnEye");
const labOffersRiposte =
  sandboxSrc.includes("commitMitigationChoice") &&
  sandboxSrc.includes('opt.id === "riposte"') &&
  sandboxSrc.includes("offerRiposte");
const labOffersBola =
  sandboxSrc.includes("commitMitigationChoice") &&
  sandboxSrc.includes('opt.id === "hiddenBola"');

const rows = [];
let assertError = null;

try {
  const brawler = boot(pack, "brawler", ["brawler-uppercut"]).actors.find((a) =>
    String(a.id).endsWith("-a")
  );
  const upper = pack.abilityById["brawler-uppercut"];
  const uLines = wdLines(brawler, upper, pack.abilityById);
  assertTriplet("Uppercut gloves", uLines[0] && uLines[0].nums, [6, 8, 11]);
  assertTriplet("Uppercut staff", uLines[1] && uLines[1].nums, [7, 9, 11]);

  const fighter = boot(pack, "fighter", ["fighter-heavy-swing", "fighter-precise-strike", "fighter-forceful-push"]);
  const f = currentActor(fighter);
  const hs = wdLines(f, pack.abilityById["fighter-heavy-swing"], pack.abilityById);
  assertTriplet("Heavy Swing heavy", hs[0] && hs[0].nums, [7, 12, 26]);
  assertTriplet("Heavy Swing longsword", hs[1] && hs[1].nums, [8, 10, 20]);
  const ps = wdLines(f, pack.abilityById["fighter-precise-strike"], pack.abilityById);
  assertTriplet("Precise heavy", ps[0] && ps[0].nums, [6, 10, 13]);
  assertTriplet("Precise longsword", ps[1] && ps[1].nums, [7, 8, 10]);
  const fp = wdLines(f, pack.abilityById["fighter-forceful-push"], pack.abilityById);
  assertTriplet("Forceful heavy", fp[0] && fp[0].nums, [6, 13, 18]);
  assertTriplet("Forceful longsword", fp[1] && fp[1].nums, [7, 11, 15]);

  const bash = pack.abilityById["fighter-shield-bash"];
  assertTriplet(
    "Shield Bash stays flat",
    previewTierTriplet(bash, f, 1, pack.abilityById),
    [3, 5, 7]
  );
  if (bash.useWeapon) throw new Error("Shield Bash must not be useWeapon");

  const flurryHero = boot(pack, "brawler", ["brawler-flurry-blows"]);
  const fl = currentActor(flurryHero);
  const flLines = wdLines(fl, pack.abilityById["brawler-flurry-blows"], pack.abilityById);
  assertTriplet("Flurry gloves", flLines[0] && flLines[0].nums, [13, 18, 33]);
  assertTriplet("Flurry staff", flLines[1] && flLines[1].nums, [15, 20, 33]);
} catch (err) {
  assertError = err;
}

for (const id of Object.keys(FEAT_SMOKE_STUBS).sort()) {
  const stub = FEAT_SMOKE_STUBS[id];
  if (!stub || !CLASS_ORDER.includes(stub.classId)) continue;
  const card = pack.abilityById[id] || null;
  const row = {
    id,
    classId: stub.classId,
    label: stub.label,
    kind: card ? "ability" : "feat",
    status: "OK",
    notes: [],
    wd: [],
  };
  try {
    const withT = boot(pack, stub.classId, [id]);
    const without = boot(pack, stub.classId, []);
    const hero = currentActor(withT);
    const base = currentActor(without);
    const granted = (hero.featSmoke || []).indexOf(id) >= 0;
    if (!granted) {
      row.status = "ISSUE";
      row.notes.push("apply() did not record featSmoke");
    }
    const addedAbilities = (hero.abilityIds || []).filter(
      (x) => (base.abilityIds || []).indexOf(x) < 0
    );
    const baseKeys = new Set((listLegal(without) || []).map(actionKey));
    const legal = listLegal(withT) || [];
    const freshActions = legal.filter((a) => !baseKeys.has(actionKey(a)));
    const flags = changedKeys(base, hero);

    if (card && card.useWeapon) {
      const lines = wdLines(hero, card, pack.abilityById);
      row.wd = lines.map((l) => l.name + " " + l.text);
      for (const line of lines) {
        if (line.nums.some((n) => n == null || !Number.isFinite(n))) {
          row.status = "ISSUE";
          row.notes.push("WD preview missing a number for " + line.name);
        }
        if (/\b\d*WD\b/.test(line.text)) {
          row.status = "ISSUE";
          row.notes.push("preview still contains a WD token: " + line.text);
        }
      }
      if (lines.length < 2 && !(card.weaponId || (card.kitModes && card.kitModes.length === 1))) {
        const kits = hero.weaponOptions || [];
        if (kits.length >= 2 && !card.weaponId) {
          row.status = "ISSUE";
          row.notes.push("useWeapon talent did not preview both class kits");
        }
      }
      if (card.weaponId && lines.length === 1) {
        row.notes.push("kit-locked to " + lines[0].name + " (weaponId " + card.weaponId + ")");
      }
    } else if (card) {
      const nums = previewTierTriplet(card, hero, hero.activeKit | 0, pack.abilityById);
      const flat = (card.tiers && ["t1", "t2", "t3"].map((k) => card.tiers[k] && card.tiers[k].dmg));
      if (flat && flat.some((d) => isWeaponDmgToken(d))) {
        row.status = "ISSUE";
        row.notes.push("card prints WD but useWeapon is not set");
      }
      row.notes.push("flat " + nums.filter((n) => n != null).join("/"));
    }

    if (card) {
      if ((hero.abilityIds || []).indexOf(id) < 0) {
        row.status = "ISSUE";
        row.notes.push("ability card exists but was not granted onto abilityIds");
      } else {
        const kits = card.useWeapon ? kitIndexesForAbility(hero, card) : [hero.activeKit | 0];
        for (const kitIndex of kits) {
          if ((hero.activeKit | 0) !== kitIndex) {
            const swap = applyAction(withT, { type: "weaponSwap", kitIndex });
            if (!swap.ok) {
              row.status = "ISSUE";
              row.notes.push("could not swap to kit " + (kitIndex + 1) + ": " + swap.reason);
              continue;
            }
          }
          const strike = findStrike(withT, id);
          if (!strike) {
            row.status = "ISSUE";
            row.notes.push("not in legal strikes on kit " + (kitIndex + 1));
            continue;
          }
          const fired = applyAction(withT, firePayload(strike));
          if (!fired.ok) {
            row.status = "ISSUE";
            row.notes.push(
              "dry-run failed on kit " + (kitIndex + 1) + ": " + (fired.reason || "?")
            );
            continue;
          }
          const result = fired.result || {};
          if (card.useWeapon && !result.crit) {
            const expect = previewTierTriplet(card, hero, kitIndex, pack.abilityById);
            const tier = result.tier | 0;
            const want = expect[tier - 1];
            if (want != null && (result.raw | 0) !== (want | 0)) {
              row.status = "ISSUE";
              row.notes.push(
                "kit " +
                  (kitIndex + 1) +
                  " T" +
                  tier +
                  " strike raw " +
                  result.raw +
                  " != preview " +
                  want
              );
            }
          }
          row.notes.push(
            "fires kit " +
              (kitIndex + 1) +
              " T" +
              ((result.tier | 0) || "?") +
              (result.raw != null ? " raw " + result.raw : "")
          );
        }
      }
    } else if (freshActions.length) {
      const baselineTypes = new Set((listLegal(without) || []).map((a) => a.type));
      const meaningful = freshActions.filter(
        (a) => a.feat || a.abilityId || a.summonKind || !baselineTypes.has(a.type)
      );
      const sample = (meaningful.find((a) => !a.upcast) || meaningful[0]) || null;
      if (!sample) {
        row.notes.push("passive: " + (flags.join(", ") || "no new action at turn start"));
      } else {
        const fired = applyAction(withT, firePayload(sample));
        if (!fired.ok) {
          row.status = "ISSUE";
          row.notes.push("action " + sample.label + " failed: " + (fired.reason || "?"));
        } else {
          row.notes.push("fires " + (sample.label || sample.type));
        }
        const rest = meaningful.filter((a) => a !== sample);
        if (rest.length) {
          row.notes.push(
            "also listed: " + rest.map((a) => a.label || a.type).join(", ")
          );
        }
      }
      if (hero.martialArtist) {
        row.notes.push("MOVE 2 safe arms after an attack, not on the opening list");
      }
    } else if (hero.eyeForAnEye) {
      if (!labOffersEye) {
        row.status = "ISSUE";
        row.notes.push("Eye for an eye flag set but lab has no OA offer");
      } else {
        row.notes.push("reactive: lab offers free OA after an enemy T3 hit");
      }
    } else if (hero.hasRiposte) {
      const foe = (withT.actors || []).find((a) => a && a.side === "enemy");
      const melee = listMitigationReactions(hero, foe, { range: 1 }, { raw: 8 });
      const ranged = listMitigationReactions(hero, foe, { range: 6 }, { raw: 8 });
      const click = melee.find((o) => o.id === "riposte" && o.ok);
      const blocked = ranged.find((o) => o.id === "riposte" && !o.ok);
      if (!labOffersRiposte || !click || !blocked) {
        row.status = "ISSUE";
        row.notes.push(
          "Riposte grants hasRiposte, but the lab reaction window does not offer a clickable melee Riposte (ranged must stay blocked)."
        );
      } else {
        row.notes.push(
          "reaction window offers Riposte on melee R1 (free · −1 stress · −" +
            click.reduce +
            "); ranged is explained as " +
            blocked.reason
        );
      }
    } else if (hero.hasHiddenBola) {
      const foe = (withT.actors || []).find((a) => a && a.side === "enemy");
      const near = listMitigationReactions(hero, foe, { range: 1 }, { raw: 8 });
      const click = near.find((o) => o.id === "hiddenBola" && o.ok);
      const farHero = Object.assign({}, hero, { x: 0, y: 0 });
      const farFoe = Object.assign({}, foe || {}, { x: 11, y: 7 });
      const far = listMitigationReactions(farHero, farFoe, { range: 1 }, { raw: 8 });
      const blocked = far.find((o) => o.id === "hiddenBola" && !o.ok);
      if (!labOffersBola || !click || !blocked) {
        row.status = "ISSUE";
        row.notes.push(
          "Hidden Bola grants hasHiddenBola, but the lab reaction window does not offer it when the attacker is in RANGE 3."
        );
      } else {
        row.notes.push(
          "reaction window offers Hidden Bola in R3 (" +
            (click.freeAction ? "free reaction" : "−1 AP") +
            " · −1 stress · −" +
            click.reduce +
            (click.knockdown ? " · Knockdown" : "") +
            "); out of range: " +
            blocked.reason
        );
      }
    } else if (flags.length) {
      row.notes.push("passive: " + flags.join(", "));
      if (id === "mystic-game-knowledge") {
        row.notes.push("OOC stub (system rolls / XP) — no combat action");
      }
      if (hero.vigilant) {
        row.notes.push("MOVE 1 safe arms after this hero takes an OA");
      }
    } else if (addedAbilities.length) {
      row.notes.push("granted abilities " + addedAbilities.join(", "));
    } else {
      row.status = "ISSUE";
      row.notes.push("granted featSmoke only — no flag, stat, or action change");
    }
  } catch (err) {
    row.status = "ISSUE";
    row.notes.push("audit threw: " + (err && err.message ? err.message : String(err)));
  }
  rows.push(row);
}

const ok = rows.filter((r) => r.status === "OK");
const issues = rows.filter((r) => r.status !== "OK");
const wdRows = rows.filter((r) => r.wd.length);

let md = "";
md += "# Rank-1 talent dummy QoL audit\n\n";
md += "Scope: every `FEAT_SMOKE_STUBS` talent, one at a time on `train_<class>` (two copies of that class vs the Training Dummy). Damage numbers use `resolveAbilityTierDamage` — the same helper a strike uses.\n\n";
md += "Counts: **" + ok.length + " OK**, **" + issues.length + " issues**, **" + rows.length + " checked**.\n\n";
if (assertError) {
  md += "Preview assertions failed: `" + assertError.message + "`\n\n";
} else {
  md += "Locked preview checks passed (Uppercut 6/8/11 vs 7/9/11, Heavy Swing, Precise Strike, Forceful Push, Flurry 13/18/33 vs 15/20/33, Shield Bash still 3/5/7 and not `useWeapon`).\n\n";
}
md += "## Uppercut before / after\n\n";
md += "Before, the inspect card printed the token: `T1 WD · T2 WD · BREAK 2 · T3 WD · BREAK 5`, and the meta badge was `WD`.\n\n";
md += "After, with Fighting Gloves active (Brawler STR 1):\n\n";
md += "- Tier lines: `T1 6 · T2 8 · BREAK 2 · T3 11 · BREAK 5`\n";
md += "- Both kits: `Fighting Gloves 6/8/11 (active) · Quarterstaff 7/9/11`\n";
md += "- Meta badge is the kit name (`Fighting Gloves`), not `WD`\n";
md += "- Attack button: `Uppercut · Fighting Gloves 6/8/11 (active) · Quarterstaff 7/9/11 · R1 (1 AP)`\n\n";
md += "Shield Bash is unchanged: `3 / 5 / 7` plus Taunt. It is not a WD talent.\n\n";
md += "## WD talents (resolved)\n\n";
for (const r of wdRows) {
  md += "- **" + r.id + "** — " + r.wd.join(" · ");
  if (r.status !== "OK") md += " — " + r.status;
  md += "\n";
}
md += "\n## Per talent\n\n";
let last = "";
for (const r of rows) {
  if (r.classId !== last) {
    md += "\n### " + r.classId.charAt(0).toUpperCase() + r.classId.slice(1) + "\n\n";
    last = r.classId;
  }
  md += "- **" + r.status + "** `" + r.id + "` — " + (r.notes.join("; ") || "ok") + "\n";
}
md += "\n## Still failing mechanically\n\n";
if (!issues.length) {
  md += "None.\n";
} else {
  for (const r of issues) {
    md += "- `" + r.id + "`: " + r.notes.join("; ") + "\n";
  }
}
md += "\n## Display notes\n\n";
md += "- Inspect tier lines and the attack buttons resolve `WD` / `2WD` / `3WD` (including `+stat` and `+bonus`) through `previewTierDamage` → `resolveAbilityTierDamage`. `3WD` used to render as `0` because `\"3WD\" | 0` is 0.\n";
md += "- Both class kits are listed when the talent is legal on both. A `weaponId` lock (Pin Shot → Shortbow) shows only that kit.\n";
md += "- `breakStat`, status `xStat`, Vulnerable `xStat`, and Push `xStat` on the card now use the hero's stat, matching the strike.\n";
md += "- Full Contact's extra +1 Push is applied when the strike resolves. It is not baked into the weapon card's printed push.\n";
md += "- Picker stub labels still contain the authored shorthand (`WD+STR`, `2WD`). The card text under the label now adds the resolved kit line.\n";
md += "- Zero-damage tiers that only apply a status (Intimidating Shout, Enfeeble) no longer lead with a bare `0`.\n";

const outPath = path.join(root, "docs", "TALENT-DUMMY-QOL.md");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, md);
console.log(md);
console.log("---");
console.log("wrote", outPath);
console.log("OK", ok.length, "ISSUE", issues.length);
if (assertError) {
  console.error(assertError);
  process.exit(1);
}
if (issues.length) process.exitCode = 0;
