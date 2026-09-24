/**
 * Resolve puppeteer-core without a hardcoded /tmp/puppeteer-run path.
 * PUPPETEER_CORE — absolute file path to puppeteer-core.js
 * PUPPETEER_RUN — directory that contains node_modules/puppeteer-core (default: os.tmpdir()/puppeteer-run)
 */
import os from "os";
import path from "path";
import { pathToFileURL } from "url";

export function puppeteerCorePath() {
  if (process.env.PUPPETEER_CORE) return process.env.PUPPETEER_CORE;
  const root = process.env.PUPPETEER_RUN || path.join(os.tmpdir(), "puppeteer-run");
  return path.join(
    root,
    "node_modules",
    "puppeteer-core",
    "lib",
    "esm",
    "puppeteer",
    "puppeteer-core.js"
  );
}

export async function loadPuppeteer() {
  const file = puppeteerCorePath();
  const mod = await import(pathToFileURL(file).href);
  return mod.default || mod;
}
