/* Local test server for leaderboard/roster.html.
   Serves leaderboard/*.html (and the scan app under /scan/) with the API pointed at the fake Sheet (test/fixture.js) running
   the working-copy Code.gs, so the page can be clicked through without touching
   the real roster. Passcode for the test copy: "test pass".
     node test/roster-server.js     ->  http://localhost:8787/roster.html */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const mock = require("./gas-mock");
const fixture = require("./fixture");

const repo = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(repo, "apps-script", "Code.gs"), "utf8");
const fx = fixture.build();
global.__RealDate = Date;   // gas-mock checks dates against this; keep real time here (no pinning)
const env = mock.makeEnv({ active: fx.ss, books: fx.books, props: { ROSTER_PASSCODE: "test pass", FEEDBACK_PASSCODE: "test pass" } });
const PORT = 8787;

http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/exec") {
    const api = mock.load(src, env);
    if (req.method === "POST") {
      let body = "";
      req.on("data", c => body += c);
      req.on("end", () => {
        const out = api.doPost({ postData: { contents: body } }).getContent();
        res.writeHead(200, { "Content-Type": "application/json" }); res.end(out);
      });
      return;
    }
    const out = api.doGet({ parameter: Object.fromEntries(url.searchParams) }).getContent();
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(out);
    return;
  }
  if (url.pathname === "/names") {   // peek at the fake Names tab and log
    const n = fx.ss.getSheetByName("Names"), l = fx.ss.getSheetByName("Roster Log");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      names: n.getRange(2, 1, n.getLastRow() - 1, 4).getValues(),
      log: l ? l.getRange(2, 1, l.getLastRow() - 1, 5).getValues() : []
    }));
    return;
  }
  // /scan/ serves the scan app (its own folder); everything else the leaderboard folder
  const scan = url.pathname.startsWith("/scan/");
  const dir = path.join(repo, scan ? "scan-app" : "leaderboard");
  const rel = scan ? url.pathname.slice(6) || "index.html" : (url.pathname === "/" ? "roster.html" : url.pathname);
  const file = path.join(dir, rel);
  if (!file.startsWith(dir) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  let html = fs.readFileSync(file, "utf8");
  html = html.replace(/const API = "[^"]+";/, 'const API = "/exec";');
  html = html.replace(/const BUILT_IN_API = "[^"]+";/, 'const BUILT_IN_API = "/exec";');   // leaderboard + scan app
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(html);
}).listen(PORT, () => console.log("roster test server on http://localhost:" + PORT + "/roster.html"));
