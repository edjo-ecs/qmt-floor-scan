/* Exercises the v32 count-from-photo endpoints against the fixture, with the
   Anthropic API mocked.
     node test/count.js
   Exit code 1 on any failure. */
"use strict";
const fs = require("fs");
const path = require("path");
const mock = require("./gas-mock");
const fixture = require("./fixture");

mock.pinDate(fixture.NOW_MS);
const src = fs.readFileSync(path.join(__dirname, "..", "apps-script", "Code.gs"), "utf8");

let failures = 0;
function check(label, cond, extra) {
  console.log((cond ? "ok   " : "FAIL ") + label + (extra ? "  (" + extra + ")" : ""));
  if (!cond) failures++;
}
const IMG = "A".repeat(500);
function setup(props, reply) {
  const fx = fixture.build();
  const env = mock.makeEnv({ active: fx.ss, books: fx.books, props: props });
  const sent = [];
  env.UrlFetchApp = {
    fetch(url, opts) {
      sent.push({ url, opts, body: JSON.parse(opts.payload) });
      const r = typeof reply === "function" ? reply(sent[sent.length - 1]) : reply;
      return { getResponseCode() { return r.status || 200; }, getContentText() { return JSON.stringify(r.body); } };
    }
  };
  const post = body => JSON.parse(mock.load(src, env).doPost({ postData: { contents: JSON.stringify(body) } }).getContent());
  const get = () => JSON.parse(mock.load(src, env).doGet({ parameter: {} }).getContent());
  return { fx, env, sent, post, get };
}
const answer = obj => ({ body: { type: "message", stop_reason: "end_turn", content: [{ type: "thinking", thinking: "" }, { type: "text", text: JSON.stringify(obj) }] } });

// --- off until the key is set ---
let t = setup({}, answer({}));
check("GET says count is off without a key", t.get().countFromPhoto === false);
let r = t.post({ type: "count", images: [IMG], item: "books" });
check("count refused without a key", !r.ok && /not switched on/.test(r.error) && t.sent.length === 0);

// --- a good count ---
t = setup({ ANTHROPIC_API_KEY: "sk-test" }, answer({ count: 50, confidence: "high", stacks: [25, 25], note: "Two stacks of 25." }));
check("GET says count is on with a key", t.get().countFromPhoto === true);
r = t.post({ type: "count", images: [IMG, IMG, IMG], item: "Books", station: "Box", job: "130632574", employee: "Oliver Darocha" });
check("count returns the number", r.ok && r.count === 50 && r.confidence === "high" && r.stacks.join() === "25,25" && /^C[0-9A-Z]+$/.test(r.id), JSON.stringify(r));
const req = t.sent[0];
check("request goes to the Messages API with the key", req.url === "https://api.anthropic.com/v1/messages" && req.opts.headers["x-api-key"] === "sk-test" && req.opts.muteHttpExceptions);
check("request: default model, effort high, JSON schema, fallbacks", req.body.model === "claude-opus-5-5" && req.body.output_config.effort === "high" && req.body.output_config.format.type === "json_schema" && req.body.fallbacks === "default");
const imgs = req.body.messages[0].content.filter(c => c.type === "image");
check("request: three images, then the ask names the item", imgs.length === 3 && imgs[0].source.media_type === "image/jpeg" && /Count the books/.test(req.body.messages[0].content.slice(-1)[0].text));
check("request: no thinking or sampling params (Opus 5.5 rejects them)", !("thinking" in req.body) && !("temperature" in req.body));
const sh = t.fx.ss.getSheetByName("Counts");
let row = sh.getRange(2, 1, 1, 12).getValues()[0];
check("Counts tab row logged", row[0] === r.id && row[2] === "Oliver Darocha" && row[3] === "Box" && row[4] === "130632574" && row[5] === "books" && row[6] === 50 && row[7] === "high" && row[9] === "" && row[11] === "claude-opus-5-5", JSON.stringify(row));

// --- the submitted quantity is written back ---
r = t.post({ type: "count_used", id: row[0], qty: 49 });
check("count_used writes the submitted qty", r.ok && sh.getRange(2, 10).getValue() === 49);
r = t.post({ type: "count_used", id: "C000NOPE", qty: 3 });
check("count_used with unknown id", !r.ok);
r = t.post({ type: "count_used", id: "=HYPERLINK()", qty: 3 });
check("count_used rejects junk ids", !r.ok && r.error === "bad request");

// --- settings and odd input ---
t = setup({ ANTHROPIC_API_KEY: "k", COUNT_MODEL: "claude-sonnet-5-5", COUNT_EFFORT: "medium" }, answer({ count: 7.4, confidence: "sure", stacks: [], note: "x" }));
r = t.post({ type: "count", images: [IMG, "short"], item: "<script>" });
check("model and effort from Script Properties", t.sent[0].body.model === "claude-sonnet-5-5" && t.sent[0].body.output_config.effort === "medium");
check("unknown item becomes 'items'; tiny image strings dropped", /Count the items/.test(JSON.stringify(t.sent[0].body)) && t.sent[0].body.messages[0].content.filter(c => c.type === "image").length === 1);
check("count rounded, unknown confidence treated as low", r.ok && r.count === 7 && r.confidence === "low");
r = t.post({ type: "count", images: [], item: "books" });
check("no photo refused before calling the API", !r.ok && /No photo/.test(r.error) && t.sent.length === 1);

// --- failures are logged and tell the person to count by hand ---
t = setup({ ANTHROPIC_API_KEY: "k" }, { status: 529, body: { type: "error", error: { type: "overloaded_error", message: "Overloaded" } } });
r = t.post({ type: "count", images: [IMG], item: "boxes", employee: "Dale Jones" });
row = t.fx.ss.getSheetByName("Counts").getRange(2, 1, 1, 12).getValues()[0];
check("API error: count by hand, logged as error", !r.ok && /Count by hand/.test(r.error) && row[7] === "error" && /Overloaded/.test(row[8]), JSON.stringify(row));
t = setup({ ANTHROPIC_API_KEY: "k" }, { body: { type: "message", stop_reason: "refusal", content: [] } });
r = t.post({ type: "count", images: [IMG], item: "boxes" });
check("refusal: count by hand", !r.ok && /Count by hand/.test(r.error));
t = setup({ ANTHROPIC_API_KEY: "k" }, { body: { type: "message", stop_reason: "end_turn", content: [{ type: "text", text: "not json" }] } });
r = t.post({ type: "count", images: [IMG], item: "boxes" });
check("unparseable reply: count by hand", !r.ok);

// --- scans are untouched ---
t = setup({ ANTHROPIC_API_KEY: "k", MIS_BASE_URL: "https://mis.example", MIS_API_KEY: "m" }, { body: { ok: true, valid: true, mis_status: "ok" } });
r = t.post({ ts: new Date(fixture.NOW_MS).toISOString(), station: "Box", job: "130632574", employee: "Oliver Darocha", qty: 50 });
check("a normal scan still posts to the MIS, not the count API", r.ok && t.sent.length === 1 && !/anthropic/.test(t.sent[0].url));

console.log(failures ? failures + " FAILED" : "all passed");
process.exit(failures ? 1 : 0);
