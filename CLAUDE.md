# Working in this repo (for Claude Code)

## What this is
A production system used every shift by ~40 people on a book-manufacturing floor. Mistakes
show up on a TV within a minute. Read `docs/ARCHITECTURE.md` before changing logic.

## Layout
- `scan-app/index.html` — single-file PWA. The html5-qrcode library is **inlined** near the
  top (~375 KB minified); the app's own code is the LAST `<script>` block. Never edit the library.
- `leaderboard/index.html` — single-file page. Fetches `<script-url>?board=1&week=N&period=...`.
- `apps-script/Code.gs` — the backend. Pure Apps Script (ES5-style, `var`, no imports).
  `appsscript.json` is the manifest.
- `docs/` — architecture, deploy steps, backlog, specs for the MIS contractor.

## Conventions
- Version stamps: bump `vNN` in `scan-app` header `<small>`, `"page vNN"` in the leaderboard
  `render()`, and every `v: NN` in `Code.gs` (also the header comment). One number per piece.
- Each `Code.gs` version adds a dated "NEW IN vNN" block at the top of the file comment and
  leaves earlier blocks in place.
- Keep `Code.gs` backwards compatible with the live page and vice versa: the page gates new
  columns on `data.v >= N`, and the script tolerates sheets missing new tabs/cells
  (`ensureTabs_` seeds them on first run).
- Settings the plant changes often are **cells in the Sheet**, not constants:
  Points E1/E3/E4/E5/E7/E8/E9/E10, the Rate Changes tab, Names col D. Add new knobs the same way.
- Timestamps in the Scans tab are sheet-local (America/New_York). The Public Schedule file is
  in GMT; read its dates as DISPLAYED text (`getDisplayValues`) — a timezone bug here already
  shifted every schedule day once (v22–v25). A "shift day" runs 4 AM to 4 AM.
- Names: `canon()` folds typed names through the Names-tab aliases; always run names through it.

## Testing without Google
`test/` holds that harness: `gas-mock.js` (SpreadsheetApp, Utilities.formatDate via Intl with
the tz honoured, CacheService, LockService, UrlFetchApp, a pinned `Date`), `fixture.js` (a
4,000-row Scans tab, Points/Names/Rate Changes/Manual Credits, and a GMT schedule workbook with
colored cells), and `regression.js`, which runs HEAD's `Code.gs` and the working copy against the
same fixture and fails if any board differs. **Run `node test/regression.js` before every
`Code.gs` change lands**; when a change is *meant* to alter numbers, say which scenario and why in
the commit. Export the real Scans and schedule tabs via the Sheets API when you need a realistic
fixture for a specific bug.
Syntax-check every edit: `node -e "new Function(require('fs').readFileSync('apps-script/Code.gs','utf8'))"`.

## Deploying
See `docs/DEPLOY.md`. Netlify auto-deploys `main`; pull requests get preview URLs — test the
preview on a phone, then merge. Apps Script: `clasp push` then `clasp deploy -i <deploymentId>`
(new VERSION of the existing deployment, never a new deployment).

## Do not
- Don't rename a station in the Sheet without checking Admin MIS mapping (Freedom owns it) —
  Admin matches stations by name and unmapped stations stop marking the racetrack.
- Don't edit the Points tab's Target/shift column to change a rate (it rewrites history);
  add a row to Rate Changes.
- Don't replay old `not_at_step` scans into Admin.
- Don't put the MIS API key anywhere in this repo; it lives in Script Properties.
