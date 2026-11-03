/* v33: a repeat scan (same job, station, quantity and people) earns nothing.
   Adds scans shaped like the real ones from 10/29 (Box) and 11/2 (QC) to the
   fixture, then reads today's board.
     node test/repeat.js
   Exit code 1 on any failure. */
"use strict";
const fs = require("fs");
const path = require("path");
const mock = require("./gas-mock");
const fixture = require("./fixture");

mock.pinDate(fixture.NOW_MS);
const src = fs.readFileSync(path.join(__dirname, "..", "apps-script", "Code.gs"), "utf8");

let failures = 0;
function check(label, cond, extra) {
  console.log((cond ? "ok   " : "FAIL ") + label + (extra ? "  (" + extra + ")" : ""));
  if (!cond) failures++;
}

const fx = fixture.build();
const scans = fx.ss.getSheetByName("Scans");
const at = mins => new Date(fixture.NOW_MS - mins * 60000);   // minutes before "now" (Mon 3:30 PM)
const add = (mins, station, job, who, qty, status) => scans.appendRow([at(mins), station, job, who, qty, "", status || "ok", ""]);

// Box 10/29: one 1,470-book job scanned twice by the same pair, 19 minutes apart
add(300, "Label and Ship", "9000001", "Test Boxer+Test Helper", 1470);
add(281, "Label and Ship", "9000001", "Test Helper + Test Boxer", 1470, "pending");   // names in the other order
// QC 11/2: the same job three times, and an exact offline replay of one of them
add(240, "Single Knife", "9000002", "Test Checker", 66);
add(200, "Single Knife", "9000002", "Test Checker", 66);
add(120, "Single Knife", "9000002", "Test Checker", 66);
add(120, "Single Knife", "9000002", "Test Checker", 66);
// a second batch of the same job with a different quantity still counts
add(100, "Single Knife", "9000002", "Test Checker", 40);
// a different person scanning the same job and quantity is not this person's repeat
add(90, "Single Knife", "9000002", "Test Other", 66);
// a rejected first scan does not make the next one a repeat
add(80, "Single Knife", "9000003", "Test Rejected", 25, "rejected");
add(70, "Single Knife", "9000003", "Test Rejected", 25);
// first scan was last week (outside today's window): today's repeat still earns nothing
scans.appendRow([new Date(fixture.NOW_MS - 3 * 86400000), "Single Knife", "9000004", "Test Lookback", 50, "", "ok", ""]);
add(60, "Single Knife", "9000004", "Test Lookback", 50);

const env = mock.makeEnv({ active: fx.ss, books: fx.books, props: {} });
const board = JSON.parse(mock.load(src, env).doGet({ parameter: { board: "1", period: "day" } }).getContent());
const row = name => board.rows.find(r => r.name === name || r.badge === name);
const st = (r, s) => (r.stations || []).find(x => x.station === s) || {};

check("board answers as v33", board.ok && board.v === 33);
let r = row("Test Boxer");
check("pair's repeated 1,470 job counts once (735 each)", r && r.units === 735 && r.scans === 1, r && JSON.stringify({ units: r.units, scans: r.scans }));
check("the repeat is flagged for the coaching report", r && r.flags.repeat === 1);
r = row("Test Checker");
check("job scanned three times + a replay counts once, the 40-book batch still counts", r && st(r, "Single Knife").units === 106 && r.scans === 2, r && JSON.stringify(st(r, "Single Knife")));
check("two repeats flagged (the exact replay is not a repeat)", r && r.flags.repeat === 2, r && JSON.stringify(r.flags));
r = row("Test Other");
check("another person's scan of the same job is not a repeat", r && r.units === 66 && r.flags.repeat === 0);
r = row("Test Rejected");
check("a rejected scan does not block the real one", r && r.units === 25 && r.flags.repeat === 0 && r.flags.rejected === 1, r && JSON.stringify(r));
r = row("Test Lookback");
check("a repeat of a scan from 3 days ago earns nothing today", r && r.units === 0 && r.flags.repeat === 1, r && JSON.stringify({ units: r.units, flags: r.flags }));

console.log(failures ? failures + " FAILED" : "all passed");
process.exit(failures ? 1 : 0);
