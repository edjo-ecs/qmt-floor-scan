/* Exercises the v28 HR roster endpoints against the fixture.
     node test/roster.js
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

function setup(passcode) {
  const fx = fixture.build();
  const props = passcode ? { ROSTER_PASSCODE: passcode } : {};
  const env = mock.makeEnv({ active: fx.ss, books: fx.books, props });
  const call = {
    get: q => JSON.parse(mock.load(src, env).doGet({ parameter: q }).getContent()),
    post: body => JSON.parse(mock.load(src, env).doPost({ postData: { contents: JSON.stringify(body) } }).getContent())
  };
  return { fx, env, call };
}
const R = (extra) => Object.assign({ type: "roster", passcode: "Blue Heron 42", by: "Vickie" }, extra);

// --- editing switched off ---
{
  const { call } = setup(null);
  const v = call.get({ roster: "1" });
  check("read works without a passcode set", v.ok && v.people.length === 41 && v.editable === false, v.people.length + " people");
  const w = call.post(R({ action: "add", name: "Test Person", shift: "Day" }));
  check("writes refused when no passcode is set", !w.ok && /not switched on/.test(w.error));
}

const { fx, env, call } = setup("Blue Heron 42");
const names = () => fx.ss.getSheetByName("Names");
const rowOf = n => names().getRange(2, 1, names().getLastRow() - 1, 4).getValues().find(r => r[1] === n);

check("roster view says editable", call.get({ roster: "1" }).editable === true);
check("wrong passcode refused", (r => !r.ok && r.badPasscode)(call.post(R({ passcode: "nope", action: "check" }))));
check("passcode ignores case and spaces", call.post(R({ passcode: "blueheron42", action: "check" })).ok);

// add
let r = call.post(R({ action: "add", name: "  Maria   Lopez ", shift: "night", nicknames: "Mari, Maria L" }));
check("add a new night-shift person", r.ok && /Added: Maria Lopez/.test(r.done), r.error);
check("…written to the Names tab tidily", JSON.stringify(rowOf("Maria Lopez").slice(0, 3)) === JSON.stringify(["Mari, Maria L", "Maria Lopez", "Night"]));
check("…appears on the phones' night list", call.get({}).roster.some(p => p.name === "Maria Lopez" && p.shift === "Night"));
check("duplicate name refused", (x => !x.ok && /already on the list/.test(x.error))(call.post(R({ action: "add", name: "maria lopez", shift: "Day" }))));
check("name that is someone's nickname refused", (x => !x.ok && /nickname for Victor Rojas/.test(x.error))(call.post(R({ action: "add", name: "Victor R", shift: "Day" }))));
check("add as Former employee refused", !call.post(R({ action: "add", name: "Z Z", shift: "Former employee" })).ok);
check("nickname owned by someone else refused", (x => !x.ok && /already used by Victor Rojas/.test(x.error))(call.post(R({ action: "add", name: "New Guy", shift: "Day", nicknames: "Victor" }))));

// shift change
r = call.post(R({ action: "shift", name: "Maria Lopez", shift: "Day" }));
check("change shift Night -> Day", r.ok && rowOf("Maria Lopez")[2] === "Day");

// leaver
const daleNicks = rowOf("Dale Jones")[0];
r = call.post(R({ action: "former", name: "Dale Jones" }));
check("mark Dale Jones former", r.ok && rowOf("Dale Jones")[2] === "Former employee" && rowOf("Dale Jones")[3] === "No");
check("…off the phones' day list", !call.get({}).roster.some(p => p.name === "Dale Jones" && /^d/i.test(p.shift)));
const board = call.get({ board: "1", week: "0", period: "day" });
check("…off today's board (no scans today)", !board.rows.some(x => x.name === "Dale Jones"));
check("…nicknames kept for old scans", rowOf("Dale Jones")[0] === daleNicks);
r = call.post(R({ action: "restore", name: "Dale Jones", shift: "Day" }));
check("bring Dale back on Day shift", r.ok && rowOf("Dale Jones")[2] === "Day" && rowOf("Dale Jones")[3] === "");

// nicknames
r = call.post(R({ action: "nicknames", name: "Maria Lopez", nicknames: ["Mari", "ML", "mari"] }));
check("set nicknames (duplicates collapsed)", r.ok && rowOf("Maria Lopez")[0] === "Mari, ML", rowOf("Maria Lopez")[0]);
check("unknown person refused", !call.post(R({ action: "shift", name: "Nobody Here", shift: "Day" })).ok);

// the board recomputes after a roster change (cache revision bumped)
call.get({ board: "1", week: "0", period: "week" });
const before = env._cache.get("scans_rev");
call.post(R({ action: "shift", name: "Maria Lopez", shift: "Night" }));
check("roster change refreshes the board cache", env._cache.get("scans_rev") !== before);

// log
const log = fx.ss.getSheetByName("Roster Log");
const logRows = log ? log.getRange(2, 1, log.getLastRow() - 1, 5).getValues() : [];
check("every change logged with who made it", logRows.length === 6 && logRows.every(x => x[1] === "Vickie"), logRows.length + " log rows");
console.log("   last log row:", logRows.length ? logRows[logRows.length - 1].slice(1).join(" | ") : "-");

// lockout
const { call: c2 } = setup("abc");
for (let i = 0; i < 10; i++) c2.post({ type: "roster", passcode: "wrong", action: "check" });
check("10 wrong passcodes lock editing", /Too many/.test(c2.post({ type: "roster", passcode: "abc", action: "check" }).error || ""));

console.log(failures ? `\n${failures} check(s) FAILED` : "\nall roster checks passed");
process.exit(failures ? 1 : 0);
