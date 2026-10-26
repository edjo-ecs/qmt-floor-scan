// v31: Config column B sends wtype_id to Admin; blank or APPROVAL ids send nothing.
const fs = require("fs"), path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "apps-script", "Code.gs"), "utf8");
let failures = 0;
const check = (name, ok, got) => { if (!ok) failures++; console.log((ok ? "ok   " : "FAIL ") + name + (ok ? "" : "  got: " + JSON.stringify(got))); };

function run(configRows) {
  const sent = [];
  const sheet = { getLastRow: () => configRows.length + 1, getRange: (r, c, n, w) => ({ getValues: () => configRows.map(x => x.slice(0, w)) }) };
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: n => n === "Config" ? sheet : null }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => ({ MIS_BASE_URL: "https://x", MIS_API_KEY: "k" }[k]) }) },
    UrlFetchApp: { fetch: (u, o) => { sent.push(JSON.parse(o.payload)); return { getResponseCode: () => 200, getContentText: () => '{"ok":true}' }; } },
  };
  const fn = new Function(...Object.keys(ctx), src + "\nreturn { callMis_ };");
  const { callMis_ } = fn(...Object.values(ctx));
  return st => { callMis_({ ts: "t", station: st, job: "1", employee: "A", qty: 1 }, "id"); return sent[sent.length - 1]; };
}

const send = run([["3 Knife Trimming", ""], ["InfiniTrim", "1038"], ["PUR BQ 500", "1005 PUR Binding"], ["Sign-off test", "1068"], ["Junk", "abc"]]);
check("blank column B sends no wtype_id (Admin's own map)", !("wtype_id" in send("3 Knife Trimming")), send("3 Knife Trimming"));
check("InfiniTrim -> 1038", send("InfiniTrim").wtype_id === 1038, send("InfiniTrim"));
check("case-insensitive, label after the id ok", send("pur bq 500").wtype_id === 1005, send("pur bq 500"));
check("APPROVAL wtype (1068) is never sent", !("wtype_id" in send("Sign-off test")), send("Sign-off test"));
check("non-numeric column B ignored", !("wtype_id" in send("Junk")), send("Junk"));
check("station not in Config sends nothing", !("wtype_id" in send("Box")), send("Box"));
// Ed 2026-10-26: both PUR machines must move the same racetrack button (1005 PUR Binding)
const live = run([["PUR BQ 280", "1005"], ["PUR BQ 470", "1005"], ["3 Knife Trim/InfiniTrim", "1038"]]);
check("PUR BQ 280 -> 1005", live("PUR BQ 280").wtype_id === 1005, live("PUR BQ 280"));
check("PUR BQ 470 -> 1005 (same button as 280)", live("PUR BQ 470").wtype_id === 1005, live("PUR BQ 470"));
check("3 Knife Trim/InfiniTrim -> 1038 (B - 3 Knife Cut)", live("3 Knife Trim/InfiniTrim").wtype_id === 1038, live("3 Knife Trim/InfiniTrim"));
check("station name sent unchanged", live("PUR BQ 470").station === "PUR BQ 470", live("PUR BQ 470"));
console.log(failures ? `\n${failures} check(s) FAILED` : "\nall wtype checks passed");
process.exit(failures ? 1 : 0);
