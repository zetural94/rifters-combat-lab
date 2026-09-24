import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadSchema, validateAllCards, validateCard } from "../scripts/check-card-schema.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("every card under cards/ matches card.schema.json", () => {
  const { files, failures } = validateAllCards();
  assert.ok(files > 0, "no cards found");
  const text = failures
    .map((row) => row.file + "\n  " + row.errors.join("\n  "))
    .join("\n");
  assert.equal(failures.length, 0, text);
});

test("schema names the engine fields xStat, breakStat, maxTargets, n, and x", () => {
  const blob = fs.readFileSync(path.join(root, "cards", "card.schema.json"), "utf8");
  for (const key of ["xStat", "xStatMult", "breakStat", "maxTargets", '"n"', '"x"']) {
    assert.ok(blob.includes(key), "schema missing " + key);
  }
});

test("nested xStat type fails (deep check, not a top-level key list)", () => {
  const schema = loadSchema();
  const card = {
    kind: "ability",
    id: "bad-xstat",
    name: "Bad",
    tiers: { t2: { dmg: 1, status: { id: "burn", x: 1, xStat: 5 } } },
  };
  const result = validateCard(card, schema);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("xStat")));
});

test("maxTargets string and breakStat are accepted when typed", () => {
  const schema = loadSchema();
  const card = {
    kind: "ability",
    id: "ok-targets",
    name: "Ok",
    aoe: { range: 8, maxTargets: "1+DEX" },
    tiers: { t2: { dmg: "WD", break: 2, breakStat: "STR" } },
  };
  const result = validateCard(card, schema);
  assert.deepEqual(result.errors, []);
});
