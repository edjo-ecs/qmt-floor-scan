/* A realistic, deterministic stand-in for the "New QMT Floor Productivity"
   Sheet and the "2026 Public Schedule" workbook. Same shape as production:
   ~4,000 scans over 11 weeks, pairs, aliases, replays, rejected / not_at_step
   / pending rows, a few out-of-order rows (late offline flushes), dated rate
   changes, manual credits, and a GMT schedule file with colored cells. */
"use strict";
const { Book, Stats } = require("./gas-mock");

const TZ = "America/New_York";
const SCHEDULE_ID = "SCHEDULE_FIXTURE";
// Monday 19 Oct 2026, 3:30 PM New York (19:30Z)
const NOW_MS = Date.UTC(2026, 9, 19, 19, 30, 0);

const DAY_NAMES = ["Oliver Darocha","Dale Jones","Sabrina Breining","Frannic Taveras","Abigail Sanchez","Luis Perez","Victor Rojas","Christian Saez","Eskarlyn Pichardo","Mabel Tene","Robert Kammerrer","Merilania Plasencia","Mia Miranda","Cecila Martinez","Idania Davila","Darlin Delgado","Aidan Minnihan","Joanna Jeon","Jon Ruiz","Kike Lopez","Elvis Rossado"];
const NIGHT_NAMES = ["Christian Dominguez","Wilfredo Mercado","Allison Coon","Hector Olivares","Manuela Irrizarri","Alex Martinez","Anabel Reyes","Edwuin Andrino","Shawn Brown","John Garner","Ramon Montero","Maynor Barrientos","Perla Herrera","Donte Carty","Donna Navarro","Maimunah Sabur","David Burton","Wilmara Irrizarri","Ralph Gillot","Malik Higgins"];
const ALIASES = { "Victor Rojas": "Victor R, Victor", "Robert Kammerrer": "Robert, RKAMMERER", "Mia Miranda": "Mia, Mía", "Jon Ruiz": "Jon, jon", "Edwuin Andrino": "Edwin, Edwuin" };

const STATIONS = ["Lamination","Smyth","PUR","InfiniTrim","Casing-In EMP","Casing-In Super","Label and Ship","B-Pre-Press Book","Quality Control","Single Knife","C-Print"];
// [station, points, target]
const POINTS = [
  ["Lamination", 1, "2560"], ["Smyth", 1, "120000 pages"], ["PUR", 1, "1600"], ["InfiniTrim", 1, "2560"],
  ["Casing-In EMP", 1, "2000"], ["Casing-In Super", 1, "2000"], ["Label and Ship", 1, "3000"],
  ["B-Pre-Press Book", 1, "60 jobs"], ["Quality Control", 0.5, ""], ["Single Knife", 1, "2500"], ["C-Print", 1, "130000 pages"]
];

/* small deterministic PRNG */
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

function build() {
  const stats = new Stats();
  const ss = new Book("MAIN_FIXTURE", TZ, stats);
  const R = rng(20261019);
  const pick = arr => arr[Math.floor(R() * arr.length)];

  // --- Scans ---
  const scans = ss.insertSheet("Scans");
  scans.appendRow(["Timestamp", "Station", "Job Barcode", "Employee", "Qty", "Pages", "MIS Status", "Reject Reason"]);
  const rows = [];
  const first = Date.UTC(2026, 7, 3, 4, 0, 0);   // Mon 3 Aug 2026
  for (let dayMs = first; dayMs < NOW_MS; dayMs += 86400000) {
    const dow = new Date(dayMs).getUTCDay();
    if (dow === 0 || dow === 6) continue;          // Mon-Fri plant, 4-day people handled by schedule
    const n = 40 + Math.floor(R() * 25);
    for (let k = 0; k < n; k++) {
      const night = R() < 0.45;
      // day shift 5:30-16:00 local (09:30Z-20:00Z); night 16:00-02:30 local (20:00Z-06:30Z next day)
      const startZ = night ? 20 : 9.5, span = night ? 10.5 : 10.5;
      let ts = dayMs - 4 * 3600000 + (startZ + R() * span) * 3600000;   // dayMs is 4am local => 08:00Z; rebase to midnight local
      if (ts >= NOW_MS) continue;
      const pool = night ? NIGHT_NAMES : DAY_NAMES;
      let emp = pick(pool);
      const r = R();
      if (r < 0.10) emp = emp + " + " + pick(pool);                   // pairs
      else if (r < 0.14) emp = emp.toLowerCase();                      // typed lower-case
      else if (r < 0.17 && ALIASES[emp]) emp = ALIASES[emp].split(",")[0].trim();   // an alias
      else if (r < 0.18) emp = String(1000000 + Math.floor(R() * 8999999));           // job number scanned as a person
      const station = pick(STATIONS);
      const job = String(2000000 + Math.floor(R() * 900000));
      const qty = station === "B-Pre-Press Book" ? 1 : 20 + Math.floor(R() * 380);
      const pages = /Smyth|Print/.test(station) ? 160 + Math.floor(R() * 240) : "";
      const s = R();
      let status = "not_at_step", reason = "Job " + job + " is not at this step on the racetrack yet";
      if (s < 0.10) { status = "ok"; reason = ""; }
      else if (s < 0.15) { status = "rejected"; reason = "Step already completed - no credit"; }
      else if (s < 0.17) { status = "pending"; reason = ""; }
      else if (s < 0.20) { status = "unmapped"; reason = "Station not mapped"; }
      else if (s < 0.215) { status = "job_not_found"; reason = "Job not found"; }
      const row = [new Date(ts), station, job, emp, qty, pages, status, reason];
      rows.push(row);
      if (R() < 0.03) rows.push(row.slice());                          // offline replay: identical row
    }
  }
  rows.sort((a, b) => a[0] - b[0]);
  // late offline flushes: ~1% of rows land in the sheet two days after they happened
  for (let i = 0; i < rows.length; i++) {
    if (R() < 0.01 && i + 90 < rows.length) { const r = rows.splice(i, 1)[0]; rows.splice(i + 90, 0, r); }
  }
  rows.forEach(r => scans.appendRow(r));

  // --- Config ---
  const config = ss.insertSheet("Config");
  config.appendRow(["Stations (edit these — the app updates automatically)"]);
  STATIONS.forEach(s => config.appendRow([s]));

  // --- Points ---
  const points = ss.insertSheet("Points");
  points.getRange("A1:C1").setValues([["Station", "Points", "Target/shift"]]);
  POINTS.forEach((p, i) => points.getRange(i + 2, 1, 1, 3).setValues([p]));
  points.getRange("D1").setValue("Scoring basis (edit E1):"); points.getRange("E1").setValue("per job");
  points.getRange("D3").setValue("Workdays/week"); points.getRange("E3").setValue(4);
  points.getRange("D4").setValue("Team goal"); points.getRange("E4").setValue(9000);
  points.getRange("D5").setValue("Shift hours"); points.getRange("E5").setValue(10);
  points.getRange("D6").setValue("Coaching emails");
  points.getRange("D7").setValue("Unpaid break"); points.getRange("E7").setValue(0.5);
  points.getRange("D8").setValue("Schedule id"); points.getRange("E8").setValue(SCHEDULE_ID);
  points.getRange("D9").setValue("Proration"); points.getRange("E9").setValue("hours");
  points.getRange("D10").setValue("Daily cap"); points.getRange("E10").setValue(150);

  // --- Names (already seeded, as in production) ---
  const names = ss.insertSheet("Names");
  names.getRange("A1:D1").setValues([["Aliases (old names, comma-separated)", "Name", "Shift", "Nectar scan special (blank = counts; type No to exempt)"]]);
  const nrows = [];
  DAY_NAMES.forEach(n => nrows.push([ALIASES[n] || "", n, "Day", n === "Oliver Darocha" ? "No" : ""]));
  NIGHT_NAMES.forEach(n => nrows.push([ALIASES[n] || "", n, "Night", ""]));
  names.getRange(2, 1, nrows.length, 4).setValues(nrows);

  // --- Manual Credits ---
  const manual = ss.insertSheet("Manual Credits");
  manual.getRange("A1:F1").setValues([["Date", "Name", "Activity", "Hours", "Approved by", "Ref ID"]]);
  [
    [new Date(Date.UTC(2026, 9, 13, 16)), "Dale Jones", "Forklift training", 2, "Oliver", ""],
    [new Date(Date.UTC(2026, 9, 14, 18)), "Perla Herrera + Donte Carty", "Line clean-down", 1.5, "Oliver", ""],
    [new Date(Date.UTC(2026, 9, 19, 14)), "Mabel Tene", "2-Min Improvement – Binding: label jig", 0.033, "Sabrina", "imp-001"]
  ].forEach((r, i) => manual.getRange(i + 2, 1, 1, 6).setValues([r]));

  // --- Rate Changes ---
  const rc = ss.insertSheet("Rate Changes");
  rc.getRange("A1:D1").setValues([["Effective (date & time)", "Station", "New target/shift", "Note"]]);
  rc.getRange(2, 1, 1, 4).setValues([[new Date(Date.UTC(2026, 9, 15, 4, 1)), "Single Knife", "3000", "Oct 15 decision"]]);
  rc.getRange(3, 1, 1, 4).setValues([[new Date(Date.UTC(2026, 9, 15, 4, 1)), "PUR", "1600", "PUR split reverted"]]);
  rc.getRange(4, 1, 1, 4).setValues([[new Date(Date.UTC(2026, 9, 25, 4, 1)), "PUR", "1700", "future"]]);

  // --- Public Schedule (GMT file, one tab per week, newest first) ---
  const sched = new Book(SCHEDULE_ID, "GMT", stats);
  const weekStarts = [Date.UTC(2026, 9, 18), Date.UTC(2026, 9, 11), Date.UTC(2026, 9, 4), Date.UTC(2026, 8, 27), Date.UTC(2026, 8, 20)];
  const colors = ["#00ff00", "#00ff00", "#00ff00", "#00ff00", "#ff9900", "#ffff00", "#ff00ff", "#ff0000", ""];
  weekStarts.forEach(ws => {
    const d = new Date(ws);
    const tab = sched.insertSheet("Week of " + (d.getUTCMonth() + 1) + "-" + d.getUTCDate());
    const blocks = [{ sun: 1, span: "5:30AM - 4PM", people: DAY_NAMES }, { sun: 10, span: "4PM - 2:30AM", people: NIGHT_NAMES }];
    blocks.forEach(b => {
      tab.getRange(1, b.sun + 1).setValue("Sunday");
      ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].forEach((n, i) => tab.getRange(1, b.sun + 2 + i).setValue(n));
      for (let i = 0; i < 7; i++) {
        const dd = new Date(ws + i * 86400000);
        tab.getRange(2, b.sun + 1 + i).setValue((dd.getUTCMonth() + 1) + "/" + dd.getUTCDate());
      }
      tab.getRange(3, b.sun).setValue(b.span);
      b.people.forEach((name, pi) => {
        const r = 3 + pi;
        const fourDay = pi % 3 === 0;             // some people work Mon-Thu only
        for (let i = 0; i < 7; i++) {
          if (i === 0 || i === 6) continue;        // Sun/Sat off
          if (fourDay && i === 5) continue;        // Friday off
          const c = colors[Math.floor(R() * colors.length)];
          if (!c) continue;                        // not scheduled that day
          const cell = tab.getRange(r, b.sun + 1 + i);
          cell.setValue(name).setBackground(c);
        }
      });
    });
  });

  return { ss, books: { [SCHEDULE_ID]: sched }, stats, NOW_MS, TZ, scanCount: rows.length };
}

module.exports = { build, NOW_MS, TZ, SCHEDULE_ID };
