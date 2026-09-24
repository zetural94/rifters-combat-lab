/**
 * Click through the lab UI for Rank-1 Help offers and minion turns.
 * Usage: node scripts/help-minion-ui.mjs
 * Serves nothing — expects http://127.0.0.1:8765/sandbox.html
 */
import fs from "fs";
import path from "path";
import { loadPuppeteer } from "./load-puppeteer.mjs";

const puppeteer = await loadPuppeteer();
import { FEAT_SMOKE_STUBS } from "../mc/r1.js";
import { trainClassFeats } from "../mc/talent-ladder.js";

const HASH = "82db039b15a911c4522cf523450d2954d083cd5290eaf8f97dec453933199aa7";
const BASE = process.env.LAB_URL || "http://127.0.0.1:8765/sandbox.html";
const CHROME = process.env.CHROME || "/usr/local/bin/google-chrome";
const OUT = "/tmp/help-ui-results.json";
const SHOTS = "/tmp/help-ui-shots";
const CLASSES = ["fighter", "brawler", "assassin", "scout", "mystic", "acolyte", "primalist"];

fs.mkdirSync(SHOTS, { recursive: true });

const pageErrors = [];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function readUi(page) {
  return page.evaluate(() => {
    const kids = [...document.querySelectorAll("#actions > *")];
    let group = "";
    const buttons = [];
    for (const el of kids) {
      if (el.classList && el.classList.contains("act-group")) group = (el.textContent || "").trim();
      if (el.tagName === "BUTTON") {
        buttons.push({
          group,
          text: (el.textContent || "").replace(/\s+/g, " ").trim(),
          disabled: !!el.disabled,
        });
      }
    }
    const declare = document.querySelector("#actions .react-declare");
    return {
      status: (document.getElementById("status") || {}).textContent || "",
      hint: (document.getElementById("hint") || {}).textContent || "",
      buttons,
      declare: declare ? declare.innerText.replace(/\s+/g, " ").trim() : "",
      log: (document.getElementById("log") || {}).innerText || "",
      roster: (document.getElementById("roster") || {}).innerText || "",
      inspect: (document.getElementById("inspect") || {}).innerText || "",
      wizard: !(document.getElementById("start-wizard") || {}).hidden,
    };
  });
}

async function clickButton(page, pred) {
  const buttons = await page.$$("#actions button");
  for (const b of buttons) {
    const info = await b.evaluate((el) => ({
      text: (el.textContent || "").replace(/\s+/g, " ").trim(),
      disabled: !!el.disabled,
      group: (() => {
        let g = "";
        let n = el.previousElementSibling;
        while (n) {
          if (n.classList && n.classList.contains("act-group")) {
            g = (n.textContent || "").trim();
            break;
          }
          n = n.previousElementSibling;
        }
        return g;
      })(),
    }));
    if (info.disabled) continue;
    if (pred(info)) {
      await b.click();
      return info.text;
    }
  }
  return null;
}

async function clickCell(page, kind) {
  const picked = await page.evaluate((kind) => {
    const cells = [...document.querySelectorAll("#grid .cell." + kind)];
    if (!cells.length) return null;
    const dummy = [...document.querySelectorAll("#grid .cell")].find((c) => {
      const tok = c.querySelector(".tok");
      return tok && (tok.textContent || "").trim() === "D";
    });
    const dx = dummy ? dummy.dataset.x | 0 : 4;
    const dy = dummy ? dummy.dataset.y | 0 : 3;
    let best = cells[0];
    let bestD = 99;
    for (const c of cells) {
      const d = Math.max(Math.abs((c.dataset.x | 0) - dx), Math.abs((c.dataset.y | 0) - dy));
      const score = kind === "legal" ? (d === 1 ? -1 : d) : d;
      if (score < bestD) {
        bestD = score;
        best = c;
      }
    }
    best.setAttribute("data-ui-pick", "1");
    return { x: best.dataset.x, y: best.dataset.y, dist: bestD };
  }, kind);
  if (!picked) return null;
  const el = await page.$('#grid .cell[data-ui-pick="1"]');
  if (!el) return null;
  await el.click();
  return picked;
}

function helpLine(log) {
  const lines = String(log || "")
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => /Help /.test(s));
  return lines[0] || "";
}

function isPrompt(ui) {
  const g = (ui.buttons[0] && ui.buttons[0].group) || "";
  if (/Power Roll|CTA|Elemental|Push|Steel Yourself|Support|Elemental Shield|OA|Reaction|Line Up|stress boost|Multi-target|Who acts|Weapon \/ kit|Help Twin/i.test(g))
    return true;
  if (ui.declare) return true;
  if (ui.buttons.some((b) => /^Help from |^Half \d|^No Help|^Accept|^No boost|^Spend |^SHIELD |^CLEANSE |^Confirm \(/.test(b.text)))
    return true;
  return false;
}

async function settle(page, opts = {}) {
  const wantHelp = opts.wantHelp !== false;
  const out = {
    helpOffered: false,
    helpLabel: "",
    helpLog: "",
    flat: false,
    clickedHelp: false,
    completed: false,
    fail: "",
    steps: [],
  };
  for (let i = 0; i < 20; i++) {
    const ui = await readUi(page);
    if (/failed:|Illegal:|Help failed|Shout failed/i.test(ui.hint) && !/Undid:/.test(ui.hint)) {
      out.fail = ui.hint;
      out.steps.push("hint:" + ui.hint);
      return out;
    }
    if (/Flat — no Power Roll/.test(ui.declare)) out.flat = true;
    const helpBtn = ui.buttons.find((b) => !b.disabled && /^Help from /.test(b.text));
    if (helpBtn) {
      out.helpOffered = true;
      out.helpLabel = helpBtn.text;
      out.helpLabels = ui.buttons.filter((b) => !b.disabled && /^Help from /.test(b.text)).map((b) => b.text);
      if (out.flat) {
        out.fail = "Help offered on a flat effect: " + helpBtn.text;
        return out;
      }
    }
    const clickHelp = wantHelp && helpBtn && !out.clickedHelp;
    let clicked = null;
    if (clickHelp) {
      clicked = await clickButton(page, (b) => b.text === helpBtn.text);
      out.clickedHelp = true;
      out.steps.push("help:" + clicked);
      continue;
    }
    clicked = await clickButton(page, (b) => /^Half 1:/.test(b.text));
    if (clicked) {
      out.steps.push(clicked);
      continue;
    }
    clicked = await clickButton(page, (b) => /^No boost$/.test(b.text));
    if (clicked) {
      out.steps.push(clicked);
      continue;
    }
    clicked = await clickButton(page, (b) => /^Confirm \(/.test(b.text));
    if (clicked) {
      out.steps.push(clicked);
      continue;
    }
    clicked = await clickButton(page, (b) => b.text === "Earth");
    if (clicked) {
      out.steps.push(clicked);
      continue;
    }
    clicked = await clickButton(page, (b) => /^SHIELD 2$/.test(b.text));
    if (clicked) {
      out.steps.push(clicked);
      out.completed = true;
      break;
    }
    clicked = await clickButton(page, (b) => /BREAK 5$/.test(b.text));
    if (clicked) {
      out.steps.push(clicked);
      out.completed = true;
      break;
    }
    clicked = await clickButton(page, (b) => /^No legal Push$/.test(b.text));
    if (clicked) {
      out.steps.push(clicked);
      out.completed = true;
      break;
    }
    clicked = await clickButton(page, (b) => /^→ /.test(b.text));
    if (clicked) {
      out.steps.push(clicked);
      out.completed = true;
      break;
    }
    clicked = await clickButton(page, (b) => /· pass OA$|· pass$/.test(b.text));
    if (clicked && opts.passReactions !== false) {
      out.steps.push(clicked);
      continue;
    }
    // Incoming OA / mitigation is before the attacker's Power Roll. Accept it and keep going.
    clicked = await clickButton(page, (b) => /^Accept effect/.test(b.text));
    if (clicked) {
      out.steps.push(clicked);
      continue;
    }
    clicked = await clickButton(page, (b) => /^Accept \+/.test(b.text));
    if (clicked) {
      out.steps.push(clicked);
      out.completed = true;
      break;
    }
    clicked = await clickButton(page, (b) => /^Accept OA|^Accept — apply|^No Help — accept/.test(b.text));
    if (clicked) {
      out.steps.push(clicked);
      out.rollAccepted = true;
      const after = await readUi(page);
      out.helpLog = helpLine(after.log) || out.helpLog;
      if (out.clickedHelp && !/Help /.test(after.log)) {
        out.fail = "Help click did not write a Help log line";
      }
      if (/Help failed|Illegal:/.test(after.hint)) out.fail = after.hint;
      if (!isPrompt(after)) {
        out.completed = true;
        break;
      }
      continue;
    }
    if (ui.buttons.some((b) => !b.disabled && /HP \d+\//.test(b.text) && /Shield|Support|sojusznik|ally/i.test(b.group))) {
      clicked = await clickButton(page, (b) => /HP \d+\//.test(b.text));
      out.steps.push(clicked || "ally");
      continue;
    }
    if (ui.buttons.some((b) => !b.disabled && b.group.startsWith("Support · effect"))) {
      clicked = await clickButton(page, (b) => b.group.startsWith("Support · effect"));
      out.steps.push(clicked || "support");
      continue;
    }
    const tgt = await clickCell(page, "target");
    if (tgt) {
      out.steps.push("target " + tgt.x + "," + tgt.y);
      continue;
    }
    const legal = await clickCell(page, "legal");
    if (legal) {
      out.steps.push("cell " + legal.x + "," + legal.y);
      continue;
    }
    if (!isPrompt(ui)) {
      out.completed = true;
      out.helpLog = helpLine(ui.log);
      out.steps.push("idle");
      break;
    }
    out.fail = "stuck prompt: " + (ui.buttons.map((b) => b.text).slice(0, 6).join(" | ") || ui.hint);
    out.steps.push("stuck");
    break;
  }
  const fin = await readUi(page);
  if (!out.helpLog) out.helpLog = helpLine(fin.log);
  if (out.clickedHelp && out.helpLog && !/reroll/.test(out.helpLog)) {
    out.fail = out.fail || "Help log missing reroll: " + out.helpLog;
  }
  if (out.clickedHelp && /Adv 1|advantage/i.test(out.helpLog) && !/not Advantage/.test(out.helpLog)) {
    out.fail = out.fail || "Help log talks about advantage: " + out.helpLog;
  }
  return out;
}

async function restoreUntil(page, pred) {
  let undid = false;
  for (let i = 0; i < 24; i++) {
    const ui = await readUi(page);
    if (undid && pred(ui)) return { ok: true, status: ui.status, ui };
    const groups = ui.buttons.map((b) => b.group).join(" ");
    if (/pick a hero|Who acts/i.test(ui.status + groups)) {
      await clickButton(page, (b) => / A · /.test(b.text));
      undid = true;
      continue;
    }
    if (/wybierz kit|Weapon \/ kit/i.test(ui.status + groups)) {
      await clickButton(page, (b) => /Kit 1 ·/.test(b.text));
      undid = true;
      continue;
    }
    const undo = await page.$("#btn-undo:not([disabled])");
    if (!undo) return { ok: false, status: ui.status, hint: ui.hint, ui };
    await undo.click();
    undid = true;
  }
  const ui = await readUi(page);
  return { ok: false, status: ui.status, hint: ui.hint, ui };
}

function uiSignature(ui) {
  return [
    ui.status,
    ui.roster,
    ui.buttons.map((b) => (b.disabled ? "#" : "") + b.text).join("|"),
  ].join("\n");
}

function idleWith(marker) {
  return (ui) => {
    const idle = ui.buttons.some((b) => /End turn/i.test(b.text)) && !isPrompt(ui);
    const hasMarker = ui.buttons.some((b) => b.text === marker);
    return idle && hasMarker;
  };
}

function classifyIdle(button, settleResult) {
  const t = button.text;
  const g = button.group;
  if (settleResult.flat) return "flat effect — Help correctly absent";
  if (/pick cell/i.test(t) || /Blink|Shadow Dash|Martial artist|Feral/i.test(t))
    return "cell move — no Power Roll";
  if (/^Summon /.test(t)) return "summon — places a token, no Power Roll";
  if (/Aim/.test(t) && /Feat|0 AP/.test(g + t)) return "self buff — Aim arms the next strike, no Power Roll";
  if (/Reactions/.test(g)) return "reaction — not an action Power Roll";
  if (/Steel Yourself/.test(t)) return "roll resolves to SHIELD/CLEANSE with no Help choice";
  if (/Ask a Question/.test(t)) return "roll commits without a Help choice";
  if (/Shove/.test(t)) return "roll commits without a Help choice";
  if (/Guard|Stealth|Enhance|Ice Wall|Systems Bargain|Magic Shield|Bless|Barkskin|Healing Water|Spotter/.test(t))
    return "click-resolves or target buff — no Power Roll";
  if (g === "Attack" || /Core actions/.test(g) || /Line Up/.test(t)) return "";
  return "no Power Roll confirm";
}

function shouldTest(b) {
  if (b.disabled) return false;
  if (/^\+ /.test(b.text)) return false;
  if (/ \+ Aim /.test(b.text)) return false;
  if (/Move into range|End turn|Weapon Swap|No Strike|Aim armed|No heroes|Continue AI|Positions \(brush\)|No movement left|No legal/.test(b.text))
    return false;
  if (b.group === "Move") return false;
  if (b.group === "Turn") return false;
  if (b.group === "Kit") return false;
  if (b.group === "Layout setup") return false;
  return /Attack|Talenty|Core actions|Feat|Reactions/.test(b.group);
}

async function exercise(page, button) {
  const before = await readUi(page);
  const signature = uiSignature(before);
  let moved = false;
  if (button.disabled) {
    return { flow: "N/A", reason: "disabled", helpOffered: false };
  }
  const opened = await clickButton(page, (b) => b.text === button.text);
  if (!opened) return { flow: "FAIL", reason: "button missing on click", helpOffered: false, repro: button.text };
  let ui = await readUi(page);
  if (button.group === "Attack" && ui.buttons.some((b) => /out of range/.test(button.text) || b.text === button.text && b.disabled)) {
    /* click already happened; out-of-range buttons are disabled so we wouldn't be here */
  }
  if (/· out of range/.test(button.text)) {
    return { flow: "N/A", reason: "listed disabled — out of range", helpOffered: false };
  }
  const needsMove =
    ui.buttons.some((b) => /Move into range/.test(b.text)) &&
    !ui.declare &&
    !ui.buttons.some((b) => /^Help from |^Accept/.test(b.text));
  if (/pick cell|pick target/i.test(button.text) && (await page.$("#grid .cell.legal, #grid .cell.target"))) {
    /* settle clicks the cell */
  } else if (needsMove) {
    await clickButton(page, (b) => /Move into range/.test(b.text));
    const cell = await clickCell(page, "legal");
    moved = !!cell;
    await clickButton(page, (b) => b.text === button.text.replace(/ · out of range/, ""));
  }
  const result = await settle(page, { wantHelp: true });
  const after = await readUi(page);
  result.signature = signature;
  let flow = "OK";
  let reason = "";
  if (result.fail) {
    flow = "FAIL";
    reason = result.fail;
  } else if (result.helpOffered) {
    if (!result.clickedHelp || !result.helpLog) {
      flow = "FAIL";
      reason = "Help offered but flow did not finish";
    } else if (!/· (Ranger free 0 AP|free reaction 0 AP|−\d+ AP)/.test(result.helpLog)) {
      flow = "FAIL";
      reason = "Help log missing pay note: " + result.helpLog;
    } else {
      flow = "OK";
      reason = result.helpLabel + " → " + result.helpLog;
    }
  } else if (
    !result.flat &&
    (button.group === "Attack" || /Line Up the Strike/.test(button.text)) &&
    (result.steps || []).some((s) => /Accept — apply|No Help — accept|Accept OA/.test(s))
  ) {
    flow = "FAIL";
    reason = "Power Roll confirm had no Help button";
  } else {
    flow = "N/A";
    reason = result.flat
      ? "flat effect — Help correctly absent"
      : classifyIdle(button, result) || "no Power Roll confirm";
  }
  return {
    flow,
    reason,
    helpOffered: result.helpOffered,
    helpLabel: result.helpLabel,
    helpLog: result.helpLog,
    flat: result.flat,
    steps: result.steps,
    signature,
    moved,
    hint: after.hint,
    declare: (await readUi(page)).declare,
  };
}

async function bootClass(page, classId, first) {
  if (first) {
    await page.waitForSelector("#wizard-rank-1", { timeout: 20000 });
    await page.click("#wizard-rank-1");
    await page.waitForSelector("#wizard-party-next", { timeout: 10000 });
    await page.click("#wizard-party-next");
    await page.waitForSelector('[data-talent-n="4"]', { timeout: 10000 });
    await page.click('[data-talent-n="4"]');
    await page.waitForSelector("#wizard-talents-lab", { timeout: 10000 });
    await page.click("#wizard-talents-lab");
  } else {
    const open = await page.$("#btn-open-lab");
    if (open) await open.click();
    else {
      await page.evaluate(() => {
        const b = document.getElementById("btn-change-setup");
        if (b) b.click();
      });
    }
    await page.waitForSelector("#lab-choice-host button", { timeout: 10000 });
  }
  await page.waitForSelector("#lab-choice-host button", { timeout: 20000 });
  const label = classId.charAt(0).toUpperCase() + classId.slice(1) + " ×2";
  const clicked = await page.evaluate((label) => {
    const buttons = [...document.querySelectorAll("#lab-choice-host button")];
    const b = buttons.find((el) => (el.textContent || "").includes(label));
    if (!b) return null;
    b.click();
    return b.textContent;
  }, label);
  if (!clicked) throw new Error("no lab choice " + label);
  await page.waitForFunction(
    (id) => {
      const h = document.getElementById("hint");
      const s = document.getElementById("status");
      const t = ((h && h.textContent) || "") + ((s && s.textContent) || "");
      return t.includes("Train package") && t.includes(id);
    },
    { timeout: 20000 },
    classId
  );
  await page.click("#btn-start");
  await page.waitForFunction(() => /pick a hero|Who acts|AP /.test(document.getElementById("status").textContent || ""), {
    timeout: 10000,
  });
  await clickButton(page, (b) => / A · /.test(b.text));
  await page.waitForFunction(() => /wybierz kit|Kit 1|AP /.test((document.getElementById("status").textContent || "") + document.body.innerText), {
    timeout: 10000,
  });
  const kit = await clickButton(page, (b) => /Kit 1 ·/.test(b.text));
  if (!kit) {
    const ui = await readUi(page);
    if (!/AP /.test(ui.status)) throw new Error("kit pick missing: " + ui.status + " " + ui.buttons.map((b) => b.text).join(" | "));
  }
  await page.waitForFunction(() => /AP \d/.test(document.getElementById("status").textContent || ""), { timeout: 10000 });
}

async function auditClass(page, classId, first) {
  const rows = [];
  await bootClass(page, classId, first);
  const ui0 = await readUi(page);
  const rosterTalents = (ui0.roster.match(/talents: ([^\n]+)/) || [])[1] || "";
  const markerBtn = ui0.buttons.find((b) => b.group === "Attack" && !b.disabled && !/ \+ Aim /.test(b.text) && !/No Strike/.test(b.text));
  const marker = markerBtn ? markerBtn.text : "";
  const seen = new Set();
  async function drain(kit, pred) {
    for (let n = 0; n < 24; n++) {
      const ui = await readUi(page);
      for (const b of ui.buttons) {
        if (!b.disabled) continue;
        if (!/Attack|Talenty/.test(b.group)) continue;
        if (seen.has(kit + "|" + b.text)) continue;
        seen.add(kit + "|" + b.text);
        rows.push({
          classId,
          kit,
          group: b.group,
          name: b.text,
          helpOffered: false,
          flow: "N/A",
          reason: /out of range/.test(b.text) ? "listed disabled — out of range until a Move" : "listed disabled",
        });
      }
      const button = ui.buttons.find((b) => shouldTest(b) && !seen.has(kit + "|" + b.text));
      if (!button) break;
      seen.add(kit + "|" + button.text);
      let result;
      try {
        result = await exercise(page, button);
      } catch (err) {
        result = { flow: "FAIL", reason: String(err && err.message ? err.message : err), helpOffered: false, steps: [] };
      }
      rows.push({
        classId,
        kit,
        group: button.group,
        name: button.text,
        helpOffered: !!result.helpOffered,
        flow: result.flow,
        reason: result.reason,
        helpLabel: result.helpLabel || "",
        helpLog: result.helpLog || "",
        steps: result.steps || [],
        logBefore: result.logBefore || "",
      });
      if (result.flow === "FAIL") {
        const shot = path.join(SHOTS, classId + "-" + kit + "-" + n + ".png");
        await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
        rows[rows.length - 1].shot = shot;
      }
      const signature = result.signature || "";
      const back = await restoreUntil(page, (ui) => signature && uiSignature(ui) === signature);
      if (!back.ok) {
        rows.push({
          classId,
          kit,
          group: "restore",
          name: "(undo)",
          helpOffered: false,
          flow: "FAIL",
          reason: "could not restore turn after " + button.text + " · " + (back.status || "") + " " + (back.hint || ""),
        });
        break;
      }
    }
  }
  const kit1Pred = (ui) => /AP 3/.test(ui.status) && idleWith(marker)(ui);
  await drain("kit1", kit1Pred);
  const swapped = await clickButton(page, (b) => /Weapon Swap/.test(b.text));
  if (swapped) {
    const uiSwap = await readUi(page);
    const kit2Btn = uiSwap.buttons.find((b) => b.group === "Attack" && !b.disabled && !/ \+ Aim /.test(b.text) && !/No Strike/.test(b.text));
    const kit2Marker = kit2Btn ? kit2Btn.text : "";
    const ap = ((uiSwap.status.match(/AP (\d)/) || [])[1]) || "";
    const kit2Pred = (ui) => new RegExp("AP " + ap).test(ui.status) && idleWith(kit2Marker)(ui);
    await drain("kit2", kit2Pred);
    await restoreUntil(page, kit1Pred);
  }
  const pressableNames = rows.map((r) => r.name).join(" \n ");
  const feats = trainClassFeats(classId) || [];
  for (const id of feats) {
    const stub = FEAT_SMOKE_STUBS[id];
    const label = stub && stub.label ? stub.label.split(":")[0].split("(")[0].trim() : id;
    const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const hit = norm(pressableNames).includes(norm(label));
    if (!hit) {
      rows.push({
        classId,
        kit: "—",
        group: "passive/reaction",
        name: label,
        helpOffered: false,
        flow: "N/A",
        reason: "no pressable action on the turn (passive or reaction window)",
        featId: id,
      });
    }
  }
  rows._rosterTalents = rosterTalents;
  rows._marker = marker;
  rows._hint = ui0.hint;
  return rows;
}

async function playSummon(page, spec) {
  const report = {
    kind: spec.kind,
    classId: spec.classId,
    checks: [],
    fail: "",
  };
  function check(name, ok, detail) {
    report.checks.push({ name, ok: !!ok, detail: detail || "" });
    if (!ok && !report.fail) report.fail = name + ": " + (detail || "no");
  }
  await bootClass(page, spec.classId, false);
  const summoned = await clickButton(page, (b) => spec.summonRe.test(b.text));
  check("summon button", !!summoned, summoned || "missing");
  if (!summoned) return report;
  await sleep(30);
  let ui = await readUi(page);
  check("token on roster", spec.tokenRe.test(ui.roster), ui.roster.split("\n").find((l) => spec.tokenRe.test(l)) || ui.roster.slice(0, 240));
  const hpLine = (ui.roster.match(new RegExp(spec.tokenRe.source + "[\\s\\S]{0,80}?(\\d+/\\d+ HP)")) || [])[0] || "";
  check("HP", spec.hpRe.test(ui.roster), hpLine || "roster missing HP");
  await page.evaluate((reSrc) => {
    const re = new RegExp(reSrc, "i");
    const arts = [...document.querySelectorAll("#roster article")];
    const art = arts.find((a) => re.test(a.innerText || ""));
    if (art) art.click();
  }, spec.tokenRe.source);
  ui = await readUi(page);
  check("stats", spec.statsRe.test(ui.inspect), ui.inspect.split("\n").find((l) => /STR/.test(l)) || "");
  const heroStrike = await clickButton(page, (b) => b.group === "Attack" && !b.disabled && !/ \+ Aim |Summon|No Strike/.test(b.text));
  if (heroStrike) {
    const tgt = await clickCell(page, "target");
    if (!tgt) {
      const res = await settle(page, { wantHelp: false });
      report.heroHelpButtons = res.helpLabel;
    } else {
      const res = await settle(page, { wantHelp: false });
      const labels = res.helpLabels || (res.helpLabel ? [res.helpLabel] : []);
      const helpedBySummon = labels.some((t) => /Help from Summon|Summon ·/.test(t));
      check("summon is not a Help ally", !helpedBySummon, labels.join(" | ") || "(no help button — accept only)");
      if (res.helpOffered) check("hero Help list excludes summon", !labels.some((t) => /Summon/.test(t)), labels.join(" | "));
      await restoreUntil(page, (ui) => spec.tokenRe.test(ui.roster) && /AP \d/.test(ui.status) && !spec.tokenRe.test(ui.status) && ui.buttons.some((b) => /End turn/i.test(b.text)) && !isPrompt(ui));
    }
  }
  const ended = await clickButton(page, (b) => /^End turn/.test(b.text));
  check("end summoner turn", !!ended, ended || "no end");
  ui = await readUi(page);
  check("summon turn selected", spec.tokenRe.test(ui.status), ui.status);
  check("move and action slots", /Mv\s*1/.test(ui.status) && /Act\s*1/.test(ui.status), ui.status);
  const summonHelpNote = /Summon turn/.test(ui.buttons.map((b) => b.text).join(" ") + (documentNote(ui)));
  check("summon help note", /Summon turn/.test((await page.$eval("#actions", (el) => el.innerText)) || ""), "ux note");

  async function useAttack(re, label, wantHelp) {
    let uiNow = await readUi(page);
    let btn = uiNow.buttons.find((b) => re.test(b.text));
    if (btn && /out of range/.test(btn.text)) {
      await clickButton(page, (b) => /Move into range/.test(b.text));
      const cell = await clickCell(page, "legal");
      check(label + " move", !!cell, cell ? cell.x + "," + cell.y : "no cell");
      uiNow = await readUi(page);
      btn = uiNow.buttons.find((b) => re.test(b.text) && !b.disabled);
    }
    if (!btn || btn.disabled) {
      check(label + " listed", false, (uiNow.buttons.filter((b) => b.group === "Attack").map((b) => b.text).join(" | ")) || "none");
      return;
    }
    const dummyBefore = (uiNow.roster.match(/Training Dummy[\s\S]{0,40}?(\d+)\/(\d+) HP/) || [])[1];
    await clickButton(page, (b) => b.text === btn.text);
    const res = await settle(page, { wantHelp });
    const after = await readUi(page);
    const dummyAfter = (after.roster.match(/Training Dummy[\s\S]{0,40}?(\d+)\/(\d+) HP/) || [])[1];
    if (wantHelp) {
      check(label + " Help offered", res.helpOffered, res.helpLabel || res.fail || "no");
      check(label + " Help completes", res.clickedHelp && /Help /.test(res.helpLog) && !res.fail, res.helpLog || res.fail);
      check(label + " summon cannot Help", !/Help from Summon/.test(res.helpLabel), res.helpLabel);
    } else {
      check(label + " Help absent", !res.helpOffered && !res.fail, res.flat ? "flat" : res.fail || "no help button");
    }
    check(label + " action spent or effect", /Act\s*0/.test(after.status) || dummyBefore !== dummyAfter || /Shield|DEF/.test(after.log), after.status + " dummy " + dummyBefore + "→" + dummyAfter);
    report[label] = {
      help: res.helpLabel,
      log: res.helpLog,
      dummy: dummyBefore + "→" + dummyAfter,
      status: after.status,
      fail: res.fail,
      steps: res.steps,
    };
  }

  for (const atk of spec.attacks) {
    await useAttack(atk.re, atk.label, atk.help);
    if (spec.attacks.indexOf(atk) < spec.attacks.length - 1) {
      const back = await restoreUntil(
        page,
        (ui) => spec.tokenRe.test(ui.status) && /Act\s*1/.test(ui.status) && ui.buttons.some((b) => /End turn/i.test(b.text)) && !isPrompt(ui)
      );
      const uiBack = back.ui || (await readUi(page));
      if (!spec.tokenRe.test(uiBack.status)) {
        check("back on summon for " + atk.label, false, uiBack.status + " " + (back.hint || ""));
        break;
      }
    }
  }
  const shot = path.join(SHOTS, "minion-" + spec.kind + ".png");
  await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
  report.shot = shot;
  return report;
}

function documentNote(ui) {
  return ui.hint || "";
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
  page.on("pageerror", (err) => pageErrors.push(String(err && err.message ? err.message : err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") pageErrors.push("console: " + msg.text());
  });
  await page.evaluateOnNewDocument((hash) => {
    sessionStorage.setItem("riftersLabAuth", hash);
  }, HASH);
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  const results = { classes: {}, minions: [], pageErrors: [] };
  let first = true;
  for (const classId of CLASSES) {
    process.stdout.write("class " + classId + "\n");
    try {
      const rows = await auditClass(page, classId, first);
      first = false;
      results.classes[classId] = {
        hint: rows._hint,
        rosterTalents: rows._rosterTalents,
        rows: rows.map(({ _rosterTalents, _marker, _hint, ...r }) => r).filter((r) => r.classId),
      };
    } catch (err) {
      first = false;
      const shot = path.join(SHOTS, "boot-" + classId + ".png");
      await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
      results.classes[classId] = { error: String(err && err.stack ? err.stack : err), shot };
    }
  }
  const minionSpecs = [
    {
      kind: "archer",
      classId: "acolyte",
      summonRe: /Summon · Archer/,
      tokenRe: /Summon · Archer/,
      hpRe: /10\/10 HP/,
      statsRe: /STR 0 · DEX 1 · INT 1 · Spd 6/,
      attacks: [
        { label: "shot", re: /Archer · Shot/, help: true },
        { label: "bone", re: /Bone Arrow/i, help: true },
      ],
    },
    {
      kind: "mage",
      classId: "acolyte",
      summonRe: /Summon · Mage/,
      tokenRe: /Summon · Mage/,
      hpRe: /8\/8 HP/,
      statsRe: /STR 0 · DEX 0 · INT 1 · Spd 4/,
      attacks: [
        { label: "bolt", re: /Mage · Dark Bolt/, help: true },
        { label: "fireball", re: /Fireball/i, help: true },
      ],
    },
    {
      kind: "warrior",
      classId: "acolyte",
      summonRe: /Summon · Warrior/,
      tokenRe: /Summon · Warrior/,
      hpRe: /14\/14 HP/,
      statsRe: /STR 1 · DEX 0 · INT 1 · Spd 3/,
      attacks: [
        { label: "strike", re: /Warrior · Strike/, help: true },
        { label: "living", re: /Living Shield/i, help: true },
      ],
    },
    {
      kind: "elemental",
      classId: "primalist",
      summonRe: /Summon · Elemental/,
      tokenRe: /Summon · Elemental/,
      hpRe: /10\/10 HP/,
      statsRe: /STR 0 · DEX 0 · INT 1 · Spd 5/,
      attacks: [
        { label: "shield", re: /Elemental Shield|Shield/i, help: false },
        { label: "bolt", re: /Elemental · Bolt/, help: true },
      ],
    },
  ];
  for (const spec of minionSpecs) {
    process.stdout.write("minion " + spec.kind + "\n");
    try {
      results.minions.push(await playSummon(page, spec));
    } catch (err) {
      const shot = path.join(SHOTS, "minion-fail-" + spec.kind + ".png");
      await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
      results.minions.push({ kind: spec.kind, fail: String(err && err.stack ? err.stack : err), shot });
    }
  }
  results.pageErrors = pageErrors.slice(0, 40);
  fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
  await browser.close();
  const fails = [];
  for (const [cls, pack] of Object.entries(results.classes)) {
    if (pack.error) fails.push(cls + " BOOT " + pack.error.split("\n")[0]);
    for (const row of pack.rows || []) if (row.flow === "FAIL") fails.push(cls + " " + row.name + " " + row.reason);
  }
  for (const m of results.minions) {
    if (m.fail) fails.push("minion " + m.kind + " " + m.fail);
    for (const c of m.checks || []) if (!c.ok) fails.push("minion " + m.kind + " " + c.name + " " + c.detail);
  }
  process.stdout.write("FAILS " + fails.length + "\n");
  for (const f of fails) process.stdout.write(f + "\n");
  process.stdout.write("wrote " + OUT + "\n");
  if (fails.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
