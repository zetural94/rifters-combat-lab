import test from "node:test";
import assert from "node:assert/strict";
import os from "os";
import path from "path";
import { puppeteerCorePath } from "../scripts/load-puppeteer.mjs";

test("puppeteer-core path follows PUPPETEER_RUN or os.tmpdir()", () => {
  const prevCore = process.env.PUPPETEER_CORE;
  const prevRun = process.env.PUPPETEER_RUN;
  delete process.env.PUPPETEER_CORE;
  delete process.env.PUPPETEER_RUN;
  try {
    const fallback = puppeteerCorePath();
    assert.ok(fallback.startsWith(os.tmpdir()));
    assert.ok(fallback.includes(path.join("puppeteer-run", "node_modules", "puppeteer-core")));
    assert.equal(fallback.includes("/tmp/puppeteer-run") || fallback.startsWith(os.tmpdir()), true);
  } finally {
    if (prevCore == null) delete process.env.PUPPETEER_CORE;
    else process.env.PUPPETEER_CORE = prevCore;
    if (prevRun == null) delete process.env.PUPPETEER_RUN;
    else process.env.PUPPETEER_RUN = prevRun;
  }
});

test("PUPPETEER_CORE overrides the default directory", () => {
  const prev = process.env.PUPPETEER_CORE;
  process.env.PUPPETEER_CORE = path.join(os.tmpdir(), "custom-puppeteer-core.js");
  try {
    assert.equal(puppeteerCorePath(), process.env.PUPPETEER_CORE);
  } finally {
    if (prev == null) delete process.env.PUPPETEER_CORE;
    else process.env.PUPPETEER_CORE = prev;
  }
});
