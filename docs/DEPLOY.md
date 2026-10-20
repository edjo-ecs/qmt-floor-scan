# Deploying

## Netlify (scan app + leaderboard)
Both sites deploy from this repo on push to `main`.
- `storied-buttercream-0abf9a` → publish directory `scan-app`, no build command.
- `jade-dango-20f096` → publish directory `leaderboard`, no build command.
Pull requests get a Deploy Preview URL; open it on a phone (camera behavior cannot be tested on
desktop), then merge. Rollback: Netlify → Deploys → pick the previous deploy → Publish deploy.

If a site was created by drag-and-drop and cannot be linked to Git: create a new site from the
repo, test it, then swap the site names so the phone URL is unchanged. Keep the old site a week.

## Apps Script (clasp)
One-time:
```
npm i -g @google/clasp
clasp login                      # as the account that owns the Sheet
cp apps-script/.clasp.json.example .clasp.json   # at repo root
# scriptId: Apps Script editor → Project Settings → Script ID
clasp deployments                # note the deployment id of the LIVE web app (URL starts AKfycbzfENik)
```
Every release:
```
clasp push                       # uploads apps-script/Code.gs + appsscript.json
clasp deploy -i <deploymentId> -d "v28: ..."   # NEW VERSION of the existing deployment
curl "<script-url>?board=1" | head -c 300      # confirm "v": 28
```
Never `clasp deploy` without `-i` (that creates a second deployment with a new URL).
First-time permissions (schedule read, email) still need one manual `Run` in the editor.

## Release checklist
1. Bump version stamps (app `vNN`, page `page vNN`, script `v: NN` everywhere + header comment).
2. `node -e "new Function(require('fs').readFileSync('apps-script/Code.gs','utf8'))"` passes.
3. Script first, then page (the page gates new fields on `data.v`).
4. Check the TV reads `page vX · script vY`.
