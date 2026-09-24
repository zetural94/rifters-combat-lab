/**
 * Combinatorial talent sweep for Soft/BP v0.3g.
 *
 * Replaces a single ladder-A/B order with:
 *   1. Every subset of size n=1..4 for one class, other party members on ladder A.
 *   2. A seeded sample of mixed parties where each hero has a random subset of size n.
 *
 * Does not change stairs, bands, or talent numbers. Warrior is skipped.
 *
 *   node tools/run-talent-sweep.mjs --seed 1 --runs 4 --mixed 1000 --jobs 4 --out /tmp/talent-sweep
 *   node tools/run-talent-sweep.mjs --analyze /tmp/talent-sweep --report /tmp/talent-sweep/summary.json
 *
 * Flags:
 *   --seed N        master seed (default 1)
 *   --runs N        rifts per build; the build mean is the in-band test (default 4)
 *   --mixed N       random parties per lane per n (default 1000)
 *   --lanes a,b     rift_easy,rift_medium,rift_hard
 *   --classes a,b   default: the seven T1 classes, never warrior
 *   --jobs N        worker processes (default 4)
 *   --out DIR       jsonl shards
 *   --limit N       stop after N jobs (smoke)
 *   --analyze DIR   read shards and write summary JSON
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { r1CardFiles, playRift, RIFT_KPI_BY_LANE, FEAT_SMOKE_STUBS } from "../mc/r1.js";
import { r1LadderFeats } from "../mc/talent-ladder.js";
import { CLASS_ORDER, partyForClass, talentPoolFromStubs } from "../mc/talent-coverage.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PLAYABLE = CLASS_ORDER.filter((c) => c !== "warrior");

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

function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function combinations(items, k) {
  const out = [];
  const cur = [];
  function rec(start) {
    if (cur.length === k) {
      out.push(cur.slice());
      return;
    }
    for (let i = start; i <= items.length - (k - cur.length); i++) {
      cur.push(items[i]);
      rec(i + 1);
      cur.pop();
    }
  }
  if (k >= 0 && k <= items.length) rec(0);
  return out;
}

function loadPack() {
  const cards = {};
  for (const name of r1CardFiles()) {
    cards[name] = JSON.parse(fs.readFileSync(path.join(ROOT, "cards", name + ".json"), "utf8"));
  }
  const abilityById = {};
  for (const card of Object.values(cards)) {
    if (card.kind === "ability") abilityById[card.id] = card;
  }
  return { cards, abilityById };
}

function poolByClass(classes) {
  const all = talentPoolFromStubs();
  const pool = {};
  for (const cls of classes) {
    const ids = (all[cls] || []).filter((id) => {
      const stub = FEAT_SMOKE_STUBS[id];
      return stub && stub.classId === cls;
    });
    pool[cls] = ids.slice().sort();
  }
  return pool;
}

function ladderByClass(n) {
  const map = {};
  for (const id of r1LadderFeats(n)) {
    const stub = FEAT_SMOKE_STUBS[id];
    const cls = stub && stub.classId;
    if (!cls || cls === "warrior") continue;
    if (!map[cls]) map[cls] = [];
    map[cls].push(id);
  }
  return map;
}

function configFromArgs(args) {
  const classes = String(args.classes || PLAYABLE.join(","))
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && s !== "warrior");
  const lanes = String(args.lanes || "rift_easy,rift_medium,rift_hard")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    seed: args.seed != null ? args.seed | 0 : 1,
    runs: Math.max(1, args.runs != null ? args.runs | 0 : 4),
    mixed: args.mixed != null ? args.mixed | 0 : 1000,
    jobs: Math.max(1, args.jobs != null ? args.jobs | 0 : Math.min(4, os.cpus().length || 1)),
    limit: args.limit != null ? args.limit | 0 : 0,
    classes,
    lanes,
    out: args.out || "/tmp/talent-sweep",
  };
}

function buildCombos(pool) {
  const combos = {};
  for (const cls of Object.keys(pool)) {
    combos[cls] = {};
    const ids = pool[cls];
    const maxN = Math.min(4, ids.length);
    for (let n = 1; n <= maxN; n++) combos[cls][n] = combinations(ids, n);
  }
  return combos;
}

function exhaustiveJobs(cfg, pool) {
  const jobs = [];
  for (const cls of cfg.classes) {
    const ids = pool[cls] || [];
    const maxN = Math.min(4, ids.length);
    for (let n = 1; n <= maxN; n++) {
      for (const subset of combinations(ids, n)) {
        for (const lane of cfg.lanes) {
          jobs.push({ kind: "ex", cls, n, talents: subset, lane });
        }
      }
    }
  }
  return jobs;
}

function mixedCount(cfg) {
  return cfg.lanes.length * 4 * cfg.mixed;
}

function mixedJobAt(index, cfg, combos) {
  let left = index;
  for (const lane of cfg.lanes) {
    for (let n = 1; n <= 4; n++) {
      if (left < cfg.mixed) {
        const rng = mulberry32(hashSeed(cfg.seed + "|mix|" + lane + "|" + n + "|" + left));
        const order = cfg.classes.slice();
        for (let i = order.length - 1; i > 0; i--) {
          const j = Math.floor(rng() * (i + 1));
          const tmp = order[i];
          order[i] = order[j];
          order[j] = tmp;
        }
        const party = order.slice(0, 4);
        const byHero = {};
        const talents = [];
        for (const cls of party) {
          const list = (combos[cls] && combos[cls][n]) || [];
          const pick = list.length ? list[Math.floor(rng() * list.length)] : [];
          byHero[cls] = pick;
          talents.push(...pick);
        }
        return { kind: "mix", lane, n, party, byHero, talents };
      }
      left -= cfg.mixed;
    }
  }
  return null;
}

function featsForExhaustive(job, ladders) {
  const party = partyForClass(job.cls);
  const ladder = ladders[job.n] || {};
  const feats = [];
  for (const hero of party) {
    if (hero === job.cls) feats.push(...job.talents);
    else feats.push(...(ladder[hero] || []));
  }
  return { party, feats };
}

function runJob(pack, job, cfg, ladders) {
  let party;
  let feats;
  let focus = null;
  if (job.kind === "ex") {
    const built = featsForExhaustive(job, ladders);
    party = built.party;
    feats = built.feats;
    focus = job.talents;
  } else {
    party = job.party;
    feats = job.talents;
  }
  const key =
    job.kind +
    "|" +
    job.lane +
    "|" +
    job.n +
    "|" +
    (job.cls || party.join("+")) +
    "|" +
    (focus || job.talents).join(",");
  let sum = 0;
  let sum2 = 0;
  let wins = 0;
  let timeouts = 0;
  const runs = cfg.runs;
  for (let r = 0; r < runs; r++) {
    const seed = hashSeed(cfg.seed + "|" + key + "|" + r) || 1;
    const row = playRift(pack, seed, {
      chain: job.lane,
      policy: "table",
      party,
      talentsPerHero: job.n,
      featSmoke: feats,
    });
    const w = row.wounds | 0;
    sum += w;
    sum2 += w * w;
    if (row.winner === "hero") wins += 1;
    else if (row.winner === "timeout") timeouts += 1;
  }
  const mean = sum / runs;
  const variance = runs > 1 ? Math.max(0, (sum2 - (sum * sum) / runs) / (runs - 1)) : 0;
  const rec = {
    kind: job.kind,
    lane: job.lane,
    n: job.n,
    mean: Math.round(mean * 1000) / 1000,
    sd: Math.round(Math.sqrt(variance) * 1000) / 1000,
    wins,
    timeouts,
    runs,
  };
  if (job.kind === "ex") {
    rec.cls = job.cls;
    rec.talents = job.talents;
  } else {
    rec.party = job.party;
    rec.talents = job.talents;
  }
  return rec;
}

function workerMain(args) {
  const cfg = configFromArgs(args);
  const shard = args.shard | 0;
  const shards = Math.max(1, args.shards | 0 || 1);
  const pool = poolByClass(cfg.classes);
  const combos = buildCombos(pool);
  const ladders = {};
  for (let n = 1; n <= 4; n++) ladders[n] = ladderByClass(n);
  const ex = exhaustiveJobs(cfg, pool);
  const mixN = mixedCount(cfg);
  const total = ex.length + mixN;
  const pack = loadPack();
  const outPath = args.out;
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const stream = fs.createWriteStream(outPath, { flags: "w" });
  let done = 0;
  let seen = 0;
  const t0 = Date.now();
  const limit = cfg.limit;
  for (let i = shard; i < total; i += shards) {
    if (limit && seen >= limit) break;
    seen += 1;
    const job = i < ex.length ? ex[i] : mixedJobAt(i - ex.length, cfg, combos);
    if (!job) continue;
    const rec = runJob(pack, job, cfg, ladders);
    stream.write(JSON.stringify(rec) + "\n");
    done += 1;
    if (done % 20 === 0) {
      const sec = (Date.now() - t0) / 1000;
      process.stderr.write(
        "shard " + shard + " " + done + " jobs " + (done / Math.max(0.001, sec)).toFixed(2) + "/s\n"
      );
    }
  }
  stream.end();
  stream.on("finish", () => {
    process.stderr.write(
      "shard " + shard + " done " + done + " in " + ((Date.now() - t0) / 1000).toFixed(1) + "s\n"
    );
  });
  return new Promise((resolve) => stream.on("finish", resolve));
}

function spawnWorker(args, shard, shards, outFile) {
  const self = fileURLToPath(import.meta.url);
  const argv = [
    self,
    "--worker",
    "--shard",
    String(shard),
    "--shards",
    String(shards),
    "--seed",
    String(args.seed),
    "--runs",
    String(args.runs),
    "--mixed",
    String(args.mixed),
    "--lanes",
    args.lanes.join(","),
    "--classes",
    args.classes.join(","),
    "--out",
    outFile,
  ];
  if (args.limit) argv.push("--limit", String(args.limit));
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, argv, { cwd: ROOT });
    child.stderr.on("data", (d) => process.stderr.write(d));
    child.stdout.on("data", (d) => process.stdout.write(d));
    child.on("close", (code) => {
      if (code !== 0) reject(new Error("worker " + shard + " exit " + code));
      else resolve();
    });
  });
}

async function parentMain(args) {
  const cfg = configFromArgs(args);
  const pool = poolByClass(cfg.classes);
  const ex = exhaustiveJobs(cfg, pool);
  const mixN = mixedCount(cfg);
  fs.mkdirSync(cfg.out, { recursive: true });
  const meta = {
    seed: cfg.seed,
    runs: cfg.runs,
    mixedPerLaneN: cfg.mixed,
    classes: cfg.classes,
    lanes: cfg.lanes,
    poolSizes: Object.fromEntries(cfg.classes.map((c) => [c, (pool[c] || []).length])),
    exhaustiveBuilds: ex.length / cfg.lanes.length,
    exhaustiveCells: ex.length,
    mixedParties: mixN,
    rifts: (ex.length + mixN) * cfg.runs,
  };
  fs.writeFileSync(path.join(cfg.out, "meta.json"), JSON.stringify(meta, null, 2));
  process.stderr.write(JSON.stringify(meta) + "\n");
  const t0 = Date.now();
  if (cfg.jobs === 1) {
    await workerMain({
      ...args,
      worker: true,
      shard: 0,
      shards: 1,
      out: path.join(cfg.out, "shard-0.jsonl"),
      seed: cfg.seed,
      runs: cfg.runs,
      mixed: cfg.mixed,
      lanes: cfg.lanes.join(","),
      classes: cfg.classes.join(","),
    });
  } else {
    const tasks = [];
    for (let s = 0; s < cfg.jobs; s++) {
      tasks.push(spawnWorker(cfg, s, cfg.jobs, path.join(cfg.out, "shard-" + s + ".jsonl")));
    }
    await Promise.all(tasks);
  }
  const elapsed = Date.now() - t0;
  fs.writeFileSync(
    path.join(cfg.out, "meta.json"),
    JSON.stringify(Object.assign({}, meta, { elapsedMs: elapsed }), null, 2)
  );
  process.stderr.write("sweep done " + (elapsed / 1000).toFixed(1) + "s\n");
}

function readRows(dir) {
  const rows = [];
  const names = fs.readdirSync(dir).filter((n) => n.endsWith(".jsonl"));
  for (const name of names) {
    const text = fs.readFileSync(path.join(dir, name), "utf8");
    for (const line of text.split("\n")) {
      if (!line) continue;
      rows.push(JSON.parse(line));
    }
  }
  return rows;
}

function wilson(k, n, z = 1.96) {
  if (!n) return { p: null, lo: null, hi: null };
  const p = k / n;
  const z2 = z * z;
  const den = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / den;
  const margin = (z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / den;
  return {
    p: round4(p),
    lo: round4(Math.max(0, center - margin)),
    hi: round4(Math.min(1, center + margin)),
  };
}

function round4(n) {
  if (n == null || Number.isNaN(n)) return null;
  return Math.round(n * 10000) / 10000;
}

function bandOf(lane) {
  const laneRow = RIFT_KPI_BY_LANE[lane] || RIFT_KPI_BY_LANE.rift_medium;
  return laneRow.wounds;
}

function inBand(mean, lane) {
  const [lo, hi] = bandOf(lane);
  return mean >= lo && mean <= hi;
}

function side(mean, lane) {
  const [lo, hi] = bandOf(lane);
  if (mean < lo) return "low";
  if (mean > hi) return "high";
  return "in";
}

function summarizeGroup(rows) {
  const n = rows.length;
  let inN = 0;
  let low = 0;
  let high = 0;
  let winSum = 0;
  let toSum = 0;
  let runSum = 0;
  let meanSum = 0;
  let seSum = 0;
  const means = [];
  for (const row of rows) {
    means.push(row.mean);
    meanSum += row.mean;
    if (inBand(row.mean, row.lane)) inN += 1;
    const s = side(row.mean, row.lane);
    if (s === "low") low += 1;
    if (s === "high") high += 1;
    winSum += row.wins;
    toSum += row.timeouts;
    runSum += row.runs;
    const se = row.runs > 1 ? row.sd / Math.sqrt(row.runs) : null;
    if (se != null) seSum += se;
  }
  means.sort((a, b) => a - b);
  const q = (p) => (means.length ? means[Math.min(means.length - 1, Math.floor((means.length - 1) * p))] : null);
  const w = wilson(inN, n);
  return {
    builds: n,
    inBand: inN,
    inBandRate: w.p,
    inBandLo: w.lo,
    inBandHi: w.hi,
    tooStrong: low,
    tooWeak: high,
    tooStrongRate: n ? round4(low / n) : null,
    tooWeakRate: n ? round4(high / n) : null,
    winRate: runSum ? round4(winSum / runSum) : null,
    timeoutRate: runSum ? round4(toSum / runSum) : null,
    meanOfMeans: n ? round4(meanSum / n) : null,
    p50Mean: q(0.5),
    p10Mean: q(0.1),
    p90Mean: q(0.9),
    meanSe: n ? round4(seSum / n) : null,
  };
}

function groupKey(row) {
  return row.lane + "|n" + row.n;
}

function talentEffects(rows) {
  const byClass = {};
  for (const row of rows) {
    if (row.kind !== "ex") continue;
    if (!byClass[row.cls]) byClass[row.cls] = [];
    byClass[row.cls].push(row);
  }
  const talents = [];
  const pairs = [];
  for (const cls of Object.keys(byClass)) {
    const list = byClass[cls];
    const ids = [];
    const seen = new Set();
    for (const row of list) {
      for (const id of row.talents) {
        if (!seen.has(id)) {
          seen.add(id);
          ids.push(id);
        }
      }
    }
    ids.sort();
    const bit = {};
    ids.forEach((id, i) => {
      bit[id] = 1 << i;
    });
    const packed = list.map((row) => {
      let mask = 0;
      for (const id of row.talents) mask |= bit[id] || 0;
      return { row, mask };
    });
    for (const id of ids) {
      const flag = bit[id];
      const perLane = {};
      for (const lane of ["rift_easy", "rift_medium", "rift_hard"]) {
        const deltas = [];
        let withOut = 0;
        let withN = 0;
        let withoutOut = 0;
        let withoutN = 0;
        let withHigh = 0;
        let withLow = 0;
        for (let n = 1; n <= 4; n++) {
          const has = [];
          const lacks = [];
          for (const item of packed) {
            if (item.row.lane !== lane || item.row.n !== n) continue;
            if (item.mask & flag) has.push(item.row);
            else lacks.push(item.row);
          }
          if (!has.length || !lacks.length) continue;
          const mh = has.reduce((s, r) => s + r.mean, 0) / has.length;
          const ml = lacks.reduce((s, r) => s + r.mean, 0) / lacks.length;
          deltas.push({ n, delta: mh - ml, withN: has.length, withoutN: lacks.length });
          for (const r of has) {
            withN += 1;
            if (!inBand(r.mean, lane)) withOut += 1;
            if (side(r.mean, lane) === "high") withHigh += 1;
            if (side(r.mean, lane) === "low") withLow += 1;
          }
          for (const r of lacks) {
            withoutN += 1;
            if (!inBand(r.mean, lane)) withoutOut += 1;
          }
        }
        const delta = deltas.length ? deltas.reduce((s, d) => s + d.delta, 0) / deltas.length : null;
        perLane[lane] = {
          delta: delta == null ? null : round4(delta),
          byN: deltas.map((d) => ({ n: d.n, delta: round4(d.delta) })),
          withOutRate: withN ? round4(withOut / withN) : null,
          withoutOutRate: withoutN ? round4(withoutOut / withoutN) : null,
          withHighRate: withN ? round4(withHigh / withN) : null,
          withLowRate: withN ? round4(withLow / withN) : null,
        };
      }
      const deltas = Object.values(perLane)
        .map((x) => x.delta)
        .filter((x) => x != null);
      talents.push({
        id,
        cls,
        delta: deltas.length ? round4(deltas.reduce((s, x) => s + x, 0) / deltas.length) : null,
        perLane,
      });
    }
    for (let a = 0; a < ids.length; a++) {
      for (let b = a + 1; b < ids.length; b++) {
        const fa = bit[ids[a]];
        const fb = bit[ids[b]];
        const perLane = {};
        for (const lane of ["rift_easy", "rift_medium", "rift_hard"]) {
          const interactions = [];
          for (let n = 2; n <= 4; n++) {
            const both = [];
            const onlyA = [];
            const onlyB = [];
            const neither = [];
            for (const item of packed) {
              if (item.row.lane !== lane || item.row.n !== n) continue;
              const ha = (item.mask & fa) !== 0;
              const hb = (item.mask & fb) !== 0;
              if (ha && hb) both.push(item.row.mean);
              else if (ha) onlyA.push(item.row.mean);
              else if (hb) onlyB.push(item.row.mean);
              else neither.push(item.row.mean);
            }
            if (!both.length || !onlyA.length || !onlyB.length || !neither.length) continue;
            const avg = (xs) => xs.reduce((s, v) => s + v, 0) / xs.length;
            const inter = avg(both) - avg(onlyA) - avg(onlyB) + avg(neither);
            interactions.push({ n, interaction: inter, both: avg(both) });
          }
          perLane[lane] = interactions.length
            ? {
                interaction: round4(
                  interactions.reduce((s, x) => s + x.interaction, 0) / interactions.length
                ),
                bothMean: round4(interactions.reduce((s, x) => s + x.both, 0) / interactions.length),
              }
            : { interaction: null, bothMean: null };
        }
        const vals = Object.values(perLane)
          .map((x) => x.interaction)
          .filter((x) => x != null);
        pairs.push({
          a: ids[a],
          b: ids[b],
          cls,
          interaction: vals.length ? round4(vals.reduce((s, x) => s + x, 0) / vals.length) : null,
          perLane,
        });
      }
    }
  }
  return { talents, pairs };
}

function analyzeMain(args) {
  const dir = args.analyze === true ? args._[0] : args.analyze;
  const rows = readRows(dir);
  const ex = rows.filter((r) => r.kind === "ex");
  const mix = rows.filter((r) => r.kind === "mix");
  function grid(list) {
    const buckets = {};
    for (const row of list) {
      const key = groupKey(row);
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push(row);
    }
    const out = {};
    for (const key of Object.keys(buckets).sort()) out[key] = summarizeGroup(buckets[key]);
    return out;
  }
  function gridClass(list) {
    const buckets = {};
    for (const row of list) {
      const key = row.cls + "|" + groupKey(row);
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push(row);
    }
    const out = {};
    for (const key of Object.keys(buckets).sort()) out[key] = summarizeGroup(buckets[key]);
    return out;
  }
  const effects = talentEffects(ex);
  effects.talents.sort((a, b) => Math.abs(b.delta || 0) - Math.abs(a.delta || 0));
  effects.pairs.sort((a, b) => Math.abs(b.interaction || 0) - Math.abs(a.interaction || 0));
  const named = [
    "assassin-cold-blooded",
    "scout-spotter",
    "scout-barrage",
    "scout-vigilant",
    "scout-survival-tactics",
  ];
  const summary = {
    rows: rows.length,
    exhaustive: grid(ex),
    exhaustiveByClass: gridClass(ex),
    mixed: grid(mix),
    talents: effects.talents,
    pairs: effects.pairs.slice(0, 40),
    named: named.map((id) => effects.talents.find((t) => t.id === id) || { id, missing: true }),
  };
  const report = args.report || path.join(dir, "summary.json");
  fs.writeFileSync(report, JSON.stringify(summary));
  process.stdout.write("summary " + report + " rows " + rows.length + "\n");
  for (const [label, gridRows] of [
    ["ex", summary.exhaustive],
    ["mix", summary.mixed],
  ]) {
    for (const key of Object.keys(gridRows)) {
      const g = gridRows[key];
      process.stdout.write(
        label +
          " " +
          key +
          " in " +
          Math.round((g.inBandRate || 0) * 1000) / 10 +
          "% [" +
          Math.round((g.inBandLo || 0) * 100) +
          "-" +
          Math.round((g.inBandHi || 0) * 100) +
          "] win " +
          g.winRate +
          " to " +
          g.timeoutRate +
          " mean " +
          g.meanOfMeans +
          " se " +
          g.meanSe +
          " low " +
          g.tooStrongRate +
          " high " +
          g.tooWeakRate +
          "\n"
      );
    }
  }
  process.stdout.write("--- talents ---\n");
  for (const t of summary.talents.slice(0, 25)) {
    process.stdout.write(t.id + " d " + t.delta + "\n");
  }
  process.stdout.write("--- pairs ---\n");
  for (const p of summary.pairs.slice(0, 15)) {
    process.stdout.write(p.a + " + " + p.b + " i " + p.interaction + "\n");
  }
}

const args = parseArgs(process.argv.slice(2));
if (args.worker) {
  workerMain(args).catch((err) => {
    process.stderr.write(String(err && err.stack ? err.stack : err) + "\n");
    process.exit(1);
  });
} else if (args.analyze) {
  analyzeMain(args);
} else {
  parentMain(args).catch((err) => {
    process.stderr.write(String(err && err.stack ? err.stack : err) + "\n");
    process.exit(1);
  });
}
