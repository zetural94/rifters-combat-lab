/**
 * Soft/BP v0.3g re-gate after the A-02 range fix.
 *
 * There is no older standalone stairs script in the repo. The lock is
 * runRiftMonteCarlo + RIFT_KPI_BY_LANE + TALENT_BP_V03 in mc/r1.js.
 * This runner calls those same functions (playRift, same seed stream as
 * runRiftMonteCarlo: seed0 + i) and prints one JSON object per cell.
 *
 * Sample size for the stairs grid is 100, the default of runRiftMonteCarlo.
 * Talent coverage uses 40 rifts per talent (Medium, package n=4).
 *
 * Usage:
 *   node scripts/soft-regate-a02.mjs drive stairs --runs 100 --seed 1 --out /tmp/stairs.json
 *   node scripts/soft-regate-a02.mjs drive coverage --runs 40 --seed 1 --out /tmp/cov.json
 *   node scripts/soft-regate-a02.mjs drive usage --runs 30 --seed 1 --out /tmp/usage.json
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  r1CardFiles,
  playRift,
  makeR1Encounter,
  playFight,
  RIFT_KPI_BY_LANE,
} from "../mc/r1.js";
import { r1LadderFeats, mixLadderFeats } from "../mc/talent-ladder.js";
import {
  allCoverageTalents,
  featPackageForTalent,
  partyForClass,
  classOfTalent,
} from "../mc/talent-coverage.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

const LANES = ["rift_easy", "rift_medium", "rift_hard"];

/** Party grids. feats=r1 uses the R1 ladder; feats=mix uses MIX_LADDER_PICKS. */
const PARTY_SPECS = [
  {
    id: "r1",
    party: "r1",
    feats: "r1",
    note: "Kotwica R1: Fighter / Brawler / Assassin / Scout, drabinka R1",
  },
  {
    id: "casters",
    party: "casters",
    feats: "mix",
    note: "Mystic / Acolyte / Primalist / Scout. Toxic Cloud od n>=3",
  },
  {
    id: "frontline",
    party: "frontline",
    feats: "mix",
    note: "Fighter / Brawler / Primalist / Acolyte. Entangle od n>=2",
  },
  {
    id: "glass",
    party: "glass",
    feats: "mix",
    note: "Assassin / Scout / Mystic / Acolyte. Toxic Cloud od n>=3",
  },
  {
    id: "summoner",
    party: ["mystic", "acolyte", "primalist", "scout"],
    feats: "r1",
    note: "Acolyte z Summon Mage (Fireball) od n>=2, drabinka R1",
  },
];

function loadPack() {
  const cards = {};
  for (const name of r1CardFiles()) {
    const file = path.join(ROOT, "cards", name + ".json");
    cards[name] = JSON.parse(fs.readFileSync(file, "utf8"));
  }
  const abilityById = {};
  for (const card of Object.values(cards)) {
    if (card.kind === "ability") abilityById[card.id] = card;
  }
  return { cards, abilityById };
}

function featSmokeFor(spec, nTalent) {
  if (spec.feats === "mix") return mixLadderFeats(spec.party, nTalent);
  return r1LadderFeats(nTalent);
}

function median(values) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * 0.5))];
}

function mean(values) {
  if (!values.length) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function round4(n) {
  if (n == null || Number.isNaN(n)) return null;
  return Math.round(n * 10000) / 10000;
}

export function summarizeRows(rows, chain) {
  const band = (RIFT_KPI_BY_LANE[chain] || RIFT_KPI_BY_LANE.rift_medium).wounds;
  const [lo, hi] = band;
  const cleared = rows.filter((r) => r.winner === "hero");
  const wounds = rows.map((r) => r.wounds | 0);
  const clearWounds = cleared.map((r) => r.wounds | 0);
  const p50 = median(wounds);
  const p50Clear = median(clearWounds);
  const inBandAll = p50 != null && p50 >= lo && p50 <= hi;
  const inBandClear = p50Clear != null && p50Clear >= lo && p50Clear <= hi;
  const clearsInBand = cleared.filter((r) => r.wounds >= lo && r.wounds <= hi).length;
  return {
    n: rows.length,
    chain,
    band: [lo, hi],
    winRate: round4(rows.filter((r) => r.winner === "hero").length / rows.length),
    lossRate: round4(rows.filter((r) => r.winner === "enemy").length / rows.length),
    timeoutRate: round4(rows.filter((r) => r.winner === "timeout").length / rows.length),
    woundsMean: round4(mean(wounds)),
    woundsP50: p50,
    woundsMeanClear: round4(mean(clearWounds)),
    woundsP50Clear: p50Clear,
    clearsInBand: round4(clearsInBand / Math.max(1, cleared.length)),
    clearedN: cleared.length,
    inBand: inBandClear,
    inBandAll,
  };
}

function runStairsCell(pack, job) {
  const spec = PARTY_SPECS.find((p) => p.id === job.partyId);
  if (!spec) throw new Error("unknown party " + job.partyId);
  const nTalent = job.nTalent | 0;
  const featSmoke = featSmokeFor(spec, nTalent);
  const rows = [];
  for (let i = 0; i < job.runs; i++) {
    rows.push(
      playRift(pack, (job.seed | 0) + i, {
        chain: job.chain,
        policy: "table",
        party: spec.party,
        talentsPerHero: nTalent,
        featSmoke,
      })
    );
  }
  return {
    kind: "stairs",
    partyId: spec.id,
    partyNote: spec.note,
    nTalent,
    feats: spec.feats,
    featCount: featSmoke.length,
    ...summarizeRows(rows, job.chain),
  };
}

function runCoverageCell(pack, job) {
  const talentId = job.talentId;
  const nTalent = job.nTalent | 0;
  const featSmoke = featPackageForTalent(talentId, nTalent);
  const party = partyForClass(classOfTalent(talentId));
  const rows = [];
  for (let i = 0; i < job.runs; i++) {
    rows.push(
      playRift(pack, (job.seed | 0) + i, {
        chain: job.chain || "rift_medium",
        policy: "table",
        party,
        talentsPerHero: nTalent,
        featSmoke,
      })
    );
  }
  return {
    kind: "coverage",
    talentId,
    classId: classOfTalent(talentId),
    party,
    nTalent,
    ...summarizeRows(rows, job.chain || "rift_medium"),
  };
}

function countLog(state, re) {
  const entries = (state.log || []).map((e) => (e && e.msg) || "");
  let n = 0;
  for (const msg of entries) if (re.test(msg)) n += 1;
  return n;
}

function runUsage(pack, job) {
  const fightsOfLane = {
    rift_easy: ["horde_pack", "bear_w2", "medium"],
    rift_medium: ["w1", "bear_w4", "solo_tortoise"],
    rift_hard: ["bear_w4", "hard", "solo_tortoise"],
  };
  // Cast counts are from fresh rooms at the same seeds (playRift does not return logs).
  // Wound KPI below is the real playRift, including carry between rooms.
  const scenarios = [
    {
      id: "entangle",
      party: "frontline",
      nTalent: 2,
      chain: "rift_medium",
      feats: null,
      re: /Entangle/i,
      note: "frontline mix n=2, Entangle jest na drabince",
    },
    {
      id: "toxic-cloud",
      party: "casters",
      nTalent: 3,
      chain: "rift_medium",
      feats: null,
      re: /Toxic Cloud/i,
      note: "casters mix n=3, Toxic Cloud jest na drabince",
    },
    {
      id: "fireball-ladder",
      party: ["mystic", "acolyte", "primalist", "scout"],
      nTalent: 3,
      chain: "rift_medium",
      feats: null,
      re: /Fireball/i,
      note: "drabinka R1 n=3 ma i Warrior i Mage; AI bierze pierwsze Summon (Warrior)",
    },
    {
      id: "fireball-mage-only",
      party: ["fighter", "brawler", "scout", "acolyte"],
      nTalent: 1,
      chains: ["rift_easy", "rift_medium", "rift_hard"],
      feats: ["acolyte-summon-mage"],
      re: /Fireball/i,
      note: "tylko Summon Mage, bez Warrior, żeby Fireball w ogóle wszedł na stół",
    },
  ];
  const out = [];
  for (const sc of scenarios) {
    const chains = sc.chains || [sc.chain];
    for (const chain of chains) {
      const spec = typeof sc.party === "string" ? PARTY_SPECS.find((p) => p.id === sc.party) : null;
      const party = spec ? spec.party : sc.party;
      const nTalent = sc.nTalent | 0;
      const featSmoke = sc.feats || (spec ? featSmokeFor(spec, nTalent) : r1LadderFeats(nTalent));
      let casts = 0;
      let summons = 0;
      let fights = 0;
      const rows = [];
      const fightsOf = fightsOfLane[chain];
      for (let i = 0; i < job.runs; i++) {
        const seed = (job.seed | 0) + i;
        rows.push(
          playRift(pack, seed, {
            chain,
            policy: "table",
            party,
            talentsPerHero: nTalent,
            featSmoke,
          })
        );
        for (let f = 0; f < fightsOf.length; f++) {
          const state = makeR1Encounter(pack, seed + f * 17, {
            scenario: fightsOf[f],
            mixKits: true,
            party,
            featSmoke,
            talentsPerHero: nTalent,
          });
          playFight(state, "table");
          const lines = (state.log || []).map((e) => (e && e.msg) || "");
          casts += lines.reduce((n, line) => n + (sc.re.test(line) ? 1 : 0), 0);
          summons += lines.reduce((n, line) => n + (line.includes("summons Summon · Mage") ? 1 : 0), 0);
          fights += 1;
        }
      }
      out.push({
        id: sc.id,
        chain,
        nTalent,
        note: sc.note,
        runs: job.runs,
        fights,
        casts,
        mageSummons: summons,
        castsPerRift: round4(casts / job.runs),
        ...summarizeRows(rows, chain),
      });
    }
  }
  return { kind: "usage", scenarios: out };
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next == null || next.startsWith("--")) out[key] = true;
      else {
        out[key] = next;
        i += 1;
      }
    } else out._.push(a);
  }
  return out;
}

function stairsJobs(runs, seed) {
  const jobs = [];
  for (const spec of PARTY_SPECS) {
    for (const chain of LANES) {
      for (let nTalent = 0; nTalent <= 4; nTalent++) {
        jobs.push({
          mode: "stairs-cell",
          partyId: spec.id,
          chain,
          nTalent,
          runs,
          seed,
        });
      }
    }
  }
  return jobs;
}

function coverageJobs(runs, seed) {
  return allCoverageTalents().map((talentId) => ({
    mode: "coverage-cell",
    talentId,
    chain: "rift_medium",
    nTalent: 4,
    runs,
    seed,
  }));
}

async function pool(jobs, concurrency, worker) {
  const results = new Array(jobs.length);
  let next = 0;
  async function pump() {
    while (next < jobs.length) {
      const index = next++;
      const t0 = Date.now();
      results[index] = await worker(jobs[index]);
      const label = jobs[index].talentId || jobs[index].partyId + " " + jobs[index].chain + " n" + jobs[index].nTalent;
      process.stderr.write(
        "[" + (index + 1) + "/" + jobs.length + "] " + label + " " + (Date.now() - t0) + "ms\n"
      );
    }
  }
  const n = Math.max(1, Math.min(concurrency, jobs.length));
  await Promise.all(Array.from({ length: n }, () => pump()));
  return results;
}

function runChild(job) {
  return new Promise((resolve, reject) => {
    const self = fileURLToPath(import.meta.url);
    const args = [self, "once", JSON.stringify(job)];
    const child = spawn(process.execPath, args, { cwd: ROOT });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d;
    });
    child.stderr.on("data", (d) => {
      stderr += d;
    });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || stdout || "cell failed " + code));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (err) {
        reject(new Error("bad json: " + stdout.slice(0, 400) + " " + err.message));
      }
    });
  });
}

async function drive(mode, args) {
  const runs = args.runs != null ? args.runs | 0 : mode === "coverage" ? 40 : mode === "usage" ? 30 : 100;
  const seed = args.seed != null ? args.seed | 0 : 1;
  const concurrency = args.jobs != null ? args.jobs | 0 : 4;
  let jobs;
  if (mode === "stairs") jobs = stairsJobs(runs, seed);
  else if (mode === "coverage") jobs = coverageJobs(runs, seed);
  else if (mode === "usage") jobs = [{ mode: "usage", runs, seed }];
  else throw new Error("unknown drive " + mode);

  const t0 = Date.now();
  const results =
    mode === "usage"
      ? [await runChild(jobs[0])]
      : await pool(jobs, concurrency, runChild);
  const payload = {
    mode,
    runs,
    seed,
    policy: "table",
    elapsedMs: Date.now() - t0,
    head: process.env.REGATE_HEAD || null,
    results: mode === "usage" ? results[0] : results,
  };
  const text = JSON.stringify(payload);
  if (args.out) fs.writeFileSync(args.out, text);
  else process.stdout.write(text + "\n");
  process.stderr.write("done " + mode + " " + payload.elapsedMs + "ms -> " + (args.out || "stdout") + "\n");
}

function once(json) {
  const job = JSON.parse(json);
  const pack = loadPack();
  let result;
  if (job.mode === "stairs-cell") result = runStairsCell(pack, job);
  else if (job.mode === "coverage-cell") result = runCoverageCell(pack, job);
  else if (job.mode === "usage") result = runUsage(pack, job);
  else throw new Error("unknown once " + job.mode);
  process.stdout.write(JSON.stringify(result));
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0] || "drive";
if (cmd === "once") {
  once(args._[1]);
} else if (cmd === "drive") {
  const mode = args._[1];
  if (!mode) {
    process.stderr.write("usage: drive stairs|coverage|usage --runs N --seed N --out file\n");
    process.exit(2);
  }
  drive(mode, args).catch((err) => {
    process.stderr.write(String(err && err.stack ? err.stack : err) + "\n");
    process.exit(1);
  });
} else {
  process.stderr.write("unknown command " + cmd + "\n");
  process.exit(2);
}
