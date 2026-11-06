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
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "fs";
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
check("the open incident is on the page and in the feed", /Unl answering your AI, down/.test(page) && /Unl answering your AI, down/.test(readFileSync(join(out, "feed.xml"), "utf8")));
check("the page says when checks began", /Our checks began on 9 October 2026/.test(page));

console.log("\n── the page wears the site's look and carries it with it ──");
check("the lockup is in the header and footer: icon, wordmark, caption", (page.match(/<use href="#mark"\/>/g) ?? []).length === 2 && /class="rest">imitless</.test(page) && /your why agent/.test(page));
check("RED: nothing is loaded from another host when the page opens", !/<link[^>]+stylesheet|<script[^>]+src=|url\(\s*["']?https?:|<img[^>]+src="https?:/i.test(page) && !/fonts\.(googleapis|gstatic)/.test(page));
check("the faces ship beside the page", ["space-grotesk.woff2", "instrument-sans.woff2", "space-mono-400.woff2", "space-mono-700.woff2"].every((f) => existsSync(join(out, "fonts", f))));
const prose = page.replace(/<style>[\s\S]*?<\/style>/, "").replace(/<script>[\s\S]*?<\/script>/g, "").replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, " ").replace(/\b\d{2}:\d{2}\b/g, "");
check("RED: no colon or em dash in what a reader reads", !/[:—]/.test(prose), (prose.match(/.{0,30}[:—].{0,30}/) ?? [""])[0]);
check("checks are counted, not turned into a percentage of days nobody checked", /3 checks so far, 2 found a problem/.test(page) && /3 checks so far, every one found it working/.test(page) && !/% of checks/.test(page));
check("'Get updates' does not point at a raw feed from the header", !/Get updates/.test(page) && /href="feed\.xml">Updates feed</.test(page));
check("RED: no visible page heading repeats the header's name; the banner comes first under the header", !/<h1(?![^>]*class="sr")/.test(page) && /<h1 class="sr">Unl status<\/h1>\s*<div class="top /.test(page) && /<title>Unl status<\/title>/.test(page));
check("the body tells a visitor how to be told of a change, with the feed and the machine file", /id="told"[^>]*>[^<]*<a href="feed\.xml">updates feed<\/a>/.test(page) && /href="status\.json"/.test(page));

check("the page re-asks how old the last check is when it is opened, with the same window", /data-last="2026-10-09T10:20:00Z"/.test(page) && /Date\.now\(\)-Date\.parse\(l\)>2700000/.test(page) && /not reported recently/.test(page));

execFileSync("node", [join(HERE, "src", "build.mjs"), dir, out, "--now", "2026-10-09T12:00:00Z"]);
check("RED: an hour and a half of silence turns the top line to 'not reported recently'", JSON.parse(readFileSync(join(out, "status.json"), "utf8")).stale === true);

console.log("\n── the subscribe box and the tab icon ──");
check("the subscribe box posts to Unl's confirm-by-email door, and works as a plain form", /<form class="sub" id="sub" action="https:\/\/api\.unlimitless\.ai\/public\/status\/subscribe" method="post">/.test(page) && /name="email" type="email" required/.test(page));
check("the page says every email can be stopped", /Every email has a link to stop them/.test(page));
check("the tab and home-screen icons are linked and ship beside the page", /rel="icon" href="favicon\.ico"/.test(page) && /rel="apple-touch-icon" href="apple-icon\.png"/.test(page) && ["favicon.ico", "icon.png", "apple-icon.png"].every((f) => existsSync(join(out, f))));

console.log("\n── the email notices: one when an incident opens, one when it is resolved, never one per check ──");
const { noticesDue, baseline, noticeFor, rehearsalIncident, incidentKey, REHEARSAL_PART } = await import("./src/notify.mjs");
const nrecs = (states) => states.map((st, i) => ({ at: new Date(Date.parse("2026-10-11T10:00:00Z") + i * 600000).toISOString(), components: { website: st } }));
const openInc = deriveIncidents(nrecs(["operational", "major", "major", "major"]));
const due1 = noticesDue(openInc, {});
check("an open incident is due one problem notice", due1.length === 1 && due1[0].kind === "opened");
const told = { [incidentKey(openInc[0])]: { opened: true } };
check("RED: once told, more failed checks send nothing more", noticesDue(deriveIncidents(nrecs(["operational", "major", "major", "major", "major", "major"])), told).length === 0);
const closed = deriveIncidents(nrecs(["operational", "major", "major", "operational", "operational"]));
const due2 = noticesDue(closed, told);
check("a resolved incident is due exactly one recovery notice", due2.length === 1 && due2[0].kind === "resolved");
check("RED: one failed check opens nothing, so it emails nobody", noticesDue(deriveIncidents(nrecs(["operational", "major", "operational"])), {}).length === 0);
check("RED: the first run records the past as told and sends nothing", noticesDue(closed, baseline(closed)).length === 0);
const n = noticeFor("opened", openInc[0]);
check("a notice names the part in customer words, carries the page and the one-click unsubscribe", /^The website is down$/.test(n.subject) && n.text.includes("https://status.unlimitless.ai/") && n.text.includes("{{{RESEND_UNSUBSCRIBE_URL}}}") && n.html.includes("{{{RESEND_UNSUBSCRIBE_URL}}}"));
check("RED: no em dash in a notice", !/—/.test(n.subject + n.text));
const [reh] = rehearsalIncident(new Date("2026-10-11T12:00:00Z"));
const rn = noticeFor("opened", reh, { parts: [REHEARSAL_PART], rehearsal: true });
check("a rehearsal plays one incident, opened then recovered, on a test part that is not on the page", !!reh && !!reh.resolvedAt && reh.component === "rehearsal" && !COMPONENTS.some((c) => c.key === "rehearsal"));
check("RED: a rehearsal notice says so and names no real part", /^Rehearsal\. A test part is down$/.test(rn.subject) && /Nothing is wrong with Unl/.test(rn.text) && !COMPONENTS.some((c) => rn.text.includes(c.name)));

console.log("\n── every publish is a deployment of its own, and is green only when the host says it is live ──");
// 5 November 2026: the checks ran every ten minutes and every publish said success, while the page people saw stayed
// one afternoon's copy for over twelve hours. Each publish had sent the commit as its version, so it asked for a
// deployment that already existed. The stand-in below answers as the host does, and remembers what it was sent.
const { buildVersion, publish } = await import("./src/publish.mjs");
const runEnv = (over = {}) => ({
  GITHUB_REPOSITORY: "o/r", GITHUB_TOKEN: "job-token-PLANTED-0123456789", GITHUB_SHA: "c0ffee", GITHUB_RUN_ID: "101", GITHUB_RUN_ATTEMPT: "1",
  ACTIONS_ID_TOKEN_REQUEST_URL: "https://sign-in.example/token", ACTIONS_ID_TOKEN_REQUEST_TOKEN: "ask-token-PLANTED-0123456789", ...over,
});
const SIGN_IN = "sign-in-PLANTED-abcdefghijklmnopqrstuvwxyz";
function host({ artifacts = [{ id: 7, name: "github-pages" }], states = ["deployment_in_progress", "succeed"], refuse = null } = {}) {
  const seen = { posts: [], asked: [], polls: 0 };
  const answer = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
  const fetchFn = async (url, options = {}) => {
    seen.asked.push({ url, headers: options.headers ?? {} });
    if (url.includes("/actions/runs/")) return answer(200, { artifacts });
    if (url.startsWith("https://sign-in.example/")) return answer(200, { value: SIGN_IN });
    if (url.endsWith("/pages/deployments") && options.method === "POST") {
      if (refuse) return answer(refuse, { message: "Resource not accessible by integration" });
      const sent = JSON.parse(options.body); seen.posts.push(sent);
      return answer(200, { id: sent.pages_build_version, page_url: "https://status.example/" });
    }
    if (url.includes("/pages/deployments/")) return answer(200, { status: states[Math.min(seen.polls++, states.length - 1)] });
    return answer(404, { message: "Not Found" });
  };
  return { fetchFn, seen };
}
const quiet = { wait: async () => {}, every: 1000 };
check("RED: two runs of the same commit never share a version", buildVersion(runEnv({ GITHUB_RUN_ID: "101" })) !== buildVersion(runEnv({ GITHUB_RUN_ID: "102" })));
check("RED: a re-run of the same run is another publish and gets its own version", buildVersion(runEnv({ GITHUB_RUN_ATTEMPT: "1" })) !== buildVersion(runEnv({ GITHUB_RUN_ATTEMPT: "2" })));
let noName = false; try { buildVersion(runEnv({ GITHUB_RUN_ID: "" })); } catch { noName = true; }
check("RED: a version is never made up from part of what names it", noName);
{
  const h = host(), said = [];
  const r = await publish({ env: runEnv(), fetchFn: h.fetchFn, log: (l) => said.push(l), ...quiet });
  check("the page this run built is sent with this run's own version", h.seen.posts.length === 1 && h.seen.posts[0].artifact_id === 7 && h.seen.posts[0].pages_build_version === "c0ffee-101-1" && r.version === "c0ffee-101-1");
  check("it is green only after the host says that deployment is live", h.seen.polls === 2 && said.some((l) => /succeed/.test(l)));
  const everything = said.join("\n") + JSON.stringify(r);
  check("RED: neither the sign-in token nor the job's tokens are ever printed", ![SIGN_IN, "job-token-PLANTED-0123456789", "ask-token-PLANTED-0123456789"].some((t) => everything.includes(t)) && h.seen.posts[0].oidc_token === SIGN_IN);
  check("the job's own token is what asks, and only of the host", h.seen.asked.filter((a) => a.url.startsWith("https://api.github.com/")).every((a) => a.headers.Authorization === "Bearer job-token-PLANTED-0123456789")
    && h.seen.asked.filter((a) => !a.url.startsWith("https://api.github.com/")).every((a) => a.headers.Authorization === "Bearer ask-token-PLANTED-0123456789"));
}
const fails_as = async (opts, env = runEnv()) => { try { await publish({ env, log: () => {}, ...quiet, ...opts }); return ""; } catch (e) { return e.message; } };
{
  const h = host({ states: ["deployment_in_progress", "deployment_failed"] });
  check("RED: a deployment the host could not make is a failure, said by name", /could not deploy the page \(deployment_failed\)/.test(await fails_as({ fetchFn: h.fetchFn })));
  const stuck = host({ states: ["deployment_in_progress"] });
  const msg = await fails_as({ fetchFn: stuck.fetchFn, patience: 3000 });
  check("RED: a deployment that never goes live runs out of patience and fails, never a green tick", /did not report deployment c0ffee-101-1 live/.test(msg) && stuck.seen.polls >= 3, msg);
  const none = host({ artifacts: [] });
  check("RED: a run that built no page sends nothing and says so", /built no page to publish/.test(await fails_as({ fetchFn: none.fetchFn })) && none.seen.posts.length === 0);
  const refused = host({ refuse: 403 });
  const said = await fails_as({ fetchFn: refused.fetchFn });
  check("RED: a refusal from the host fails with its own reason, and carries no token", /the deployment was refused \(HTTP 403, Resource not accessible/.test(said) && !said.includes(SIGN_IN), said);
  check("RED: a job with no sign-in token to ask for fails before sending anything", /not given a sign-in token/.test(await fails_as({ fetchFn: h.fetchFn }, runEnv({ ACTIONS_ID_TOKEN_REQUEST_URL: "" }))));
}
const flow = readFileSync(join(HERE, ".github", "workflows", "status.yml"), "utf8");
const publishJob = flow.slice(flow.indexOf("\n  publish:"));
check("the publish job runs this file, with leave to deploy pages and to ask for a sign-in token", /run: node src\/publish\.mjs/.test(publishJob) && /pages: write/.test(publishJob) && /id-token: write/.test(publishJob) && /name: github-pages/.test(publishJob));
check("RED: the stock deploy step, which sends the commit as the version, is not what publishes", !/uses: actions\/deploy-pages/.test(flow));

console.log(fails ? `\nstatus tests: ${fails} failure(s)` : "\nstatus tests: clean");
process.exit(fails ? 1 : 0);
