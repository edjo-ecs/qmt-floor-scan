/* Exercises the v29 feedback endpoints against the fixture.
     node test/feedback.js
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
  const env = mock.makeEnv({ active: fx.ss, books: fx.books, props: passcode ? { FEEDBACK_PASSCODE: passcode } : {} });
  const post = body => JSON.parse(mock.load(src, env).doPost({ postData: { contents: JSON.stringify(body) } }).getContent());
  return { fx, env, post };
}

// --- submitting never needs a passcode ---
const { fx, post } = setup("Review 7");
let r = post({ type: "feedback", app: "scan-app", version: "v23", kind: "bug", message: "  Camera   black after switch camera on the Samsung ", from: "Dale Jones", station: "PUR", job: "130605141", device: "Android 14; SM-A156U" });
check("submit a bug", r.ok && /^F[0-9A-Z]+$/.test(r.id), JSON.stringify(r));
const id1 = r.id;
r = post({ type: "feedback", app: "leaderboard", version: "page v18", kind: "idea", message: "Show pages per hour next to the %", from: "" });
check("submit an idea from the leaderboard", r.ok);
const id2 = r.id;
check("ids differ", id1 !== id2);
r = post({ type: "feedback", app: "scan-app", kind: "idea", message: "ok" });
check("too-short message refused", !r.ok && /describe/.test(r.error));
r = post({ type: "feedback", app: "scan-app", kind: "complaint", message: "something odd happened" });
check("unknown kind becomes Idea", r.ok);

const sh = fx.ss.getSheetByName("Feedback");
const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 14).getValues();
check("Feedback tab created with 3 rows", sh && rows.length === 3, rows.length);
const bug = rows.find(x => x[0] === id1);
check("row has app/version/kind/from/message/station/job/device/status", bug && bug[2] === "scan-app" && bug[3] === "v23" && bug[4] === "Bug" && bug[5] === "Dale Jones" && bug[7] === "PUR" && bug[8] === "130605141" && /SM-A156U/.test(bug[9]) && bug[10] === "New", JSON.stringify(bug && bug.slice(2, 11)));
check("message kept as typed (trimmed, inner spaces too)", bug && bug[6] === "Camera   black after switch camera on the Samsung");

// --- reviewing needs the passcode ---
const P = { type: "feedback_list", passcode: "review7" };
r = post({ type: "feedback_list", passcode: "nope" });
check("list refused with wrong passcode", !r.ok && r.badPasscode);
r = post(P);
check("list with passcode (ignores case/spaces), newest first", r.ok && r.items.length === 3 && r.items[0].status === "New" && r.items.every(i => i.id), r.items && r.items.map(i => i.kind).join(","));
check("list items carry a readable time", /^[A-Z][a-z]{2} \d+\/\d+ \d+:\d\d [AP]M$/.test(r.items[0].when), r.items[0].when);

r = post({ type: "feedback_decide", passcode: "Review 7", by: "Ed", id: id1, status: "approved", note: "Fix in v24" });
check("approve with a note", r.ok && /Approved/.test(r.done), r.error);
const after = sh.getRange(2, 1, sh.getLastRow() - 1, 14).getValues().find(x => x[0] === id1);
check("…row updated: status, by, decided date, note", after[10] === "Approved" && after[11] === "Ed" && after[12] instanceof Date && after[13] === "Fix in v24", JSON.stringify(after.slice(10)));
check("…reply includes the refreshed list", r.items.find(i => i.id === id1).status === "Approved" && r.items.find(i => i.id === id1).decidedBy === "Ed");
r = post({ type: "feedback_decide", passcode: "Review 7", by: "Ed", id: id1, status: "new", note: "" });
check("back to New clears who/when", r.ok && (x => x[10] === "New" && x[11] === "" && x[12] === "")(sh.getRange(2, 1, sh.getLastRow() - 1, 14).getValues().find(x => x[0] === id1)));
check("unknown id refused", !post({ type: "feedback_decide", passcode: "Review 7", by: "Ed", id: "FNOPE", status: "Done" }).ok);
check("bad status refused", !post({ type: "feedback_decide", passcode: "Review 7", by: "Ed", id: id2, status: "maybe" }).ok);

// --- no passcode set: submitting works, reviewing doesn't ---
{
  const { post: p2 } = setup(null);
  check("submit works with no passcode set", p2({ type: "feedback", app: "scan-app", kind: "bug", message: "test report" }).ok);
  check("review refused with no passcode set", /not switched on/.test(p2({ type: "feedback_list", passcode: "x" }).error || ""));
}
// --- lockout ---
{
  const { post: p3 } = setup("abc");
  for (let i = 0; i < 10; i++) p3({ type: "feedback_list", passcode: "wrong" });
  check("10 wrong passcodes lock reviewing", /Too many/.test(p3({ type: "feedback_list", passcode: "abc" }).error || ""));
}
// the board is untouched by a feedback row
const env2 = setup("x");
env2.post({ type: "feedback", app: "scan-app", kind: "bug", message: "board check" });
const board = JSON.parse(mock.load(src, env2.env).doGet({ parameter: { board: "1", week: "0", period: "week" } }).getContent());
check("board still answers after feedback (v30)", board.ok && board.v === 30 && board.rows.length > 0);

// v30: the board carries the open-report count, and it moves at once
{
  const t = setup("x");
  const b = () => JSON.parse(mock.load(src, t.env).doGet({ parameter: { board: "1", week: "0", period: "week" } }).getContent());
  check("board feedbackOpen is 0 with no Feedback tab", b().feedbackOpen === 0);
  const a1 = t.post({ type: "feedback", app: "scan-app", kind: "bug", message: "count check one" }).id;
  t.post({ type: "feedback", app: "scan-app", kind: "idea", message: "count check two" });
  check("two new reports -> feedbackOpen 2 (cache cleared on submit)", b().feedbackOpen === 2, b().feedbackOpen);
  t.post({ type: "feedback_decide", passcode: "x", by: "Ed", id: a1, status: "Approved" });
  check("approved still counts as open", b().feedbackOpen === 2);
  t.post({ type: "feedback_decide", passcode: "x", by: "Ed", id: a1, status: "Done" });
  check("done drops it -> 1 (cache cleared on decide)", b().feedbackOpen === 1, b().feedbackOpen);
}

console.log(failures ? `\n${failures} check(s) FAILED` : "\nall feedback checks passed");
process.exit(failures ? 1 : 0);
