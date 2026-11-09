/**
 * QMT Floor Scan — import Admin-screen scans into the Sheet (11/2026).
 *
 * The floor also scans jobs through Admin's own mobile pages
 * (production/MobileMain.asp -> YearbookScanner.asp / MobileCheckBatch.asp).
 * Those scans update the racetrack directly but never reached this Sheet,
 * so the leaderboard missed them. Admin now exposes a read-only feed of
 * those completions:
 *
 *   GET <MIS_BASE_URL>?type=recent_scans&since_id=<cursor>
 *   -> { ok, last_id, count, scans: [ { id, ts, job_id, wtype_id,
 *        wtype_name, operator, quantity } ] }
 *
 * This file is ADDITIVE: paste it into the bound script project as a new
 * file (or below Code.gs) — it changes nothing in the existing code.
 * Scans made through the phone app itself are NOT in the feed (Admin
 * filters them out), so nothing is double-counted.
 *
 * Setup (one time):
 *   1. Paste this file. It reuses the existing MIS_BASE_URL and
 *      MIS_API_KEY Script Properties — nothing new to configure.
 *   2. Run setupAdminImportTrigger once (authorize if asked). It creates
 *      a 5-minute time trigger for the importer and initializes the
 *      cursor "from now" (no historical backfill).
 *   3. New rows appear on the Scans tab with MIS Status "admin" so you
 *      can tell them from app scans. The leaderboard counts them (it
 *      only skips "rejected"); the reconciliation sweep ignores them.
 *
 * Station names: the importer maps the feed's wtype_id to the station
 * name in the Config tab (column A = station, column B = wtype_id — the
 * v31 layout). If a wtype_id isn't in Config, the row uses Admin's
 * work-type name (e.g. "B - 3 Knife Cut") so nothing is lost; add the
 * station + wtype_id to Config to control the display name and points.
 *
 * Employee names: Admin-screen scans carry the operator's Admin login
 * (e.g. DCARRY) or a typed name. Add rows to the Names tab (Badge ->
 * Name) for the logins you want prettified on the leaderboard.
 */

var ADMIN_IMPORT_CURSOR_PROP = "MIS_IMPORT_LAST_ID";

/** One-time setup: initialize the cursor to "now" and add the trigger. */
function setupAdminImportTrigger() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty(ADMIN_IMPORT_CURSOR_PROP)) {
    var first = fetchAdminScans_(0); // since_id 0 = no rows, just the tip
    props.setProperty(ADMIN_IMPORT_CURSOR_PROP, String(first.last_id || 0));
  }
  var exists = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === "importAdminScans";
  });
  if (!exists) {
    ScriptApp.newTrigger("importAdminScans").timeBased().everyMinutes(5).create();
  }
}

/**
 * The trigger target: pull every new Admin-screen completion into Scans.
 * Public (no trailing underscore) so the trigger UI and the editor's Run
 * dropdown can both see it - run it by hand for an immediate import.
 */
function importAdminScans() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30 * 1000)) return; // a previous run is still going
  try {
    var props = PropertiesService.getScriptProperties();
    var cursor = Number(props.getProperty(ADMIN_IMPORT_CURSOR_PROP)) || 0;
    if (!cursor) { setupAdminImportTrigger(); return; }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var scansSheet = ss.getSheetByName("Scans");
    var stationByWtype = configStationsByWtype_(ss);

    // Page through the feed; 500 rows per call, loop until drained.
    for (var page = 0; page < 10; page++) {
      var feed = fetchAdminScans_(cursor);
      if (!feed.ok) throw new Error("recent_scans feed error: " + JSON.stringify(feed));
      if (feed.scans && feed.scans.length) {
        var rows = feed.scans.map(function (s) {
          var station = stationByWtype[String(s.wtype_id)] ||
                        String(s.wtype_name || "").trim() || ("wtype " + s.wtype_id);
          var ts = new Date(s.ts);
          if (isNaN(ts.getTime())) ts = new Date();
          return [ts, station, String(s.job_id), String(s.operator || "").trim(),
                  Number(s.quantity) || 0, "", "admin", ""];
        });
        scansSheet.getRange(scansSheet.getLastRow() + 1, 1, rows.length, 8).setValues(rows);
      }
      cursor = Number(feed.last_id) || cursor;
      props.setProperty(ADMIN_IMPORT_CURSOR_PROP, String(cursor));
      if (!feed.scans || feed.scans.length < 500) break; // drained
    }
  } finally {
    lock.releaseLock();
  }
}

/** One feed call. since_id 0 initializes: no rows, last_id = newest. */
function fetchAdminScans_(sinceId) {
  var props = PropertiesService.getScriptProperties();
  var base = props.getProperty("MIS_BASE_URL");
  var key = props.getProperty("MIS_API_KEY");
  if (!base || !key) throw new Error("MIS_BASE_URL / MIS_API_KEY Script Properties are not set");
  var url = base + (base.indexOf("?") >= 0 ? "&" : "?") +
            "type=recent_scans&since_id=" + encodeURIComponent(sinceId);
  var resp = UrlFetchApp.fetch(url, {
    method: "get",
    headers: { "X-Api-Key": key },
    muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200) {
    throw new Error("recent_scans HTTP " + resp.getResponseCode() + ": " +
                    resp.getContentText().slice(0, 300));
  }
  return JSON.parse(resp.getContentText());
}

/** Config tab -> { "<wtype_id>": "<station name>" } (col A name, col B wtype_id). */
function configStationsByWtype_(ss) {
  var map = {};
  var sheet = ss.getSheetByName("Config");
  if (!sheet) return map;
  var last = sheet.getLastRow();
  if (last < 2) return map;
  var rows = sheet.getRange(2, 1, last - 1, 2).getValues();
  rows.forEach(function (r) {
    var name = String(r[0] || "").trim();
    var wtype = String(r[1] || "").trim();
    if (name && wtype && !isNaN(Number(wtype))) map[String(Number(wtype))] = name;
  });
  return map;
}
