/* v34: the weekly team goal rolls up by itself.
   The fixture's "now" is Mon 10/19/2026 3:30 PM ET, so last week = 10/12-10/18
   (6,492 books through Label and Ship in the fixture).
     node test/team-goal.js
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

function setup(goal) {
  const fx = fixture.build();
  fx.ss.getSheetByName("Points").getRange("E4").setValue(goal);
  const env = mock.makeEnv({ active: fx.ss, books: fx.books, props: {} });
  const board = q => JSON.parse(mock.load(src, env).doGet({ parameter: Object.assign({ board: "1" }, q) }).getContent());
  const log = () => {
    const sh = fx.ss.getSheetByName("Team Goal Log");
    return sh && sh.getLastRow() >= 2 ? sh.getRange(2, 1, sh.getLastRow() - 1, 9).getValues() : [];
  };
  const e4 = () => fx.ss.getSheetByName("Points").getRange("E4").getValue();
  return { fx, env, board, log, e4 };
}

// --- the rounding rule ---
const fns = mock.load(src, mock.makeEnv({ active: fixture.build().ss, books: {}, props: {} }));
[[13846, 14000], [14020, 15000], [14000, 15000], [9000, 10000], [999, 1000]].forEach(([u, want]) =>
  check("next goal after " + u.toLocaleString() + " shipped = " + want.toLocaleString(), fns.nextTeamGoal_(u) === want, String(fns.nextTeamGoal_(u))));

// --- goal hit: 6,492 shipped against 6,000 ---
let t = setup(6000);
let now = t.board({ week: "0", period: "week" });
check("board answers as v35", now.ok && now.v === 35);
let rows = t.log();
check("last week written to the Team Goal Log", rows.length === 1, JSON.stringify(rows));
const r = rows[0] || [];
check("log row: week of 10/12, goal 6,000, 6,492 shipped, hit", r[0] instanceof Date &&
  mock.formatDate(r[0], fixture.TZ, "yyyy-MM-dd") === "2026-10-12" && r[1] === 6000 && r[2] === 6492 && r[3] === "Yes",
  JSON.stringify(r.slice(0, 4)));
check("log row: 25 points each, next goal 7,000", r[4] === 25 && r[6] === 7000, JSON.stringify(r.slice(4, 7)));
check("goal in Points E4 raised to 7,000", t.e4() === 7000, String(t.e4()));
check("this week's board already shows the new goal", now.team && now.team.goal === 7000, JSON.stringify(now.team));

let last = t.board({ week: "1", period: "week" });
check("last week still shows ITS goal (6,000) and hit", last.team && last.team.goal === 6000 && last.team.hit === true && last.team.logged === true, JSON.stringify(last.team && { goal: last.team.goal, hit: last.team.hit }));
check("last week: bonus 25, next goal 7,000", last.team.bonus === 25 && last.team.nextGoal === 7000);
const rosterSh = t.fx.ss.getSheetByName("Names");
const rosterNames = new Set(rosterSh.getRange(2, 2, rosterSh.getLastRow() - 1, 1).getValues().map(v => String(v[0]).trim().toLowerCase()).filter(String));
const scannedAll = last.rows.filter(x => x.scans > 0 && !/former/i.test(x.shift || ""));
const scanned = scannedAll.filter(x => rosterNames.has(x.name.toLowerCase()) || rosterNames.has(String(x.badge).toLowerCase())).map(x => x.name).sort((a, b) => a.localeCompare(b));
const notOnRoster = scannedAll.filter(x => !scanned.includes(x.name)).map(x => x.name).sort((a, b) => a.localeCompare(b));
check("bonus goes to everyone on the roster who scanned last week", JSON.stringify(last.team.bonusNames) === JSON.stringify(scanned) && scanned.length > 0,
  (last.team.bonusNames || []).length + " vs " + scanned.length);
check("scanners not on the roster (badge numbers) are skipped and listed", notOnRoster.length > 0 &&
  JSON.stringify(last.team.bonusSkipped) === JSON.stringify(notOnRoster) && notOnRoster.every(n => !last.team.bonusNames.includes(n)),
  JSON.stringify(last.team.bonusSkipped));
check("log counts the same people", r[5] === scanned.length && r[8] === scanned.join(", "), r[5] + " vs " + scanned.length);
check("nobody with zero scans gets the bonus", last.rows.filter(x => !x.scans).every(x => !last.team.bonusNames.includes(x.name)));

// roll-up runs once: more requests (cache cleared too) add no rows and don't raise again
t.env._cache._clear();
t.board({ week: "0", period: "week" }); t.board({ week: "0", period: "day" });
check("a second roll-up adds nothing", t.log().length === 1 && t.e4() === 7000, t.log().length + " rows, E4 " + t.e4());

// someone types a new goal by hand: last week keeps 6,000, this week uses the typed one
t.fx.ss.getSheetByName("Points").getRange("E4").setValue(20000);
t.env._cache._clear();
check("hand-typed E4 does not rewrite last week", t.board({ week: "1", period: "week" }).team.goal === 6000);
check("hand-typed E4 is this week's goal", t.board({ week: "0", period: "week" }).team.goal === 20000);

// a day view of last week has no name list (its rows are one day)
const day = t.board({ week: "1", period: "day" });
check("day view carries no bonus name list", day.team && !day.team.bonusNames);

// --- goal missed: 6,492 shipped against 9,000 ---
t = setup(9000);
t.board({ week: "0", period: "week" });
rows = t.log();
check("missed week is logged as not hit, no bonus", rows.length === 1 && rows[0][3] === "No" && rows[0][4] === 0 && rows[0][5] === 0, JSON.stringify(rows[0]));
check("missed week keeps the goal at 9,000", t.e4() === 9000 && rows[0][6] === 9000);
last = t.board({ week: "1", period: "week" });
check("missed week: hit false, no names", last.team.hit === false && !last.team.bonusNames);

// --- no goal set: nothing happens ---
t = setup(0);
t.board({ week: "0", period: "week" });
check("no goal set (E4 = 0): no log written", t.log().length === 0 && !t.fx.ss.getSheetByName("Team Goal Log"));

console.log(failures ? failures + " FAILED" : "all passed");
process.exit(failures ? 1 : 0);
