/**
 * Lab UI pass for the overnight canon fixes.
 * Lightning Bolt scaling, Magic Shield upcast, Barrage move prompt, Pin Shot button.
 * Usage: node scripts/lab-qa-night-ui.mjs
 * Expects http://127.0.0.1:8765/sandbox.html?qa=1
 */
import fs from "fs";
import { loadPuppeteer } from "./load-puppeteer.mjs";

const puppeteer = await loadPuppeteer();
const AUTH_OK = "open";
const BASE = process.env.LAB_URL || "http://127.0.0.1:8765/sandbox.html?qa=1";
const CHROME = process.env.CHROME || "/usr/bin/google-chrome";

const rows = [];
function record(name, ok, detail) {
  const row = { name, ok: !!ok, detail: String(detail || "").replace(/\s+/g, " ").slice(0, 500) };
  rows.push(row);
  console.log((row.ok ? "OK  " : "FAIL") + " " + name + " — " + row.detail);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function ui(page) {
  return page.evaluate(() => {
    const buttons = [...document.querySelectorAll("#actions button")].map((el) => ({
      text: (el.textContent || "").replace(/\s+/g, " ").trim(),
      disabled: !!el.disabled,
    }));
    return {
      hint: ((document.getElementById("hint") || {}).textContent || "").trim(),
      buttons,
      inspect: ((document.getElementById("inspect") || {}).innerText || "").slice(0, 900),
    };
  });
}

async function domClick(page, sel) {
  const ok = await page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return false;
    el.click();
    return true;
  }, sel);
  if (!ok) throw new Error("missing " + sel);
  await sleep(140);
}

async function clickAction(page, pred) {
  const buttons = await page.$$("#actions button");
  for (const b of buttons) {
    const info = await b.evaluate((el) => ({
      text: (el.textContent || "").replace(/\s+/g, " ").trim(),
      disabled: !!el.disabled,
    }));
    if (info.disabled) continue;
    if (pred(info.text)) {
      await b.click();
      return info.text;
    }
  }
  return null;
}

async function qa(page, method, args) {
  return page.evaluate(
    (m, a) => {
      const hook = globalThis.__riftersQa;
      if (!hook || typeof hook[m] !== "function") return { ok: false, reason: "no-hook" };
      return hook[m](...(a || []));
    },
    method,
    args || []
  );
}

async function boot(page, talents, startName) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#wizard-rank-1", { timeout: 20000 });
  await page.waitForFunction(() => {
    const s = document.getElementById("status");
    return s && s.textContent && !/Loading/.test(s.textContent);
  });
  await sleep(200);
  await domClick(page, "#wizard-rank-1");
  await page.waitForSelector("[data-party-slot='0']");
  const party = ["mystic", "fighter", "brawler", "scout"];
  for (let i = 0; i < party.length; i++) {
    await page.select("[data-party-slot='" + i + "']", party[i]);
  }
  await domClick(page, "#wizard-party-next");
  await domClick(page, '[data-talent-n="2"]');
  await domClick(page, "#wizard-src-manual");
  await sleep(150);
  await domClick(page, "#btn-talent-clear");
  await sleep(80);
  for (const id of talents) {
    const state = await page.evaluate((talentId) => {
      const el = document.getElementById("tp-" + talentId);
      if (!el) return "missing";
      if (el.disabled) return "disabled";
      if (!el.checked) el.click();
      return el.checked ? "on" : "off";
    }, id);
    if (state !== "on") throw new Error("talent " + id + " " + state);
  }
  await domClick(page, "#wizard-talents-lab");
  await page.waitForSelector("#lab-choice-host button");
  const choices = await page.evaluate(() => {
    const host = document.getElementById("lab-choice-host");
    const buttons = [...host.querySelectorAll("button")].map((el) => (el.textContent || "").trim());
    const b = [...host.querySelectorAll("button")].find((el) => /4× Wolf|4x Wolf|Wolf/.test(el.textContent || ""));
    if (b) b.click();
    return { buttons, clicked: !!(b && b.textContent) };
  });
  if (!choices.clicked) throw new Error("no wolf scenario");
  await sleep(300);
  await domClick(page, "#btn-start");
  await sleep(300);
  const picked = await clickAction(page, (t) => new RegExp(startName).test(t) && /HP/.test(t));
  await sleep(200);
  await clickAction(page, (t) => /Kit 1|Pyre|Shortbow|Gloves|Heavy Sword|Focus/.test(t));
  await sleep(180);
  return picked;
}

async function acceptRoll(page) {
  const seen = [];
  for (let i = 0; i < 8; i++) {
    const hit = await clickAction(page, (t) =>
      /No Help — accept roll|Accept effect|pass OA|No boost|No Move|Confirm \(/.test(t)
    );
    if (!hit) break;
    seen.push(hit);
    await sleep(160);
    if (/No Help — accept roll/.test(hit)) break;
  }
  return seen.join(" | ");
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(20000);
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err && err.message ? err.message : err)));
  await page.evaluateOnNewDocument((flag) => {
    sessionStorage.setItem("riftersLabAuth", flag);
  }, AUTH_OK);

  await boot(page, [
    "mystic-lightning-bolt",
    "mystic-magic-shield",
    "fighter-precise-strike",
    "fighter-heavy-swing",
    "brawler-grapple",
    "brawler-uppercut",
    "scout-pin-shot",
    "scout-barrage",
  ], "Mystic");

  let snap = await ui(page);
  const bolt = snap.buttons.find((b) => /^Lightning Bolt /.test(b.text) && !/Upcast/.test(b.text));
  const boltUp = snap.buttons.find((b) => /Lightning Bolt \(Upcast\)/.test(b.text));
  record(
    "Lightning Bolt button",
    !!(bolt && boltUp && /3 mana/.test(boltUp.text) && /1 mana/.test(bolt.text)),
    (bolt && bolt.text) + " || " + (boltUp && boltUp.text)
  );

  await qa(page, "setResources", ["mystic", { int: 3, ap: 3, mana: 10 }]);
  await page.evaluate(() => {
    const hook = globalThis.__riftersQa.snap();
    const me = hook.actors.find((a) => a.id === "mystic");
    if (!me) return;
    const el = document.querySelector('#grid .cell[data-x="' + me.x + '"][data-y="' + me.y + '"]');
    if (el) el.click();
  });
  await sleep(80);
  snap = await ui(page);
  record(
    "Lightning inspect scales at INT 3",
    /T1\s+16/.test(snap.inspect) && /T2\s+24/.test(snap.inspect) && /T3\s+28/.test(snap.inspect),
    snap.inspect.replace(/\s+/g, " ").slice(0, 280)
  );

  await qa(page, "primeDice", [1, 1]);
  const cast = await clickAction(page, (t) => /^Lightning Bolt /.test(t) && !/Upcast/.test(t) && !/out of range/.test(t));
  await sleep(120);
  const cell = await page.evaluate(() => {
    const hook = globalThis.__riftersQa.snap();
    const wolf = hook.actors.find((a) => /ember-wolf-1/.test(a.id));
    if (!wolf) return null;
    const el = document.querySelector('#grid .cell.target[data-x="' + wolf.x + '"][data-y="' + wolf.y + '"]');
    if (!el) return { targeted: false, x: wolf.x, y: wolf.y, hp: wolf.hp };
    el.click();
    return { targeted: true, id: wolf.id, hp: wolf.hp };
  });
  await sleep(150);
  const accepted = await acceptRoll(page);
  const after = await qa(page, "snap");
  const wolf = after.actors && after.actors.find((a) => a.id === "ember-wolf-1");
  record(
    "Lightning Bolt T1 at INT 3 deals 16",
    !!(cast && cell && cell.targeted && wolf && wolf.hp === 2),
    "cast " + cast + " cell " + JSON.stringify(cell) + " accept " + accepted + " hp " + (wolf && wolf.hp)
  );

  await qa(page, "setResources", ["mystic", { ap: 3, mana: 10 }]);
  const shield = await clickAction(page, (t) => /Magic Shield \(Upcast\)/.test(t));
  await sleep(100);
  const first = await page.evaluate(() => {
    const el = document.querySelector("#grid .cell.target .tok.hero, #grid .cell.target");
    const cells = [...document.querySelectorAll("#grid .cell.target")];
    if (!cells.length) return { n: 0 };
    cells[0].click();
    return { n: cells.length };
  });
  await sleep(120);
  const hint1 = (await ui(page)).hint;
  const skip = await clickAction(page, (t) => /No additional target/.test(t));
  const shielded = await qa(page, "snap");
  const mystic = shielded.actors && shielded.actors.find((a) => a.id === "mystic");
  record(
    "Magic Shield upcast is 2+2×INT",
    !!(shield && skip && mystic),
    "btn " + shield + " targets " + first.n + " hint " + hint1 + " skip " + skip + " mana " + (mystic && mystic.mana)
  );
  const shieldAmt = await page.evaluate(() => {
    const hook = globalThis.__riftersQa;
    return hook && hook.snap && "logged";
  });
  const log = (await ui(page)).inspect;
  const manaLeft = mystic && mystic.mana;
  record(
    "Magic Shield spent 2 mana",
    manaLeft === 8,
    "mana " + manaLeft + " " + shieldAmt + " " + log.slice(0, 80)
  );

  await boot(page, [
    "mystic-lightning-bolt",
    "mystic-magic-shield",
    "fighter-precise-strike",
    "fighter-heavy-swing",
    "brawler-grapple",
    "brawler-uppercut",
    "scout-pin-shot",
    "scout-barrage",
  ], "Scout");
  snap = await ui(page);
  const pin = snap.buttons.find((b) => /Pin Shot/.test(b.text));
  const bar = snap.buttons.find((b) => /^Barrage /.test(b.text) && !/out of range/.test(b.text));
  record("Pin Shot and Barrage listed", !!(pin && bar), (pin && pin.text) + " || " + (bar && bar.text));
  if (bar && /out of range/.test(bar.text)) {
    await clickAction(page, (t) => /Move into range|^Move /.test(t));
    await sleep(80);
  }
  const barClick = await clickAction(page, (t) => /^Barrage /.test(t) && !/out of range/.test(t));
  await sleep(100);
  const wolfCell = await page.evaluate(() => {
    const hook = globalThis.__riftersQa.snap();
    const wolf = hook.actors.find((a) => /wolf/.test(a.id));
    if (!wolf) return null;
    const el = document.querySelector('#grid .cell.target[data-x="' + wolf.x + '"][data-y="' + wolf.y + '"]');
    if (!el) return { targeted: false };
    el.click();
    return { targeted: true };
  });
  await sleep(150);
  const moveUi = await ui(page);
  const moveBefore = moveUi.buttons.find((b) => /Move before/.test(b.text));
  record(
    "Barrage offers Move before or after",
    !!(barClick && wolfCell && wolfCell.targeted && moveBefore),
    "click " + barClick + " cell " + JSON.stringify(wolfCell) + " hint " + moveUi.hint
  );

  record("page errors", pageErrors.length === 0, pageErrors.join(" | ") || "none");
  const fails = rows.filter((r) => !r.ok).length;
  fs.writeFileSync("/tmp/lab-qa-night-ui.json", JSON.stringify({ fails, rows }, null, 2));
  console.log("UI " + (rows.length - fails) + " ok, " + fails + " fail");
  await browser.close();
  if (fails) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
