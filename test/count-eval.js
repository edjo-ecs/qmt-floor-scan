/* Accuracy check for v32 count-from-photo, against REAL photos and the REAL
   Anthropic API (costs a few cents per photo). Sends exactly the request
   Code.gs builds (buildCountRequest_), so a pass here is a pass on the floor.

     ANTHROPIC_API_KEY=... node test/count-eval.js <cases.json> <sets-dir> [model] [effort]

   cases.json: [{ "id": "C01", "item": "books", "expect": 29 }, ...]
   sets-dir:   <id>_0.jpg (whole), <id>_1.jpg, <id>_2.jpg (halves) — the same
               three images the scan app sends (see countImages() in scan-app).
   Pass rule (Ed's memo, Oct 2026): under 100 within 1; 100+ within 1%;
   overall right 19 times out of 20. Photos are not kept in this repo. */
"use strict";
const fs = require("fs");
const path = require("path");

const [casesFile, dir, model, effort] = process.argv.slice(2);
const key = process.env.ANTHROPIC_API_KEY;
if (!casesFile || !dir || !key) { console.error("usage: ANTHROPIC_API_KEY=... node test/count-eval.js <cases.json> <sets-dir> [model] [effort]"); process.exit(2); }

const src = fs.readFileSync(path.join(__dirname, "..", "apps-script", "Code.gs"), "utf8");
const { buildCountRequest_, parseCountResponse_ } = new Function(src + "\nreturn { buildCountRequest_, parseCountResponse_ };")();
const cases = JSON.parse(fs.readFileSync(casesFile, "utf8"));
const pass = (got, want) => want < 100 ? Math.abs(got - want) <= 1 : Math.abs(got - want) <= want * 0.01;

async function one(c) {
  const images = [0, 1, 2].map(i => path.join(dir, c.id + "_" + i + ".jpg")).filter(f => fs.existsSync(f))
    .map(f => fs.readFileSync(f).toString("base64"));
  const t0 = Date.now();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-beta": "server-side-fallback-2026-07-01" },
    body: JSON.stringify(buildCountRequest_(images, c.item, model, effort))
  });
  const body = await res.json();
  const secs = (Date.now() - t0) / 1000;
  try {
    const r = parseCountResponse_(body);
    return Object.assign({ secs, usage: body.usage }, c, r, { ok: pass(r.count, c.expect) });
  } catch (e) {
    return Object.assign({ secs, error: String(e.message || e) }, c, { ok: false });
  }
}

(async () => {
  const out = [];
  for (let i = 0; i < cases.length; i += 4) {   // four at a time
    (await Promise.all(cases.slice(i, i + 4).map(one))).forEach(r => {
      out.push(r);
      console.log([r.id, r.item, "want " + r.expect, "got " + (r.error ? "ERROR " + r.error : r.count), r.confidence || "", r.ok ? "PASS" : "MISS", r.secs.toFixed(0) + "s", r.note || ""].join(" | "));
    });
  }
  const n = out.filter(r => r.ok).length;
  const sure = out.filter(r => r.confidence && r.confidence !== "low");
  const inTok = out.reduce((s, r) => s + ((r.usage && r.usage.input_tokens) || 0), 0);
  const outTok = out.reduce((s, r) => s + ((r.usage && r.usage.output_tokens) || 0), 0);
  console.log("\npassed " + n + "/" + out.length + " (" + Math.round(100 * n / out.length) + "%; bar is 95%)");
  console.log("when it said high/medium: " + sure.filter(r => r.ok).length + "/" + sure.length + " right");
  console.log("slowest " + Math.max(...out.map(r => r.secs)).toFixed(0) + "s; tokens in " + inTok + ", out " + outTok);
  fs.writeFileSync(path.join(dir, "eval-" + Date.now() + ".json"), JSON.stringify(out, null, 1));
})();
