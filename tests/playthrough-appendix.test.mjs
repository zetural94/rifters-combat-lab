import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { preserveBrowserAppendix } from "../scripts/browser-appendix.mjs";

test("playthrough generator keeps the marked browser appendix", () => {
  const previous = [
    "# generated",
    "",
    "<!-- browser-appendix:start -->",
    "- Riposte click in the live sandbox.",
    "- Hidden Bola click in the live sandbox.",
    "<!-- browser-appendix:end -->",
    "",
  ].join("\n");
  const kept = preserveBrowserAppendix(previous);
  assert.match(kept, /Riposte click/);
  assert.match(kept, /Hidden Bola click/);
  assert.equal(preserveBrowserAppendix("# no marker\n"), "");

  const doc = fs.readFileSync(new URL("../docs/TALENT-PLAYTHROUGH.md", import.meta.url), "utf8");
  const live = preserveBrowserAppendix(doc);
  assert.match(live, /Riposte/);
  assert.match(live, /Hidden Bola/);
});
