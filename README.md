# QMT Floor Scan

Barcode-scanning productivity system for the Quantum Fulfillment Services book plant
(Princeton Junction, NJ). Three deployable pieces, one repo.

| Folder | What it is | Where it runs | Live version |
|---|---|---|---|
| `scan-app/` | Phone app operators use to scan job sheets | Netlify site `storied-buttercream-0abf9a` | app v20 |
| `leaderboard/` | TV / phone leaderboard | Netlify site `jade-dango-20f096` | page v12 |
| `apps-script/` | Google Apps Script backend bound to the Sheet "New QMT Floor Productivity" | Google (one web-app deployment) | script v27 (v28 built, see `docs/BACKLOG.md`) |
| `test/` | Node harness: fake Sheets + schedule; runs two `Code.gs` versions and diffs every board | `node test/regression.js` | — |

Both Netlify sites deploy from this repo: each site's **publish directory** is its folder
(`scan-app` or `leaderboard`), no build command. The Apps Script is deployed with `clasp`
(see `docs/DEPLOY.md`); it cannot be deployed by Netlify.

**Start here:** `CLAUDE.md` (how to work in this repo), then `docs/ARCHITECTURE.md`,
`docs/DEPLOY.md`, `docs/BACKLOG.md`.

## Rules that keep the floor running
- Phones and the TV have the site URLs and the script URL baked in. **Never create a new
  Apps Script deployment** ("New deployment" mints a new URL nothing points at); always
  push a **new version of the existing deployment**.
- Bump the version stamp on every change (`vNN` in the app header, `page vNN` in the
  leaderboard, `v: NN` in `Code.gs`). The TV shows `page vX · script vY`; that is how we
  confirm what is live.
- Rate targets live in the Sheet, not in code. Change them in the **Rate Changes** tab
  (dated, non-retroactive), never in the Points tab.
- Test on a real phone before merging anything that touches the camera.
