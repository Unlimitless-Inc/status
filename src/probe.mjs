#!/usr/bin/env node
// THE STATUS PROBE. Runs every check in lib.mjs from OUTSIDE the infrastructure it reports on and
// appends one line to <data>/checks.jsonl: the time, each part's state, and each failed check's plain reason.
// It records an outage as a reading and exits 0; it exits 1 only when it could not judge at all (no checks ran).
//
// Usage: node src/probe.mjs <data-dir>
import { appendFileSync, mkdirSync } from "fs";
import { join } from "path";
import { COMPONENTS, judgeCheck, componentState } from "./lib.mjs";

const dir = process.argv[2];
if (!dir) { console.error("usage: probe.mjs <data-dir>"); process.exit(2); }

async function observe(check) {
  const t0 = Date.now();
  try {
    const init = { method: check.method ?? "GET", redirect: "manual", signal: AbortSignal.timeout(15000), headers: { "user-agent": "unl-status-probe/1" } };
    if (init.method === "POST") {
      init.headers["content-type"] = "application/json";
      init.headers.accept = "application/json, text/event-stream";
      init.body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "unl-status", version: "1" } } });
    }
    const res = await fetch(check.url, init);
    const body = await res.text();
    return { status: res.status, bytes: Buffer.byteLength(body), body, ms: Date.now() - t0, headers: Object.fromEntries(res.headers) };
  } catch (e) {
    return { error: String(e?.name ?? e), ms: Date.now() - t0 };
  }
}

const at = new Date().toISOString();
const components = {};
const reasons = {};
let ran = 0;
for (const c of COMPONENTS) {
  const results = [];
  for (const check of c.checks) {
    const r = judgeCheck(check, await observe(check));
    ran++;
    results.push(r);
    if (!r.ok) (reasons[c.key] ??= []).push(r.why);
  }
  components[c.key] = componentState(results);
}
if (!ran) { console.error("FAULT: no checks ran, so nothing was judged"); process.exit(1); }

mkdirSync(dir, { recursive: true });
appendFileSync(join(dir, "checks.jsonl"), JSON.stringify({ at, components, ...(Object.keys(reasons).length ? { reasons } : {}) }) + "\n");
console.log(at, JSON.stringify(components));
