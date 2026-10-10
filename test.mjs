#!/usr/bin/env node
// THE STATUS PAGE'S RULES CAN FAIL.
//
// The page exists to be believed when Unl is down, so each rule it keeps is driven red on a planted case before the
// real build is judged: a failed check is never green; a part with no checks has no state; a day nobody checked is
// never drawn green; one blip opens no incident but two failures in a row do, and two working checks close it; the
// top line says so when checks have gone quiet; and a vendor or stack name on the page stops the build.
//
// Pure: no network. It builds the page from planted records into a temp dir.
import { execFileSync } from "child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { COMPONENTS, judgeCheck, componentState, dayBars, uptime, deriveIncidents, headline, bannedOnPage } from "./src/lib.mjs";

// Planted words for the test only: the real list is a repository variable and never lives in this public code.
process.env.STATUS_BANNED_WORDS = "acmehost,widgetdb,internal engine";
const BANNED_ON_PAGE = bannedOnPage();

const HERE = dirname(fileURLToPath(import.meta.url));
let fails = 0;
const check = (name, ok, detail = "") => { console.log(`  ${ok ? "✓" : "✗ FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`); if (!ok) fails++; };

console.log("\n── a check is judged on what came back ──");
const web = COMPONENTS.find((c) => c.key === "website").checks[0];
check("a 200 with the page is a pass", judgeCheck(web, { status: 200, bytes: 50000, body: 'x name="unl-build" y', ms: 300 }).ok);
check("RED: a 502 is a fail", !judgeCheck(web, { status: 502, bytes: 50000, body: 'name="unl-build"' }).ok);
check("RED: no answer is a fail", !judgeCheck(web, { error: "TimeoutError" }).ok);
check("RED: a 200 holding an error page is a fail", !judgeCheck(web, { status: 200, bytes: 300, body: "oops" }).ok);
const mcp = COMPONENTS.find((c) => c.key === "connect").checks[1];
check("RED: an open door (200) where the sign-in handshake belongs is a fail", !judgeCheck(mcp, { status: 200, headers: {} }).ok);
check("a 401 carrying the handshake is a pass", judgeCheck(mcp, { status: 401, headers: { "www-authenticate": 'Bearer resource_metadata="x"' } }).ok);
const pulse = COMPONENTS.find((c) => c.key === "answering").checks[1];
check("RED: a pulse reporting its store unreachable is a fail", !judgeCheck(pulse, { status: 200, body: JSON.stringify({ alive: true, substrate: "unreachable", database: "reachable" }) }).ok);

console.log("\n── a part's state comes from its checks, never a default ──");
check("all pass → working", componentState([{ ok: true }, { ok: true }]) === "operational");
check("all pass, one slow → slower than normal", componentState([{ ok: true, slow: true }, { ok: true }]) === "degraded");
check("RED: some fail → partly down", componentState([{ ok: true }, { ok: false }]) === "partial");
check("RED: all fail → down", componentState([{ ok: false }]) === "major");
let threw = false; try { componentState([]); } catch { threw = true; }
check("RED: a part with no checks has no state (never green by default)", threw);

console.log("\n── no backfilled green ──");
const recs = [
  { at: "2026-10-08T10:00:00Z", components: { website: "operational" } },
  { at: "2026-10-09T10:00:00Z", components: { website: "major" } },
];
const bars = dayBars(recs, "website", "2026-10-09");
check("90 bars are drawn", bars.length === 90);
check("RED: a day before monitoring began is 'none', not working", bars[0].state === "none" && bars[87].state === "none");
check("a checked day carries its worst state", bars[88].state === "operational" && bars[89].state === "major");
check("uptime counts checked days only", uptime(bars) === 50);
check("RED: no checks at all is no uptime, not 100%", uptime(dayBars([], "website", "2026-10-09")) === null);

console.log("\n── incidents come from the checks ──");
const t = (m) => `2026-10-09T10:${String(m).padStart(2, "0")}:00Z`;
const series = (states) => states.map((s, i) => ({ at: t(i * 10 % 60), components: { website: s } }));
check("RED: one failed check alone opens nothing", deriveIncidents(series(["operational", "major", "operational", "operational"])).length === 0);
const two = deriveIncidents(series(["operational", "major", "major", "operational", "operational"]));
check("two failures in a row open one incident, two working checks resolve it", two.length === 1 && !!two[0].resolvedAt && two[0].updates.length === 2);
const still = deriveIncidents(series(["major", "major", "major"]));
check("an incident still failing stays open", still.length === 1 && still[0].resolvedAt === null);

console.log("\n── the top line ──");
check("all working → everything is working", headline(["operational", "operational"], false).text === "Everything is working");
check("RED: one part down is said", headline(["operational", "major"], false).tone === "major");
check("RED: quiet checks are said, not shown as current", headline(["operational"], true).tone === "unknown");

console.log("\n── the page names parts in customer words ──");
check("RED: a listed vendor name is caught", BANNED_ON_PAGE.test("Hosted on AcmeHost"));
check("RED: a listed two-word internal name is caught", BANNED_ON_PAGE.test("the internal engine is down"));
let noList = false; try { bannedOnPage(""); } catch { noList = true; }
check("RED: with no list the build refuses rather than checking nothing", noList);
check("every part's name passes", COMPONENTS.every((c) => !BANNED_ON_PAGE.test(c.name)));
const past = JSON.parse(readFileSync(join(HERE, "past-incidents.json"), "utf8")).incidents;
check("every past incident names its source", past.every((i) => typeof i.source === "string" && i.source.length > 10));
check("the 26 Sep outage is told", past.some((i) => i.startedAt.startsWith("2026-09-26")));

console.log("\n── the real build, from planted records ──");
const dir = mkdtempSync(join(tmpdir(), "status-"));
writeFileSync(join(dir, "checks.jsonl"), [
  { at: "2026-10-09T10:00:00Z", components: { website: "operational", "sign-in": "operational", connect: "operational", answering: "operational" } },
  { at: "2026-10-09T10:10:00Z", components: { website: "operational", "sign-in": "operational", connect: "operational", answering: "major" } },
  { at: "2026-10-09T10:20:00Z", components: { website: "operational", "sign-in": "operational", connect: "operational", answering: "major" } },
].map((r) => JSON.stringify(r)).join("\n") + "\n");
const out = join(dir, "out");
execFileSync("node", [join(HERE, "src", "build.mjs"), dir, out, "--now", "2026-10-09T10:25:00Z"]);
const page = readFileSync(join(out, "index.html"), "utf8");
const json = JSON.parse(readFileSync(join(out, "status.json"), "utf8"));
check("the top line says a part is down", /Some parts are down/.test(page) && json.status.tone === "major");
check("the open incident is on the page and in the feed", /Unl answering your AI: down/.test(page) && /Unl answering your AI: down/.test(readFileSync(join(out, "feed.xml"), "utf8")));
check("the page says when checks began", /Our checks began on 9 October 2026/.test(page));
execFileSync("node", [join(HERE, "src", "build.mjs"), dir, out, "--now", "2026-10-09T12:00:00Z"]);
check("RED: an hour and a half of silence turns the top line to 'not reported recently'", JSON.parse(readFileSync(join(out, "status.json"), "utf8")).stale === true);

console.log(fails ? `\nstatus tests: ${fails} failure(s)` : "\nstatus tests: clean");
process.exit(fails ? 1 : 0);
