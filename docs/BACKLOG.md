# Backlog (as of Oct 19 2026)

## Done in v28 (LIVE since Oct 21 2026, 3:09 pm; deployment version @30): board performance
All four items from the plan, verified with `node test/regression.js` (every board identical
to v27 on a 4,000-row fixture; see the commit for the measured read counts):
1. `readScanBlock_` reads column A alone, finds the first and last row inside the needed range
   (board window ∪ team-goal week ∪ Nectar week ± 1 day), then reads only that block. No
   ordering assumption: out-of-order rows just widen the block, and every caller still filters
   each row against its own window as before.
2. Finished board JSON cached 60 s in `CacheService`, keyed by (scans revision, week, period,
   from, to). `doPost` and improvement credits bump the revision, so a scan shows on the very
   next request.
3. `scheduleConfig_` / `openSchedule_` memoize Points E7/E8/E9 and the schedule workbook for
   the request (Apps Script executions are isolated, so a script-level memo is per request).
4. `ensureTabs_(light=true)` on `?board=1` / `?scans=1` skips seeding and the Points sync once
   the tabs exist. `housekeeping_()` exists for an hourly trigger (add it at deploy time).
Also: `reconcilePending_` now retries only the last `RECONCILE_DAYS` (7) days and stops after
~4.5 min. **Still to confirm at deploy: does the 15-minute trigger exist?** If it does, it has
been timing out every run (11,700 HTTP calls cannot finish inside 6 minutes).

## Deploy v28 — done 2026-10-21
Deployed by Claude with clasp signed in as **ed@entourageyearbooks.com** (an editor). Nobody had the
qmt-floorscan@ password. The live script was pulled first and matched main's v27 byte for byte.
- @29 15:09: v28 as built. Board numbers matched v27; Robert off; scans after 15:09 still reached Admin.
- @30 15:12: cache fix. Scans no longer clear the board cache (they arrived every few seconds, so the
  cache never hit: ~17 s per request). Now 45 s TTL: ~2 s per request; a full rebuild is still ~15 s.
- Script ID 17CgpK4yEsu_aBL0coYc_sw100OLoTZKcmmAm6JIEVyVfFqQz5YJy272_; live deployment
  AKfycbzfENik… Deploying as ed@ means the web app may now run as ed@ (it is "execute as the user
  deploying"). Admin calls and Sheet writes both work. If ed@ is ever locked, scanning stops until
  someone redeploys.
Still to do by hand:
- `clasp push`, `clasp deploy -i <deploymentId> -d "v28: fast board"`, confirm `"v": 28`.
- Add the hourly `housekeeping_` trigger (Triggers → Add → housekeeping_ → Time-driven → Hour timer).
- Turn on HR roster editing: Apps Script editor → Project Settings → Script properties → add
  `ROSTER_PASSCODE` (Ed picks it and gives it to Vickie directly; never in this repo or a chat).
  Then open https://jade-dango-20f096.netlify.app/roster.html — the "View only" note disappears.
- Watch the TV for one shift: `page v12 · script v28`, numbers unchanged from v27.

## v29 (LIVE 2026-10-21 ~4:50 pm, deployment @31) + leaderboard page v18: feedback from the floor
"Report a problem or idea" button on the leaderboard (live) and in scan app v23 (draft, with the
battery changes). Reports land in the Feedback tab; Ed reviews at
https://jade-dango-20f096.netlify.app/feedback.html. **To switch reviewing on:** Script property
`FEEDBACK_PASSCODE` (same place as ROSTER_PASSCODE). Tests: `node test/feedback.js`.
One labelled test report was sent during setup; mark it Done.

## Open findings from the Oct 19 review (not fixed in v28)
- **Idempotency key drift.** `reconcilePending_` rebuilds `scan_id` from the Date stored in the
  sheet (`toISOString()`), but the original key was built from the phone's `ts` string. If
  Sheets drops milliseconds or the phone sent a non-UTC string, the retry carries a *different*
  scan_id and Admin cannot recognise it as a replay. Harmless while Admin answers not_at_step;
  matters once auto-complete goes live. Fix: store the original `ts` string (new column I) or
  derive the key from a normalised timestamp on both paths.
- **Poison row in the phone queue.** `flushQueue` stops at the first failing row forever, so one
  scan the server rejects with `ok:false` blocks every scan queued behind it on that phone.
  Fix: after N failures move the row to a "dead" list and show it in the gear menu.
- **Anyone with the script URL can post.** The web app is `ANYONE_ANONYMOUS` and the URL is in
  the public HTML. In particular `type=improvement` accepts any name and up to 720 minutes of
  credit with no secret. Acceptable for a floor board; not for payouts. Fix: a shared token in
  Script Properties checked on improvement posts (the 2-Minute app would send it).
- `getNamesMap_` keys on the whole aliases cell ("victor r, victor") so it rarely matches;
  `names[k]` in `buildLeaderboard_` is effectively dead. Harmless; remove when convenient.
- Nectar uses the 4 AM shift day for "today" but `getScheduleHours_` uses the calendar day;
  between midnight and 4 AM the two disagree about whether today counts. Cosmetic.

## Leaderboard / Nectar
- Department Top-3 bonus layer (draft notice exists): needs department assignment by
  majority-of-week, a 3-days-worked minimum, and a Thursday winners list.
- Names col D exemptions still to be filled (managers, office, sample kit).
- Weekly winners sheet is produced by hand from the data; could be generated.

## Admin MIS (Freedom)
- Auto-complete earlier racetrack steps (spec PDF in docs/).
- Map unmapped stations; check job_not_found barcodes against Gelato jobs.

## Scan app
- v21 is live (PUR 280/470 — BACKLOG previously said it was reverted; it was not).
- **v22 (battery) built 2026-10-21 on branch `scan-app-v22-battery`, draft-deployed, NOT live.**
  Camera released 30 s after leaving the scan screen (was paused-but-open for 120 s), released
  at once on visibilitychange/pagehide, capture 1280x720 @ 10 fps (was 1080p @ 15). Needs a
  floor phone test on the draft URL (see commit) before `netlify deploy --prod --dir scan-app
  --site a0dce97c-c9d4-4a0c-8ad5-c23c4d1cdf27`. Watch for: reopen delay after a pause, any
  barcode that no longer reads at 720p (then try 1280x960 or go back to 1080p but keep the release
  changes — the release changes are the bigger battery win).
- Unknown stations fall into an "Other" tab — consider reading groups from the Sheet.

## Decisions log
- Oct 6: E3 workdays = 4; hours-based proration from the Public Schedule.
- Oct 8: scan special = 25 pts prorated by days worked ÷ days scheduled; HR-excused days exempt.
- Oct 14: daily cap 150%; Coiling Machine 8,080 typo corrected to 80.
- Oct 15: Single Knife 3000, Corner Cutter 3500, Hole/Renz Puncher 1500, Coiling 750,
  C-Print 130000 pages, PUR 1600 (PUR split reverted). Pre-press stays page-based.
- Oct 15: rate changes become dated/non-retroactive (v27), today's rates as the starting point.
