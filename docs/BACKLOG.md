# Backlog (as of Oct 19 2026)

## Next: v28 performance (board loads too slowly)
Per request today the script reads all ~26k Scans rows, opens the schedule workbook twice,
and runs tab-seeding housekeeping. Plan, in payoff order:
1. Read only the Scans rows inside the viewed window (rows are appended in time order: find the
   first row ≥ window start by reading col A, or binary search; fall back to a full read if order breaks).
2. Cache the finished `buildLeaderboard_` JSON in `CacheService` for 60 s keyed by
   (week, period, from, to); invalidate on doPost is optional.
3. Open the Public Schedule once per request; pass the parsed hours/perDay into `computeNectar_`
   instead of calling `getScheduleHours_` again (note: the Nectar week differs from the board week,
   so pass the book handle / cached tab parses, not just the result).
4. Skip `seedRoster_/seedAliases_/syncPointsWithConfig_` on `?board=1` requests; run them on
   doPost and on an hourly trigger.
Also: `reconcilePending_` should only retry rows from the last 7 days (it currently retries
~11,700 old not_at_step rows every 15 min). Confirm whether its trigger exists.

## Leaderboard / Nectar
- Department Top-3 bonus layer (draft notice exists): needs department assignment by
  majority-of-week, a 3-days-worked minimum, and a Thursday winners list.
- Names col D exemptions still to be filled (managers, office, sample kit).
- Weekly winners sheet is produced by hand from the data; could be generated.

## Admin MIS (Freedom)
- Auto-complete earlier racetrack steps (spec PDF in docs/).
- Map unmapped stations; check job_not_found barcodes against Gelato jobs.

## Scan app
- v20 is live. A v21 (PUR 280/470) was built and reverted; not deployed.
- Unknown stations fall into an "Other" tab — consider reading groups from the Sheet.

## Decisions log
- Oct 6: E3 workdays = 4; hours-based proration from the Public Schedule.
- Oct 8: scan special = 25 pts prorated by days worked ÷ days scheduled; HR-excused days exempt.
- Oct 14: daily cap 150%; Coiling Machine 8,080 typo corrected to 80.
- Oct 15: Single Knife 3000, Corner Cutter 3500, Hole/Renz Puncher 1500, Coiling 750,
  C-Print 130000 pages, PUR 1600 (PUR split reverted). Pre-press stays page-based.
- Oct 15: rate changes become dated/non-retroactive (v27), today's rates as the starting point.
