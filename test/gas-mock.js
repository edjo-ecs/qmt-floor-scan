/* Minimal Google Apps Script environment for running Code.gs under Node.
   Enough of SpreadsheetApp / Utilities / CacheService / LockService /
   PropertiesService / UrlFetchApp / ContentService for the board, the scan
   endpoint and the reconcile sweep. Counts what the script reads so the
   v28 performance work can be measured, not guessed. */
"use strict";
const crypto = require("crypto");

/* ---------- Date pinned to one instant ---------- */
function pinDate(fixedMs) {
  const RealDate = global.__RealDate || Date;
  global.__RealDate = RealDate;
  class FixedDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(fixedMs); else super(...a); }
    static now() { return fixedMs; }
  }
  global.Date = FixedDate;
  return FixedDate;
}

/* ---------- Utilities.formatDate with Java-ish patterns ---------- */
const partsCache = new Map();
function dateParts(date, tz) {
  const key = tz + "|" + date.getTime();
  let p = partsCache.get(key);
  if (p) return p;
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", second: "numeric", weekday: "short"
  });
  const o = {};
  f.formatToParts(date).forEach(x => { o[x.type] = x.value; });
  p = {
    y: Number(o.year), M: Number(o.month), d: Number(o.day),
    H: Number(o.hour) % 24, m: Number(o.minute), s: Number(o.second),
    E: o.weekday
  };
  partsCache.set(key, p);
  return p;
}
const ISO_DOW = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
function formatDate(date, tz, pattern) {
  if (!(date instanceof global.__RealDate) || isNaN(date.getTime())) throw new Error("formatDate: bad date");
  const p = dateParts(date, tz);
  const pad = (n, w) => String(n).padStart(w, "0");
  let out = "", i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (!/[A-Za-z]/.test(ch)) { out += ch; i++; continue; }
    let j = i; while (j < pattern.length && pattern[j] === ch) j++;
    const n = j - i;
    switch (ch) {
      case "y": out += n >= 4 ? pad(p.y, 4) : String(p.y).slice(-2); break;
      case "M": out += n >= 2 ? pad(p.M, 2) : String(p.M); break;
      case "d": out += n >= 2 ? pad(p.d, 2) : String(p.d); break;
      case "H": out += n >= 2 ? pad(p.H, 2) : String(p.H); break;
      case "h": { const h12 = (p.H % 12) || 12; out += n >= 2 ? pad(h12, 2) : String(h12); break; }
      case "m": out += n >= 2 ? pad(p.m, 2) : String(p.m); break;
      case "s": out += n >= 2 ? pad(p.s, 2) : String(p.s); break;
      case "a": out += p.H < 12 ? "AM" : "PM"; break;
      case "E": out += p.E; break;
      case "u": out += String(ISO_DOW[p.E]); break;
      default: throw new Error("formatDate: unsupported pattern letter " + ch);
    }
    i = j;
  }
  return out;
}

/* ---------- Spreadsheet mock ---------- */
function colToIndex(letters) {
  let n = 0;
  for (const c of letters) n = n * 26 + (c.charCodeAt(0) - 64);
  return n;
}
function parseA1(a1) {
  const m = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(a1);
  if (!m) throw new Error("A1 not supported: " + a1);
  const c1 = colToIndex(m[1]), r1 = Number(m[2]);
  const c2 = m[3] ? colToIndex(m[3]) : c1, r2 = m[4] ? Number(m[4]) : r1;
  return { r: r1, c: c1, nr: r2 - r1 + 1, nc: c2 - c1 + 1 };
}

class Range {
  constructor(sheet, r, c, nr, nc) { Object.assign(this, { sheet, r, c, nr, nc }); }
  _grid(fn) {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = [];
      for (let j = 0; j < this.nc; j++) row.push(fn(this.r - 1 + i, this.c - 1 + j));
      out.push(row);
    }
    return out;
  }
  _count(kind) { this.sheet.book.stats.count(this.sheet.name, kind, this.nr * this.nc); }
  getValues() {
    this._count("values");
    return this._grid((i, j) => {
      const v = this.sheet.data[i] && this.sheet.data[i][j];
      return v === undefined || v === null ? "" : v;
    });
  }
  getDisplayValues() {
    this._count("display");
    return this._grid((i, j) => {
      const v = this.sheet.data[i] && this.sheet.data[i][j];
      if (v === undefined || v === null) return "";
      if (v instanceof global.__RealDate) return formatDate(v, this.sheet.book.tz, "M/d/yyyy H:mm:ss");
      return String(v);
    });
  }
  getBackgrounds() {
    this._count("backgrounds");
    return this._grid((i, j) => (this.sheet.bg[i] && this.sheet.bg[i][j]) || "#ffffff");
  }
  getValue() { return this.getValues()[0][0]; }
  setValues(vals) {
    for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sheet._set(this.r - 1 + i, this.c - 1 + j, vals[i][j]);
    return this;
  }
  setValue(v) { this.sheet._set(this.r - 1, this.c - 1, v); return this; }
  setFontWeight() { return this; }
  setNumberFormat() { return this; }
  setBackground(hex) { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sheet._setBg(this.r - 1 + i, this.c - 1 + j, hex); return this; }
}

class Sheet {
  constructor(book, name, id) { this.book = book; this.name = name; this.id = id; this.data = []; this.bg = []; }
  _set(i, j, v) { while (this.data.length <= i) this.data.push([]); this.data[i][j] = v; }
  _setBg(i, j, hex) { while (this.bg.length <= i) this.bg.push([]); this.bg[i][j] = hex; }
  getName() { return this.name; }
  getSheetId() { return this.id; }
  getLastRow() {
    for (let i = this.data.length - 1; i >= 0; i--) {
      if ((this.data[i] || []).some(v => v !== undefined && v !== null && v !== "")) return i + 1;
    }
    return 0;
  }
  getRange(a, b, c, d) {
    if (typeof a === "string") { const p = parseA1(a); return new Range(this, p.r, p.c, p.nr, p.nc); }
    return new Range(this, a, b, c === undefined ? 1 : c, d === undefined ? 1 : d);
  }
  appendRow(vals) { const i = this.getLastRow(); vals.forEach((v, j) => this._set(i, j, v)); this.book.stats.appends++; return this; }
  deleteRow(r) { this.data.splice(r - 1, 1); this.bg.splice(r - 1, 1); return this; }
  setFrozenRows() { return this; }
  clear() { this.data = []; this.bg = []; return this; }
}

class Stats {
  constructor() { this.reset(); }
  reset() { this.cells = {}; this.ranges = {}; this.opens = 0; this.fetches = 0; this.appends = 0; this.cacheHits = 0; this.cacheMisses = 0; }
  count(sheet, kind, n) {
    this.cells[sheet] = (this.cells[sheet] || 0) + n;
    this.ranges[sheet] = (this.ranges[sheet] || 0) + 1;
  }
}

class Book {
  constructor(id, tz, stats) { this.id = id; this.tz = tz; this.sheets = []; this.stats = stats; this._nextId = 1; }
  getId() { return this.id; }
  getSpreadsheetTimeZone() { return this.tz; }
  getSheets() { return this.sheets.slice(); }
  getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
  insertSheet(n) { const s = new Sheet(this, n, this._nextId++); this.sheets.push(s); return s; }
}

/* ---------- the environment ---------- */
function makeEnv({ active, books, props, misResponse }) {
  const stats = active.stats;
  const cacheStore = new Map();
  const cache = {
    get(k) { const v = cacheStore.get(k); if (v === undefined) { stats.cacheMisses++; return null; } stats.cacheHits++; return v; },
    put(k, v) { cacheStore.set(k, String(v)); },
    remove(k) { cacheStore.delete(k); },
    _clear() { cacheStore.clear(); }
  };
  const env = {
    SpreadsheetApp: {
      getActiveSpreadsheet() { return active; },
      openById(id) { stats.opens++; const b = books[id]; if (!b) throw new Error("no such file " + id); return b; },
      flush() {}
    },
    Utilities: {
      formatDate,
      computeDigest(alg, s) { return Array.from(crypto.createHash("md5").update(String(s), "utf8").digest()); },
      base64Encode(bytes) { return Buffer.from(bytes).toString("base64"); },
      DigestAlgorithm: { MD5: "MD5" }
    },
    CacheService: { getScriptCache() { return cache; } },
    LockService: { getScriptLock() { return { waitLock() {}, releaseLock() {} }; } },
    PropertiesService: { getScriptProperties() { return { getProperty(k) { return props[k] === undefined ? null : props[k]; } }; } },
    UrlFetchApp: {
      fetch(url, opts) {
        stats.fetches++;
        const body = misResponse ? misResponse(JSON.parse(opts.payload)) : { ok: true, valid: true, mis_status: "not_at_step", reason: "Job is not at this step on the racetrack yet" };
        return { getResponseCode() { return 200; }, getContentText() { return JSON.stringify(body); } };
      }
    },
    ContentService: {
      createTextOutput(text) { return { text, setMimeType() { return this; }, getContent() { return text; } }; },
      MimeType: { JSON: "application/json" }
    },
    Session: { getEffectiveUser() { return { getEmail() { return "test@example.com"; } }; } },
    MailApp: { sendEmail() {} },
    _cache: cache
  };
  return env;
}

/* Load a Code.gs source into a fresh scope (one load = one Apps Script execution). */
function load(code, env) {
  const names = ["SpreadsheetApp", "Utilities", "CacheService", "LockService", "PropertiesService", "UrlFetchApp", "ContentService", "Session", "MailApp"];
  const fn = new Function(...names, code +
    "\nreturn { doGet: doGet, doPost: doPost, reconcilePending_: reconcilePending_, buildLeaderboard_: buildLeaderboard_, ensureTabs_: ensureTabs_ };");
  return fn(...names.map(n => env[n]));
}

module.exports = { pinDate, formatDate, Book, Sheet, Stats, makeEnv, load };
