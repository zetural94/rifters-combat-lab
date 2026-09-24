/**
 * Click the real sandbox wizard + Lab for the five QA areas.
 * Usage: node scripts/lab-qa-ui.mjs
 * Expects http://127.0.0.1:8765/sandbox.html
 */
import fs from "fs";
import path from "path";
import puppeteer from "/tmp/puppeteer-run/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";

const HASH = "82db039b15a911c4522cf523450d2954d083cd5290eaf8f97dec453933199aa7";
const BASE = process.env.LAB_URL || "http://127.0.0.1:8765/sandbox.html";
const CHROME = process.env.CHROME || "/usr/bin/google-chrome";
const SHOTS = "/tmp/lab-qa-shots";
fs.mkdirSync(SHOTS, { recursive: true });

const rows = [];
const pageErrors = [];
function record(section, name, ok, detail) {
  const row = { section, name, ok: !!ok, detail: String(detail || "").replace(/\s+/g, " ").slice(0, 500) };
  rows.push(row);
  console.log((row.ok ? "OK  " : "FAIL") + " [" + section + "] " + name + " — " + row.detail);
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
    const wizardOpen = !(document.getElementById("start-wizard") || {}).hidden;
    const wizardTitle = ((document.getElementById("wizard-title") || {}).textContent || "").trim();
    const diff = ((document.getElementById("wizard-diff-summary") || {}).textContent || "").trim();
    const easy = ((document.querySelector("#wizard-diff-easy span") || {}).textContent || "").trim();
    const med = ((document.querySelector("#wizard-diff-medium span") || {}).textContent || "").trim();
    const hard = ((document.querySelector("#wizard-diff-hard span") || {}).textContent || "").trim();
    const classes = [...document.querySelectorAll("#wizard-party-slots select")].map((s) =>
      [...s.options].map((o) => o.value)
    );
    return {
      wizardOpen,
      wizardTitle,
      diff,
      easy,
      med,
      hard,
      classes,
      status: ((document.getElementById("status") || {}).textContent || "").trim(),
      title: ((document.getElementById("title") || {}).textContent || "").trim(),
      hint: ((document.getElementById("hint") || {}).textContent || "").trim(),
      buttons,
      log: ((document.getElementById("log") || {}).innerText || "").slice(0, 2500),
      roster: ((document.getElementById("roster") || {}).innerText || "").slice(0, 1800),
      inspect: ((document.getElementById("inspect") || {}).innerText || "").slice(0, 2500),
      steps: ((document.getElementById("wizard-steps") || {}).innerText || "").replace(/\s+/g, " ").trim(),
    };
  });
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOTS, name + ".png"), fullPage: false }).catch(() => {});
}

async function clickText(page, pred) {
  const buttons = await page.$$("button");
  for (const b of buttons) {
    const info = await b.evaluate((el) => ({
      text: (el.textContent || "").replace(/\s+/g, " ").trim(),
      disabled: !!el.disabled,
      hidden: !!el.hidden || el.offsetParent === null,
    }));
    if (info.disabled || info.hidden) continue;
    if (pred(info.text)) {
      await b.click();
      return info.text;
    }
  }
  return null;
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

async function fresh(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#wizard-rank-1", { timeout: 20000 });
  await page.waitForFunction(() => {
    const s = document.getElementById("status");
    return s && s.textContent && !/Loading/.test(s.textContent);
  }, { timeout: 20000 });
  await sleep(150);
}

async function domClick(page, sel) {
  const ok = await page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return false;
    el.click();
    return true;
  }, sel);
  if (!ok) throw new Error("missing " + sel);
  await sleep(120);
}

async function openWizard(page) {
  const cur = await ui(page);
  if (cur.wizardOpen) return;
  await domClick(page, "#btn-change-setup");
  await sleep(200);
}

async function setParty(page, ids) {
  await page.waitForSelector("[data-party-slot='0']");
  for (let i = 0; i < ids.length; i++) {
    await page.select("[data-party-slot='" + i + "']", ids[i]);
    await sleep(40);
  }
}

async function toDiff(page, rank, n, party) {
  await fresh(page);
  await domClick(page, rank === 0 ? "#wizard-rank-0" : "#wizard-rank-1");
  await page.waitForSelector("[data-party-slot='0']");
  if (party) await setParty(page, party);
  await domClick(page, "#wizard-party-next");
  if (rank === 0) return ui(page);
  await domClick(page, '[data-talent-n="' + n + '"]');
  await domClick(page, "#wizard-src-ladder");
  await domClick(page, "#wizard-talents-next");
  await page.waitForSelector("#wizard-diff-summary");
  await sleep(100);
  return ui(page);
}

async function toManualLab(page, n, party, ids) {
  await fresh(page);
  await domClick(page, "#wizard-rank-1");
  await page.waitForSelector("[data-party-slot='0']");
  await setParty(page, party);
  await domClick(page, "#wizard-party-next");
  await domClick(page, '[data-talent-n="' + n + '"]');
  await domClick(page, "#wizard-src-manual");
  await sleep(200);
  // Switching to manual seeds the ladder up to n, which then rejects extra checks.
  await domClick(page, "#btn-talent-clear");
  await sleep(120);
  const picked = [];
  for (const id of ids) {
    const state = await page.evaluate((talentId) => {
      const el = document.getElementById("tp-" + talentId);
      if (!el) return "missing";
      if (el.disabled) return "disabled";
      if (!el.checked) el.click();
      return el.checked ? "on" : "off";
    }, id);
    picked.push(id + "=" + state);
    if (state !== "on") throw new Error("talent " + id + " stayed " + state);
    await sleep(40);
  }
  const gate = await page.evaluate(() => ({
    status: ((document.getElementById("wizard-talent-status") || {}).textContent || "").trim(),
    labDisabled: !!(document.getElementById("wizard-talents-lab") || {}).disabled,
  }));
  if (gate.labDisabled) throw new Error("lab disabled: " + gate.status + " · " + picked.join(", "));
  await domClick(page, "#wizard-talents-lab");
  await page.waitForFunction(() => {
    const panel = document.getElementById("wizard-panel-lab");
    return panel && !panel.hidden && document.querySelector("#lab-choice-host button");
  }, { timeout: 8000 });
  await sleep(150);
  const snap = await ui(page);
  snap.talents = picked.join(", ");
  return snap;
}

async function beginLab(page, reSource) {
  const hit = await page.evaluate((src) => {
    const re = new RegExp(src);
    const host = document.getElementById("lab-choice-host");
    const buttons = host ? [...host.querySelectorAll("button")] : [];
    const b = buttons.find((el) => re.test((el.textContent || "").replace(/\s+/g, " ")));
    if (!b) {
      return {
        ok: false,
        wizard: ((document.getElementById("wizard-title") || {}).textContent || "").trim(),
        count: buttons.length,
      };
    }
    b.click();
    return { ok: true, text: (b.textContent || "").replace(/\s+/g, " ").trim() };
  }, reSource);
  await sleep(400);
  return hit;
}

async function clickCell(page, kind) {
  return page.evaluate((k) => {
    const el = document.querySelector("#grid .cell." + k);
    if (!el) return null;
    el.click();
    return (el.dataset.x || "?") + "," + (el.dataset.y || "?");
  }, kind);
}

async function clickFarLegalCell(page) {
  return page.evaluate(() => {
    const cells = [...document.querySelectorAll("#grid .cell.legal")];
    const foes = [...document.querySelectorAll("#grid .cell")].filter((c) => c.querySelector(".tok.enemy"));
    const foePos = foes.map((c) => ({ x: c.dataset.x | 0, y: c.dataset.y | 0 }));
    const dist = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    const ranked = cells
      .map((el) => {
        const p = { x: el.dataset.x | 0, y: el.dataset.y | 0 };
        const d = foePos.reduce((m, f) => Math.min(m, dist(p, f)), 99);
        return { el, d, p };
      })
      .sort((a, b) => {
        const band = (d) => (d >= 2 && d <= 4 ? 0 : d <= 4 ? 1 : 2);
        return band(a.d) - band(b.d) || a.d - b.d || b.p.x - a.p.x;
      });
    const pick = ranked[0];
    if (!pick) return null;
    pick.el.click();
    return pick.p.x + "," + pick.p.y + " d" + pick.d;
  });
}

async function startRift(page, which) {
  await domClick(page, "#wizard-diff-" + which);
  await sleep(400);
  return ui(page);
}

async function startFight(page) {
  await domClick(page, "#btn-start");
  await sleep(300);
  return ui(page);
}

async function pickKit(page, pred) {
  const hit = await clickAction(page, pred);
  if (hit) await sleep(150);
  return hit;
}

async function readyActor(page, nameRe, kitRe) {
  const picked = await clickAction(page, (t) => nameRe.test(t) && /HP/.test(t));
  await sleep(200);
  const kit = await clickAction(page, (t) => (kitRe ? kitRe.test(t) : /Kit 1/.test(t)));
  await sleep(180);
  return { picked, kit };
}

async function autoUntilOver(page, ms) {
  await domClick(page, "#btn-auto");
  const t0 = Date.now();
  let last = "";
  let sameSince = Date.now();
  while (Date.now() - t0 < ms) {
    const snap = await ui(page);
    const sig = snap.status + " | " + snap.hint;
    if (sig !== last) {
      last = sig;
      sameSince = Date.now();
    } else if (Date.now() - sameSince > 45000) {
      return Object.assign(snap, { stalled: true, last });
    }
    if (/Over —/.test(snap.status) || /fight over/i.test(snap.hint)) return snap;
    if (/Auto-play paused/i.test(snap.hint)) return snap;
    await sleep(400);
  }
  return Object.assign(await ui(page), { timeout: true, last });
}

async function section1(page) {
  for (const n of [1, 3, 4]) {
    const snap = await toDiff(page, 1, n, ["fighter", "brawler", "assassin", "scout"]);
    const hardWant = n === 1 ? "34+6=40" : n === 3 ? "34+8=42" : "34+9=43";
    const easyWant = n === 1 ? "27+2=29" : n === 3 ? "27+4=31" : "27+5=32";
    const medWant = n === 1 ? "30+4=34" : n === 3 ? "30+6=36" : "30+7=37";
    const text = snap.diff + " " + snap.easy + " " + snap.med + " " + snap.hard;
    record(
      "1",
      "wizard BP n=" + n,
      text.includes(easyWant) && text.includes(medWant) && text.includes(hardWant),
      text
    );
    if (n === 3 || n === 4) {
      const room = await startRift(page, "hard");
      await shot(page, "hard-n" + n);
      const want = n === 3 ? "34+8=42" : "34+9=43";
      record(
        "1",
        "Hard room spawn n=" + n,
        room.title.includes(want) && room.status.includes(want) && /room BP/.test(room.title),
        room.title + " || " + room.status
      );
    }
  }
  const easy = await toDiff(page, 1, 1, ["fighter", "brawler", "assassin", "scout"]);
  await startRift(page, "easy");
  const started = await startFight(page);
  record(
    "1",
    "Easy room 1 fight starts",
    /Round 1/.test(started.status) && /Wounds 0/.test(started.roster) && !/Over/.test(started.status),
    started.status + " || roster " + started.roster.slice(0, 240)
  );
  const done = await autoUntilOver(page, 120000);
  await shot(page, "easy-room1-end");
  const over = /Over —/.test(done.status);
  const next = await clickAction(page, (t) => /Next room/.test(t));
  await sleep(400);
  const room2 = await ui(page);
  record(
    "1",
    "Easy room 1 ends and Next room opens room 2",
    over && !!next && /sala 2\/3|rift_easy 2\/3|room 2/.test(room2.status + room2.title + room2.hint),
    "end=" + done.status + " hint=" + done.hint + " next=" + next + " room2=" + room2.title + " || " + room2.status
  );
  if (room2.title && /Setup|brush/.test(room2.status)) {
    const s2 = await startFight(page);
    record(
      "1",
      "Easy room 2 starts without soft-lock",
      /Round 1/.test(s2.status) && /2\/3/.test(s2.status),
      s2.status
    );
  }
  await clearFirstRoom(page, "medium", "30+4=34", 150000);
  await clearFirstRoom(page, "hard", "34+6=40", 300000);
}

async function clearFirstRoom(page, which, quote, ms) {
  await toDiff(page, 1, 1, ["fighter", "brawler", "assassin", "scout"]);
  const room = await startRift(page, which);
  record(
    "1",
    which + " room 1 shows rift pool",
    room.title.includes(quote) && room.status.includes(quote) && /room BP/.test(room.title + room.status),
    room.title + " || " + room.status
  );
  const started = await startFight(page);
  record(
    "1",
    which + " room 1 fight starts",
    /Round 1/.test(started.status) && /Wounds/.test(started.roster) && !/Over/.test(started.status),
    started.status
  );
  const done = await autoUntilOver(page, ms || 150000);
  const over = /Over —/.test(done.status);
  const next = await clickAction(page, (t) => /Next room/.test(t));
  await sleep(400);
  const room2 = await ui(page);
  record(
    "1",
    which + " room 1 ends and room 2 opens",
    over && !!next && /2\/3/.test(room2.status + " " + room2.title),
    "end=" + done.status + " next=" + next + " room2=" + (room2.status || "").slice(0, 240)
  );
}

async function section2(page) {
  await toManualLab(page, 1, ["fighter", "scout", "assassin", "brawler"], [
    "fighter-eye-for-an-eye",
    "scout-vigilant",
    "assassin-riposte",
    "brawler-martial-artist",
  ]);
  const opened = await clickText(page, (t) => /Scout ×2 vs Dummy/.test(t));
  await sleep(300);
  const fight = await startFight(page);
  const ready = await readyActor(page, /Scout/);
  const defend = await clickAction(page, (t) => /Defend/.test(t) && /free reaction/.test(t));
  await sleep(200);
  let snap = await ui(page);
  record(
    "2",
    "Scout Defend free reaction click",
    !!opened && !!defend && /Defend/i.test(snap.log),
    "opened=" + opened + " hero=" + ready.picked + " kit=" + ready.kit + " btn=" + defend + " log=" + snap.log.slice(0, 300)
  );
  const breath = await clickAction(page, (t) => /catch breath/i.test(t));
  await sleep(150);
  const accept = await clickAction(page, (t) => /Accept \+/.test(t));
  await sleep(200);
  snap = await ui(page);
  record(
    "2",
    "Catch Breath click then Accept",
    !!breath && !!accept && /CATCH BREATH|Catch Breath/i.test(snap.log),
    "btn=" + breath + " accept=" + accept + " log=" + snap.log.slice(0, 300)
  );

  await domClick(page, "#btn-open-lab");
  await sleep(200);
  if ((await ui(page)).wizardTitle !== "Lab / Dummy") await domClick(page, "#wizard-diff-lab");
  const openedF = await clickText(page, (t) => /Fighter ×2 vs Dummy/.test(t));
  await sleep(250);
  await startFight(page);
  await readyActor(page, /Fighter/);
  const defendAp = await clickAction(page, (t) => /Defend/.test(t) && /1 AP/.test(t));
  await sleep(200);
  snap = await ui(page);
  record(
    "2",
    "Fighter Defend costs 1 AP",
    !!openedF && !!defendAp && /Defend/i.test(snap.log),
    "btn=" + defendAp + " status=" + snap.status + " log=" + snap.log.slice(0, 220)
  );

  await domClick(page, "#btn-open-lab");
  await sleep(200);
  if ((await ui(page)).wizardTitle !== "Lab / Dummy") await domClick(page, "#wizard-diff-lab");
  const openedA = await clickText(page, (t) => /Assassin ×2 vs Dummy/.test(t));
  await sleep(250);
  await startFight(page);
  for (let i = 0; i < 24; i++) {
    await domClick(page, "#btn-step");
    await sleep(80);
    const now = await ui(page);
    if (now.buttons.some((b) => /Interpose|Riposte|Hidden Bola|Eye OA|Vigilant/.test(b.text))) break;
  }
  snap = await ui(page);
  const inter = snap.buttons.find((b) => /Interpose/.test(b.text));
  const rip = snap.buttons.find((b) => /Riposte/.test(b.text) && !/OA/.test(b.text));
  let interClick = null;
  if (inter && !inter.disabled) interClick = await clickAction(page, (t) => /Interpose/.test(t));
  await sleep(200);
  snap = await ui(page);
  const dest = snap.buttons.find((b) => /→|Interpose/.test(b.text));
  record(
    "2",
    "Interpose offered on incoming hit",
    !!openedA && !!inter,
    "buttons " + snap.buttons.map((b) => b.text).slice(0, 8).join(" | ") + " click=" + interClick + " dest=" + !!(dest)
  );
  if (interClick) {
    const cell = await page.$(".cell.legal");
    if (cell) await cell.click();
    await sleep(200);
    const after = await ui(page);
    record(
      "2",
      "Interpose click retargets",
      /Interpos/i.test(after.log),
      after.log.slice(0, 300)
    );
  }

  const stacked = await ui(page);
  const names = stacked.buttons.map((b) => b.text).join(" | ");
  const kinds = ["Defend", "Catch Breath", "Interpose", "Riposte", "Accept"].filter((k) =>
    stacked.buttons.some((b) => b.text.indexOf(k) >= 0)
  );
  record(
    "2",
    "reaction stack lists more than one option",
    kinds.length >= 2,
    "saw " + kinds.join(", ") + " · " + names.slice(0, 400)
  );
}

async function toLadderLab(page, n, party) {
  await fresh(page);
  await domClick(page, "#wizard-rank-1");
  await page.waitForSelector("[data-party-slot='0']");
  await setParty(page, party);
  await domClick(page, "#wizard-party-next");
  await domClick(page, '[data-talent-n="' + n + '"]');
  await domClick(page, "#wizard-src-ladder");
  await domClick(page, "#wizard-talents-lab");
  await sleep(200);
}

async function section3(page) {
  await toLadderLab(page, 2, ["mystic", "acolyte", "primalist", "scout"]);
  await clickText(page, (t) => /Mystic ×2 vs Dummy/.test(t));
  await sleep(250);
  await startFight(page);
  await readyActor(page, /Mystic/);
  const up = await clickAction(page, (t) => /Blink \(Upcast\)/.test(t) && /2 mana/.test(t));
  await sleep(150);
  const cells = await page.$$(".cell.legal");
  if (cells.length) await cells[cells.length - 1].click();
  await sleep(250);
  let snap = await ui(page);
  record(
    "3",
    "Blink (Upcast) button and resolve",
    !!up && /Blink/.test(snap.log),
    "btn=" + up + " log=" + snap.log.slice(0, 280)
  );

  await domClick(page, "#btn-open-lab");
  await clickText(page, (t) => /Acolyte ×2 vs Dummy/.test(t));
  await sleep(250);
  await startFight(page);
  await readyActor(page, /Acolyte/);
  const bless = await clickAction(page, (t) => /Bless \(Upcast\)/.test(t) && /2 mana/.test(t));
  await sleep(120);
  const tgt = await page.$(".cell.target");
  if (tgt) await tgt.click();
  await sleep(200);
  snap = await ui(page);
  record(
    "3",
    "Bless (Upcast) spends 2 mana",
    !!bless && /Bless \(Upcast\)/.test(snap.log),
    "btn=" + bless + " log=" + snap.log.slice(0, 280)
  );

  await domClick(page, "#btn-open-lab");
  await clickText(page, (t) => /Primalist ×2 vs Dummy/.test(t));
  await sleep(250);
  await startFight(page);
  await readyActor(page, /Primalist/);
  const bark = await clickAction(page, (t) => /Barkskin \(Upcast\)/.test(t) && /2 mana/.test(t));
  await sleep(100);
  const tgt2 = await page.$(".cell.target");
  if (tgt2) await tgt2.click();
  await sleep(200);
  snap = await ui(page);
  const water = await clickAction(page, (t) => /Healing Water \(Upcast\)/.test(t) && /2 mana/.test(t));
  await sleep(100);
  const tgt3 = await page.$(".cell.target");
  if (tgt3) await tgt3.click();
  await sleep(200);
  const snap2 = await ui(page);
  record(
    "3",
    "Barkskin and Healing Water upcast buttons",
    !!bark && /Barkskin \(Upcast\)/.test(snap.log) && !!water && /Healing Water \(Upcast\)/.test(snap2.log),
    "bark=" + bark + " water=" + water + " log=" + snap2.log.slice(0, 320)
  );

  await domClick(page, "#btn-open-lab");
  await clickText(page, (t) => /Scout ×2 vs Dummy/.test(t));
  await sleep(250);
  await startFight(page);
  await readyActor(page, /Scout/, /shortbow|Shortbow|Kit 1/);
  const aim = await clickAction(page, (t) => /Aim/.test(t));
  await sleep(150);
  snap = await ui(page);
  const strike = await clickAction(page, (t) => /Shortbow/.test(t) && /Strike|shortbow/i.test(t) && !/Barrage/.test(t));
  await sleep(100);
  const foe = await page.$(".cell.target");
  if (foe) await foe.click();
  await sleep(200);
  const accept = await clickAction(page, (t) => /Accept roll/.test(t));
  await sleep(200);
  const after = await ui(page);
  record(
    "3",
    "Aim then Strike shows and consumes Aim",
    !!aim && (/Aim/.test(after.log) || /Aim armed/.test(snap.buttons.map((b) => b.text).join(" "))),
    "aim=" + aim + " strike=" + strike + " accept=" + accept + " log=" + after.log.slice(0, 300)
  );

  await domClick(page, "#btn-open-lab");
  await clickText(page, (t) => /Fighter ×2 vs Dummy/.test(t));
  await sleep(250);
  await startFight(page);
  await readyActor(page, /Fighter/, /heavy-sword|Heavy|Kit 1/);
  const before = await ui(page);
  const swap = await clickAction(page, (t) => /Weapon Swap/.test(t));
  await sleep(200);
  const afterSwap = await ui(page);
  record(
    "3",
    "Weapon Swap updates strike list",
    !!swap && before.buttons.map((b) => b.text).join("|") !== afterSwap.buttons.map((b) => b.text).join("|"),
    "swap=" + swap + " before=" + before.buttons.filter((b) => /Strike|Sword|Longsword|Heavy/.test(b.text)).map((b) => b.text).join(" || ") +
      " after=" + afterSwap.buttons.filter((b) => /Strike|Sword|Longsword|Heavy/.test(b.text)).map((b) => b.text).join(" || ")
  );

  const manual = await toManualLab(page, 1, ["assassin", "scout", "fighter", "mystic"], [
    "assassin-flurry-daggers",
    "scout-barrage",
    "fighter-eye-for-an-eye",
    "mystic-blink",
  ]);
  const opened = await beginLab(page, "Easy — 4× Wolf");
  await startFight(page);
  const readyFlurry = await readyActor(page, /Assassin/, /dual-daggers|Dual|Kit 1/);
  const closed = await bringStrikeInRange(page, /Flurry of Daggers/);
  const flurry = await clickAction(page, (t) => /Flurry of Daggers/.test(t) && !/out of range/.test(t));
  await sleep(120);
  const t1 = await clickCell(page, "target");
  await sleep(250);
  await passBlockingPrompts(page);
  snap = await ui(page);
  const prompt = snap.buttons.some((b) => /Confirm/.test(b.text)) || /Pick up to|kolejny cel|Confirm/.test(snap.hint);
  const extra = await clickCell(page, "legal");
  await sleep(120);
  const confirm = await clickAction(page, (t) => /Confirm/.test(t));
  await sleep(200);
  const accept2 = await clickAction(page, (t) => /accept roll|Accept — apply/i.test(t));
  await sleep(250);
  const done = await ui(page);
  record(
    "3",
    "Flurry second-target prompt",
    !!opened.ok && !!flurry && prompt && !!confirm && /Flurry of Daggers/.test(done.log) && /AoE/.test(done.log),
    "talents=" + (manual.talents || "") + " lab=" + (opened.text || opened.wizard) +
      " pick=" + readyFlurry.picked + " kit=" + readyFlurry.kit +
      " move=" + closed + " flurry=" + flurry + " t1=" + t1 + " extra=" + extra +
      " confirm=" + confirm + " accept=" + accept2 + " log=" + done.log.slice(0, 320)
  );

  const ended = await clickAction(page, (t) => /End turn/.test(t));
  await sleep(300);
  let bar = null;
  for (let i = 0; i < 8 && !bar; i++) {
    bar = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll("#actions button")];
      const b = buttons.find((el) => /Scout/.test(el.textContent || "") && /HP/.test(el.textContent || "") && !el.disabled);
      if (!b) return null;
      b.click();
      return (b.textContent || "").replace(/\s+/g, " ").trim();
    });
    if (bar) break;
    const step = await page.$("#btn-step");
    if (step) await step.click().catch(() => {});
    await sleep(200);
  }
  const pickSnap = await ui(page);
  await sleep(150);
  const bow = await clickAction(page, (t) => /shortbow|Shortbow|Kit 1/.test(t));
  await sleep(100);
  const barrage = await clickAction(page, (t) => /Barrage/.test(t) && !/out of range/.test(t));
  await sleep(100);
  const bt = await clickCell(page, "target");
  await sleep(200);
  await passBlockingPrompts(page);
  const bsnap = await ui(page);
  const bextra = await clickCell(page, "legal");
  await sleep(100);
  const bconf = await clickAction(page, (t) => /Confirm/.test(t));
  await sleep(200);
  const baccept = await clickAction(page, (t) => /accept roll|Accept — apply/i.test(t));
  await sleep(250);
  const bdone = await ui(page);
  record(
    "3",
    "Barrage second-target prompt",
    !!barrage && !!bconf && /Barrage/.test(bdone.log) && /AoE/.test(bdone.log),
    "end=" + ended + " scout=" + bar + " kit=" + bow +
      " pickBtns=" + pickSnap.buttons.map((b) => b.text).slice(0, 6).join(" | ") +
      " barrage=" + barrage +
      " t1=" + bt + " extra=" + bextra + " confirm=" + bconf + " accept=" + baccept +
      " prompt=" + bsnap.buttons.some((b) => /Confirm/.test(b.text)) +
      " log=" + bdone.log.slice(0, 320)
  );
}

async function bringStrikeInRange(page, nameRe) {
  const notes = [];
  for (let i = 0; i < 3; i++) {
    const snap = await ui(page);
    const btn = snap.buttons.find((b) => nameRe.test(b.text));
    if (btn && !btn.disabled && !/out of range/.test(btn.text)) return notes.join(";") || "in-range";
    const moved = await clickAction(page, (t) => /Move into range/.test(t) || /^Move /.test(t));
    await sleep(120);
    const dest = await clickFarLegalCell(page);
    notes.push((moved || "no-move") + "→" + dest);
    await sleep(250);
  }
  return notes.join(";") || "stuck";
}

async function passBlockingPrompts(page) {
  const seen = [];
  for (let i = 0; i < 6; i++) {
    const snap = await ui(page);
    if (snap.buttons.some((b) => /Confirm/.test(b.text))) return seen.join(";") || "confirm";
    const pass = await clickAction(page, (t) =>
      /pass OA|No boost|Accept effect|Accept OA|No Help — accept OA/.test(t)
    );
    if (!pass) return seen.join(";") || "none";
    seen.push(pass);
    await sleep(220);
  }
  return seen.join(";") || "loop";
}

async function section4(page) {
  const snap = await toDiff(page, 0, 0, ["fighter", "mystic", "acolyte", "primalist"]);
  const opts = (snap.classes[0] || []).join(",");
  record(
    "4",
    "Rank 0 skips talents and hides Warrior",
    snap.wizardTitle === "Trudność riftu" && /n=0/.test(snap.diff) && !/warrior/i.test(opts) && snap.steps.indexOf("Talenty") < 0,
    "title=" + snap.wizardTitle + " steps=" + snap.steps + " diff=" + snap.diff + " classes=" + opts
  );
  await domClick(page, "#wizard-diff-lab");
  await clickText(page, (t) => /Easy — 4× Wolf/.test(t));
  await sleep(300);
  const room = await ui(page);
  const started = await startFight(page);
  const names = started.roster;
  const strikes = started.buttons.filter((b) => /Strike|sword|Sword|Symbol|Ember|Hex|Spear/.test(b.text));
  record(
    "4",
    "Rank 0 party of 4 plays without talents",
    /Fighter/.test(names) && /Mystic/.test(names) && /Acolyte/.test(names) && /Primalist/.test(names) &&
      !/Warrior/.test(names) && /Rank 0/.test(room.hint + started.hint) &&
      (strikes.length > 0 || started.buttons.some((b) => /Kit|End turn|Fighter|Mystic/.test(b.text))),
    "hint=" + started.hint.slice(0, 180) + " buttons=" + started.buttons.map((b) => b.text).slice(0, 8).join(" | ")
  );

  await toDiff(page, 1, 1, ["assassin", "mystic", "primalist", "scout"]);
  const diff = await ui(page);
  record(
    "4",
    "Rank 1 mixed party reaches difficulty",
    /Assassin/.test(diff.diff) && /Mystic/.test(diff.diff) && /Primalist/.test(diff.diff) && /Scout/.test(diff.diff) && !/Warrior/.test(diff.diff),
    diff.diff
  );
  await domClick(page, "#wizard-diff-lab");
  await clickText(page, (t) => /Easy — 4× Wolf/.test(t));
  await sleep(250);
  const play = await startFight(page);
  record(
    "4",
    "mixed party controllable",
    play.roster.split("\n").filter((l) => l.trim()).length >= 4,
    play.roster.slice(0, 300)
  );
}

async function section5(page) {
  await toDiff(page, 1, 1, ["assassin", "fighter", "scout", "mystic"]);
  await domClick(page, "#wizard-diff-lab");
  await clickText(page, (t) => /Hard — 3W\+Alpha/.test(t));
  await sleep(300);
  const alpha = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("#roster article")];
    const hit = rows.find((el) => /Alpha/i.test(el.innerText || ""));
    if (hit) {
      hit.click();
      return true;
    }
    return false;
  });
  await sleep(200);
  const snap = await ui(page);
  await shot(page, "alpha-specials");
  record(
    "5",
    "live Alpha specials on the card",
    alpha && /Specials/.test(snap.inspect) && /Piercing Howl|Howl/.test(snap.inspect),
    snap.inspect.slice(0, 500)
  );
  const wolf = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("#roster article")];
    const hit = rows.find((el) => /Wolf/.test(el.innerText || "") && !/Alpha/i.test(el.innerText || ""));
    if (hit) {
      hit.click();
      return true;
    }
    return false;
  });
  await sleep(150);
  const wolfUi = await ui(page);
  record(
    "5",
    "Wolf specials labeled on the card",
    wolf && /Specials/.test(wolfUi.inspect) && /Savage Claws|Claws/.test(wolfUi.inspect),
    wolfUi.inspect.slice(0, 400)
  );
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(25000);
  page.on("pageerror", (err) => pageErrors.push(String(err && err.message ? err.message : err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") pageErrors.push("console: " + msg.text());
  });
  await page.evaluateOnNewDocument((hash) => {
    sessionStorage.setItem("riftersLabAuth", hash);
  }, HASH);
  await page.goto(BASE, { waitUntil: "networkidle0" });
  await page.waitForSelector("#wizard-rank-1");

  const sections = [
    ["1", section1],
    ["2", section2],
    ["3", section3],
    ["4", section4],
    ["5", section5],
  ];
  for (const [id, fn] of sections) {
    console.log("\n== section " + id + " ==");
    try {
      await fn(page);
    } catch (err) {
      record(id, "section threw", false, err && err.stack ? err.stack.split("\n").slice(0, 4).join(" | ") : String(err));
    }
  }
  const summary = {
    ok: rows.filter((r) => r.ok).length,
    fail: rows.filter((r) => !r.ok).length,
    pageErrors: pageErrors.slice(0, 30),
    rows,
  };
  fs.writeFileSync("/tmp/lab-qa-ui.json", JSON.stringify(summary, null, 2));
  console.log("\nUI", summary.ok, "ok", summary.fail, "fail", "errors", pageErrors.length);
  await browser.close();
  process.exit(summary.fail ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
