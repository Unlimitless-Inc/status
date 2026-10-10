#!/usr/bin/env node
// THE STATUS PAGE BUILDER. Reads <data>/checks.jsonl and past-incidents.json and writes a
// static site to <out>: index.html (the page), status.json (the same truth for machines) and feed.xml (an Atom feed
// of incidents, the way to be told when something changes). Static on purpose: it is served from a host that is not
// the one it reports on, so it stays up when Unl is down, which is the point of a status page.
//
// Shape: one line at the top saying whether everything is working; the parts a customer depends on, each with its
// state and 90 days of bars; past incidents by day, each told in dated updates; a way to be told. Our rules: no day before monitoring began is drawn green, nothing is set by hand, no
// vendor or stack name appears.
//
// Usage: STATUS_BANNED_WORDS=<a,b,c> node src/build.mjs <data-dir> <out-dir> [--now <iso>]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { COMPONENTS, STATES, headline, dayBars, uptime, deriveIncidents, bannedOnPage } from "./lib.mjs";

const [, , dataDir, outDir, flag, nowArg] = process.argv;
if (!dataDir || !outDir) { console.error("usage: build.mjs <data-dir> <out-dir> [--now <iso>]"); process.exit(2); }
const now = flag === "--now" && nowArg ? new Date(nowArg) : new Date();
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BANNED_ON_PAGE = bannedOnPage();

const file = join(dataDir, "checks.jsonl");
const records = existsSync(file)
  ? readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).sort((a, b) => a.at.localeCompare(b.at))
  : [];
const past = JSON.parse(readFileSync(join(ROOT, "past-incidents.json"), "utf8")).incidents;

/** Checks run every ten minutes; nothing for 45 means the page says so rather than showing old states as current. */
const STALE_MS = 45 * 60 * 1000;
const last = records.at(-1);
const stale = !last || now.getTime() - new Date(last.at).getTime() > STALE_MS;
const today = now.toISOString().slice(0, 10);
const since = records[0]?.at.slice(0, 10) ?? null;

const parts = COMPONENTS.map((c) => {
  const bars = dayBars(records, c.key, today);
  return { key: c.key, name: c.name, state: last?.components?.[c.key] ?? null, bars, uptime: uptime(bars) };
});
const top = headline(parts.map((p) => p.state ?? "operational"), stale || parts.some((p) => !p.state));
const incidents = [...deriveIncidents(records), ...past].sort((a, b) => b.startedAt.localeCompare(a.startedAt));

const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
const longDate = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const hhmm = (iso) => iso.slice(11, 16);
const nameOf = (key) => COMPONENTS.find((c) => c.key === key)?.name ?? key;

const barSvg = (bars) => {
  const w = 4, gap = 2;
  return `<svg class="bars" viewBox="0 0 ${bars.length * (w + gap) - gap} 34" preserveAspectRatio="none" role="img" aria-label="Last 90 days">${bars
    .map((b, i) => `<rect x="${i * (w + gap)}" y="0" width="${w}" height="34" rx="1" class="b-${b.state}"><title>${esc(longDate(b.day))}: ${b.state === "none" ? "not yet checked" : `${esc(STATES[b.state].label)}${b.bad ? `, ${b.bad} of ${b.checks} checks found a problem` : ""}`}</title></rect>`)
    .join("")}</svg>`;
};

const incidentHtml = (inc) => `<article class="inc">
  <h3>${esc(inc.title)} <span class="pill s-${inc.resolvedAt ? "resolved" : inc.worst}">${inc.resolvedAt ? "Resolved" : esc(STATES[inc.worst].label)}</span></h3>
  <p class="inc-part">${esc(nameOf(inc.component))}</p>
  <ol>${[...inc.updates].reverse().map((u) => `<li><time datetime="${esc(u.at)}">${esc(longDate(u.at))}, ${esc(hhmm(u.at))} UTC</time><p>${esc(u.text)}</p></li>`).join("")}</ol>
</article>`;

const byDay = new Map();
for (const inc of incidents) {
  const d = inc.startedAt.slice(0, 10);
  if (!byDay.has(d)) byDay.set(d, []);
  byDay.get(d).push(inc);
}

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Unl status</title>
<meta name="description" content="Whether Unl is working right now, the last 90 days of each part, and every incident.">
<link rel="alternate" type="application/atom+xml" title="Unl status updates" href="feed.xml">
<style>
:root{--ink:#1A1B26;--panel:#24283B;--line:rgba(192,202,245,.12);--text:#E8EAED;--muted:#9AA3AD;--ok:#4FD1A1;--slow:#E0B341;--part:#E8894A;--down:#E5606B;--none:#3A3F55;--acc:#7DCFFF}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--ink);color:var(--text);font:400 16px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
.wrap{max-width:860px;margin:0 auto;padding:0 16px}
header{display:flex;justify-content:space-between;align-items:center;padding:24px 0}
.brand{font-weight:700;font-size:20px;color:var(--text);text-decoration:none}.brand span{color:var(--acc)}
header a.sub{color:var(--muted);font-size:14px}
.top{border-radius:12px;padding:18px 20px;font-weight:600;font-size:18px;margin:8px 0 28px}
.top.operational{background:rgba(79,209,161,.14);color:var(--ok)}.top.degraded{background:rgba(224,179,65,.14);color:var(--slow)}
.top.partial{background:rgba(232,137,74,.16);color:var(--part)}.top.major{background:rgba(229,96,107,.16);color:var(--down)}
.top.unknown{background:var(--panel);color:var(--muted)}
.parts{border:1px solid var(--line);border-radius:12px;overflow:hidden}
.part{padding:16px 20px;border-top:1px solid var(--line)}.part:first-child{border-top:0}
.part-h{display:flex;justify-content:space-between;gap:12px;margin-bottom:10px}.part-h b{font-weight:600}
.st{font-size:14px}.st.operational{color:var(--ok)}.st.degraded{color:var(--slow)}.st.partial{color:var(--part)}.st.major{color:var(--down)}.st.none{color:var(--muted)}
.bars{width:100%;height:34px;display:block}
.b-operational{fill:var(--ok)}.b-degraded{fill:var(--slow)}.b-partial{fill:var(--part)}.b-major{fill:var(--down)}.b-maintenance{fill:var(--acc)}.b-none{fill:var(--none)}
.part-f{display:flex;justify-content:space-between;color:var(--muted);font-size:12.5px;margin-top:6px}
.note{color:var(--muted);font-size:14px;margin:12px 0 0}
h2{font-size:20px;margin:40px 0 14px}
.day{border-top:1px solid var(--line);padding:16px 0}.day>h3{font-size:15px;color:var(--muted);font-weight:500;margin-bottom:8px}
.day .none{color:var(--muted);font-size:14px}
.inc{margin:10px 0 0}.inc h3{font-size:16px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.inc-part{color:var(--muted);font-size:13px;margin:2px 0 8px}
.inc ol{list-style:none;border-left:2px solid var(--line);padding-left:14px;display:grid;gap:10px}
.inc time{color:var(--muted);font-size:13px}.inc li p{margin-top:2px}
.pill{font-size:12px;font-weight:600;border-radius:999px;padding:2px 9px}
.s-resolved{background:rgba(79,209,161,.14);color:var(--ok)}.s-major{background:rgba(229,96,107,.16);color:var(--down)}.s-partial{background:rgba(232,137,74,.16);color:var(--part)}.s-degraded{background:rgba(224,179,65,.14);color:var(--slow)}
footer{color:var(--muted);font-size:13px;padding:40px 0;display:flex;flex-wrap:wrap;gap:8px 18px}
footer a,.note a{color:var(--text)}
</style></head>
<body><div class="wrap">
<header><a class="brand" href="https://unlimitless.ai/"><span>Unl</span> status</a><a class="sub" href="feed.xml">Get updates</a></header>
<div class="top ${top.tone}" role="status">${esc(top.text)}</div>
<section class="parts" aria-label="Parts of Unl">
${parts.map((p) => `<div class="part"><div class="part-h"><b>${esc(p.name)}</b><span class="st ${p.state ?? "none"}">${p.state ? esc(STATES[p.state].label) : "Not yet checked"}</span></div>${barSvg(p.bars)}<div class="part-f"><span>90 days ago</span><span>${p.uptime === null ? "No checks yet" : `${p.uptime}% of checks found it working`}</span><span>Today</span></div></div>`).join("\n")}
</section>
<p class="note">${since ? `Our checks began on ${esc(longDate(since))}. Days before that have no bars, because nothing was checked then.` : "Our checks have not started yet, so no days are drawn."} ${last ? `Last checked ${esc(longDate(last.at))}, ${esc(hhmm(last.at))} UTC.` : ""}</p>
<h2>Past incidents</h2>
${byDay.size ? [...byDay.entries()].map(([d, list]) => `<section class="day"><h3>${esc(longDate(d))}</h3>${list.map(incidentHtml).join("")}</section>`).join("\n") : `<section class="day"><p class="none">No incidents.</p></section>`}
<footer><span>&copy; 2026 Unlimitless</span><a href="https://unlimitless.ai/support">Support</a><a href="status.json">status.json</a><a href="feed.xml">Updates feed</a></footer>
</div></body></html>
`;

const json = {
  updated: now.toISOString(),
  last_checked: last?.at ?? null,
  monitoring_since: since,
  stale,
  status: { tone: top.tone, text: top.text },
  parts: parts.map((p) => ({ key: p.key, name: p.name, state: p.state, uptime_90d: p.uptime })),
  incidents: incidents.map((i) => ({ part: i.component, title: i.title, started_at: i.startedAt, resolved_at: i.resolvedAt, updates: i.updates })),
};

const feed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>Unl status</title><id>https://status.unlimitless.ai/</id><updated>${now.toISOString()}</updated>
<link href="https://status.unlimitless.ai/"/>
${incidents.map((i) => `<entry><id>https://status.unlimitless.ai/#${esc(i.component)}-${esc(i.startedAt)}</id><title>${esc(i.title)}${i.resolvedAt ? " (resolved)" : ""}</title><updated>${esc(i.updates.at(-1).at)}</updated><content type="text">${esc(i.updates.map((u) => `${u.at.slice(0, 16).replace("T", " ")} UTC: ${u.text}`).join("\n"))}</content></entry>`).join("\n")}
</feed>
`;

// The page's own law, checked on what it is about to publish: no vendor, stack or internal name.
const visible = html.replace(/<style>[\s\S]*?<\/style>/, "").replace(/<[^>]+>/g, " ");
const leak = visible.match(BANNED_ON_PAGE);
if (leak) { console.error(`FAULT: the page would name "${leak[0]}"; it names parts in customer words only`); process.exit(1); }

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "index.html"), html);
writeFileSync(join(outDir, "status.json"), JSON.stringify(json, null, 2) + "\n");
writeFileSync(join(outDir, "feed.xml"), feed);
console.log(`built: ${top.text}; ${records.length} check(s) since ${since ?? "never"}; ${incidents.length} incident(s)`);
