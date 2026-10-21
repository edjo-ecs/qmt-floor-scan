/* Runs two versions of Code.gs against the same fixture and checks that every
   board the TV can ask for comes out identical, then reports how much each
   version read to produce it.

     node test/regression.js                      # HEAD's Code.gs  vs  the working copy
     node test/regression.js old.gs new.gs        # any two files

   Exit code 1 if any board differs. */
"use strict";
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const mock = require("./gas-mock");
const fixture = require("./fixture");

const repo = path.join(__dirname, "..");
const args = process.argv.slice(2);
const oldSrc = args[0] ? fs.readFileSync(args[0], "utf8") : execSync("git show HEAD:apps-script/Code.gs", { cwd: repo, encoding: "utf8" });
const newSrc = fs.readFileSync(args[1] || path.join(repo, "apps-script", "Code.gs"), "utf8");

mock.pinDate(fixture.NOW_MS);

const SCENARIOS = [
  { label: "this week",        q: { board: "1", week: "0", period: "week" } },
  { label: "last week",        q: { board: "1", week: "1", period: "week" } },
  { label: "two weeks ago",    q: { board: "1", week: "2", period: "week" } },
  { label: "today",            q: { board: "1", week: "0", period: "day" } },
  { label: "custom 10/5-10/14", q: { board: "1", from: "2026-10-05", to: "2026-10-14" } },
  { label: "custom Aug 3-9",   q: { board: "1", from: "2026-08-03", to: "2026-08-09" } },
  { label: "double-dip check", q: { scans: "1", name: "Victor R", from: "2026-10-12T04:00:00Z", to: "2026-10-19T04:00:00Z" } },
  { label: "app config",       q: {} }
];
const VOLATILE = new Set(["v", "updated", "firstTs"]);

function stable(obj) {
  if (Array.isArray(obj)) return obj.map(stable);
  if (obj && typeof obj === "object") {
    const o = {};
    Object.keys(obj).sort().forEach(k => { if (!VOLATILE.has(k)) o[k] = stable(obj[k]); });
    return o;
  }
  return obj;
}

function run(src, scenario, fx, env, repeat) {
  // one load per request, like a real Apps Script execution
  fx.stats.reset();
  const t0 = process.hrtime.bigint();
  let out;
  for (let i = 0; i < (repeat || 1); i++) {
    const api = mock.load(src, env);
    out = JSON.parse(api.doGet({ parameter: scenario.q }).getContent());
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return { out, cells: fx.stats.cells.Scans || 0, ranges: fx.stats.ranges.Scans || 0, opens: fx.stats.opens, ms: Math.round(ms) };
}

function versionOf(src) { const m = /\bv:\s*(\d+)/.exec(src); return m ? "v" + m[1] : "?"; }

let failures = 0;
const fx = fixture.build();
const env = mock.makeEnv({ active: fx.ss, books: fx.books, props: {} });
console.log(`fixture: ${fx.scanCount} scan rows, now = ${new Date(fixture.NOW_MS).toISOString()}`);
console.log(`comparing ${versionOf(oldSrc)} (old) with ${versionOf(newSrc)} (new)\n`);
console.log(pad("scenario", 22) + pad("same?", 7) + pad("old cells", 11) + pad("new cells", 11) + pad("old opens", 11) + pad("new opens", 11) + "rows");

for (const sc of SCENARIOS) {
  env._cache._clear();
  const a = run(oldSrc, sc, fx, env);
  env._cache._clear();
  const b = run(newSrc, sc, fx, env);
  const same = JSON.stringify(stable(a.out)) === JSON.stringify(stable(b.out));
  if (!same) failures++;
  const rows = Array.isArray(b.out.rows) ? b.out.rows.length : "-";
  console.log(pad(sc.label, 22) + pad(same ? "yes" : "NO", 7) + pad(a.cells, 11) + pad(b.cells, 11) + pad(a.opens, 11) + pad(b.opens, 11) + rows);
  if (!same) {
    const dir = path.join(repo, "test", "out"); fs.mkdirSync(dir, { recursive: true });
    const slug = sc.label.replace(/[^a-z0-9]+/gi, "_");
    fs.writeFileSync(path.join(dir, slug + ".old.json"), JSON.stringify(stable(a.out), null, 2));
    fs.writeFileSync(path.join(dir, slug + ".new.json"), JSON.stringify(stable(b.out), null, 2));
    console.log("   differs — see test/out/" + slug + ".{old,new}.json");
  }
}

// Cache behaviour: a second identical request within the cache window
env._cache._clear();
const first = run(newSrc, SCENARIOS[0], fx, env);
const second = run(newSrc, SCENARIOS[0], fx, env);
console.log(`\ncache: first request read ${first.cells} Scans cells, the repeat read ${second.cells} (hit = ${second.cells === 0 ? "yes" : "NO"})`);
if (second.cells !== 0) failures++;
// ...a new scan does NOT clear it (scans arrive every few seconds mid-shift) …
const api = mock.load(newSrc, env);
api.doPost({ postData: { contents: JSON.stringify({ ts: new Date().toISOString(), station: "PUR", job: "2999999", employee: "Dale Jones", qty: 100 }) } });
const third = run(newSrc, SCENARIOS[0], fx, env);
console.log(`cache: right after a new scan the next request read ${third.cells} cells (still cached = ${third.cells === 0 ? "yes" : "NO"})`);
if (third.cells !== 0) failures++;
// … but once the cache expires the scan is counted
env._cache._clear();
const fourth = run(newSrc, SCENARIOS[0], fx, env);
const dale = fourth.out.rows.find(r => r.name === "Dale Jones");
const daleBefore = first.out.rows.find(r => r.name === "Dale Jones");
console.log(`cache: after expiry Dale Jones scans this week ${daleBefore.scans} -> ${dale.scans} (counted = ${dale.scans === daleBefore.scans + 1 ? "yes" : "NO"})`);
if (dale.scans !== daleBefore.scans + 1) failures++;

// Reconcile sweep: how many rows each version re-submits to Admin
const props = { MIS_BASE_URL: "https://example.invalid/QmtFloorScan.asp", MIS_API_KEY: "x" };
for (const [label, src] of [["old", oldSrc], ["new", newSrc]]) {
  const f2 = fixture.build();
  const e2 = mock.makeEnv({ active: f2.ss, books: f2.books, props });
  const a2 = mock.load(src, e2);
  a2.reconcilePending_();
  console.log(`reconcile (${label}): ${e2.SpreadsheetApp.getActiveSpreadsheet().stats.fetches} rows re-submitted to Admin, ${f2.stats.cells.Scans} Scans cells read`);
}

console.log(failures ? `\n${failures} check(s) FAILED` : "\nall boards identical; cache and reconcile behave as intended");
process.exit(failures ? 1 : 0);

function pad(s, n) { s = String(s); return s + " ".repeat(Math.max(0, n - s.length)); }
