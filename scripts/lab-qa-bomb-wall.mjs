/**
 * Lab UI check for Living Bomb and Ice Wall.
 * Usage: node scripts/lab-qa-bomb-wall.mjs
 * Expects http://127.0.0.1:8765/sandbox.html?qa=1
 */
import fs from "fs";
import path from "path";
import { loadPuppeteer } from "./load-puppeteer.mjs";

const puppeteer = await loadPuppeteer();
const AUTH_OK = "open";
const BASE = process.env.LAB_URL || "http://127.0.0.1:8765/sandbox.html?qa=1";
const CHROME = process.env.CHROME || "/usr/bin/google-chrome";
const SHOTS = "/tmp/lab-qa-bomb-wall";
fs.mkdirSync(SHOTS, { recursive: true });

const rows = [];
function record(name, ok, detail) {
  const row = { name, ok: !!ok, detail: String(detail || "").replace(/\s+/g, " ").slice(0, 700) };
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
      status: ((document.getElementById("status") || {}).textContent || "").trim(),
      hint: ((document.getElementById("hint") || {}).textContent || "").trim(),
      buttons,
      log: ((document.getElementById("log") || {}).innerText || "").slice(-1800),
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
  await sleep(120);
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

async function readyMystic(page) {
  const picked = await clickAction(page, (t) => /Mystic/.test(t) && /HP/.test(t));
  await sleep(200);
  const kit = await clickAction(page, (t) => /Kit 1|Pyre|Ember|Focus/.test(t));
  await sleep(180);
  return { picked, kit, ui: await ui(page) };
}

async function bringInRange(page) {
  const notes = [];
  for (let i = 0; i < 4; i++) {
    const snap = await ui(page);
    const btn = snap.buttons.find((b) => /^Living Bomb /.test(b.text) && !/Upcast/.test(b.text));
    if (btn && !btn.disabled && !/out of range/.test(btn.text)) return notes.join(";") || "in-range";
    const moved = await clickAction(page, (t) => /Move into range/.test(t) || /^Move /.test(t));
    await sleep(100);
    const dest = await page.evaluate(() => {
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
        const band = (d) => (d >= 2 && d <= 5 ? 0 : 1);
        return band(a.d) - band(b.d) || a.d - b.d;
      });
      const pick = ranked.find((r) => r.d >= 2 && r.d <= 5) || ranked[0];
      if (!pick) return null;
      pick.el.click();
      return pick.p.x + "," + pick.p.y + " d" + pick.d;
    });
    notes.push((moved || "no-move") + "→" + dest);
    await sleep(220);
  }
  return notes.join(";") || "stuck";
}

async function acceptRoll(page) {
  const seen = [];
  for (let i = 0; i < 6; i++) {
    const hit = await clickAction(page, (t) => /No Help — accept roll|Accept effect|pass OA|No boost/.test(t));
    if (!hit) break;
    seen.push(hit);
    await sleep(180);
    if (/No Help — accept roll/.test(hit)) break;
  }
  return seen.join(" | ");
}

async function castBomb(page, upcast, d1, d2, targetId) {
  await qa(page, "primeDice", [d1, d2]);
  const label = await clickAction(page, (t) =>
    upcast
      ? /Living Bomb \(Upcast\)/.test(t) && !/out of range/.test(t)
      : /^Living Bomb /.test(t) && !/Upcast/.test(t) && !/out of range/.test(t)
  );
  await sleep(120);
  const cell = await page.evaluate((id) => {
    const hook = globalThis.__riftersQa && globalThis.__riftersQa.snap();
    const actor = hook && hook.actors.find((a) => a.id === id);
    if (!actor) return null;
    const el = document.querySelector('#grid .cell.target[data-x="' + actor.x + '"][data-y="' + actor.y + '"]');
    if (!el) return { id, x: actor.x, y: actor.y, targeted: false };
    el.click();
    return { id, x: actor.x, y: actor.y, targeted: true };
  }, targetId);
  await sleep(180);
  const accepted = await acceptRoll(page);
  return { label, cell, accepted };
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
  await sleep(200);
  await domClick(page, "#btn-talent-clear");
  await sleep(100);
  for (const id of [
    "mystic-living-bomb",
    "mystic-ice-wall",
    "fighter-precise-strike",
    "fighter-heavy-swing",
    "brawler-grapple",
    "brawler-uppercut",
    "scout-pin-shot",
    "scout-barrage",
  ]) {
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
  const opened = await page.evaluate(() => {
    const host = document.getElementById("lab-choice-host");
    const b = [...host.querySelectorAll("button")].find((el) => /Easy — 4× Wolf/.test(el.textContent || ""));
    if (!b) return { ok: false };
    b.click();
    return { ok: true, text: (b.textContent || "").trim() };
  });
  await sleep(400);
  await domClick(page, "#btn-start");
  await sleep(300);
  const ready = await readyMystic(page);
  const hook = await qa(page, "snap");
  record(
    "qa hook and mystic turn",
    opened.ok && hook && hook.currentId === "mystic" && !hook.reason,
    "opened=" + (opened.text || opened.ok) + " ready=" + JSON.stringify(ready.picked) + " kit=" + ready.kit + " current=" + (hook && hook.currentId)
  );

  const buttons = (await ui(page)).buttons.map((b) => b.text);
  const baseWall = buttons.find((t) => /^Ice Wall · 2 AP · 3 mana/.test(t));
  const spacesBtn = buttons.find((t) => /Ice Wall \(Upcast \+3 spaces\) · 2 AP · 4 mana/.test(t));
  const dmgBtn = buttons.find((t) => /Ice Wall \(Upcast \+2 destroy\) · 2 AP · 4 mana/.test(t));
  record(
    "Ice Wall buttons show 2 AP / 3 mana and both upcasts",
    !!baseWall && !!spacesBtn && !!dmgBtn,
    [baseWall, spacesBtn, dmgBtn].filter(Boolean).join(" || ") || buttons.filter((t) => /Ice/.test(t)).join(" || ")
  );

  const moved = await bringInRange(page);
  const bombButtons = (await ui(page)).buttons.map((b) => b.text);
  const bombBase = bombButtons.find((t) => /^Living Bomb /.test(t) && !/Upcast/.test(t) && !/out of range/.test(t));
  const bombUp = bombButtons.find((t) => /Living Bomb \(Upcast\)/.test(t) && !/out of range/.test(t));
  record(
    "Living Bomb costs 2 AP / 2 mana and upcast is 3 mana",
    !!bombBase && /2 AP/.test(bombBase) && /2 mana/.test(bombBase) && !!bombUp && /3 mana/.test(bombUp),
    "move=" + moved + " base=" + (bombBase || "") + " up=" + (bombUp || "")
  );

  const beforeBomb = await qa(page, "snap");
  const mb = (beforeBomb.actors || []).find((a) => a.id === "mystic");
  const wolves = (beforeBomb.actors || []).filter((a) => a.side === "enemy" && !a.dead);
  const homes = wolves.map((w) => ({ id: w.id, x: w.x, y: w.y }));
  const tiers = [
    { name: "T1", d1: 1, d2: 1, burn: 0, upcast: false, dmg: 11 },
    { name: "T2", d1: 6, d2: 6, burn: 3, upcast: false, dmg: 11 },
    { name: "T3", d1: 8, d2: 8, burn: 4, upcast: false, dmg: 11 },
    { name: "upcast", d1: 1, d2: 1, burn: 0, upcast: true, dmg: 13 },
  ];
  for (let i = 0; i < tiers.length && i < wolves.length; i++) {
    const spec = tiers[i];
    await qa(page, "setResources", ["mystic", { ap: 6, mana: 10, attacksThisTurn: 0 }]);
    const cast = await castBomb(page, spec.upcast, spec.d1, spec.d2, wolves[i].id);
    const snap = await qa(page, "snap");
    const marked = (snap.actors || []).find((a) => a.id === wolves[i].id);
    record(
      "Living Bomb " + spec.name + " burn gate and death damage",
      !!(
        marked &&
        marked.livingBomb &&
        marked.livingBomb.dmg === spec.dmg &&
        marked.livingBomb.range === 3 &&
        marked.burn === spec.burn &&
        (!spec.upcast || marked.livingBomb.upcast)
      ),
      "cast=" + JSON.stringify(cast) + " wolf=" + JSON.stringify(marked && { id: marked.id, burn: marked.burn, bomb: marked.livingBomb, x: marked.x, y: marked.y }) + " int=" + (mb && mb.int)
    );
  }

  await qa(page, "moveActor", ["mystic", 2, 2]);
  await qa(page, "setResources", ["mystic", { ap: 3, mana: 10, attacksThisTurn: 0 }]);
  const before = await qa(page, "snap");
  const mystic0 = (before.actors || []).find((a) => a.id === "mystic");
  await clickAction(page, (t) => /^Ice Wall · 2 AP · 3 mana/.test(t));
  await sleep(250);
  const after = await qa(page, "snap");
  const mystic1 = (after.actors || []).find((a) => a.id === "mystic");
  const log1 = after.log.join(" | ");
  record(
    "base Ice Wall spends 2 AP and 3 mana and places 4 segments",
    mystic1 &&
      mystic0 &&
      mystic1.ap === mystic0.ap - 2 &&
      mystic1.mana === mystic0.mana - 3 &&
      after.ice.length === 4 &&
      after.ice.every((o) => o.destroyDmg === 2) &&
      after.difficult > 0 &&
      mystic1.iceWallUsed === false &&
      /Ice Wall ×4/.test(log1) &&
      /destroy 2/.test(log1) &&
      /adjacent difficult/.test(log1),
    "ap " + mystic0.ap + "→" + mystic1.ap + " mana " + mystic0.mana + "→" + mystic1.mana + " ice=" + after.ice.length + " difficult=" + after.difficult + " used=" + mystic1.iceWallUsed + " log=" + log1
  );

  await qa(page, "setResources", ["mystic", { ap: 3 }]);
  await sleep(80);
  const still = await clickAction(page, (t) => /^Ice Wall · 2 AP · 3 mana/.test(t));
  await sleep(250);
  const second = await qa(page, "snap");
  const mystic2 = (second.actors || []).find((a) => a.id === "mystic");
  record(
    "human can cast a second Ice Wall in the same fight",
    !!still && second.ice.length === 8 && mystic2 && mystic2.iceWallUsed === false,
    "click=" + still + " ice=" + second.ice.length + " used=" + (mystic2 && mystic2.iceWallUsed)
  );

  await qa(page, "setResources", ["mystic", { ap: 3, mana: 10 }]);
  await sleep(80);
  const spacesClick = await clickAction(page, (t) => /Ice Wall \(Upcast \+3 spaces\)/.test(t));
  await sleep(250);
  const spaces = await qa(page, "snap");
  record(
    "upcast +3 spaces places 7 segments at destroy 2",
    !!spacesClick && spaces.ice.length === 15 && spaces.log.join(" ").includes("upcast spaces") && spaces.ice.filter((o) => o.destroyDmg === 2).length >= 7,
    "click=" + spacesClick + " ice=" + spaces.ice.length + " log=" + spaces.log.slice(-2).join(" | ")
  );

  await qa(page, "setResources", ["mystic", { ap: 3, mana: 10 }]);
  await sleep(80);
  const dmgClick = await clickAction(page, (t) => /Ice Wall \(Upcast \+2 destroy\)/.test(t));
  await sleep(250);
  const boom = await qa(page, "snap");
  const boomSeg = boom.ice.find((o) => o.destroyDmg === 4);
  record(
    "upcast +2 destroy keeps 4 segments and destroy 4",
    !!dmgClick && !!boomSeg && boom.log.join(" ").includes("upcast damage") && boom.log.join(" ").includes("destroy 4"),
    "click=" + dmgClick + " destroy4=" + boom.ice.filter((o) => o.destroyDmg === 4).length + " log=" + boom.log.slice(-2).join(" | ")
  );

  const seg2 = boom.ice.find((o) => o.destroyDmg === 2);
  async function splashOf(seg, label) {
    if (!seg) return record(label, false, "no segment");
    const wolves = (await qa(page, "snap")).actors.filter((a) => a.side === "enemy" && !a.dead);
    const wolf = wolves[0];
    const beforeHp = wolf.hp;
    await qa(page, "moveActor", [wolf.id, seg.x, seg.y + 1 > 7 ? seg.y - 1 : seg.y + 1]);
    const hit = await qa(page, "smashIce", [seg.id]);
    const afterHp = await qa(page, "snap");
    const now = (afterHp.actors || []).find((a) => a.id === wolf.id);
    const drop = beforeHp - (now ? now.hp : beforeHp);
    record(
      label,
      hit && hit.ok && drop === seg.destroyDmg && (now ? now.defFire : 0) >= 3,
      "destroy=" + seg.destroyDmg + " drop=" + drop + " defFire=" + (now && now.defFire) + " hit=" + JSON.stringify(hit && hit.hit)
    );
  }
  await splashOf(seg2, "destroy splash 2 is unpreventable");
  const fresh = await qa(page, "snap");
  const seg4 = (fresh.ice || []).find((o) => o.destroyDmg === 4);
  const wolf2 = (fresh.actors || []).filter((a) => a.side === "enemy" && !a.dead)[1];
  if (seg4 && wolf2) {
    const beforeHp = wolf2.hp;
    await qa(page, "moveActor", [wolf2.id, seg4.x + 1 > 11 ? seg4.x - 1 : seg4.x + 1, seg4.y]);
    const hit = await qa(page, "smashIce", [seg4.id]);
    const afterHp = await qa(page, "snap");
    const now = (afterHp.actors || []).find((a) => a.id === wolf2.id);
    const drop = beforeHp - (now ? now.hp : beforeHp);
    record(
      "destroy splash 4 is unpreventable",
      hit && hit.ok && drop === 4,
      "drop=" + drop + " defFire=" + (now && now.defFire)
    );
  } else {
    record("destroy splash 4 is unpreventable", false, "missing seg or wolf");
  }

  for (const home of homes) await qa(page, "moveActor", [home.id, home.x, home.y]);
  await qa(page, "setResources", ["mystic", { ap: 6, mana: 10, attacksThisTurn: 0 }]);
  const pick1 = await qa(page, "aiPick");
  const applied = pick1 && pick1.type === "iceWall" ? await qa(page, "apply", [pick1]) : null;
  const mid = await qa(page, "snap");
  const mysticAi = (mid.actors || []).find((a) => a.id === "mystic");
  await qa(page, "setResources", ["mystic", { ap: 6, mana: 10, attacksThisTurn: 0 }]);
  const pick2 = await qa(page, "aiPick");
  const buttonsAfter = (await ui(page)).buttons.map((b) => b.text);
  record(
    "AI casts Ice Wall once, then refuses, while the button stays",
    pick1 &&
      pick1.type === "iceWall" &&
      pick1.fromAi === true &&
      applied &&
      applied.ok &&
      mysticAi &&
      mysticAi.iceWallUsed === true &&
      pick2 &&
      pick2.type !== "iceWall" &&
      buttonsAfter.some((t) => /^Ice Wall · 2 AP · 3 mana/.test(t)),
    "pick1=" + JSON.stringify(pick1) + " apply=" + JSON.stringify(applied) + " used=" + (mysticAi && mysticAi.iceWallUsed) + " pick2=" + (pick2 && pick2.type) + " button=" + buttonsAfter.some((t) => /^Ice Wall ·/.test(t))
  );

  for (const home of homes) await qa(page, "moveActor", [home.id, home.x, home.y]);
  const preKill = await qa(page, "snap");
  const victim = (preKill.actors || []).find((a) => a.livingBomb && a.livingBomb.dmg === 13);
  const others = (preKill.actors || []).filter((a) => a.side === "enemy" && !a.dead && a.id !== (victim && victim.id));
  if (victim) {
    const hurt = await qa(page, "hurt", [victim.id, 100]);
    const post = await qa(page, "snap");
    const dead = (post.actors || []).find((a) => a.id === victim.id);
    const drops = others.map((o) => {
      const now = (post.actors || []).find((a) => a.id === o.id);
      return { id: o.id, from: o.hp, to: now ? now.hp : null, def: o.defFire };
    });
    record(
      "on-death 13 Fire splash in range 3 after DEF",
      hurt && hurt.ok && dead && dead.dead && drops.length >= 1 && drops.every((d) => d.from - d.to === 10),
      "hurt=" + JSON.stringify(hurt) + " drops=" + JSON.stringify(drops)
    );
  } else {
    record("on-death 13 Fire splash in range 3 after DEF", false, "no upcast mark");
  }

  const baseVictim = (await qa(page, "snap")).actors.find((a) => a.livingBomb && a.livingBomb.dmg === 11 && !a.dead);
  if (baseVictim) {
    const near = (await qa(page, "snap")).actors.filter((a) => a.side === "enemy" && !a.dead && a.id !== baseVictim.id);
    await qa(page, "hurt", [baseVictim.id, 100]);
    const post = await qa(page, "snap");
    const drops = near.map((o) => {
      const now = (post.actors || []).find((a) => a.id === o.id);
      return { id: o.id, from: o.hp, to: now ? now.hp : null };
    });
    record(
      "on-death 11 Fire splash in range 3 after DEF",
      drops.length >= 1 && drops.every((d) => d.to != null && (d.from - d.to === 8 || d.to <= 0)),
      JSON.stringify(drops)
    );
  }

  await page.screenshot({ path: path.join(SHOTS, "end.png") }).catch(() => {});
  const summary = { ok: rows.filter((r) => r.ok).length, fail: rows.filter((r) => !r.ok).length, pageErrors, rows };
  fs.writeFileSync("/tmp/lab-qa-bomb-wall.json", JSON.stringify(summary, null, 2));
  console.log("\nUI", summary.ok, "ok", summary.fail, "fail", "errors", pageErrors.length);
  if (pageErrors.length) console.log(pageErrors.slice(0, 8).join("\n"));
  await browser.close();
  process.exit(summary.fail || pageErrors.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
