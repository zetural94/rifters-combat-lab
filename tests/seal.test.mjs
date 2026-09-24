import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { collectPlayableFiles, encryptPack, decryptPack } from "../scripts/seal-lab.mjs";

test("seal round-trips sandbox, engine, and cards", () => {
  const files = collectPlayableFiles();
  const names = new Set(files.map((row) => row[0]));
  assert.ok(names.has("sandbox.html"));
  assert.ok(names.has("engine/index.js"));
  assert.ok(names.has("engine/reactPrompt.js"));
  assert.ok(names.has("cards/fighter.json"));
  assert.ok(names.has("mc/r1.js"));
  const password = "test-password-not-the-lab-one";
  const blob = encryptPack(files.slice(0, 3), password);
  const back = decryptPack(blob, password);
  assert.equal(back.length, 3);
  assert.equal(back[0][0], files[0][0]);
  assert.ok(back[0][1].equals(files[0][1]));
});

test("wrong password does not open the pack", () => {
  const blob = encryptPack([["engine/index.js", Buffer.from("secret-rules")]], "correct-horse");
  assert.throws(() => decryptPack(blob, "wrong-horse"));
});

test("committed lab.enc is ciphertext and Pages exclude lists the source trees", () => {
  const enc = fs.readFileSync(new URL("../lab.enc", import.meta.url));
  const snippet = fs.readFileSync(new URL("../engine/index.js", import.meta.url)).subarray(0, 80);
  assert.equal(enc.subarray(0, 4).toString(), "RFLB");
  assert.equal(enc.includes(snippet), false);
  assert.equal(fs.existsSync(new URL("../.nojekyll", import.meta.url)), false);
  const cfg = fs.readFileSync(new URL("../_config.yml", import.meta.url), "utf8");
  for (const name of ["engine", "cards", "mc", "sandbox.html"]) {
    assert.ok(cfg.includes(name), name);
  }
});
