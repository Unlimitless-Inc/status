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
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { COMPONENTS, STATES, headline, dayBars, checksSoFar, uptime, deriveIncidents, bannedOnPage } from "./lib.mjs";
import { BRAND_CSS, MARK_DEFS, lockup, FOOTER_COLUMNS } from "./brand.mjs";

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
  return { key: c.key, name: c.name, state: last?.components?.[c.key] ?? null, bars, sofar: checksSoFar(bars) };
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
<style>${BRAND_CSS}
.wrap{max-width:880px;margin:0 auto;padding:0 16px}
header.top-bar{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:26px 0 30px}
.page-tag{font:400 12px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--dim)}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.told{margin:14px 0 0;color:var(--muted);font-size:14px}.told a{color:var(--unl-cyan)}
.top{border-radius:var(--radius);border:1px solid var(--line);padding:16px 20px;font:600 18px/1.4 var(--disp);margin:0 0 26px;display:flex;align-items:center;gap:12px}
.top::before{content:'';flex:none;width:10px;height:10px;border-radius:50%;background:currentColor;box-shadow:0 0 12px currentColor}
.top.operational{background:var(--ok-soft);color:var(--ok)}.top.degraded{background:var(--slow-soft);color:var(--slow)}
.top.partial,.top.major{background:var(--down-soft);color:var(--down)}.top.unknown{background:var(--panel);color:var(--muted)}
.parts{border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;background:rgba(36,40,59,.55)}
.part{padding:18px 20px;border-top:1px solid var(--line)}.part:first-child{border-top:0}
.part-h{display:flex;justify-content:space-between;gap:12px;margin-bottom:12px}.part-h b{font:600 16px/1.4 var(--disp);color:var(--white)}
.st{font:400 12.5px/1.6 var(--mono);letter-spacing:.02em}.st.operational{color:var(--ok)}.st.degraded{color:var(--slow)}.st.partial,.st.major{color:var(--down)}.st.none{color:var(--muted)}
.bars{width:100%;height:34px;display:block}
.b-operational{fill:var(--ok)}.b-degraded{fill:var(--slow)}.b-partial,.b-major{fill:var(--down)}.b-maintenance{fill:var(--unl-cyan)}.b-none{fill:var(--none)}
.part-f{display:flex;justify-content:space-between;gap:10px;color:var(--dim);font:400 11.5px/1.5 var(--mono);margin-top:8px}
.part-f span:nth-child(2){text-align:center}
.note{color:var(--muted);font-size:14px;margin:14px 0 0}
h2{font:600 22px/1.3 var(--disp);color:var(--white);letter-spacing:-.01em;margin:46px 0 14px}
.day{border-top:1px solid var(--line);padding:18px 0}.day>h3{font:400 12px/1.4 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--dim);margin-bottom:10px}
.day .none{color:var(--muted);font-size:14px}
.inc{margin:10px 0 0;border:1px solid var(--line);border-radius:var(--radius);padding:16px 18px;background:rgba(36,40,59,.45)}
.inc h3{font:600 16px/1.4 var(--disp);color:var(--white);display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.inc-part{color:var(--dim);font:400 12px/1.5 var(--mono);margin:4px 0 12px}
.inc ol{list-style:none;border-left:2px solid var(--line2);padding-left:14px;display:grid;gap:12px}
.inc time{color:var(--dim);font:400 12px/1.5 var(--mono)}.inc li p{margin-top:2px;color:var(--txt)}
.pill{font:700 11px/1 var(--mono);letter-spacing:.04em;border-radius:999px;padding:5px 10px}
.s-resolved{background:var(--ok-soft);color:var(--ok)}.s-major,.s-partial{background:var(--down-soft);color:var(--down)}.s-degraded{background:var(--slow-soft);color:var(--slow)}
footer{border-top:1px solid var(--line);margin-top:56px;padding:34px 0 40px}
.foot{display:grid;grid-template-columns:minmax(190px,1fr) 3fr;gap:32px 40px;font-size:13.5px;color:var(--dim)}
.foot .brand{font-size:20px}.foot .brand-caption{font-size:11px}
.foot-cols{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:24px}
.foot-h{font:400 11.5px/1 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 14px}
.foot ul{list-style:none;display:flex;flex-direction:column;gap:10px}
.foot a{text-decoration:none}.foot a:hover{color:var(--text)}
.foot-base{grid-column:1/-1;border-top:1px solid var(--line);padding-top:20px;font-size:12.5px}
@media(max-width:700px){.foot{grid-template-columns:1fr}.foot-cols{grid-template-columns:repeat(2,minmax(0,1fr))}.part-f span:first-child,.part-f span:last-child{display:none}.part-f{justify-content:center}}
</style></head>
<body>${MARK_DEFS}<div class="wrap">
<header class="top-bar">${lockup()}<span class="page-tag">Status</span></header>
<h1 class="sr">Unl status</h1>
<div class="top ${top.tone}" role="status" id="top"${last ? ` data-last="${esc(last.at)}"` : ""}>${esc(top.text)}</div>
<script>
// The page is built when the checks run, so "how old is the last check" is asked again when it is opened. If the
// checks have gone quiet since, the top line says so instead of showing an old state as current.
(function(){var t=document.getElementById("top"),l=t&&t.getAttribute("data-last");if(!l)return;if(Date.now()-Date.parse(l)>${STALE_MS}){t.className="top unknown";t.textContent=${JSON.stringify(headline([], true).text)};}})();
</script>
<section class="parts" aria-label="Parts of Unl">
${parts.map((p) => `<div class="part"><div class="part-h"><b>${esc(p.name)}</b><span class="st ${p.state ?? "none"}">${p.state ? esc(STATES[p.state].label) : "Not yet checked"}</span></div>${barSvg(p.bars)}<div class="part-f"><span>90 days ago</span><span>${p.sofar.checks === 0 ? "No checks yet" : p.sofar.bad === 0 ? `${p.sofar.checks} checks so far, every one found it working` : `${p.sofar.checks} checks so far, ${p.sofar.bad} found a problem`}</span><span>Today</span></div></div>`).join("\n")}
</section>
<p class="note">${since ? `Our checks began on ${esc(longDate(since))}. Days before that have no bars, because nothing was checked then.` : "Our checks have not started yet, so no days are drawn."} ${last ? `Last checked ${esc(longDate(last.at))}, ${esc(hhmm(last.at))} UTC.` : ""}</p>
<p class="told" id="told">To be told when a part stops working and when it recovers, follow the <a href="feed.xml">updates feed</a> in any feed reader. Agents can read the same truth from <a href="status.json">status.json</a>.</p>
<h2>Past incidents</h2>
${byDay.size ? [...byDay.entries()].map(([d, list]) => `<section class="day"><h3>${esc(longDate(d))}</h3>${list.map(incidentHtml).join("")}</section>`).join("\n") : `<section class="day"><p class="none">No incidents.</p></section>`}
</div>
<footer><div class="wrap foot"><div>${lockup(30)}</div><div class="foot-cols">${FOOTER_COLUMNS.map((c) => `<div><p class="foot-h">${esc(c.h)}</p><ul>${c.links.map(([href, text]) => `<li><a href="${esc(href)}">${esc(text)}</a></li>`).join("")}</ul></div>`).join("")}</div><div class="foot-base">&copy; 2026 Unlimitless</div></div></footer>
</body></html>
`;

const json = {
  updated: now.toISOString(),
  last_checked: last?.at ?? null,
  monitoring_since: since,
  stale,
  status: { tone: top.tone, text: top.text },
  parts: parts.map((p) => ({ key: p.key, name: p.name, state: p.state, checks_90d: p.sofar.checks, problems_90d: p.sofar.bad, uptime_90d: uptime(p.bars) })),
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
// The faces travel with the page: nothing is fetched from the site, or a font host, when the page is opened.
mkdirSync(join(outDir, "fonts"), { recursive: true });
for (const f of readdirSync(join(ROOT, "brand", "fonts"))) copyFileSync(join(ROOT, "brand", "fonts", f), join(outDir, "fonts", f));
console.log(`built: ${top.text}; ${records.length} check(s) since ${since ?? "never"}; ${incidents.length} incident(s)`);
