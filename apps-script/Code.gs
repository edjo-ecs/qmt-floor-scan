/**
 * QMT Floor Scan — Google Apps Script backend (v31: racetrack step per station)
 * NOTHING TO EDIT IN THIS FILE. Paste it as-is over the old code.
 *
 * NEW IN v31 (2026-10-26, over v30 — scoring unchanged):
 *   - RACETRACK STEP PER STATION. Config column B can hold the Admin work type
 *     (wtype_id, e.g. 1038 = B - 3 Knife Cut) that a station's scans complete.
 *     When set, it is sent as wtype_id and Admin uses it instead of its own
 *     hard-coded station list, so a new station can move the racetrack without
 *     an Admin deploy. Blank = Admin's own mapping, exactly as before.
 *     APPROVAL work types (sign-offs, not floor operations) are never sent.
 *
 * NEW IN v30 (2026-10-21, over v29 — scoring unchanged):
 *   - The board response carries feedbackOpen: how many Feedback rows are New
 *     or Approved (not yet Declined or Done). Leaderboard page v19 colours its
 *     Report button red with that count, or green when it is 0. Submitting or
 *     deciding a report clears the board cache so the colour changes at once.
 *
 * NEW IN v29 (2026-10-21, over v28 — scoring unchanged):
 *   - FEEDBACK. The scan app and the leaderboard get a "Report a problem or
 *     idea" button. Each report lands in a new "Feedback" tab (created on first
 *     use) with the app, version, station, job and phone type attached. Ed
 *     reviews them on feedback.html (leaderboard site) and marks each Approved,
 *     Declined or Done with a note; the decision, who made it and when are
 *     written back to the row. Reviewing needs Script Property
 *     FEEDBACK_PASSCODE (blank = review page can't sign in; reports still land).
 *
 * NEW IN v28 (2026-10-19, over v27 — scoring is unchanged, only how much work a request does):
 *   - The board reads only the Scans rows that can matter for the window it is
 *     showing (plus the Nectar week and the team-goal week around it), instead of
 *     all ~26k rows on every request. Column A is read alone first to find the
 *     block; rows inside the block but outside the window are filtered exactly
 *     as before, so out-of-order rows change nothing.
 *   - The finished board JSON is cached for 45 s per (week, period, from, to),
 *     so the board is never more than ~45 s behind. Roster and improvement-credit
 *     changes clear it at once; scans don't (they arrive every few seconds).
 *   - The Public Schedule file is opened ONCE per request (it was opened twice:
 *     once for hours worked, once for "scanned every day").
 *   - Read-only requests (?board=1, ?scans=1) skip the tab-seeding housekeeping
 *     (roster/alias seeding, Points sync) once the tabs exist. It still runs on
 *     every scan posted, and housekeeping_() exists for an hourly trigger.
 *   - reconcilePending_ retries only rows from the last RECONCILE_DAYS (7) days
 *     and stops after ~4.5 minutes so it never hits the 6-minute execution
 *     limit. Older pending / not_at_step rows are left as history and are NOT
 *     replayed into Admin (see docs/Spec_Auto-Complete_Racetrack_Steps.pdf).
 *   - The response's totalRows is now the row count of the Scans tab (same
 *     number as before); firstTs is the first row of the block that was read.
 *   - FORMER EMPLOYEES (added 2026-10-21): type "Former employee" in the Names
 *     tab's Shift column (C) instead of deleting the row. The person drops off
 *     the board's zero-score list and (since the scan app only lists Day/Night
 *     names) off the phones' sign-in list, while their aliases keep old scans
 *     joined up. Weeks they actually scanned still show them.
 *
 * v27 (unchanged below):
 *   - DATED RATE CHANGES. A new "Rate Changes" tab (created automatically) holds
 *     scheduled changes to a station's Target/shift:
 *         Effective (date & time) | Station | New target/shift | Note
 *         10/18/2026 12:01 AM     | Single Knife | 3000      | (anything)
 *     Every scan is scored with the rate that was in effect WHEN IT WAS SCANNED:
 *     the latest change at or before the scan, else the Points tab. So a change
 *     never touches earlier performance, and people never watch last week's
 *     numbers move. The Points tab is the STARTING rate; from now on change
 *     rates in "Rate Changes" instead of editing Points. The target can be
 *     written like the Points tab ("3000", "130000 pages", "60 jobs").
 *     Times are in the scan sheet's time zone. Type the date and time the way
 *     Sheets shows it; Sheets will store it as a date-time.
 *   - The leaderboard response lists upcoming changes as upcomingRates.
 *
 * v26 (unchanged below):
 *   - The schedule's dates are now read as the TEXT the sheet displays (e.g.
 *     "10/13") with getDisplayValues(), so no time zone can shift them. The old
 *     date-object reading is only a fallback.
 *   - Each person's nectar block now also lists the days considered ("worked")
 *     and the days missed ("missed"), e.g. "Thu 10/8". The Details view shows them
 *     under anyone marked No, so a wrong answer can be traced to a specific day.
 *   - Schedule cache keys changed again so nothing from earlier readings lingers.
 *
 * v25 (unchanged below):
 *   - FIX: the Public Schedule file is set to GMT and stores its dates as real
 *     dates, but v22-v24 read them in the scan sheet's New York time, which put
 *     every schedule day ONE DAY EARLY. Effects: the "scanned every day" column
 *     read No for nearly everyone, and the hours-based rate dropped a worked day
 *     from each week (30 hours counted instead of 40), overstating rates by up
 *     to a third. Dates are now read in the schedule file's own time zone.
 *   - The schedule cache keys changed, so nothing from the old reading lingers.
 *
 * v24 (unchanged below):
 *   (over v23 — everything else is unchanged)
 *   - Every leaderboard row now carries nectar: { status, days, scanned } and the
 *     response carries nectarWeek: { label, scheduleOk }. status is "yes" when the
 *     person scanned production work on EVERY day the Public Schedule shows them
 *     here (green/orange) in the Thursday-to-Wednesday Nectar week that contains
 *     the viewed week, "no" when they missed a worked day, and "na" when there is
 *     nothing to judge yet. Excused and called-out days are not worked days, so
 *     they never count against anyone. Today counts only once the person has
 *     scanned; days after today are ignored. Anyone not on the schedule is judged
 *     by the days they scanned. Rejected scans do not count.
 *   - Names tab column D: type No to exempt someone (managers, office, sample kit,
 *     a brand-new hire) from the column; they show a dash. Blank = counts.
 *   - Unknown barcodes ("job not found") and duplicates do not count as scanning.
 *   - Display names now use the roster spelling even if scans were typed in lower case.
 *   - Viewing a Mon-Sun week shows the Nectar week that ENDS on that week's
 *     Wednesday (Oct 5-11 -> Thu Oct 1 - Wed Oct 7), so Thursday's payout review
 *     is just "last week". Day and custom views use the Nectar week containing
 *     the end date.
 *
 * v23 (unchanged below):
 *   - DAILY CAP: nobody can earn more than the cap (default 150% of a shift,
 *     scaled to the hours they worked that day) from scans in a single day.
 *     One typo'd quantity or one enormous job can no longer show 500%.
 *     Set it in Points E10 (150 = 150%; 100 = nobody above 100% in a day;
 *     0 = no cap). A shift day runs 4 AM to 4 AM, so night-shift work after
 *     midnight counts toward the day the shift started.
 *   - PER-JOB SCORING: a Target/shift like "60 jobs" scores ONE credit per
 *     scan whatever the quantity entered — right for pre-press, where file
 *     prep does not grow with the number of copies. ("2560" and "19200 pages"
 *     work exactly as before.) Switch a station to "N jobs" only AFTER this
 *     version is deployed.
 *   - Each leaderboard row also reports cappedDays (days the cap applied).
 *
 * v22 (unchanged below):
 *   - RATE (weekly, daily, custom ranges) is now prorated to each person's
 *     hours WORKED, read live from the Public Schedule:
 *       green  = here                       -> counts the shift's paid hours
 *       orange = late / left early          -> counts as a full day
 *       blank or shaded = not scheduled     -> counts nothing
 *       yellow / magenta / red = absent     -> drops out (not a zero day)
 *     An 8-hour person is measured against 8 hours, not 10; a 4-day person
 *     against 4 days. Anyone not found on the schedule (or if the schedule
 *     can't be read) falls back to the old workday divisor (Points E3).
 *   - New Points-tab settings (seeded on first run):
 *       E7  unpaid break hours per shift (0.5)
 *       E8  Public Schedule file ID
 *       E9  "hours" (use the schedule) or "days" (old method) — instant off switch
 *   - scheduleCheck_(): run once from the editor. It authorizes schedule
 *     access and writes an "Hours Check" tab showing exactly what was counted.
 *   - Improvement credit hours now round to 3 decimals (2 min = 0.033 hr).
 *
 * UPDATING AN EXISTING DEPLOYMENT (keeps the same URL — phones keep working):
 * 1. Open the Sheet → Extensions → Apps Script
 * 2. Select all the old code, paste this file over it, Save
 * 3. ONE TIME (skip if you already did this for v22): choose scheduleCheck_ in the function dropdown, click Run, and
 *    approve the permission prompt (it lets the script READ the Public Schedule).
 *    Then open the new "Hours Check" tab and glance at the numbers.
 * 4. Deploy → Manage deployments → pencil icon → Version: "New version" → Deploy
 *    (NOT "New deployment" — that mints a different URL nothing points at.)
 * 5. Verify: GET <script-url>?board=1 shows "v": 23.
 *
 * (Earlier setup steps — MIS script properties, the reconcilePending_ and
 *  sendCoachingEmail_ triggers — are already done and carry over untouched.)
 *
 * Earlier versions: v21 improvement credits + rank by rate; v20 alias merging;
 * v19 custom date ranges; v18 shift filter + zero-fill; v16 coaching email;
 * v15 manual credits; v14 team goal; v13 prorated weekly rate; v6 Admin MIS.
 *
 * Tabs (auto-created; edit them freely in the Sheet):
 *   "Scans"  — one row per scan
 *   "Config" — station list
 *   "Points" — station point values + scoring basis. THIS IS WHERE YOU SET
 *              lamination = 0.5, PUR = 1, etc.
 *   "Names"  — badge number → display name, so the leaderboard shows
 *              "Jong" instead of "10047"
 *   "Manual Credits" — manager-signed and approved-improvement hours
 *   "Hours Check" — written by scheduleCheck_ (hours counted from the schedule)
 */

// One person, or a pair joined by + & / , "and" or "y"
var PAIR_RE = /\s*[+&\/,]\s*|\s+(?:and|y)\s+/i;

// v22: the Public Schedule workbook (override in Points E8)
var SCHEDULE_DEFAULT_ID = "1iOIXG8D5t9rRc53vhNJ8UasF1o4kTTmtqlYRwe43PQs";

var DEFAULT_STATIONS = [
  "Lamination",
  "Smyth",
  "Smasher",
  "PUR",
  "InfiniTrim",
  "Casing-In EMP",
  "Casing-In Super",
  "Sticker"
];

// v28: how far back the 15-minute retry sweep looks. Older rows are history.
var RECONCILE_DAYS = 7;
// v28: how long a finished board stays cached (seconds). The TV polls every 60 s,
// so a board is never more than ~45 s behind the Scans tab. Scans deliberately do
// NOT clear the cache: mid-shift they arrive every few seconds, which kept the
// cache permanently empty (first live hour, 2026-10-21: ~17 s per request).
var BOARD_CACHE_SECS = 45;

/**
 * Make sure every tab and settings cell exists (seeding them on first run).
 * v28: pass light=true for read-only requests — once the tabs exist, the
 * seeding and Points sync are skipped; they still run on every doPost and
 * from housekeeping_().
 */
function ensureTabs_(light) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (light && ss.getSheetByName("Scans") && ss.getSheetByName("Points") && ss.getSheetByName("Names")) {
    return ss;
  }

  var scans = ss.getSheetByName("Scans");
  if (!scans) {
    scans = ss.insertSheet("Scans");
    scans.appendRow(["Timestamp", "Station", "Job Barcode", "Employee", "Qty",
                     "Pages", "MIS Status", "Reject Reason"]);
    scans.getRange("A1:H1").setFontWeight("bold");
    scans.setFrozenRows(1);
  } else if (!String(scans.getRange("F1").getValue())) {
    // Existing v5 sheet: add the three MIS column headers once
    scans.getRange("F1:H1").setValues([["Pages", "MIS Status", "Reject Reason"]]).setFontWeight("bold");
  }

  var config = ss.getSheetByName("Config");
  if (!config) {
    config = ss.insertSheet("Config");
    config.appendRow(["Stations (edit these — the app updates automatically)"]);
    config.getRange("A1").setFontWeight("bold");
    DEFAULT_STATIONS.forEach(function (s) { config.appendRow([s]); });
  }

  var points = ss.getSheetByName("Points");
  if (points && !String(points.getRange("C1").getValue())) {
    // Existing sheet: add the Target/shift header once (v12)
    points.getRange("C1").setValue("Target/shift").setFontWeight("bold");
    points.getRange("C2").setValue('e.g. 2560, or "19200 pages" to score that station by pages');
  }
  if (points && !String(points.getRange("E3").getValue())) {
    // v13: weekly rate divisor — how many workdays make a full week
    points.getRange("D3").setValue("Workdays/week (weekly rate divisor, edit E3):").setFontWeight("bold");
    points.getRange("E3").setValue(5);
  }
  if (points && !String(points.getRange("E4").getValue())) {
    // v14: weekly team goal — books through Label and Ship
    points.getRange("D4").setValue("Team goal: books/week through Label and Ship (edit E4):").setFontWeight("bold");
    points.getRange("E4").setValue(0);
  }
  if (points && !String(points.getRange("E5").getValue())) {
    // v15: manual-credit divisor — hours in a full shift
    points.getRange("D5").setValue("Shift hours (manual credit divisor, edit E5):").setFontWeight("bold");
    points.getRange("E5").setValue(10);
  }
  if (points && !String(points.getRange("D6").getValue())) {
    // v16: coaching report recipients
    points.getRange("D6").setValue("Coaching report emails, comma-separated (edit E6; blank = script owner):").setFontWeight("bold");
  }
  if (points && !String(points.getRange("D7").getValue())) {
    // v22: hours-based rate proration from the Public Schedule
    points.getRange("D7").setValue("Unpaid break hours per shift, for schedule hours (edit E7):").setFontWeight("bold");
    points.getRange("E7").setValue(0.5);
    points.getRange("D8").setValue("Public Schedule file ID (edit E8):").setFontWeight("bold");
    points.getRange("E8").setValue(SCHEDULE_DEFAULT_ID);
    points.getRange("D9").setValue('Rate proration: "hours" (from the schedule) or "days" (edit E9):').setFontWeight("bold");
    points.getRange("E9").setValue("hours");
  }
  if (points && !String(points.getRange("D10").getValue())) {
    // v23: daily cap on rate
    points.getRange("D10").setValue("Daily rate cap, % of a shift per person (edit E10; 0 = no cap):").setFontWeight("bold");
    points.getRange("E10").setValue(150);
  }
  if (!points) {
    points = ss.insertSheet("Points");
    points.getRange("A1:C1").setValues([["Station", "Points", "Target/shift"]]).setFontWeight("bold");
    points.getRange("D1").setValue("Scoring basis (edit E1):").setFontWeight("bold");
    points.getRange("E1").setValue("per job");   // or: per 100 units
    points.getRange("D2").setValue('Options: "per job" = points x number of jobs scanned. "per 100 units" = points x (qty / 100).');
    points.getRange("D3").setValue("Workdays/week (weekly rate divisor, edit E3):").setFontWeight("bold");
    points.getRange("E3").setValue(5);
    points.getRange("D4").setValue("Team goal: books/week through Label and Ship (edit E4):").setFontWeight("bold");
    points.getRange("E4").setValue(0);
    var stations = getStations_(ss);
    stations.forEach(function (s) { points.appendRow([s, 1]); });
    points.setFrozenRows(1);
  }

  var manual = ss.getSheetByName("Manual Credits");
  if (!manual) {
    manual = ss.insertSheet("Manual Credits");
    manual.getRange("A1:E1").setValues([["Date", "Name", "Activity", "Hours", "Approved by"]]).setFontWeight("bold");
    manual.getRange("G1").setValue("Manager-signed credit for off-list work (rate only, no points). One row per person; hours are per person. Counts as hours ÷ shift hours (Points E5).");
    manual.setFrozenRows(1);
  }

  var rateTab = ss.getSheetByName("Rate Changes");
  if (!rateTab) {
    // v27: scheduled, non-retroactive changes to Target/shift
    rateTab = ss.insertSheet("Rate Changes");
    rateTab.getRange("A1:D1").setValues([["Effective (date & time)", "Station", "New target/shift", "Note"]]).setFontWeight("bold");
    rateTab.getRange("F1").setValue("A change here takes effect at the date and time shown and is NOT retroactive: scans before that moment keep the old rate, scans after it use the new one. The Points tab holds the starting rate. Example row: 10/18/2026 12:01 AM | Single Knife | 3000. Target can be 3000, 130000 pages, or 60 jobs, like the Points tab.");
    rateTab.getRange("A2:A200").setNumberFormat("m/d/yyyy h:mm AM/PM");
    rateTab.setFrozenRows(1);
  }

  var names = ss.getSheetByName("Names");
  if (!names) {
    names = ss.insertSheet("Names");
    names.getRange("A1:C1").setValues([["Aliases (old names, comma-separated)", "Name", "Shift"]]).setFontWeight("bold");
    names.setFrozenRows(1);
  } else if (!String(names.getRange("C1").getValue())) {
    names.getRange("C1").setValue("Shift").setFontWeight("bold");
  }
  if (String(names.getRange("A1").getValue()) === "Badge") {
    names.getRange("A1").setValue("Aliases (old names, comma-separated)").setFontWeight("bold");
  }
  if (!String(names.getRange("D1").getValue())) {
    // v24: who the "scanned every day" column applies to
    names.getRange("D1").setValue('Nectar scan special (blank = counts; type No to exempt)').setFontWeight("bold");
  }
  seedRoster_(names);
  seedAliases_(names);

  syncPointsWithConfig_(ss, points);

  return ss;
}

/** v28: attach to an hourly time-driven trigger. Runs the tab seeding and the
 *  Points/Config sync that ?board=1 requests no longer run themselves. */
function housekeeping_() {
  ensureTabs_();
}

/** v28: bump the revision the board cache is keyed on, so the next board
 *  request after a scan or a credit recomputes instead of serving the cache. */
function bumpScansRev_() {
  try { CacheService.getScriptCache().put("scans_rev", Date.now() + "-" + Math.floor(Math.random() * 1e9), 21600); } catch (e) {}
}

/**
 * Keep the Points tab in step with the Config station list automatically:
 * any station present in Config but missing from Points is appended with a
 * default weight of 1. Runs on every request, so adding a station in Config
 * makes it appear in Points within a minute — no manual copying, no more
 * stations silently scoring the default because the row was never created.
 * (Never deletes or edits existing Points rows — your tuned weights and the
 * E1 scoring basis are untouched. Matching is case-insensitive and ignores
 * stray spaces.)
 */
function syncPointsWithConfig_(ss, points) {
  try {
    if (!points) points = ss.getSheetByName("Points");
    if (!points) return;
    var stations = getStations_(ss);
    var have = {};
    var last = points.getLastRow();
    if (last >= 2) {
      points.getRange(2, 1, last - 1, 1).getValues().forEach(function (r) {
        var v = String(r[0]).trim().toLowerCase();
        if (v) have[v] = true;
      });
    }
    var missing = [];
    stations.forEach(function (s) {
      if (!have[String(s).trim().toLowerCase()]) missing.push([s, 1, ""]);
    });
    if (missing.length) {
      points.getRange(points.getLastRow() + 1, 1, missing.length, 3).setValues(missing);
    }
  } catch (err) {
    // Sync is a convenience — never let it break scan logging or the board.
  }
}

/* One-time seed of the employee roster (edit freely in the Names tab
   afterward — the app updates within a minute of any change). */
function seedRoster_(names) {
  if (names.getLastRow() >= 2) return;   // already has data — never overwrite
  var day = ["Oliver Darocha","Dale Jones","Sabrina Breining","Frannic Taveras","Abigail Sanchez","Luis Perez","Victor Rojas","Christian Saez","Eskarlyn Pichardo","Mabel Tene","Robert Kammerrer","Merilania Plasencia","Mia Miranda","Cecila Martinez","Idania Davila","Darlin Delgado","Aidan Minnihan","Joanna Jeon","Jon Ruiz","Kike Lopez","Elvis Rossado"];
  var night = ["Christian Dominguez","Wilfredo Mercado","Allison Coon","Hector Olivares","Manuela Irrizarri","Alex Martinez","Anabel Reyes","Edwuin Andrino","Shawn Brown","John Garner","Ramon Montero","Maynor Barrientos","Perla Herrera","Donte Carty","Donna Navarro","Maimunah Sabur","David Burton","Wilmara Irrizarri","Ralph Gillot","Malik Higgins"];
  var rows = [];
  day.forEach(function (n) { rows.push(["", n, "Day"]); });
  night.forEach(function (n) { rows.push(["", n, "Night"]); });
  names.getRange(2, 1, rows.length, 3).setValues(rows);
}

/* One-time seed of known old-name aliases (pre-roster typed names).
   Runs only while the alias column is entirely empty; edit freely after. */
function seedAliases_(names) {
  var last = names.getLastRow();
  if (last < 2) return;
  var data = names.getRange(2, 1, last - 1, 2).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim()) return;   // any alias present — never touch
  }
  var known = {
    "Oliver Darocha": "Oliver",
    "Dale Jones": "Dale",
    "Sabrina Breining": "Sabrina",
    "Abigail Sanchez": "Abigail",
    "Luis Perez": "Luis",
    "Victor Rojas": "Victor R, Victor",
    "Eskarlyn Pichardo": "Eskarlin, Eskarlyn",
    "Mabel Tene": "Mabel",
    "Robert Kammerrer": "Robert, RKAMMERER",
    "Merilania Plasencia": "Merilania",
    "Mia Miranda": "Mia, Mía",
    "Cecila Martinez": "Ceci, Cecilia",
    "Idania Davila": "Idania",
    "Darlin Delgado": "Darlin, ddelgado",
    "Aidan Minnihan": "Aidan",
    "Joanna Jeon": "Joanna",
    "Jon Ruiz": "Jon, jon",
    "Kike Lopez": "Kike",
    "Elvis Rossado": "Elvis",
    "Wilfredo Mercado": "Wilfredo",
    "Allison Coon": "Allison",
    "Hector Olivares": "Hector",
    "Manuela Irrizarri": "Manuela",
    "Alex Martinez": "Alex",
    "Anabel Reyes": "Anabel",
    "Edwuin Andrino": "Edwin, Edwuin",
    "Shawn Brown": "Shawn",
    "John Garner": "John",
    "Ramon Montero": "Ramon",
    "Maynor Barrientos": "Maynor",
    "Perla Herrera": "Perla",
    "Donte Carty": "Donte",
    "Donna Navarro": "Donna",
    "Maimunah Sabur": "Maimunah",
    "David Burton": "David",
    "Wilmara Irrizarri": "Wilmara",
    "Ralph Gillot": "Ralph",
    "Malik Higgins": "Malik"
  };
  var out = [];
  var toWrite = false;
  for (var j = 0; j < data.length; j++) {
    var canonical = String(data[j][1]).trim();
    var alias = known[canonical] || "";
    out.push([alias]);
    if (alias) toWrite = true;
  }
  if (toWrite) names.getRange(2, 1, out.length, 1).setValues(out);
}

/* Alias map: lowercase old name -> canonical roster name (display form). */
function getAliasMap_(ss) {
  var sh = ss.getSheetByName("Names");
  var map = {};
  if (sh && sh.getLastRow() >= 2) {
    var rows = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
    rows.forEach(function (r) {
      var canonical = String(r[1]).trim();
      if (!canonical) return;
      String(r[0]).split(",").forEach(function (a) {
        a = a.trim().toLowerCase();
        if (a) map[a] = canonical;
      });
    });
  }
  return map;
}

/* Roster for the app's sign-in list: Names tab columns B (name) + C (shift). */
function getRoster_(ss) {
  var sh = ss.getSheetByName("Names");
  var out = [];
  if (sh && sh.getLastRow() >= 2) {
    var rows = sh.getRange(2, 2, sh.getLastRow() - 1, 3).getValues();
    rows.forEach(function (r) {
      var name = String(r[0]).trim();
      var shift = String(r[1]).trim();
      var exempt = /^\s*(no|n|exempt)\b/i.test(String(r[2]));   // v24: Names col D "No" = not part of the scan special
      if (name) out.push({ name: name, shift: shift, exempt: exempt });
    });
  }
  return out;
}

function getStations_(ss) {
  var config = ss.getSheetByName("Config");
  var last = config.getLastRow();
  if (last < 2) return DEFAULT_STATIONS;
  var values = config.getRange(2, 1, last - 1, 1).getValues();
  var out = [];
  values.forEach(function (r) {
    var v = String(r[0]).trim();
    if (v) out.push(v);
  });
  return out.length ? out : DEFAULT_STATIONS;
}

function getPointsMap_(ss) {
  var sh = ss.getSheetByName("Points");
  var map = {};
  var targets = {};
  var basis = "per job";
  var workdays = 5;
  var teamGoal = 0;
  var shiftHours = 10;
  var dailyCap = 1.5;     // v23: default 150% of a shift per person per day
  if (sh) {
    var b = String(sh.getRange("E1").getValue() || "").toLowerCase();
    if (b.indexOf("100") !== -1) basis = "per 100 units";
    var wd = Number(sh.getRange("E3").getValue());
    if (!isNaN(wd) && wd >= 1 && wd <= 7) workdays = Math.round(wd);
    var tg = Number(sh.getRange("E4").getValue());
    if (!isNaN(tg) && tg > 0) teamGoal = Math.round(tg);
    var shh = Number(sh.getRange("E5").getValue());
    if (!isNaN(shh) && shh >= 1 && shh <= 24) shiftHours = shh;
    var capRaw = sh.getRange("E10").getValue();
    if (String(capRaw).trim() !== "") {
      var capN = Number(capRaw);
      if (!isNaN(capN) && capN >= 0) dailyCap = capN / 100;   // 0 = no cap
    }
    var last = sh.getLastRow();
    if (last >= 2) {
      var rows = sh.getRange(2, 1, last - 1, 3).getValues();
      rows.forEach(function (r) {
        var st = String(r[0]).trim();
        var pts = Number(r[1]);
        if (st && !isNaN(pts)) map[st.toLowerCase()] = pts;
        // Target/shift: a number with an optional unit word; "pages" switches
        // that station to page-based scoring (qty × pages ÷ target); "jobs"
        // scores one credit per scan, whatever the quantity (v23, pre-press).
        var raw = String(r[2] || "").trim();
        var m = raw.match(/([\d,.]+)/);
        if (st && m) {
          var num = Number(m[1].replace(/,/g, ""));
          if (num > 0) {
            targets[st.toLowerCase()] = { target: num, pages: /page/i.test(raw), jobs: /job/i.test(raw) };
          }
        }
      });
    }
  }
  // v27: dated rate changes (the Points tab above is the starting rate)
  var rateChanges = {};
  var rcSheet = ss.getSheetByName("Rate Changes");
  if (rcSheet && rcSheet.getLastRow() >= 2) {
    rcSheet.getRange(2, 1, rcSheet.getLastRow() - 1, 3).getValues().forEach(function (r) {
      var when = (r[0] instanceof Date) ? r[0] : new Date(r[0]);
      var stName = String(r[1]).trim();
      var rawT = String(r[2] === null || r[2] === undefined ? "" : r[2]).trim();
      var mt = rawT.match(/([\d,.]+)/);
      if (isNaN(when.getTime()) || !stName || !mt) return;
      var num = Number(mt[1].replace(/,/g, ""));
      if (!(num > 0)) return;
      var key = stName.toLowerCase();
      if (!rateChanges[key]) rateChanges[key] = [];
      rateChanges[key].push({ at: when.getTime(), station: stName, raw: rawT, target: num, pages: /page/i.test(rawT), jobs: /job/i.test(rawT) });
    });
    Object.keys(rateChanges).forEach(function (k) { rateChanges[k].sort(function (a, b) { return a.at - b.at; }); });
  }
  return { map: map, basis: basis, targets: targets, workdays: workdays, teamGoal: teamGoal, shiftHours: shiftHours, dailyCap: dailyCap, rateChanges: rateChanges };
}

function getNamesMap_(ss) {
  var sh = ss.getSheetByName("Names");
  var map = {};
  if (sh) {
    var last = sh.getLastRow();
    if (last >= 2) {
      var rows = sh.getRange(2, 1, last - 1, 2).getValues();
      rows.forEach(function (r) {
        var badge = String(r[0]).trim().toLowerCase();
        var name = String(r[1]).trim();
        if (badge && name) map[badge] = name;
      });
    }
  }
  return map;
}

/**
 * Receives a scan from the app, round-trips it to the Admin MIS (which
 * marks the racetrack step DONE), and appends it to the Scans tab —
 * including rejected attempts, for the audit trail (they score zero).
 * v21: also receives approved improvement cards (data.type set).
 */
function doPost(e) {
  try {
    var ss = ensureTabs_();
    var data = JSON.parse(e.postData.contents);
    if (data.type === "roster") return json_(handleRoster_(ss, data));   // v28: HR roster page
    if (data.type === "feedback") return json_(handleFeedback_(ss, data));              // v29: a report from the floor
    if (data.type === "feedback_list") return json_(feedbackList_(ss, data));          // v29: review page
    if (data.type === "feedback_decide") return json_(handleFeedbackDecide_(ss, data)); // v29: review page
    if (data.type) return json_(handleImprovement_(ss, data));   // v21: 2-Minute Improvement credits

    var scan = {
      ts: String(data.ts || new Date().toISOString()),
      station: String(data.station || ""),
      job: String(data.job || ""),
      employee: String(data.employee || ""),
      qty: Number(data.qty) || 0
    };

    // Idempotency key — offline phones can replay the same scan (R6)
    var scanId = Utilities.base64Encode(
      Utilities.computeDigest(Utilities.DigestAlgorithm.MD5,
        scan.ts + "|" + scan.job + "|" + scan.station + "|" + scan.employee));

    var mis = callMis_(scan, scanId);   // { valid, reason, pages, misStatus }

    var tsDate = new Date(scan.ts);
    if (isNaN(tsDate.getTime())) tsDate = new Date();

    ss.getSheetByName("Scans").appendRow([
      tsDate,
      scan.station, scan.job, scan.employee, scan.qty,
      mis.pages || "", mis.misStatus, mis.reason || ""
    ]);

    return json_({
      ok: true,
      valid: mis.valid,          // false ⇒ phone shows rejection, no credit
      reason: mis.reason || "",  // shown to the operator verbatim
      pages: mis.pages || null   // enrichment (R3)
    });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/**
 * The Admin MIS round-trip. Endpoint: admin/api/QmtFloorScan.asp —
 * resolves the barcode to a production job, maps the station to a
 * racetrack work type, marks that step DONE (so ProductionRacetrack.asp
 * updates), and rejects duplicates. Station→step mapping lives server-
 * side, so it can change without redeploying this script or the phones.
 */
function callMis_(scan, scanId) {
  var props = PropertiesService.getScriptProperties();
  var base = props.getProperty("MIS_BASE_URL");
  var key = props.getProperty("MIS_API_KEY");

  // R5: integration not configured / unreachable — never block the floor.
  if (!base || !key) return { valid: true, misStatus: "pending", reason: "" };

  var payload = {
    scan_id: scanId,                 // Admin treats repeats as no-ops (R6)
    scan_value: scan.job,            // full raw barcode or numeric job id
    station: scan.station,           // mapped to a wtype_id server-side
    quantity: scan.qty,
    operators: scan.employee,        // "badge" or "badge1+badge2" as-is
    ts: scan.ts
  };
  var wt = stationWtype_(scan.station);   // v31: Config column B overrides Admin's map
  if (wt) payload.wtype_id = wt;

  try {
    var res = UrlFetchApp.fetch(base, {
      method: "post",
      contentType: "application/json",
      headers: { "X-Api-Key": key },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) {
      // Auth/server problem: accept the scan, flag for reconciliation (R5)
      return { valid: true, misStatus: "pending", reason: "" };
    }
    var body = JSON.parse(res.getContentText());
    // body: { ok, valid, reason, mis_status, pages, title, expected_qty,
    //         job_id, jdetail_id, wtype_id, replay }
    return {
      valid: body.valid !== false,   // false ⇒ phone shows rejection, no credit
      reason: body.reason || "",
      pages: body.pages || null,
      misStatus: body.mis_status || (body.ok ? "ok" : "pending")
    };
  } catch (err) {
    // MIS unreachable: accept the scan, flag for the reconciliation sweep (R5)
    return { valid: true, misStatus: "pending", reason: "" };
  }
}

/**
 * R5 reconciliation sweep — attach to a time-driven trigger (every 15 min).
 * Re-submits Scans rows whose MIS Status (col G) is "pending" or
 * "not_at_step"; scan_id idempotency in Admin makes replays safe.
 * v28: only rows from the last RECONCILE_DAYS days, and the sweep stops after
 * ~4.5 minutes so it finishes inside the 6-minute execution limit instead of
 * timing out part-way (it was retrying ~11,700 old rows every run). Older
 * rows are history — they are deliberately never replayed into Admin.
 * Returns the number of rows re-submitted.
 */
function reconcilePending_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Scans");
  if (!sheet || sheet.getLastRow() < 2) return 0;

  var t0 = Date.now();
  var cutoff = t0 - RECONCILE_DAYS * 86400000;
  var block = readScanBlock_(sheet, cutoff, t0 + 86400000);
  var rows = block.rows;
  var tried = 0, changed = 0;

  for (var i = 0; i < rows.length; i++) {
    if (Date.now() - t0 > 270000) break;        // stay well inside the 6-minute limit
    var status = String(rows[i][6] || "");
    if (status !== "pending" && status !== "not_at_step") continue;
    var ts0 = rows[i][0] instanceof Date ? rows[i][0] : new Date(rows[i][0]);
    if (isNaN(ts0.getTime()) || ts0.getTime() < cutoff) continue;   // an old row inside the block

    var scan = {
      ts: ts0.toISOString(),
      station: String(rows[i][1] || ""),
      job: String(rows[i][2] || ""),
      employee: String(rows[i][3] || ""),
      qty: Number(rows[i][4]) || 0
    };
    var scanId = Utilities.base64Encode(
      Utilities.computeDigest(Utilities.DigestAlgorithm.MD5,
        scan.ts + "|" + scan.job + "|" + scan.station + "|" + scan.employee));

    tried++;
    var mis = callMis_(scan, scanId);
    if (mis.misStatus === "pending") continue;  // still unreachable — try next sweep

    var sheetRow = block.firstRow + i;
    if (mis.pages) sheet.getRange(sheetRow, 6).setValue(mis.pages);
    sheet.getRange(sheetRow, 7).setValue(mis.misStatus);
    sheet.getRange(sheetRow, 8).setValue(mis.reason || "");
    changed++;
  }
  return tried;
}

/**
 * v28: the Scans rows that can matter for [startMs, endMs). Column A is read
 * on its own first (one column, cheap), the first and last row whose
 * timestamp falls inside the range mark the block, and only that block is
 * read in full. Callers keep filtering every row against their own window
 * exactly as before, so a row that is out of time order changes nothing —
 * it is simply read as part of a slightly larger block.
 * Returns { rows: [...], firstRow: <sheet row number of rows[0]> }.
 */
function readScanBlock_(scans, startMs, endMs) {
  var last = scans.getLastRow();
  if (last < 2) return { rows: [], firstRow: 2 };
  var col = scans.getRange(2, 1, last - 1, 1).getValues();
  var lo = -1, hi = -1;
  for (var i = 0; i < col.length; i++) {
    var v = col[i][0];
    var t = (v instanceof Date) ? v.getTime() : new Date(v).getTime();
    if (isNaN(t) || t < startMs || t >= endMs) continue;
    if (lo < 0) lo = i;
    hi = i;
  }
  if (lo < 0) return { rows: [], firstRow: 2 };
  return { rows: scans.getRange(lo + 2, 1, hi - lo + 1, 8).getValues(), firstRow: lo + 2 };
}

/** GET: station config for the scan app, or ?board=1 for the leaderboard. */
function doGet(e) {
  var p = (e && e.parameter) || {};
  var ss = ensureTabs_(!!(p.board || p.scans || p.roster));   // v28: read-only requests skip housekeeping
  if (p.scans) return json_(scanWindow_(ss, p));   // v21: double-dip check
  if (p.roster) return json_(rosterView_(ss));     // v28: HR roster page
  if (p.board) {
    var wk = parseInt(p.week, 10);
    if (isNaN(wk) || wk < 0) wk = 0;
    if (wk > 51) wk = 51;
    var period = (p.period === "day") ? "day" : "week";
    var from = String(p.from || "");
    var to = String(p.to || "");
    // v28: serve the finished board from the cache for BOARD_CACHE_SECS. The key
    // carries a revision that roster and credit changes bump (rare, and people want
    // to see those at once); new scans just wait out the cache.
    var cache = null, ck = null;
    try {
      cache = CacheService.getScriptCache();
      ck = "board28_" + (cache.get("scans_rev") || "0") + "_" + wk + "_" + period + "_" + from + "_" + to;
      var hit = cache.get(ck);
      if (hit) return jsonText_(hit);
    } catch (err) { cache = null; }
    var text = JSON.stringify(buildLeaderboard_(ss, wk, period, from, to));
    if (cache && text.length < 95000) {
      try { cache.put(ck, text, BOARD_CACHE_SECS); } catch (err2) {}
    }
    return jsonText_(text);
  }
  return json_({ ok: true, app: "qmt-floor-scan", stations: getStations_(ss), roster: getRoster_(ss) });
}

/** This week's totals per employee (week starts Monday 00:00, sheet timezone). */
function buildLeaderboard_(ss, weekOffset, period, fromStr, toStr) {
  weekOffset = weekOffset || 0;   // 0 = current week, 1 = last week, ...
  period = period || "week";      // "week", "day" (today), or custom via from/to
  var tz = ss.getSpreadsheetTimeZone() || "America/New_York";
  var now = new Date();
  // Day of week, robustly: some runtimes don't support the "u" pattern
  var dow = Number(Utilities.formatDate(now, tz, "u"));
  if (isNaN(dow) || dow < 1 || dow > 7) {
    var eee = Utilities.formatDate(now, tz, "EEE");
    dow = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[eee] || 1;
  }
  // Sheet-timezone midnight as an absolute instant — pure arithmetic,
  // no date-string parsing (which can silently misfire).
  var hms = Utilities.formatDate(now, tz, "HH:mm:ss").split(":");
  var msSinceMidnight = ((Number(hms[0]) * 3600) + (Number(hms[1]) * 60) + Number(hms[2])) * 1000 + now.getMilliseconds();
  var midnight = new Date(now.getTime() - msSinceMidnight);
  var baseWeekStart = new Date(midnight.getTime() - (dow - 1) * 86400000);
  // Turn a yyyy-mm-dd into that date's midnight in the sheet timezone,
  // anchored off today's midnight (pure day arithmetic, no string parsing)
  var todayUTC = Date.UTC.apply(null, Utilities.formatDate(now, tz, "yyyy-MM-dd").split("-").map(Number).map(function (v, i) { return i === 1 ? v - 1 : v; }));
  function dayInstant_(ymd) {
    var m = String(ymd).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    var target = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return new Date(midnight.getTime() + (target - todayUTC));
  }
  var weekStart, weekEnd;
  var fromD = fromStr ? dayInstant_(fromStr) : null;
  var toD = toStr ? dayInstant_(toStr) : null;
  if (fromD && toD) {
    if (toD < fromD) { var tmp = fromD; fromD = toD; toD = tmp; }
    period = "custom";
    weekStart = fromD;
    weekEnd = new Date(toD.getTime() + 86400000);          // end date inclusive
    if (weekEnd.getTime() - weekStart.getTime() > 366 * 86400000) {
      weekEnd = new Date(weekStart.getTime() + 366 * 86400000);
    }
  } else if (period === "day") {
    weekStart = midnight;                                  // today, sheet tz
    weekEnd = new Date(midnight.getTime() + 86400000);
  } else {
    weekStart = new Date(baseWeekStart.getTime() - weekOffset * 7 * 86400000);
    weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
  }

  var scans = ss.getSheetByName("Scans");
  var last = scans.getLastRow();
  var pts = getPointsMap_(ss);
  var names = getNamesMap_(ss);
  var aliases = getAliasMap_(ss);
  var canon = function (person) {
    return aliases[String(person).trim().toLowerCase()] || String(person).trim();
  };
  var totals = {};
  var totalRows = Math.max(0, last - 1), inWindow = 0;
  var seen = {};        // replay guard: identical scans (offline-queue re-posts) count once
  // Team goal always measures the WEEK (the goal is weekly), even on the daily view
  var teamWeekStart = new Date(baseWeekStart.getTime() - weekOffset * 7 * 86400000);
  var teamWeekEnd = new Date(teamWeekStart.getTime() + 7 * 86400000);
  var teamSeen = {}, teamUnits = 0;
  var firstTs = null;   // tracer: what does a raw timestamp actually look like?

  // v28: read only the rows that can matter — this window, the team-goal week,
  // and the Nectar week (with the one-day margin computeNectar_ allows itself).
  var nw = nectarWindow_(period, weekStart, weekEnd, midnight, tz);
  var readStart = Math.min(weekStart.getTime(), teamWeekStart.getTime(), nw.startMs - 86400000);
  var readEnd = Math.max(weekEnd.getTime(), teamWeekEnd.getTime(), nw.endMs + 86400000);
  var rows = readScanBlock_(scans, readStart, readEnd).rows;

  if (rows.length) {
    rows.forEach(function (r) {
      var raw = r[0];
      if (firstTs === null) {
        firstTs = Object.prototype.toString.call(raw) + " | " + String(raw);
      }
      // Accept the timestamp in whatever form the Sheet hands it back
      var ts = raw;
      if (!(ts instanceof Date)) ts = new Date(ts);
      if (isNaN(ts.getTime())) return;              // genuinely unreadable — skip
      if (ts < weekStart || ts >= weekEnd) return;  // outside this week
      var station = String(r[1]).trim();
      var job = String(r[2]).trim();
      var badgeField = String(r[3]).trim();
      var qty = Number(r[4]) || 0;
      // The offline queue can re-post a scan; Admin ignores replays but the
      // Sheet appends them. Same timestamp+job+station+employee = same scan:
      // count it once. (Legitimate repeat work gets a new timestamp.)
      var dupKey = ts.getTime() + "|" + job + "|" + station.toLowerCase() + "|" + badgeField.toLowerCase();
      var misStatus = String(r[6]).toLowerCase();
      var isRejected = misStatus === "rejected";
      // Team goal: books through Label and Ship this week (replays once, rejects skipped)
      if (pts.teamGoal > 0 && !isRejected &&
          station.toLowerCase() === "label and ship" &&
          ts >= teamWeekStart && ts < teamWeekEnd && !teamSeen[dupKey]) {
        teamSeen[dupKey] = true;
        teamUnits += qty;
      }
      if (seen[dupKey]) return;
      seen[dupKey] = true;
      // System flags per person (coaching report: system problems, not effort)
      if (misStatus === "rejected" || misStatus === "not_at_step" || misStatus === "unmapped") {
        String(r[3]).trim().split(PAIR_RE).map(function (s) { return s.trim(); }).filter(String)
          .forEach(function (person) {
            person = canon(person);
            var fk = person.toLowerCase();
            if (!totals[fk]) totals[fk] = { badge: person, points: 0, scans: 0, units: 0, shiftEq: 0, dayEq: {}, stations: {}, manuals: [], days: {}, flags: { rejected: 0, notAtStep: 0, unmapped: 0 } };
            if (misStatus === "rejected") totals[fk].flags.rejected++;
            else if (misStatus === "not_at_step") totals[fk].flags.notAtStep++;
            else totals[fk].flags.unmapped++;
          });
      }
      // MIS rejected the scan (duplicate step / unknown job) — no credit (R2)
      if (isRejected) return;
      inWindow++;
      if (!badgeField) return;
      var weight = pts.map[station.toLowerCase()];
      if (weight === undefined) weight = 1;
      var p = (pts.basis === "per 100 units") ? (qty / 100) * weight : weight;
      // Paired employees split the credit evenly. The app writes "A+B", but
      // operators sometimes type pairs by hand — so split on any common
      // joiner: +  &  /  ,  or the word "and" (case-insensitive).
      var people = badgeField.split(PAIR_RE)
        .map(function (s) { return s.trim(); }).filter(String);
      if (!people.length) return;
      var share = 1 / people.length;
      // Rate: fraction of a 10-hour shift standard this scan represents.
      // Page-based stations (e.g. Smyth) use qty × pages from the MIS.
      var tgt = targetAt_(pts, station.toLowerCase(), ts.getTime());   // v27: the rate in effect WHEN scanned
      var pages = Number(r[5]) || 0;
      var shiftEq = 0;
      if (tgt) {
        var output = tgt.jobs ? 1 : (tgt.pages ? (pages > 0 ? qty * pages : 0) : qty);
        if (output > 0) shiftEq = output / tgt.target;
      }
      people.forEach(function (badge) {
        badge = canon(badge);            // fold old typed names into roster names
        var key = badge.toLowerCase();   // "Ed" and "ed" are the same person
        if (!totals[key]) totals[key] = { badge: badge, points: 0, scans: 0, units: 0, shiftEq: 0, dayEq: {}, stations: {}, manuals: [], days: {}, flags: { rejected: 0, notAtStep: 0, unmapped: 0 } };
        totals[key].points += p * share;
        totals[key].scans += 1;
        totals[key].units += qty * share;
        var sdk = shiftDayKey_(ts, tz);   // v23: day-level credit, so the daily cap can apply
        totals[key].dayEq[sdk] = (totals[key].dayEq[sdk] || 0) + shiftEq * share;
        totals[key].days[Utilities.formatDate(ts, tz, "yyyy-MM-dd")] = true;
        var st = totals[key].stations[station];
        if (!st) st = totals[key].stations[station] = { station: station, points: 0, scans: 0, units: 0, shiftEq: 0, dayEq: {}, hasTarget: !!tgt };
        st.points += p * share;
        st.scans += 1;
        st.units += qty * share;
        st.dayEq[sdk] = (st.dayEq[sdk] || 0) + shiftEq * share;
      });
    });
  }

  // Manager-signed manual credits: off-list work, credited to RATE only
  // (hours ÷ shift hours = shift-equivalents), never to points. Hours are
  // per person: a pair entry credits each person the full hours.
  // v21: approved 2-Minute Improvement cards arrive here too.
  var manualSheet = ss.getSheetByName("Manual Credits");
  if (manualSheet && manualSheet.getLastRow() >= 2) {
    var mrows = manualSheet.getRange(2, 1, manualSheet.getLastRow() - 1, 5).getValues();
    mrows.forEach(function (r) {
      var d = r[0];
      if (!(d instanceof Date)) d = new Date(d);
      if (isNaN(d.getTime())) return;
      if (d < weekStart || d >= weekEnd) return;   // same window as the board
      var nameField = String(r[1]).trim();
      if (!nameField) return;
      var activity = String(r[2]).trim() || "Manual credit";
      var hrs = Number(r[3]) || 0;
      if (hrs <= 0) return;
      var approver = String(r[4]).trim();
      var eq = hrs / pts.shiftHours;
      nameField.split(PAIR_RE).map(function (s) { return s.trim(); }).filter(String)
        .forEach(function (person) {
          person = canon(person);
          var key = person.toLowerCase();
          if (!totals[key]) totals[key] = { badge: person, points: 0, scans: 0, units: 0, shiftEq: 0, dayEq: {}, stations: {}, manuals: [], days: {}, flags: { rejected: 0, notAtStep: 0, unmapped: 0 } };
          totals[key].shiftEq += eq;
          totals[key].days[Utilities.formatDate(d, tz, "yyyy-MM-dd")] = true;
          totals[key].manuals.push({ activity: activity, hours: hrs, approver: approver });
        });
    });
  }

  // Weekly rates are prorated: divide by how many workdays have elapsed in
  // the selected week, so 100% always means "on standard for the days so far".
  var rateDays = 1;
  if (period === "custom") {
    // Days of the range that have actually elapsed, scaled to the workweek
    var spanDays = Math.round((weekEnd.getTime() - weekStart.getTime()) / 86400000);
    var elapsedDays = Math.ceil((Math.min(now.getTime(), weekEnd.getTime()) - weekStart.getTime()) / 86400000);
    elapsedDays = Math.max(1, Math.min(elapsedDays, spanDays));
    rateDays = Math.max(1, Math.round(elapsedDays * pts.workdays / 7));
    if (elapsedDays < 7) rateDays = Math.max(1, Math.min(elapsedDays, pts.workdays));
  } else if (period !== "day") {
    if (weekOffset > 0) {
      rateDays = pts.workdays;                       // past week: full workweek
    } else {
      var elapsed = Math.floor((now.getTime() - weekStart.getTime()) / 86400000) + 1;
      rateDays = Math.max(1, Math.min(elapsed, pts.workdays));
    }
  }

  // v22: hours-based proration. Each person's denominator is the paid hours
  // the Public Schedule shows them HERE (green / orange) in this window,
  // over the shift length. Absent days drop out instead of counting as zero.
  // Anyone not on the schedule — or if it can't be read — keeps the workday
  // divisor above, so nothing ever disappears from the board.
  var sched = getScheduleHours_(ss, weekStart.getTime(), weekEnd.getTime(), now, tz, canon);
  var denomFor = function (key) {
    var h = sched.ok ? sched.byPerson[key] : 0;
    return (h && h > 0)
      ? { shifts: h / pts.shiftHours, hours: Math.round(h * 100) / 100, src: "schedule" }
      : { shifts: rateDays, hours: null, src: "default" };
  };

  // v23: daily cap. A person's scan credit for ONE shift day is limited to the
  // cap (default 150% of a shift) scaled to the hours the schedule shows them
  // working that day (10 if unknown). Manual credits are not capped. The
  // station lines shrink by the same factor, so they still add up.
  Object.keys(totals).forEach(function (k) {
    var t = totals[k];
    var scanEq = 0, cappedDays = 0, factor = {};
    Object.keys(t.dayEq).forEach(function (dk) {
      var raw = t.dayEq[dk];
      var f = 1;
      if (pts.dailyCap > 0 && raw > 0) {
        var hrs = sched.ok ? sched.perDay[k + "|" + dk] : 0;
        var limit = pts.dailyCap * ((hrs && hrs > 0) ? hrs : pts.shiftHours) / pts.shiftHours;
        if (raw > limit) { f = limit / raw; cappedDays++; }
      }
      factor[dk] = f;
      scanEq += raw * f;
    });
    Object.keys(t.stations).forEach(function (s) {
      var v = t.stations[s], sum = 0;
      Object.keys(v.dayEq).forEach(function (dk) {
        sum += v.dayEq[dk] * (factor[dk] === undefined ? 1 : factor[dk]);
      });
      v.shiftEq = sum;
    });
    t.shiftEq += scanEq;       // manual credits were added earlier; capped scans join them here
    t.cappedDays = cappedDays;
  });

  // Roster: attach each person's shift, and list EVERYONE — people who
  // haven't scanned appear at zero (adoption tracking, not judgment).
  var roster = getRoster_(ss);
  var shiftByName = {};
  roster.forEach(function (p) { shiftByName[p.name.toLowerCase()] = p.shift || ""; });
  var rosterCanon = {};
  roster.forEach(function (p) { rosterCanon[p.name.toLowerCase()] = p.name; });

  // v24: "scanned every day" status for the weekly Nectar special
  var nct = computeNectar_(ss, rows, roster, canon, now, tz, period, weekStart, weekEnd, midnight);
  var nectarFor = function (key) { return nct.byPerson[key] || { status: "na", days: 0, scanned: 0 }; };

  var list = Object.keys(totals).map(function (k) {
    var t = totals[k];
    var den = denomFor(k);
    var stArr = Object.keys(t.stations).map(function (s) {
      var v = t.stations[s];
      return {
        station: v.station,
        points: Math.round(v.points * 100) / 100,
        scans: v.scans,
        units: Math.round(v.units * 10) / 10,
        rate: v.hasTarget ? Math.round((v.shiftEq / den.shifts) * 1000) / 10 : null
      };
    });
    stArr.sort(function (a, b) { return b.units - a.units; });
    return {
      name: names[k] || names[String(t.badge).toLowerCase()] || rosterCanon[k] || t.badge,
      badge: t.badge,
      points: Math.round(t.points * 100) / 100,
      scans: t.scans,
      units: Math.round(t.units * 10) / 10,
      rate: Math.round((t.shiftEq / den.shifts) * 1000) / 10,   // % of standard, prorated to hours worked
      hoursWorked: den.hours,
      hoursSource: den.src,
      cappedDays: t.cappedDays || 0,
      nectar: nectarFor(k),
      shift: shiftByName[String(t.badge).toLowerCase()] || "",
      daysActive: Object.keys(t.days || {}).length,
      ratePerActiveDay: Object.keys(t.days || {}).length
        ? Math.round((t.shiftEq / Object.keys(t.days).length) * 1000) / 10
        : 0,
      flags: t.flags || { rejected: 0, notAtStep: 0, unmapped: 0 },
      stations: stArr,
      manuals: (t.manuals || []).map(function (m) {
        return {
          activity: m.activity,
          hours: m.hours,
          approver: m.approver,
          rate: Math.round((m.hours / pts.shiftHours / den.shifts) * 1000) / 10
        };
      })
    };
  });
  // Zero-fill: roster members with no activity in this window.
  // v28: a Shift of "Former employee" (Names col C) keeps the row for its aliases
  // and history, but no longer lists that person at zero. Anyone who did scan
  // in the window still shows, so past weeks stay complete.
  roster.forEach(function (p) {
    if (totals[p.name.toLowerCase()]) return;
    if (/former/i.test(p.shift || "")) return;
    list.push({
      name: names[p.name.toLowerCase()] || p.name,
      badge: p.name,
      points: 0, scans: 0, units: 0, rate: 0,
      hoursWorked: null, hoursSource: "default", cappedDays: 0,
      nectar: nectarFor(p.name.toLowerCase()),
      shift: p.shift || "",
      daysActive: 0, ratePerActiveDay: 0,
      flags: { rejected: 0, notAtStep: 0, unmapped: 0 },
      stations: [], manuals: []
    });
  });

  // v21: rank by RATE (% of standard) — it includes approved improvement
  // time and manual credits, so that work moves people up the standings.
  // Points break ties, then volume, jobs, and name.
  list.sort(function (a, b) {
    if (b.rate !== a.rate) return b.rate - a.rate;
    if (b.points !== a.points) return b.points - a.points;
    if (b.units !== a.units) return b.units - a.units;    // tie: more volume ranks higher
    if (b.scans !== a.scans) return b.scans - a.scans;    // then more jobs
    return String(a.name).localeCompare(String(b.name));  // then alphabetical, stable
  });

  var fmt = function (d) { return Utilities.formatDate(d, tz, "EEE M/d"); };
  // Selectable weeks for the dashboard dropdown (current + 11 back)
  var weeks = [];
  for (var o = 0; o < 12; o++) {
    var wsO = new Date(baseWeekStart.getTime() - o * 7 * 86400000);
    var weO = new Date(wsO.getTime() + 6 * 86400000);
    weeks.push({ offset: o, label: fmt(wsO) + " \u2013 " + fmt(weO) });
  }
  var label = (period === "day")
    ? ("Today \u00B7 " + fmt(weekStart))
    : (fmt(weekStart) + " \u2013 " + fmt(new Date(weekEnd.getTime() - 86400000)));
  var hasTargets = Object.keys(pts.targets).length > 0 || Object.keys(pts.rateChanges).length > 0;
  var upcomingRates = [];
  Object.keys(pts.rateChanges).forEach(function (k) {
    pts.rateChanges[k].forEach(function (ch) {
      if (ch.at > now.getTime()) upcomingRates.push({ at: ch.at, when: Utilities.formatDate(new Date(ch.at), tz, "EEE M/d h:mm a"), station: ch.station, target: ch.raw });
    });
  });
  upcomingRates.sort(function (a, b) { return a.at - b.at; });
  upcomingRates = upcomingRates.slice(0, 12);
  var team = null;
  if (pts.teamGoal > 0) {
    team = {
      goal: pts.teamGoal,
      units: Math.round(teamUnits),
      pct: Math.round((teamUnits / pts.teamGoal) * 1000) / 10
    };
  }
  return {
    ok: true,
    app: "qmt-floor-scan",
    v: 31,
    dailyCapPct: Math.round(pts.dailyCap * 100),
    nectarWeek: nct.week,
    upcomingRates: upcomingRates,
    rankBy: "rate",
    hasTargets: hasTargets,
    rateDays: sched.ok ? null : rateDays,      // null = prorated to hours worked (the page then omits the "workdays" note)
    rateBasis: sched.ok ? "hours" : "days",
    scheduleNote: sched.note || "",
    team: team,
    period: period,
    label: label,
    weekOffset: weekOffset,
    weeks: weeks,
    week: fmt(weekStart) + " – " + fmt(new Date(weekEnd.getTime() - 86400000)),
    basis: pts.basis,
    updated: Utilities.formatDate(now, tz, "h:mm a"),
    totalRows: totalRows,
    inWindow: inWindow,
    weekStartISO: weekStart.toISOString(),
    weekEndISO: weekEnd.toISOString(),
    firstTs: firstTs,
    feedbackOpen: feedbackOpenCount_(ss),   // v30
    rows: list
  };
}

/**
 * MANAGER-ONLY COACHING REPORT — emailed, never shown on the TV.
 * Covers the most recent completed week. Ranks by rate-per-ACTIVE-day
 * (fair to people who missed days), flags system problems that suppress
 * scores, compares everyone to their own prior 3 weeks, and averages
 * each station to expose miscalibrated targets.
 *
 * SET UP ONCE:
 *   1. In the editor, Run > sendCoachingEmail_ once and approve the new
 *      "send email" permission (also sends you a test report immediately).
 *   2. Triggers (clock icon) > Add Trigger > sendCoachingEmail_ >
 *      Time-driven > Week timer > Every Monday > 6am-7am.
 *   3. Optional: recipients in Points tab E6 (comma-separated); blank
 *      sends to the script owner.
 */
function sendCoachingEmail_() {
  var ss = ensureTabs_();
  var report = buildCoachingReport_(ss);
  var pts = ss.getSheetByName("Points");
  var to = "";
  try { to = String(pts.getRange("E6").getValue() || "").trim(); } catch (e) {}
  if (!to) to = Session.getEffectiveUser().getEmail();
  MailApp.sendEmail({
    to: to,
    subject: "QMT Coaching Report — week of " + report.week,
    htmlBody: report.html
  });
}

function buildCoachingReport_(ss) {
  var last = buildLeaderboard_(ss, 1, "week");      // most recent completed week
  var prev = [buildLeaderboard_(ss, 2, "week"),
              buildLeaderboard_(ss, 3, "week"),
              buildLeaderboard_(ss, 4, "week")];

  // Prior-3-week average of rate-per-active-day, per person
  var hist = {};
  prev.forEach(function (wk) {
    (wk.rows || []).forEach(function (r) {
      var k = String(r.badge).toLowerCase();
      if (!hist[k]) hist[k] = [];
      if (r.ratePerActiveDay > 0) hist[k].push(r.ratePerActiveDay);
    });
  });

  var looksLikeJobNumber = function (s) { return /^\d{7,}$/.test(String(s).trim()); };
  var rows = (last.rows || []).filter(function (r) { return !looksLikeJobNumber(r.badge); });
  var dataQuality = (last.rows || []).length - rows.length;

  rows.forEach(function (r) {
    var h = hist[String(r.badge).toLowerCase()] || [];
    r.histAvg = h.length ? Math.round((h.reduce(function (a, b) { return a + b; }, 0) / h.length) * 10) / 10 : null;
    r.trendPct = (r.histAvg && r.histAvg > 0)
      ? Math.round(((r.ratePerActiveDay - r.histAvg) / r.histAvg) * 100) : null;
  });

  var rated = rows.filter(function (r) { return r.daysActive > 0 && r.ratePerActiveDay > 0; });
  var bottom = rated.slice().sort(function (a, b) { return a.ratePerActiveDay - b.ratePerActiveDay; }).slice(0, 5);
  var top = rated.slice().sort(function (a, b) { return b.ratePerActiveDay - a.ratePerActiveDay; }).slice(0, 3);
  var declining = rated.filter(function (r) { return r.trendPct !== null && r.trendPct <= -25; })
    .sort(function (a, b) { return a.trendPct - b.trendPct; });
  var flagged = rows.filter(function (r) {
    return (r.flags.notAtStep + r.flags.unmapped) >= 5 || r.flags.rejected >= 3;
  }).sort(function (a, b) {
    return (b.flags.notAtStep + b.flags.unmapped + b.flags.rejected) -
           (a.flags.notAtStep + a.flags.unmapped + a.flags.rejected);
  });

  // Station health: average per-person station rate
  var stAgg = {};
  rows.forEach(function (r) {
    (r.stations || []).forEach(function (s) {
      if (typeof s.rate !== "number" || s.rate <= 0) return;
      if (!stAgg[s.station]) stAgg[s.station] = { sum: 0, n: 0 };
      stAgg[s.station].sum += s.rate;
      stAgg[s.station].n++;
    });
  });
  var stations = Object.keys(stAgg).map(function (k) {
    return { station: k, avg: Math.round((stAgg[k].sum / stAgg[k].n) * 10) / 10, n: stAgg[k].n };
  }).sort(function (a, b) { return a.avg - b.avg; });

  var esc = function (s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  };
  var trendTxt = function (r) {
    if (r.trendPct === null) return "no history";
    return (r.trendPct > 0 ? "+" : "") + r.trendPct + "% vs their 3-wk avg (" + r.histAvg + "%)";
  };
  var personRow = function (r) {
    var st = (r.stations || []).map(function (s) {
      return esc(s.station) + (typeof s.rate === "number" && s.rate > 0 ? " " + s.rate + "%" : "");
    }).join(" · ");
    return "<tr><td style='padding:6px 10px'><b>" + esc(r.name) + "</b></td>" +
      "<td style='padding:6px 10px;text-align:right'><b>" + r.ratePerActiveDay + "%</b>/day</td>" +
      "<td style='padding:6px 10px;text-align:right'>" + r.daysActive + " days</td>" +
      "<td style='padding:6px 10px'>" + trendTxt(r) + "</td>" +
      "<td style='padding:6px 10px;color:#666'>" + st + "</td></tr>";
  };
  var section = function (title, note, inner) {
    return "<h3 style='margin:22px 0 4px'>" + title + "</h3>" +
      (note ? "<div style='color:#666;font-size:13px;margin-bottom:6px'>" + note + "</div>" : "") +
      inner;
  };
  var table = function (list) {
    if (!list.length) return "<div style='color:#666'>— none —</div>";
    return "<table style='border-collapse:collapse;font-size:14px'>" + list.map(personRow).join("") + "</table>";
  };

  var html =
    "<div style='font-family:Arial,Helvetica,sans-serif;max-width:760px'>" +
    "<h2 style='margin:0'>QMT Coaching Report</h2>" +
    "<div style='color:#666'>Week of " + esc(last.week) + " · rate-per-active-day = output vs shift standard on days the person actually worked · manager-only, not shown on the floor TV</div>" +
    section("Coach first — lowest rate per active day", "Before coaching, check their Flags and Station sections: low often means system, not effort.", table(bottom)) +
    section("Declining — down 25%+ vs their own 3-week average", "The person to reach first is the one falling, not the one lowest.", table(declining)) +
    section("System flags — scans blocked by racetrack/mapping, not effort", "not_at_step = racetrack behind · unmapped = station not mapped in Admin · rejected = duplicate step. High counts here mean fix the system before coaching the person.",
      flagged.length
        ? "<table style='border-collapse:collapse;font-size:14px'>" + flagged.map(function (r) {
            return "<tr><td style='padding:6px 10px'><b>" + esc(r.name) + "</b></td>" +
              "<td style='padding:6px 10px'>" + r.flags.notAtStep + " not-at-step · " +
              r.flags.unmapped + " unmapped · " + r.flags.rejected + " rejected</td></tr>";
          }).join("") + "</table>"
        : "<div style='color:#666'>— none —</div>") +
    section("Station health — average rate per station", "A whole station under ~70% usually means the Target/shift is miscalibrated or the machine is struggling — fix the target, not the people.",
      stations.length
        ? "<table style='border-collapse:collapse;font-size:14px'>" + stations.map(function (s) {
            return "<tr><td style='padding:6px 10px'><b>" + esc(s.station) + "</b></td>" +
              "<td style='padding:6px 10px;text-align:right'>" + s.avg + "%</td>" +
              "<td style='padding:6px 10px;color:#666'>" + s.n + " people</td></tr>";
          }).join("") + "</table>"
        : "<div style='color:#666'>— no rated stations —</div>") +
    section("Recognize — top rate per active day", "", table(top)) +
    (dataQuality ? "<div style='color:#b00;font-size:13px;margin-top:18px'>Data quality: " + dataQuality +
      " leaderboard entr" + (dataQuality === 1 ? "y" : "ies") + " look like job numbers scanned as employees — excluded here; worth a floor reminder about badge sign-in.</div>" : "") +
    "</div>";

  return { week: last.week, html: html };
}

function json_(obj) {
  return jsonText_(JSON.stringify(obj));
}

/** v28: a JSON response from text that is already serialized (cached boards). */
function jsonText_(text) {
  return ContentService
    .createTextOutput(text)
    .setMimeType(ContentService.MimeType.JSON);
}

/* =====================================================================
 * v21 — 2-Minute Improvement bridge
 * ===================================================================== */

/**
 * The improvement dashboard posts each APPROVED card here. It becomes one
 * row in "Manual Credits": Date | Name | Activity | Hours | Approved by | Ref ID
 * and counts exactly like any manual credit (hours ÷ shift hours, rate only,
 * never station rates — so target-recalibration data stays clean).
 * Repeat posts of the same card are ignored; type "improvement_undo" removes it.
 */
function handleImprovement_(ss, data) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (err) { return { ok: false, error: "busy, retry" }; }
  try {
    var sh = ss.getSheetByName("Manual Credits");
    if (!sh) return { ok: false, error: "Manual Credits tab missing" };
    if (!String(sh.getRange("F1").getValue())) {
      sh.getRange("F1").setValue("Ref ID").setFontWeight("bold");
    }
    var ref = String(data.ref || "").trim();
    if (!ref) return { ok: false, error: "missing ref" };
    var row = findImprovementRow_(sh, ref);

    if (data.type === "improvement") {
      if (row) return { ok: true, already: true, v: 31 };
      var mins = Number(data.minutes) || 0;
      if (mins <= 0 || mins > 720) return { ok: false, error: "bad minutes" };
      var hours = Math.round((mins / 60) * 1000) / 1000;   // v22: 3 decimals (2 min = 0.033 hr)
      var d = new Date(data.ts);
      if (isNaN(d.getTime())) d = new Date();
      var activity = "2-Min Improvement";
      if (data.area) activity += " \u2013 " + String(data.area);
      if (data.caption) activity += ": " + String(data.caption);
      activity = activity.slice(0, 200);
      sh.appendRow([d, String(data.name || "").trim(), activity, hours,
                    String(data.approver || "").trim(), ref]);
      bumpScansRev_();   // v28: credits change the board too
      return { ok: true, v: 31 };
    }

    if (data.type === "improvement_undo") {
      if (row) { sh.deleteRow(row); bumpScansRev_(); }
      return { ok: true, removed: !!row, v: 31 };
    }

    return { ok: false, error: "unknown type" };
  } finally {
    lock.releaseLock();
  }
}

function findImprovementRow_(sh, ref) {
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var vals = sh.getRange(2, 6, last - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]).trim() === ref) return i + 2;
  }
  return 0;
}

/** GET ?scans=1&name=<roster name>&from=<ISO>&to=<ISO> — double-dip check. */
function scanWindow_(ss, p) {
  var name = String(p.name || "").trim();
  var from = new Date(p.from), to = new Date(p.to);
  if (!name || isNaN(from.getTime()) || isNaN(to.getTime())) {
    return { ok: false, error: "need name, from, to" };
  }
  var aliases = getAliasMap_(ss);
  var canon = function (person) {
    return (aliases[String(person).trim().toLowerCase()] || String(person).trim()).toLowerCase();
  };
  var who = canon(name);
  var scans = ss.getSheetByName("Scans");
  var count = 0, stations = {};
  if (scans) {
    var rows = readScanBlock_(scans, from.getTime(), to.getTime() + 1).rows;   // v28: only the window (to is inclusive)
    rows.forEach(function (r) {
      var ts = r[0] instanceof Date ? r[0] : new Date(r[0]);
      if (isNaN(ts.getTime()) || ts < from || ts > to) return;
      if (String(r[6]).toLowerCase() === "rejected") return;
      var people = String(r[3]).split(PAIR_RE).map(function (s) { return s.trim(); }).filter(String);
      for (var i = 0; i < people.length; i++) {
        if (canon(people[i]) === who) {
          count++;
          var st = String(r[1]).trim();
          if (st) stations[st] = true;
          break;
        }
      }
    });
  }
  return { ok: true, v: 31, count: count, stations: Object.keys(stations) };
}

/* =====================================================================
 * v22 — hours-based rate proration from the Public Schedule
 *
 * The schedule workbook has one tab per week. Each tab holds two blocks
 * (day shift, night shift), each block Sunday..Saturday. A person's name
 * sits in the cell for each day they are listed; the cell COLOR says what
 * happened: green = here, orange = late/left early, yellow = called out,
 * magenta = excused, red = no call no show. Shaded or blank = not scheduled.
 * A time label ("5:30AM - 4PM") in the column just left of each block sets
 * the shift length for that row and the rows below it.
 * ===================================================================== */

/** Cell color -> status. Only G and O count as hours worked. */
function colorClass_(hex) {
  var m = String(hex || "").toLowerCase().match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/);
  if (!m) return "";
  var r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
  var near = function (R, G, B) {
    return Math.abs(r - R) <= 30 && Math.abs(g - G) <= 30 && Math.abs(b - B) <= 30;
  };
  if (near(0, 255, 0)) return "G";      // here
  if (near(255, 153, 0)) return "O";    // late / left early (counts as a full day)
  if (near(255, 255, 0)) return "Y";    // called out
  if (near(255, 0, 255)) return "M";    // excused absence
  if (near(255, 0, 0)) return "R";      // no call no show
  return "";                            // department shading, white, labels
}

/** "5:30AM - 4PM" -> 10.5 (hours between start and end; night shifts wrap). */
function parseSpanHours_(s) {
  var m = String(s || "").replace(/[\u2013\u2014]/g, "-")
    .match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  if (!m) return null;
  var to24 = function (h, mi, ap) {
    h = Number(h); mi = Number(mi || 0);
    ap = String(ap).toUpperCase();
    if (ap === "PM" && h !== 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
    return h + mi / 60;
  };
  var a = to24(m[1], m[2], m[3]), b = to24(m[4], m[5], m[6]);
  if (b <= a) b += 24;
  return b - a;
}

/** A schedule date header ("9/27" text or a real date) -> "yyyy-MM-dd". */
function scheduleDateKey_(v, now, tz) {
  if (v instanceof Date && !isNaN(v.getTime())) return Utilities.formatDate(v, tz, "yyyy-MM-dd");
  var m = String(v === null || v === undefined ? "" : v).trim().match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (!m) return null;
  var mo = Number(m[1]), da = Number(m[2]);
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;
  var year = Number(Utilities.formatDate(now, tz, "yyyy"));
  if (m[3]) {
    year = Number(m[3]);
    if (year < 100) year += 2000;
  } else {
    // No year on the sheet: take the year that puts this date closest to
    // today (handles the December / January turnover).
    var nowMs = Date.UTC(year, Number(Utilities.formatDate(now, tz, "M")) - 1, Number(Utilities.formatDate(now, tz, "d")));
    var best = null;
    [year - 1, year, year + 1].forEach(function (y) {
      var diff = Math.abs(Date.UTC(y, mo - 1, da) - nowMs);
      if (best === null || diff < best.diff) best = { y: y, diff: diff };
    });
    year = best.y;
  }
  return year + "-" + ("0" + mo).slice(-2) + "-" + ("0" + da).slice(-2);
}

/** The most recent weekly tabs and the date span each covers (cached 30 min). */
function getScheduleTabs_(book, now, tz) {
  var cache = CacheService.getScriptCache();
  var ck = "sch_tabs3_" + book.getId();
  var hit = cache.get(ck);
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  var out = [];
  var btz = book.getSpreadsheetTimeZone() || tz;     // v25: read the schedule's dates in ITS time zone
  var sheets = book.getSheets();
  var limit = Math.min(sheets.length, 16);          // newest tabs are first
  for (var i = 0; i < limit; i++) {
    var sh = sheets[i];
    var topRng = sh.getRange(1, 1, 2, 21);
    var top = topRng.getValues(), topDisp = topRng.getDisplayValues();
    var keys = [];
    top[1].forEach(function (v, ci) {
      var k = scheduleDateKey_(topDisp[1][ci], now, btz) || scheduleDateKey_(v, now, btz);   // v26: shown text first
      if (k) keys.push(k);
    });
    if (!keys.length) continue;
    keys.sort();
    out.push({ name: sh.getName(), id: sh.getSheetId(), start: keys[0], end: keys[keys.length - 1] });
  }
  try { cache.put(ck, JSON.stringify(out), 1800); } catch (e) {}
  return out;
}

/**
 * Everyone marked HERE (green or orange) in one weekly tab:
 * { present: [ [dateKey, nameAsWritten, paidHours], ... ] }   (cached 5 min)
 */
function parseScheduleTab_(book, tab, now, tz, breakHrs) {
  var cache = CacheService.getScriptCache();
  var ck = "sch_tab3_" + book.getId() + "_" + tab.id + "_" + breakHrs;
  var hit = cache.get(ck);
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }

  var sh = book.getSheetByName(tab.name);
  var btz = book.getSpreadsheetTimeZone() || tz;     // v25: the schedule file's own time zone
  var present = [];
  if (sh) {
    var rng = sh.getRange(1, 1, 30, 21);
    var vals = rng.getValues(), bgs = rng.getBackgrounds(), disp = rng.getDisplayValues();
    // Each block starts at a "Sunday" header cell in row 1
    var starts = [];
    for (var c = 0; c < 21; c++) {
      if (String(vals[0][c]).trim().toLowerCase() === "sunday") starts.push(c);
    }
    starts.forEach(function (sun) {
      var timeCol = sun - 1;
      if (timeCol < 0) return;
      var dayKeys = [];
      for (var d = 0; d < 7; d++) dayKeys.push(scheduleDateKey_(disp[1][sun + d], now, btz) || scheduleDateKey_(vals[1][sun + d], now, btz));
      var span = null;
      for (var r = 2; r < 30; r++) {
        var sp = parseSpanHours_(vals[r][timeCol]);
        if (sp) span = sp;
        if (span === null) continue;
        var paid = span >= 6 ? Math.max(span - breakHrs, 0) : span;
        for (var d2 = 0; d2 < 7; d2++) {
          var text = String(vals[r][sun + d2] === null || vals[r][sun + d2] === undefined ? "" : vals[r][sun + d2]).trim();
          if (!text || /^\d+$/.test(text) || !dayKeys[d2]) continue;
          var cls = colorClass_(bgs[r][sun + d2]);
          if (cls === "G" || cls === "O") present.push([dayKeys[d2], text, paid]);
        }
      }
    });
  }
  var res = { present: present };
  try { cache.put(ck, JSON.stringify(res), 300); } catch (e) {}
  return res;
}

/**
 * Paid hours worked per person (lowercase canonical name) inside a window,
 * counting only days up to today. Returns { ok, byPerson, note }.
 * ok=false means "use the workday divisor instead" (switched off, schedule
 * unreadable, or no tab covers the window) — the board never breaks.
 */
/**
 * v28: the schedule settings (Points E7/E8/E9) read once per request, and the
 * Public Schedule workbook opened once per request. Apps Script runs each
 * request in its own fresh execution, so a script-level memo is per request.
 */
var SCHEDULE_MEMO_ = { cfg: null, books: {} };
function scheduleConfig_(ss) {
  if (SCHEDULE_MEMO_.cfg) return SCHEDULE_MEMO_.cfg;
  var pts = ss.getSheetByName("Points");
  var mode = String(pts.getRange("E9").getValue() || "hours").trim().toLowerCase();
  var id = String(pts.getRange("E8").getValue() || "").trim() || SCHEDULE_DEFAULT_ID;
  var breakHrs = Number(pts.getRange("E7").getValue());
  if (isNaN(breakHrs) || breakHrs < 0 || breakHrs > 2) breakHrs = 0.5;
  SCHEDULE_MEMO_.cfg = { mode: mode, id: id, breakHrs: breakHrs };
  return SCHEDULE_MEMO_.cfg;
}
function openSchedule_(id) {
  if (!SCHEDULE_MEMO_.books[id]) SCHEDULE_MEMO_.books[id] = SpreadsheetApp.openById(id);
  return SCHEDULE_MEMO_.books[id];
}

function getScheduleHours_(ss, startMs, endMs, now, tz, canon) {
  var out = { ok: false, byPerson: {}, perDay: {}, note: "" };
  try {
    var cfg = scheduleConfig_(ss);
    if (cfg.mode === "days") { out.note = "proration: workdays (Points E9)"; return out; }
    var breakHrs = cfg.breakHrs;
    var book = openSchedule_(cfg.id);
    var startKey = Utilities.formatDate(new Date(startMs), tz, "yyyy-MM-dd");
    var endKey = Utilities.formatDate(new Date(endMs), tz, "yyyy-MM-dd");   // exclusive
    var todayKey = Utilities.formatDate(now, tz, "yyyy-MM-dd");
    var tabs = getScheduleTabs_(book, now, tz).filter(function (t) {
      return t.end >= startKey && t.start < endKey;
    });
    if (!tabs.length) { out.note = "no schedule tab covers this window"; return out; }
    var perDay = {};
    tabs.forEach(function (t) {
      parseScheduleTab_(book, t, now, tz, breakHrs).present.forEach(function (p) {
        var key = p[0];
        if (key < startKey || key >= endKey || key > todayKey) return;   // in the window, not in the future
        var who = canon(p[1]).toLowerCase();
        var dk = who + "|" + key;
        perDay[dk] = Math.max(perDay[dk] || 0, p[2]);                   // one person, one day: the larger shift
      });
    });
    Object.keys(perDay).forEach(function (dk) {
      var who = dk.split("|")[0];
      out.byPerson[who] = (out.byPerson[who] || 0) + perDay[dk];
    });
    out.perDay = perDay;
    out.ok = true;
  } catch (err) {
    out.note = "schedule unavailable: " + String(err).slice(0, 120);
  }
  return out;
}

/**
 * RUN ONCE FROM THE EDITOR (function dropdown > scheduleCheck_ > Run).
 * Authorizes the script to read the Public Schedule, then writes an
 * "Hours Check" tab: for the three newest weeks, who was marked here, how
 * many days, and the paid hours counted. Compare it with the schedule to
 * confirm the numbers look right. Safe to re-run any time.
 */
function scheduleCheck_() {
  var ss = ensureTabs_();
  var tz = ss.getSpreadsheetTimeZone() || "America/New_York";
  var now = new Date();
  var aliases = getAliasMap_(ss);
  var canon = function (p) { return aliases[String(p).trim().toLowerCase()] || String(p).trim(); };
  var cfg = scheduleConfig_(ss);
  var breakHrs = cfg.breakHrs;
  var book = openSchedule_(cfg.id);
  var tabs = getScheduleTabs_(book, now, tz).slice(0, 3);
  var out = [["Week of", "Name on the schedule", "Counted as", "Days marked here", "Paid hours"]];
  tabs.forEach(function (t) {
    var perDay = {};
    parseScheduleTab_(book, t, now, tz, breakHrs).present.forEach(function (p) {
      var k = p[1] + "|" + p[0];
      perDay[k] = Math.max(perDay[k] || 0, p[2]);
    });
    var agg = {};
    Object.keys(perDay).forEach(function (k) {
      var nm = k.split("|")[0];
      if (!agg[nm]) agg[nm] = { days: 0, hours: 0 };
      agg[nm].days++;
      agg[nm].hours += perDay[k];
    });
    Object.keys(agg).sort().forEach(function (nm) {
      out.push([t.start, nm, canon(nm), agg[nm].days, agg[nm].hours]);
    });
  });
  var tab = ss.getSheetByName("Hours Check") || ss.insertSheet("Hours Check");
  tab.clear();
  tab.getRange(1, 1, out.length, 5).setValues(out);
  tab.getRange("A1:E1").setFontWeight("bold");
  tab.setFrozenRows(1);
  tab.getRange("G1").setValue("Refreshed " + Utilities.formatDate(now, tz, "M/d h:mm a") +
    " from the Public Schedule. Green and orange cells count as worked; blank, shaded, yellow, magenta and red do not. " +
    "Future days of the current week show here if they are already colored, but the board only counts days up to today.");
  SpreadsheetApp.flush();
  return out.length - 1;
}

/** v23: the calendar date of the SHIFT a scan belongs to (4 AM to 4 AM), so night
 *  work after midnight counts toward the day that shift started. */
function shiftDayKey_(ts, tz) {
  return Utilities.formatDate(new Date(ts.getTime() - 4 * 3600000), tz, "yyyy-MM-dd");
}

/* =====================================================================
 * v24 — "scanned every day" for the weekly Nectar special
 * ===================================================================== */

/**
 * For the Thursday-to-Wednesday Nectar week that contains the viewed window,
 * says who scanned production work on EVERY day the Public Schedule shows them
 * here (green or orange). Returns
 *   { week: { label, scheduleOk }, byPerson: { "lowercase name": { status, days, scanned } } }
 * status: "yes" | "no" | "na". A day that is not over yet counts only once the
 * person has scanned; days after today are ignored; if the schedule cannot be
 * read every status is "na" (the board never guesses).
 */
/** v28 (logic unchanged, split out so the board can size its Scans read): the
 *  Thursday-to-Wednesday Nectar week for a view, as { startMs, endMs } (end exclusive). */
function nectarWindow_(period, weekStart, weekEnd, midnight, tz) {
  var DAY = 86400000;
  var refMs;
  if (period === "day") refMs = midnight.getTime();
  else if (period === "custom") refMs = weekEnd.getTime() - DAY;
  else refMs = weekStart.getTime() + 2 * DAY;        // the Wednesday of the viewed Mon-Sun week
  var refD = new Date(refMs + DAY / 2);
  var dow = Number(Utilities.formatDate(refD, tz, "u"));
  if (isNaN(dow) || dow < 1 || dow > 7) {
    dow = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[Utilities.formatDate(refD, tz, "EEE")] || 1;
  }
  var startMs = refMs - ((dow - 4 + 7) % 7) * DAY;   // back to Thursday
  return { startMs: startMs, endMs: startMs + 7 * DAY };
}

function computeNectar_(ss, scanRows, roster, canon, now, tz, period, weekStart, weekEnd, midnight) {
  var DAY = 86400000;
  var nw = nectarWindow_(period, weekStart, weekEnd, midnight, tz);
  var startMs = nw.startMs, endMs = nw.endMs;
  var keySet = {};
  for (var i = 0; i < 7; i++) keySet[Utilities.formatDate(new Date(startMs + i * DAY + DAY / 2), tz, "yyyy-MM-dd")] = true;
  var fmt = function (ms) { return Utilities.formatDate(new Date(ms + DAY / 2), tz, "EEE M/d"); };
  var out = { week: { label: fmt(startMs) + " \u2013 " + fmt(endMs - DAY), scheduleOk: false }, byPerson: {} };
  var todayKey = shiftDayKey_(now, tz);

  // who scanned on which shift day (valid scans only; replays count once)
  var scanned = {}, seen = {};
  (scanRows || []).forEach(function (r) {
    var ts = r[0];
    if (!(ts instanceof Date)) ts = new Date(ts);
    if (isNaN(ts.getTime())) return;
    if (ts.getTime() < startMs - DAY || ts.getTime() >= endMs + DAY) return;
    var stNect = String(r[6]).toLowerCase();
    if (stNect === "rejected" || stNect === "job_not_found") return;   // duplicates and unknown barcodes are not production scans
    var badgeField = String(r[3]).trim();
    if (!badgeField) return;
    var dk = ts.getTime() + "|" + String(r[2]).trim() + "|" + String(r[1]).trim().toLowerCase() + "|" + badgeField.toLowerCase();
    if (seen[dk]) return;
    seen[dk] = true;
    var sk = shiftDayKey_(ts, tz);
    if (!keySet[sk]) return;
    badgeField.split(PAIR_RE).map(function (s) { return s.trim(); }).filter(String).forEach(function (person) {
      var who = canon(person).toLowerCase();
      if (!scanned[who]) scanned[who] = {};
      scanned[who][sk] = true;
    });
  });

  // the days each person is shown here on the schedule
  var sched = getScheduleHours_(ss, startMs, endMs, now, tz, canon);
  out.week.scheduleOk = !!sched.ok;
  var worked = {};
  if (sched.ok) {
    Object.keys(sched.perDay).forEach(function (dk) {
      var parts = dk.split("|");
      if (!worked[parts[0]]) worked[parts[0]] = {};
      worked[parts[0]][parts[1]] = true;
    });
  }
  var names = {};
  Object.keys(scanned).forEach(function (w) { names[w] = true; });
  Object.keys(worked).forEach(function (w) { names[w] = true; });
  var exemptSet = {};
  (roster || []).forEach(function (p) {
    names[String(p.name).toLowerCase()] = true;
    if (p.exempt) exemptSet[String(p.name).toLowerCase()] = true;
  });
  Object.keys(names).forEach(function (who) {
    if (exemptSet[who]) { out.byPerson[who] = { status: "na", days: 0, scanned: 0, exempt: true, worked: [], missed: [] }; return; }
    var sc = scanned[who] || {};
    var days = Object.keys(worked[who] || {});
    if (!days.length) days = Object.keys(sc);          // not on the schedule: judge by the days they scanned
    var considered = days.filter(function (d) { return d < todayKey || sc[d]; });
    considered.sort();
    var missedDays = considered.filter(function (d) { return !sc[d]; });
    if (!sched.ok || !considered.length) { out.byPerson[who] = { status: "na", days: considered.length, scanned: 0, worked: considered.map(dayLabel_), missed: [] }; return; }
    out.byPerson[who] = {
      status: missedDays.length ? "no" : "yes",
      days: considered.length,
      scanned: considered.length - missedDays.length,
      worked: considered.map(dayLabel_),      // the days the schedule shows them here (so far)
      missed: missedDays.map(dayLabel_)       // ...and the ones with no scan
    };
  });
  return out;
}

/** "2026-10-13" -> "Tue 10/13" (pure calendar arithmetic, no time-zone effects). */
function dayLabel_(key) {
  var p = String(key).split("-");
  return Utilities.formatDate(new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12)), "Etc/GMT", "EEE M/d");
}

/** v27: the Target/shift in effect for a station at the moment of a scan.
 *  The latest dated change at or before the scan wins; otherwise the Points tab. */
function targetAt_(pts, key, tsMs) {
  var list = pts.rateChanges && pts.rateChanges[key];
  if (list) {
    for (var i = list.length - 1; i >= 0; i--) {
      if (list[i].at <= tsMs) return { target: list[i].target, pages: list[i].pages, jobs: list[i].jobs };
    }
  }
  return pts.targets[key];
}

/* =====================================================================
 * v28 — HR roster page (leaderboard site, roster.html)
 *
 * Lets HR add people, change shifts, set nicknames and mark leavers
 * without opening the Sheet. Every change goes through here:
 *   - writes need the passcode in Script Properties ROSTER_PASSCODE
 *     (blank/missing = editing switched off; reading still works)
 *   - one change at a time (script lock), checked before it is written
 *   - every change is appended to a "Roster Log" tab
 *   - leavers are never deleted: Shift becomes "Former employee", which keeps
 *     their nicknames joining up old scans (see v28 FORMER EMPLOYEES)
 * Names tab: A nicknames (comma-separated) | B name | C shift | D Nectar exempt
 * ===================================================================== */

var ROSTER_SHIFTS = ["Day", "Night", "Former employee"];

/** GET ?roster=1 — everyone on the Names tab, for the roster page. */
function rosterView_(ss) {
  var sh = ss.getSheetByName("Names");
  var people = [];
  if (sh && sh.getLastRow() >= 2) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues().forEach(function (r) {
      var name = String(r[1]).trim();
      if (!name) return;
      people.push({
        name: name,
        shift: String(r[2]).trim(),
        nicknames: String(r[0]).split(",").map(function (s) { return s.trim(); }).filter(String),
        nectarExempt: /^\s*(no|n|exempt)\b/i.test(String(r[3]))
      });
    });
  }
  var pass = PropertiesService.getScriptProperties().getProperty("ROSTER_PASSCODE");
  return { ok: true, app: "qmt-floor-scan", v: 31, editable: !!pass, shifts: ROSTER_SHIFTS, people: people };
}

/** POST { type:"roster", passcode, by, action, name, shift, nicknames } */
function handleRoster_(ss, data) {
  var props = PropertiesService.getScriptProperties();
  var pass = props.getProperty("ROSTER_PASSCODE");
  if (!pass) return { ok: false, error: "Roster editing is not switched on yet." };

  // Slow down passcode guessing: 10 wrong tries in 10 minutes locks editing for 10 minutes.
  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get("roster_fails") || 0);
  if (fails >= 10) return { ok: false, error: "Too many wrong passcodes. Try again in 10 minutes." };
  if (normPass_(data.passcode) !== normPass_(pass)) {
    cache.put("roster_fails", String(fails + 1), 600);
    return { ok: false, error: "Wrong passcode.", badPasscode: true };
  }
  if (data.action === "check") return { ok: true };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (err) { return { ok: false, error: "Busy, please try again." }; }
  try {
    var sh = ss.getSheetByName("Names");
    var last = sh.getLastRow();
    var rows = last >= 2 ? sh.getRange(2, 1, last - 1, 4).getValues() : [];
    var key = function (s) { return String(s || "").trim().replace(/\s+/g, " ").toLowerCase(); };
    var name = String(data.name || "").trim().replace(/\s+/g, " ");
    var by = String(data.by || "").trim().slice(0, 60) || "(not given)";
    var idx = -1;
    for (var i = 0; i < rows.length; i++) if (key(rows[i][1]) === key(name)) { idx = i; break; }

    // Who already owns a name or nickname (so two people never share one)
    var owner = {};
    rows.forEach(function (r, j) {
      if (!String(r[1]).trim()) return;
      owner[key(r[1])] = j;
      String(r[0]).split(",").forEach(function (a) { if (key(a)) owner[key(a)] = j; });
    });
    var cleanNicks = function (list, self) {
      var out = [], seen = {};
      (Array.isArray(list) ? list : String(list || "").split(",")).forEach(function (a) {
        a = String(a).trim().replace(/\s+/g, " ");
        var k = key(a);
        if (!k || seen[k] || k === key(name)) return;
        if (owner[k] !== undefined && owner[k] !== self) {
          throw new Error("“" + a + "” is already used by " + String(rows[owner[k]][1]).trim() + ".");
        }
        seen[k] = true;
        out.push(a.slice(0, 40));
      });
      return out;
    };
    var shiftOk = function (s) {
      for (var k = 0; k < ROSTER_SHIFTS.length; k++) if (key(s) === key(ROSTER_SHIFTS[k])) return ROSTER_SHIFTS[k];
      return null;
    };

    var action = String(data.action || "");
    var detail = "";
    if (action === "add") {
      if (!name || name.length > 60) return { ok: false, error: "Type the person's full name." };
      if (owner[key(name)] !== undefined) {
        return { ok: false, error: (idx >= 0 ? String(rows[idx][1]).trim() : name) + " is already on the list" +
          (idx >= 0 ? " (" + String(rows[idx][2]).trim() + ")." : " as a nickname for " + String(rows[owner[key(name)]][1]).trim() + ".") };
      }
      var sAdd = shiftOk(data.shift);
      if (!sAdd || sAdd === "Former employee") return { ok: false, error: "Pick Day or Night." };
      var nicksAdd = cleanNicks(data.nicknames, -1);
      sh.getRange(last + 1, 1, 1, 3).setValues([[nicksAdd.join(", "), name, sAdd]]);
      detail = sAdd + (nicksAdd.length ? "; nicknames: " + nicksAdd.join(", ") : "");
    } else {
      if (idx < 0) return { ok: false, error: name + " is not on the list." };
      var rowNo = idx + 2;
      var before = String(rows[idx][2]).trim();
      if (action === "shift" || action === "former" || action === "restore") {
        var s = action === "former" ? "Former employee" : shiftOk(data.shift);
        if (!s || (action === "restore" && s === "Former employee")) return { ok: false, error: "Pick Day or Night." };
        sh.getRange(rowNo, 3).setValue(s);
        if (action === "former" && !String(rows[idx][3]).trim()) sh.getRange(rowNo, 4).setValue("No");
        if (action === "restore" && /^\s*no\s*$/i.test(String(rows[idx][3]))) sh.getRange(rowNo, 4).setValue("");
        detail = before + " → " + s;
      } else if (action === "nicknames") {
        var nicks = cleanNicks(data.nicknames, idx);
        sh.getRange(rowNo, 1).setValue(nicks.join(", "));
        detail = "“" + String(rows[idx][0]).trim() + "” → “" + nicks.join(", ") + "”";
      } else {
        return { ok: false, error: "Unknown change." };
      }
    }

    var log = ss.getSheetByName("Roster Log");
    if (!log) {
      log = ss.insertSheet("Roster Log");
      log.getRange("A1:E1").setValues([["When", "Changed by", "Change", "Employee", "Details"]]).setFontWeight("bold");
      log.setFrozenRows(1);
    }
    var label = { add: "Added", shift: "Shift changed", former: "Marked former employee", restore: "Brought back", nicknames: "Nicknames changed" }[action];
    log.appendRow([new Date(), by, label, name, detail]);
    bumpScansRev_();   // the board and the phones read the roster
    var view = rosterView_(ss);
    view.done = label + ": " + name;
    return view;
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  } finally {
    lock.releaseLock();
  }
}

function normPass_(s) {
  return String(s || "").toLowerCase().replace(/[\s‘’“”'"`.,\-_]/g, "");
}

/* =====================================================================
 * v29 — Feedback from the floor (bugs and ideas)
 *
 * Anyone can submit (no passcode: the floor is the point). Reviewing needs
 * Script Property FEEDBACK_PASSCODE. One "Feedback" tab:
 *   A Id | B When | C App | D Version | E Kind | F From | G Message | H Station
 *   | I Job | J Device | K Status | L Decided by | M Decided | N Note
 * ===================================================================== */

var FEEDBACK_STATUSES = ["New", "Approved", "Declined", "Done"];
var FEEDBACK_HEADER = ["Id", "When", "App", "Version", "Kind", "From", "Message", "Station", "Job", "Device", "Status", "Decided by", "Decided", "Note"];

function feedbackSheet_(ss) {
  var sh = ss.getSheetByName("Feedback");
  if (!sh) {
    sh = ss.insertSheet("Feedback");
    sh.getRange(1, 1, 1, FEEDBACK_HEADER.length).setValues([FEEDBACK_HEADER]).setFontWeight("bold");
    sh.setFrozenRows(1);
    sh.getRange("P1").setValue("Reports from the Report a problem or idea button in the scan app and on the leaderboard. Review them on the leaderboard site's feedback.html (needs the FEEDBACK_PASSCODE script property). Status: New, Approved, Declined, Done.");
  }
  return sh;
}

function fbClean_(v, max) { return String(v === null || v === undefined ? "" : v).replace(/\s+/g, " ").trim().slice(0, max); }

/** POST { type:"feedback", app, version, kind, message, from, station, job, device } */
function handleFeedback_(ss, data) {
  var message = String(data.message || "").trim().slice(0, 1000);
  if (message.length < 3) return { ok: false, error: "Please describe the problem or idea." };
  var kind = /bug|problem|error/i.test(String(data.kind || "")) ? "Bug" : "Idea";
  var sh = feedbackSheet_(ss);
  var id = "F" + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 1296).toString(36).toUpperCase();
  sh.appendRow([id, new Date(), fbClean_(data.app, 30) || "unknown", fbClean_(data.version, 20), kind,
    fbClean_(data.from, 60), message, fbClean_(data.station, 60), fbClean_(data.job, 40), fbClean_(data.device, 120),
    "New", "", "", ""]);
  bumpScansRev_();   // v30: the board's open-report count changes
  return { ok: true, id: id, v: 31 };
}

function feedbackAuth_(data) {
  var pass = PropertiesService.getScriptProperties().getProperty("FEEDBACK_PASSCODE");
  if (!pass) return { ok: false, error: "Reviewing is not switched on yet (no FEEDBACK_PASSCODE)." };
  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get("fb_fails") || 0);
  if (fails >= 10) return { ok: false, error: "Too many wrong passcodes. Try again in 10 minutes." };
  if (normPass_(data.passcode) !== normPass_(pass)) {
    cache.put("fb_fails", String(fails + 1), 600);
    return { ok: false, error: "Wrong passcode.", badPasscode: true };
  }
  return { ok: true };
}

/** POST { type:"feedback_list", passcode } — every report, newest first. */
function feedbackList_(ss, data) {
  var auth = feedbackAuth_(data);
  if (!auth.ok) return auth;
  var sh = feedbackSheet_(ss);
  var tz = ss.getSpreadsheetTimeZone() || "America/New_York";
  var items = [];
  if (sh.getLastRow() >= 2) {
    sh.getRange(2, 1, sh.getLastRow() - 1, FEEDBACK_HEADER.length).getValues().forEach(function (r) {
      if (!String(r[0]).trim()) return;
      var when = r[1] instanceof Date ? r[1] : new Date(r[1]);
      var decided = r[12] instanceof Date ? r[12] : (r[12] ? new Date(r[12]) : null);
      items.push({
        id: String(r[0]).trim(), whenMs: isNaN(when.getTime()) ? 0 : when.getTime(),
        when: isNaN(when.getTime()) ? "" : Utilities.formatDate(when, tz, "EEE M/d h:mm a"),
        app: String(r[2]), version: String(r[3]), kind: String(r[4]), from: String(r[5]), message: String(r[6]),
        station: String(r[7]), job: String(r[8]), device: String(r[9]),
        status: String(r[10]).trim() || "New", decidedBy: String(r[11]),
        decided: decided && !isNaN(decided.getTime()) ? Utilities.formatDate(decided, tz, "EEE M/d h:mm a") : "",
        note: String(r[13])
      });
    });
  }
  items.sort(function (a, b) { return b.whenMs - a.whenMs; });
  return { ok: true, v: 31, statuses: FEEDBACK_STATUSES, items: items };
}

/** POST { type:"feedback_decide", passcode, by, id, status, note } */
function handleFeedbackDecide_(ss, data) {
  var auth = feedbackAuth_(data);
  if (!auth.ok) return auth;
  var status = null;
  FEEDBACK_STATUSES.forEach(function (st) { if (String(data.status || "").trim().toLowerCase() === st.toLowerCase()) status = st; });
  if (!status) return { ok: false, error: "Pick Approved, Declined, Done or New." };
  var id = String(data.id || "").trim();
  var by = fbClean_(data.by, 60) || "(not given)";
  var note = String(data.note || "").trim().slice(0, 500);
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (err) { return { ok: false, error: "Busy, please try again." }; }
  try {
    var sh = feedbackSheet_(ss);
    var last = sh.getLastRow();
    var ids = last >= 2 ? sh.getRange(2, 1, last - 1, 1).getValues() : [];
    var row = -1;
    for (var i = 0; i < ids.length; i++) if (String(ids[i][0]).trim() === id) { row = i + 2; break; }
    if (row < 0) return { ok: false, error: "That report is no longer in the list." };
    sh.getRange(row, 11, 1, 4).setValues([[status, status === "New" ? "" : by, status === "New" ? "" : new Date(), note]]);
    bumpScansRev_();   // v30: the board's open-report count changes
  } finally {
    lock.releaseLock();
  }
  var list = feedbackList_(ss, data);
  list.done = status + ": " + id;
  return list;
}


/** v30: Feedback rows still open (New or Approved). 0 if the tab doesn't exist yet. */
function feedbackOpenCount_(ss) {
  try {
    var sh = ss.getSheetByName("Feedback");
    if (!sh || sh.getLastRow() < 2) return 0;
    var n = 0;
    sh.getRange(2, 11, sh.getLastRow() - 1, 1).getValues().forEach(function (r) {
      var st = String(r[0]).trim().toLowerCase();
      if (st === "" || st === "new" || st === "approved") n++;
    });
    return n;
  } catch (e) { return null; }
}


/** v31: Admin work types in the APPROVAL category — sign-offs a floor scan can
 *  never attest to, so Config column B may not point at them. */
var APPROVAL_WTYPES_ = [1001, 1008, 1015, 1036, 1068, 1069, 1071, 1072, 1073, 1076];

/** v31: the racetrack work type (wtype_id) Config column B gives this station,
 *  or null to leave the mapping to Admin. Read once per execution. */
var STATION_WTYPES_ = null;
function stationWtype_(station) {
  if (STATION_WTYPES_ === null) {
    STATION_WTYPES_ = {};
    try {
      var config = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Config");
      if (config && config.getLastRow() >= 2) {
        config.getRange(2, 1, config.getLastRow() - 1, 2).getValues().forEach(function (r) {
          var name = String(r[0]).trim().toLowerCase();
          var m = String(r[1]).match(/\d{4}/);
          if (!name || !m) return;
          var id = Number(m[0]);
          if (APPROVAL_WTYPES_.indexOf(id) === -1) STATION_WTYPES_[name] = id;
        });
      }
    } catch (e) {}
  }
  return STATION_WTYPES_[String(station).trim().toLowerCase()] || null;
}
