# Architecture

```
phone (scan-app)  --POST scan-->  Apps Script doPost  --POST-->  Admin MIS QmtFloorScan.asp
                                       |   (marks racetrack step; rejects duplicates)
                                       v
                              Google Sheet "New QMT Floor Productivity"
                                 Scans | Config | Points | Names | Manual Credits | Rate Changes | Hours Check
                                       ^
TV / phones (leaderboard)  --GET ?board=1-->  Apps Script doGet -> buildLeaderboard_()
                                       |
                                       +--reads--> "2026 Public Schedule" (Oliver's file, GMT)
2-Minute Improvement app  --POST type=improvement-->  doPost -> Manual Credits row
HR (roster.html)          --POST type=roster-->       doPost -> Names tab + Roster Log   [ROSTER_PASSCODE]
Anyone (Report button)    --POST type=feedback-->     doPost -> Feedback tab
Ed (feedback.html)        --POST type=feedback_list / feedback_decide-->  Feedback tab   [FEEDBACK_PASSCODE]
```

Sheet file id: `12VS_aKKpQ4VVvAanjwSHqsFRTbE8vWL9rFparh-NKws`
Public Schedule id: `1iOIXG8D5t9rRc53vhNJ8UasF1o4kTTmtqlYRwe43PQs` (also Points E8)
Script web-app URL: `https://script.google.com/macros/s/AKfycbzfENikUcV-2mjQeTDqovKEsX4ihj2WpgZTKB6L_HLxnHyUefxT-fPXw_AYNivnhZRbOg/exec`

## Sheet tabs
- **Scans**: Timestamp | Station | Job Barcode | Employee | Qty | Pages | MIS Status | Reject Reason.
  One row per scan attempt, rejected ones included (they score zero). ~26k rows as of Oct 2026.
  MIS Status values: ok, pending, not_at_step, unmapped, rejected, job_not_found.
- **Config**: station list the phones show (col A). Grouping into Printing / Binding / QC and
  Shipping is in the app (`DEPT_MAP`); unknown stations land in "Other".
- **Points**: A station, B weight (points), C Target/shift (`2560`, `120000 pages`, `60 jobs`).
  Settings: E1 scoring basis, E3 workdays/week (4), E4 team goal (9000), E5 shift hours (10),
  E6 coaching emails, E7 unpaid break (0.5), E8 schedule id, E9 "hours"/"days", E10 daily cap % (150).
  **Points is the STARTING rate**; dated changes go in Rate Changes.
- **Rate Changes** (v27): Effective datetime | Station | New target/shift | Note. Each scan is scored
  with the rate in effect when it happened.
- **Names**: A aliases (comma-separated), B roster name, C shift (Day/Night), D "No" = exempt from
  the Nectar scan special.
- **Manual Credits**: Date | Name | Activity | Hours | Approved by | Ref ID. Hours ÷ E5 = rate only.
- **Hours Check**: written by `scheduleCheck_()`; what the schedule reader counted.
- **Roster Log** (v28): every change made through roster.html (HR page), with who made it.
- **Feedback** (v29): Id | When | App | Version | Kind | From | Message | Station | Job | Device | Status |
  Decided by | Decided | Note. Filled by the "Report a problem or idea" button (scan app v23+, leaderboard
  page v18+); reviewed on feedback.html. Status: New / Approved / Declined / Done.

## Scoring (buildLeaderboard_)
- Rate = Σ(output ÷ target) ÷ hours-worked-in-shifts. Output = qty, or qty×pages for "pages"
  targets, or 1 per scan for "jobs" targets. Pairs ("A+B") split 50/50. Replays deduped.
- Hours worked come from the Public Schedule (green = here, orange = late/left early count as the
  shift's paid hours; absent/blank count nothing). Fallback: workdays divisor (E3).
- Daily cap (E10): one shift-day's scan credit is limited to cap% of a shift, scaled to that day's hours.
- Team goal counts Label and Ship units Mon–Sun.
- `nectar` per row: scanned on every scheduled-here day in the Thu–Wed week containing the view.
- Ranking: rate, then points, units, scans, name.

## Request cost (v28)
- `?board=1`: column A of Scans (all rows, 1 cell each) + the block of rows covering the window,
  the team-goal week and the Nectar week; the schedule workbook once; no tab seeding. The finished
  JSON is cached 60 s per (scans revision, week, period, from, to) — `doPost` bumps the revision.
- `doPost`: full `ensureTabs_` (seeding + Points sync), one Admin call, one appendRow, cache bump.
- `reconcilePending_`: last 7 days only, ≤ ~4.5 min per run.
- `housekeeping_`: hourly trigger; the seeding the board no longer does.

## Known limits / gotchas
- Admin racetrack: ~90% of scans return not_at_step because earlier steps aren't marked; the
  auto-complete spec for Freedom is in `docs/Spec_Auto-Complete_Racetrack_Steps.pdf`.
- Several new stations are unmapped in Admin (Quality Control, Smashing, Single Knife, Corner
  Cutter, pre-press, punchers, Digibinder, Coiling Machine).
- The schedule file can be edited after the fact, which changes "scanned every day" results.
