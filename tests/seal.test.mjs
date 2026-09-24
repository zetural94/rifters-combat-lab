import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import fs from "fs";
import { collectPlayableFiles, encryptPack, decryptPack, plaintextDigest } from "../scripts/seal-lab.mjs";

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
  assert.equal(enc[4], 1);
  assert.equal(enc.readUInt32BE(5), 120000);
  assert.ok(enc.length > 50000);
  assert.equal(enc.includes(snippet), false);
  assert.equal(fs.existsSync(new URL("../.nojekyll", import.meta.url)), false);
  const cfg = fs.readFileSync(new URL("../_config.yml", import.meta.url), "utf8");
  for (const name of ["engine", "cards", "mc", "sandbox.html"]) {
    assert.ok(cfg.includes(name), name);
  }
});

test("lab.manifest.json matches the playable tree and the committed ciphertext", () => {
  const enc = fs.readFileSync(new URL("../lab.enc", import.meta.url));
  const manifest = JSON.parse(fs.readFileSync(new URL("../lab.manifest.json", import.meta.url), "utf8"));
  const files = collectPlayableFiles();
  assert.equal(manifest.files, files.length);
  assert.equal(manifest.packSha256, plaintextDigest(files));
  assert.equal(manifest.encSha256, crypto.createHash("sha256").update(enc).digest("hex"));
});

test("published gate does not store a password hash", () => {
  for (const rel of [
    "../index.html",
    "../sandbox.html",
    "../scripts/lab-qa-ui.mjs",
    "../scripts/help-minion-ui.mjs",
  ]) {
    const text = fs.readFileSync(new URL(rel, import.meta.url), "utf8");
    assert.equal(/const HASH\s*=/.test(text), false, rel);
    assert.equal(/sessionStorage\.(setItem|getItem)\([^)]*[0-9a-f]{64}/.test(text), false, rel);
  }
  const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const sandbox = fs.readFileSync(new URL("../sandbox.html", import.meta.url), "utf8");
  assert.match(index, /sessionStorage\.setItem\(AUTH,\s*AUTH_OK\)/);
  assert.match(index, /const AUTH_OK = "open"/);
  assert.match(sandbox, /!== AUTH_OK/);
  assert.match(sandbox, /const AUTH_OK = "open"/);
});
