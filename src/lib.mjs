// THE STATUS PAGE'S RULES, AS PURE FUNCTIONS. Everything here is pure so test.mjs can drive each rule red before it
// is believed: how a check becomes a state, how a day becomes a bar, how failures become an incident, and that
// nothing is ever shown green for a time nobody checked.
//
// THE RULES:
//   · every state comes from a real check, never from a hand;
//   · the history is honest: no day before monitoring began is drawn, and the outage of 26 Sep is told;
//   · parts are named in customer words; no vendor or stack name appears on the page.

/** The parts a customer depends on, in their words, each with the real checks behind it. A part with no honest
 *  public check (the portal answers 404 to anyone signed out, by design; Slack has no public probe) is left off
 *  rather than shown green. */
export const COMPONENTS = [
  {
    key: "website",
    name: "The website",
    checks: [{ url: "https://unlimitless.ai/", expect: { status: [200], minBytes: 10000, contains: 'name="unl-build"' } }],
  },
  {
    key: "sign-in",
    name: "Signing in",
    checks: [{ url: "https://unlimitless.ai/sign-in", expect: { status: [200], minBytes: 5000 } }],
  },
  {
    key: "connect",
    name: "Connecting an AI",
    checks: [
      { url: "https://unlimitless.ai/connect", expect: { status: [200], minBytes: 10000 } },
      // An unauthenticated MCP call must be refused WITH the sign-in handshake: that is the door every AI uses.
      { url: "https://api.unlimitless.ai/mcp", method: "POST", expect: { status: [401], header: ["www-authenticate", "resource_metadata"] } },
      { url: "https://api.unlimitless.ai/.well-known/oauth-protected-resource/mcp", expect: { status: [200], contains: "authorization_servers" } },
    ],
  },
  {
    key: "answering",
    name: "Unl answering your AI",
    checks: [
      { url: "https://api.unlimitless.ai/health", expect: { status: [200], contains: '"ok":true' } },
      { url: "https://api.unlimitless.ai/pulse", expect: { status: [200], json: { alive: true, substrate: "reachable", database: "reachable" } } },
    ],
  },
];

/** A response slower than this reads as slower than normal, not as down. */
export const SLOW_MS = 4000;

export const STATES = {
  operational: { label: "Working", rank: 0 },
  degraded: { label: "Slower than normal", rank: 1 },
  partial: { label: "Partly down", rank: 2 },
  major: { label: "Down", rank: 3 },
  maintenance: { label: "Maintenance", rank: 1 },
};

/** One check's observation → pass / fail, with the reason in plain words. */
export function judgeCheck(check, obs) {
  if (obs.error) return { ok: false, why: "no answer" };
  const e = check.expect;
  if (!e.status.includes(obs.status)) return { ok: false, why: `answered ${obs.status}` };
  if (e.minBytes && (obs.bytes ?? 0) < e.minBytes) return { ok: false, why: "answered with too little" };
  if (e.contains && !(obs.body ?? "").includes(e.contains)) return { ok: false, why: "answered without the expected content" };
  if (e.header) {
    const v = (obs.headers ?? {})[e.header[0]] ?? "";
    if (!v.includes(e.header[1])) return { ok: false, why: "answered without the sign-in handshake" };
  }
  if (e.json) {
    let j;
    try { j = JSON.parse(obs.body ?? ""); } catch { return { ok: false, why: "answered with unreadable content" }; }
    for (const [k, v] of Object.entries(e.json)) if (j?.[k] !== v) return { ok: false, why: "reports a part of itself not ready" };
  }
  return { ok: true, slow: (obs.ms ?? 0) > SLOW_MS };
}

/** All of a part's checks → its state. All pass: working (or slower than normal); some fail: partly down; all fail: down. */
export function componentState(results) {
  if (!results.length) throw new Error("a part with no checks has no state; it is never green by default");
  const failed = results.filter((r) => !r.ok).length;
  if (failed === results.length) return "major";
  if (failed > 0) return "partial";
  return results.some((r) => r.slow) ? "degraded" : "operational";
}

export function worst(states) {
  return states.reduce((a, b) => (STATES[b].rank > STATES[a].rank ? b : a), "operational");
}

/** The one line at the top. */
export function headline(states, stale) {
  if (stale) return { tone: "unknown", text: "Our checks have not reported recently, so the states below may be out of date." };
  const w = worst(states);
  if (w === "operational") return { tone: "operational", text: "Everything is working" };
  if (w === "degraded") return { tone: "degraded", text: "Some parts are slower than normal" };
  return { tone: w, text: w === "major" ? "Some parts are down" : "Some parts are partly down" };
}

/** Days for the 90-day bar. A day before monitoring began has NO data and is drawn as such, never green. */
export function dayBars(records, key, today, days = 90) {
  const byDay = new Map();
  for (const r of records) {
    const d = r.at.slice(0, 10);
    const s = r.components?.[key];
    if (!s) continue;
    const cur = byDay.get(d) ?? { checks: 0, worst: "operational", bad: 0 };
    cur.checks++;
    if (s !== "operational") cur.bad++;
    if (STATES[s].rank > STATES[cur.worst].rank) cur.worst = s;
    byDay.set(d, cur);
  }
  const out = [];
  const t = new Date(`${today}T00:00:00Z`);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(t.getTime() - i * 86400000).toISOString().slice(0, 10);
    const v = byDay.get(d);
    out.push(v ? { day: d, state: v.worst, checks: v.checks, bad: v.bad } : { day: d, state: "none", checks: 0, bad: 0 });
  }
  return out;
}

/** Uptime over the days that HAVE data only: a share of checks that found the part working. Null when none. */
export function uptime(bars) {
  const checked = bars.filter((b) => b.checks > 0);
  const n = checked.reduce((a, b) => a + b.checks, 0);
  if (!n) return null;
  const ok = checked.reduce((a, b) => a + (b.checks - b.bad), 0);
  return Math.floor((ok / n) * 10000) / 100;
}

/** How many checks the bars hold and how many found a problem. The page says this rather than a percentage: on the
 *  first day "100%" beside eighty-nine empty days reads as a claim about days nobody checked. */
export function checksSoFar(bars) {
  return bars.reduce((a, b) => ({ checks: a.checks + b.checks, bad: a.bad + b.bad }), { checks: 0, bad: 0 });
}

/**
 * Incidents derived from the checks, never written by hand: a part that is not working on TWO checks in a row
 * opens one; it is resolved after two working checks in a row. A single blip opens nothing.
 */
export function deriveIncidents(records, components = COMPONENTS) {
  const out = [];
  for (const c of components) {
    let run = [];
    let open = null;
    let goodRun = 0;
    for (const r of records) {
      const s = r.components?.[c.key];
      if (!s) continue;
      if (s === "operational") {
        run = [];
        if (open) {
          goodRun++;
          if (goodRun === 2) { open.resolvedAt = r.at; open.updates.push({ at: r.at, text: `${c.name} is working again. Our checks have found it working twice in a row.` }); out.push(open); open = null; }
        }
        continue;
      }
      goodRun = 0;
      run.push(r);
      if (!open && run.length >= 2) {
        open = {
          component: c.key,
          title: `${c.name}, ${STATES[s].label.toLowerCase()}`,
          startedAt: run[0].at,
          resolvedAt: null,
          worst: s,
          updates: [{ at: run[1].at, text: `We are looking into it. Our checks found ${c.name.toLowerCase()} ${STATES[s].label.toLowerCase()} twice in a row, first at ${clock(run[0].at)} UTC.` }],
        };
      } else if (open && STATES[s].rank > STATES[open.worst].rank) {
        open.worst = s;
        open.updates.push({ at: r.at, text: `${c.name} is now ${STATES[s].label.toLowerCase()}.` });
      }
    }
    if (open) out.push(open);
  }
  return out.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export const clock = (iso) => iso.slice(11, 16);

/**
 * Words that must never reach the public page: vendors, stack and internal names. The list itself is not kept in
 * this public repository, because naming every word to keep off the page would publish them here instead. It
 * arrives as a comma-separated list in the STATUS_BANNED_WORDS repository variable, and a build without it refuses to run (bannedOnPage).
 */
export function bannedOnPage(list = process.env.STATUS_BANNED_WORDS) {
  const words = String(list ?? "").split(",").map((w) => w.trim()).filter(Boolean);
  if (!words.length) throw new Error("STATUS_BANNED_WORDS is empty, so the page's own law cannot be checked; nothing is built");
  const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, " ?");
  return new RegExp(`\\b(${words.map(esc).join("|")})\\b`, "i");
}
