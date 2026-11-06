#!/usr/bin/env node
// publish — hand this run's page to the host as a deployment of its own, and wait until it is the one being served.
//
// WHY THIS IS NOT THE STOCK DEPLOY STEP. The host knows a deployment by its build version, and the stock step sends
// the commit as that version. This repository's commit changes a few times a year while the page is rebuilt every
// ten minutes, so every publish asked for a deployment that already existed and was told at once that it had
// succeeded. For weeks the host replaced the page anyway. From 5 November 2026, 17:50 UTC, it stopped: the checks
// kept running, every publish kept saying success, and the page people saw stayed that afternoon's copy for more
// than twelve hours, telling them the checks had gone quiet when they had not.
//
// So the version sent here belongs to one publish and no other (the commit, the run and its attempt), and the job
// is green only when the host says THAT deployment is live. Anything else fails by name: a page that silently stops
// updating is the fault this file exists to close.
//
// The functions are pure and take what they need (tested in test.mjs with a stand-in for the host). The sign-in
// token and the job token go into a header or a body and are never printed.

const API = "https://api.github.com";
const DONE = "succeed";
const FAILED = {
  deployment_failed: "the host could not deploy the page",
  deployment_content_failed: "the host refused the page's files",
  deployment_cancelled: "the deployment was cancelled",
  deployment_lost: "the host lost track of the deployment",
};

/** A version no other publish shares. A re-run of the same run is another publish, so the attempt is part of it. */
export function buildVersion(env) {
  const { GITHUB_SHA: sha, GITHUB_RUN_ID: run, GITHUB_RUN_ATTEMPT: attempt } = env;
  if (!sha || !run || !attempt) throw new Error("publish: the commit, the run and its attempt are all needed to name a version");
  return `${sha}-${run}-${attempt}`;
}

async function ask(fetchFn, url, options, what) {
  let res;
  try { res = await fetchFn(url, options); } catch (e) { throw new Error(`publish: ${what} did not answer (${e?.name ?? "error"})`); }
  let body = null;
  try { body = await res.json(); } catch { /* an empty or non-JSON answer is judged on its status alone */ }
  if (!res.ok) throw new Error(`publish: ${what} was refused (HTTP ${res.status}${body?.message ? `, ${String(body.message).slice(0, 120)}` : ""})`);
  return body ?? {};
}

/**
 * Publish the page artifact this run built. Resolves with { version, id, page } once the host reports the
 * deployment live; rejects, naming what happened, on a refusal, a failed deployment or a wait that runs out.
 */
export async function publish({ env, fetchFn = fetch, wait = (ms) => new Promise((r) => setTimeout(r, ms)), log = console.log, every = 5000, patience = 9 * 60 * 1000 }) {
  const repo = env.GITHUB_REPOSITORY, token = env.GITHUB_TOKEN;
  if (!repo || !token) throw new Error("publish: the repository and the job's token are needed");
  if (!env.ACTIONS_ID_TOKEN_REQUEST_URL || !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) throw new Error("publish: this job was not given a sign-in token to ask for (id-token: write)");
  const version = buildVersion(env);
  const gh = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "unl-status-publish" };

  const found = await ask(fetchFn, `${API}/repos/${repo}/actions/runs/${env.GITHUB_RUN_ID}/artifacts?name=github-pages&per_page=100`, { headers: gh }, "the list of this run's artifacts");
  const pages = (found.artifacts ?? []).filter((a) => a?.name === "github-pages" && !a.expired).sort((a, b) => b.id - a.id);
  if (!pages.length) throw new Error("publish: this run built no page to publish (no github-pages artifact)");

  const signIn = await ask(fetchFn, env.ACTIONS_ID_TOKEN_REQUEST_URL, { headers: { Authorization: `Bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}`, Accept: "application/json" } }, "the sign-in token");
  if (!signIn.value) throw new Error("publish: the sign-in token came back empty");

  const made = await ask(fetchFn, `${API}/repos/${repo}/pages/deployments`, {
    method: "POST", headers: { ...gh, "Content-Type": "application/json" },
    body: JSON.stringify({ artifact_id: pages[0].id, pages_build_version: version, oidc_token: signIn.value }),
  }, "the deployment");
  const id = made.id ?? version;
  log(`publish: asked for deployment ${version} of artifact ${pages[0].id}`);

  let waited = 0, last = "";
  for (;;) {
    const state = (await ask(fetchFn, `${API}/repos/${repo}/pages/deployments/${id}`, { headers: gh }, "the deployment's state")).status ?? "";
    if (state !== last) { log(`publish: ${state || "no state yet"}`); last = state; }
    if (state === DONE) return { version, id, page: made.page_url ?? "" };
    if (FAILED[state]) throw new Error(`publish: ${FAILED[state]} (${state})`);
    if (waited >= patience) throw new Error(`publish: the host did not report deployment ${version} live within ${Math.round(patience / 60000)} minutes (last state: ${state || "none"})`);
    await wait(every); waited += every;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  publish({ env: process.env }).then(
    (r) => console.log(`publish: live as ${r.version}${r.page ? ` at ${r.page}` : ""}`),
    (e) => { console.error(`::error::${e.message}`); process.exit(1); },
  );
}
