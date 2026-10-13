#!/usr/bin/env node
// THE EMAIL NOTICES. After each check, the page's own incidents decide what is told: one email
// when an incident opens and one when it is resolved, never one per check. Subscribers are held by Resend in the
// "Status updates" segment and opted in to the "Status updates" topic; they joined through Unl's confirm-by-email
// door, and every email carries Resend's own one-click unsubscribe.
//
// WHY HERE AND NOT ON UNL. An email saying Unl is down has to be sent by something that is not Unl, so it goes from
// these checks, on GitHub's runners, with the RESEND_API_KEY secret.
//
// WHAT HAS BEEN TOLD is kept in <data>/notified.json on the status-data branch, keyed by incident, so a notice is
// sent once even though the checks run every ten minutes. It is written only after Resend accepted the send, so a
// failed send is tried again on the next run. The first run with no file records every incident already on the page
// as told without sending anything: nobody is emailed about the past.
//
// A REHEARSAL (--rehearse) plays one incident on a test part that is not on the page, opened then recovered, to
// the "Status rehearsal" segment only. It never reads or writes notified.json and never sends to the public list.
//
// Usage: node src/notify.mjs <data-dir>            (after probe.mjs; needs RESEND_API_KEY)
//        node src/notify.mjs --rehearse            (needs RESEND_API_KEY)
//        add --dry to print what would be sent, sending nothing
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { COMPONENTS, STATES, deriveIncidents, clock } from "./lib.mjs";

export const STATUS_SEGMENT = "Status updates";
export const REHEARSAL_SEGMENT = "Status rehearsal";
export const STATUS_TOPIC = "Status updates";
export const FROM = "Unl status <status@unlimitless.ai>";
export const PAGE = "https://status.unlimitless.ai/";

/** The test part a rehearsal plays on. Never in COMPONENTS, so never on the page. */
export const REHEARSAL_PART = { key: "rehearsal", name: "A test part", checks: [] };

export const incidentKey = (inc) => `${inc.component}@${inc.startedAt}`;

/** Which notices are due, oldest first, given what has been told. Pure. */
export function noticesDue(incidents, told) {
  const due = [];
  for (const inc of [...incidents].sort((a, b) => a.startedAt.localeCompare(b.startedAt))) {
    const t = told[incidentKey(inc)] ?? {};
    if (!t.opened) due.push({ kind: "opened", inc });
    if (inc.resolvedAt && !t.resolved) due.push({ kind: "resolved", inc });
  }
  return due;
}

/** The first run: every incident already known is recorded as told, so nothing about the past is sent. Pure. */
export function baseline(incidents) {
  return Object.fromEntries(incidents.map((i) => [incidentKey(i), { opened: true, resolved: !!i.resolvedAt }]));
}

const nameOf = (key, parts) => parts.find((c) => c.key === key)?.name ?? key;
const longDate = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** One notice in the page's own plain words. Pure. */
export function noticeFor(kind, inc, { parts = COMPONENTS, rehearsal = false } = {}) {
  const part = nameOf(inc.component, parts);
  const tag = rehearsal ? "Rehearsal. " : "";
  const when = (iso) => `${longDate(iso)}, ${clock(iso)} UTC`;
  const subject = kind === "opened"
    ? `${tag}${part} is ${STATES[inc.worst].label.toLowerCase()}`
    : `${tag}${part} is working again`;
  const lines = kind === "opened"
    ? [`${part} is ${STATES[inc.worst].label.toLowerCase()}. Our checks found it twice in a row, first at ${when(inc.startedAt)}.`, `We are looking into it, and you will get one more email when it is working again.`]
    : [`${part} is working again. Our checks have found it working twice in a row, at ${when(inc.resolvedAt)}.`, `It was not working from ${when(inc.startedAt)}.`];
  if (rehearsal) lines.unshift("This is a rehearsal on a test part. Nothing is wrong with Unl.");
  const text = [...lines, `See every part now at ${PAGE}`, `You asked for these emails on the Unl status page. To stop them, unsubscribe here {{{RESEND_UNSUBSCRIBE_URL}}}`].join("\n\n");
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#111">${lines.map((l) => `<p>${esc(l)}</p>`).join("")}
<p><a href="${PAGE}">See every part now</a></p>
<p style="color:#555;font-size:13px">You asked for these emails on the Unl status page. <a href="{{{RESEND_UNSUBSCRIBE_URL}}}">Unsubscribe</a> to stop them.</p></div>`;
  return { subject, text, html };
}

/** The rehearsal's own history: the test part down twice, then working twice. Pure. */
export function rehearsalIncident(now = new Date()) {
  const at = (min) => new Date(now.getTime() - (40 - min) * 60000).toISOString();
  const recs = [0, 10, 20, 30].map((m, i) => ({ at: at(m), components: { rehearsal: i < 2 ? "major" : "operational" } }));
  return deriveIncidents(recs, [REHEARSAL_PART]);
}

// ── Resend ──
async function resend(key, method, path, body) {
  const r = await fetch(`https://api.resend.com${path}`, {
    method, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let j = null; try { j = await r.json(); } catch {}
  if (!r.ok) throw new Error(`resend ${method} ${path.split("/")[1]} ${r.status}`);
  return j;
}
async function idByName(key, kind, name) {
  const j = await resend(key, "GET", `/${kind}`);
  return (j?.data ?? []).find((x) => x?.name === name)?.id ?? null;
}
async function broadcast(key, segmentName, notice) {
  const segment = await idByName(key, "segments", segmentName);
  const topic = await idByName(key, "topics", STATUS_TOPIC);
  // No list yet means nobody has subscribed: nothing to send, which is not a fault.
  if (!segment || !topic) return "no list yet";
  await resend(key, "POST", "/broadcasts", { segment_id: segment, topic_id: topic, from: FROM, subject: notice.subject, text: notice.text, html: notice.html, name: notice.subject, send: true });
  return "sent";
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const key = String(process.env.RESEND_API_KEY ?? "").trim();
  if (!key && !dry) { console.log("FAULT: no RESEND_API_KEY, so no notice can be sent"); process.exit(1); }

  if (args.includes("--rehearse")) {
    const [inc] = rehearsalIncident();
    for (const kind of ["opened", "resolved"]) {
      const n = noticeFor(kind, inc, { parts: [REHEARSAL_PART], rehearsal: true });
      console.log(`rehearsal ${kind}: ${dry ? "would send" : await broadcast(key, REHEARSAL_SEGMENT, n)} · ${n.subject}`);
    }
    return;
  }

  const dir = args.find((a) => !a.startsWith("--"));
  if (!dir) { console.error("usage: notify.mjs <data-dir> | --rehearse [--dry]"); process.exit(2); }
  const file = join(dir, "checks.jsonl");
  const records = existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).sort((a, b) => a.at.localeCompare(b.at)) : [];
  const incidents = deriveIncidents(records);
  const store = join(dir, "notified.json");
  if (!existsSync(store)) {
    if (dry) { console.log(`first run: would record ${incidents.length} known incident(s) as told, sending nothing`); return; }
    writeFileSync(store, JSON.stringify({ _why: "What the email notices have told, by incident. See src/notify.mjs.", told: baseline(incidents) }, null, 2) + "\n");
    console.log(`first run: ${incidents.length} known incident(s) recorded as told, nothing sent`);
    return;
  }
  const saved = JSON.parse(readFileSync(store, "utf8"));
  const told = saved.told ?? {};
  const due = noticesDue(incidents, told);
  if (!due.length) { console.log("no notice due"); return; }
  for (const { kind, inc } of due) {
    const n = noticeFor(kind, inc);
    if (dry) { console.log(`would send ${kind}: ${n.subject}`); continue; }
    const outcome = await broadcast(key, STATUS_SEGMENT, n);
    (told[incidentKey(inc)] ??= {})[kind] = true;
    writeFileSync(store, JSON.stringify({ ...saved, told }, null, 2) + "\n");
    console.log(`${kind}: ${outcome} · ${n.subject}`);
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  main().catch((e) => { console.log(`FAULT: ${e?.message ?? e}`); process.exit(1); });
}
