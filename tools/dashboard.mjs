#!/usr/bin/env node
/**
 * Engineering dashboard — read-only visibility snapshot across all four AI
 * environments working this repo (Claude Code, Cursor, Replit) and Sri.
 *
 * Deliberately NOT an orchestrator: this script only reads and renders state
 * that already exists (GitHub Issues/PRs/Actions, WORK/LOCK.md, git branches,
 * docs/architecture/ADR/). It assigns no work and makes no decisions — per
 * Sri's 2026-07-30 directive, autonomous task assignment stays deferred until
 * the manual/board-based workflow has demonstrably become the bottleneck.
 *
 * Every data source is best-effort: a missing `gh` auth, no network, or an
 * empty section degrades to "unavailable", never a crash — this has to be
 * safe to run from any of the four environments, some of which may not have
 * `gh` configured.
 *
 * Usage:
 *   node tools/dashboard.mjs          # markdown to stdout
 *   node tools/dashboard.mjs --html   # self-contained static HTML to stdout
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const REPO = "Sricharangellu/Ascend";
const TIERS = [
  { branch: "develop", label: "DEV" },
  { branch: "staging", label: "TESTING" },
  { branch: "master", label: "PROD" },
];

function tryRun(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

function tryJson(cmd, args) {
  const out = tryRun(cmd, args);
  if (!out) return null;
  try {
    return JSON.parse(out);
  } catch {
    return null;
  }
}

// --- Tasks + ownership: GitHub Issues by lane ---------------------------
function getIssuesByLane() {
  const lanes = ["lane:ready", "lane:in-progress", "lane:in-review", "lane:blocked"];
  const result = {};
  for (const lane of lanes) {
    const issues = tryJson("gh", [
      "issue", "list", "--repo", REPO, "--label", lane,
      "--json", "number,title,assignees,updatedAt", "--limit", "50",
    ]);
    result[lane] = issues; // null = unavailable, [] = empty, [...] = data
  }
  return result;
}

// --- Reviews: open PRs ----------------------------------------------------
function getOpenPRs() {
  return tryJson("gh", [
    "pr", "list", "--repo", REPO,
    "--json", "number,title,baseRefName,headRefName,reviewDecision,isDraft,updatedAt",
    "--limit", "50",
  ]);
}

// --- CI: latest run per tier branch --------------------------------------
function getCiStatus() {
  const result = {};
  for (const { branch } of TIERS) {
    const runs = tryJson("gh", [
      "run", "list", "--repo", REPO, "--branch", branch,
      "--json", "status,conclusion,displayTitle,createdAt,url", "--limit", "1",
    ]);
    result[branch] = runs && runs.length ? runs[0] : null;
  }
  return result;
}

// --- Deployments: tier -> branch HEAD sha (proxy; no hosting API creds assumed) ---
function getDeployState() {
  return TIERS.map(({ branch, label }) => {
    const sha = tryRun("git", ["rev-parse", "--short", `origin/${branch}`]);
    const subject = tryRun("git", ["log", "-1", "--format=%s", `origin/${branch}`]);
    return { branch, label, sha: sha?.trim() ?? "unknown", subject: subject?.trim() ?? "" };
  });
}

// --- Ownership: WORK/LOCK.md active claims (lightweight parse) ----------
function getActiveLockClaims() {
  let text;
  try {
    text = readFileSync(join(ROOT, "WORK/LOCK.md"), "utf8");
  } catch {
    return null;
  }
  const claims = [];
  const headerRe = /^##\s+(.+Claim.*)$/gm;
  let match;
  const headers = [];
  while ((match = headerRe.exec(text))) {
    headers.push({ title: match[1].trim(), index: match.index });
  }
  for (let i = 0; i < headers.length; i++) {
    const start = headers[i].index;
    const end = i + 1 < headers.length ? headers[i + 1].index : text.length;
    const block = text.slice(start, end);
    const statusMatch = block.match(/\|\s*Status\s*\|\s*([^|]+)\|/);
    const status = statusMatch ? statusMatch[1].trim() : "unknown";
    if (/^ACTIVE/i.test(status) && !/RELEASED/i.test(headers[i].title)) {
      claims.push({ title: headers[i].title, status });
    }
  }
  return claims;
}

// --- Decisions: ADR list --------------------------------------------------
function getAdrs() {
  const dir = join(ROOT, "docs/architecture/ADR");
  let files;
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
  } catch {
    return null;
  }
  return files.map((f) => {
    const text = readFileSync(join(dir, f), "utf8");
    const title = text.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? f;
    return { file: f, title };
  });
}

function gather() {
  return {
    generatedAt: new Date().toISOString(),
    issuesByLane: getIssuesByLane(),
    openPRs: getOpenPRs(),
    ciStatus: getCiStatus(),
    deployState: getDeployState(),
    lockClaims: getActiveLockClaims(),
    adrs: getAdrs(),
  };
}

// --------------------------- Markdown render -----------------------------
function renderMarkdown(d) {
  const lines = [];
  lines.push(`# Ascend Engineering Dashboard`, ``, `_Generated ${d.generatedAt}_`, ``);
  lines.push(`Read-only visibility snapshot. No task assignment happens here — see`, `` +
    `\`docs/architecture/ORCHESTRATION.md\` for why autonomous dispatch is deferred.`, ``);

  lines.push(`## Tasks (GitHub Issues by lane)`, ``);
  for (const [lane, issues] of Object.entries(d.issuesByLane)) {
    lines.push(`**${lane}**`);
    if (issues === null) lines.push(`- _unavailable (gh not authenticated?)_`);
    else if (issues.length === 0) lines.push(`- _empty_`);
    else for (const it of issues) {
      const who = it.assignees?.map((a) => a.login).join(", ") || "unassigned";
      lines.push(`- #${it.number} ${it.title} — ${who}`);
    }
    lines.push(``);
  }

  lines.push(`## Reviews (open PRs)`, ``);
  if (d.openPRs === null) lines.push(`_unavailable (gh not authenticated?)_`);
  else if (d.openPRs.length === 0) lines.push(`_none open_`);
  else for (const pr of d.openPRs) {
    const decision = pr.reviewDecision || (pr.isDraft ? "DRAFT" : "PENDING");
    lines.push(`- #${pr.number} ${pr.title} (\`${pr.headRefName}\` → \`${pr.baseRefName}\`) — ${decision}`);
  }
  lines.push(``);

  lines.push(`## CI (latest run per tier)`, ``);
  for (const { branch, label } of TIERS) {
    const run = d.ciStatus[branch];
    if (!run) lines.push(`- **${label}** (\`${branch}\`): _unavailable_`);
    else lines.push(`- **${label}** (\`${branch}\`): ${run.status}/${run.conclusion ?? "?"} — ${run.displayTitle}`);
  }
  lines.push(``);

  lines.push(`## Deployments (branch HEAD per tier — proxy, not a hosting-API read)`, ``);
  for (const t of d.deployState) {
    lines.push(`- **${t.label}** (\`${t.branch}\`): \`${t.sha}\` — ${t.subject}`);
  }
  lines.push(``);

  lines.push(`## Ownership (active WORK/LOCK.md claims)`, ``);
  if (d.lockClaims === null) lines.push(`_WORK/LOCK.md not found_`);
  else if (d.lockClaims.length === 0) lines.push(`_no active claims_`);
  else for (const c of d.lockClaims) lines.push(`- ${c.title} — ${c.status}`);
  lines.push(``);

  lines.push(`## Decisions (ADRs)`, ``);
  if (d.adrs === null) lines.push(`_docs/architecture/ADR not found_`);
  else for (const adr of d.adrs) lines.push(`- ${adr.file}: ${adr.title}`);

  return lines.join("\n");
}

// ----------------------------- HTML render --------------------------------
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderHtml(d) {
  const laneOrder = ["lane:ready", "lane:in-progress", "lane:in-review", "lane:blocked"];
  const laneCards = laneOrder.map((lane) => {
    const issues = d.issuesByLane[lane];
    const body = issues === null
      ? `<p class="muted">unavailable</p>`
      : issues.length === 0
      ? `<p class="muted">empty</p>`
      : `<ul>${issues.map((it) => `<li><span class="num">#${it.number}</span> ${esc(it.title)}<span class="who">${esc(it.assignees?.map((a) => a.login).join(", ") || "unassigned")}</span></li>`).join("")}</ul>`;
    return `<div class="card"><h3>${esc(lane)}</h3>${body}</div>`;
  }).join("");

  const prRows = d.openPRs === null
    ? `<p class="muted">unavailable</p>`
    : d.openPRs.length === 0
    ? `<p class="muted">none open</p>`
    : `<ul>${d.openPRs.map((pr) => `<li><span class="num">#${pr.number}</span> ${esc(pr.title)} <code>${esc(pr.headRefName)}</code> → <code>${esc(pr.baseRefName)}</code><span class="pill">${esc(pr.reviewDecision || (pr.isDraft ? "DRAFT" : "PENDING"))}</span></li>`).join("")}</ul>`;

  const ciRows = TIERS.map(({ branch, label }) => {
    const run = d.ciStatus[branch];
    const status = run ? `${esc(run.status)}/${esc(run.conclusion ?? "?")}` : "unavailable";
    const cls = run?.conclusion === "success" ? "ok" : run?.conclusion === "failure" ? "bad" : "muted";
    return `<tr><td>${label}</td><td><code>${branch}</code></td><td class="${cls}">${status}</td><td>${esc(run?.displayTitle ?? "")}</td></tr>`;
  }).join("");

  const deployRows = d.deployState.map((t) =>
    `<tr><td>${t.label}</td><td><code>${t.branch}</code></td><td><code>${esc(t.sha)}</code></td><td>${esc(t.subject)}</td></tr>`
  ).join("");

  const lockRows = d.lockClaims === null
    ? `<p class="muted">WORK/LOCK.md not found</p>`
    : d.lockClaims.length === 0
    ? `<p class="muted">no active claims</p>`
    : `<ul>${d.lockClaims.map((c) => `<li>${esc(c.title)} <span class="pill">${esc(c.status)}</span></li>`).join("")}</ul>`;

  const adrRows = d.adrs === null
    ? `<p class="muted">docs/architecture/ADR not found</p>`
    : `<ul>${d.adrs.map((a) => `<li><code>${esc(a.file)}</code> — ${esc(a.title)}</li>`).join("")}</ul>`;

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Ascend Engineering Dashboard</title>
<style>
:root{--bg:#0f1216;--panel:#171b21;--ink:#e8ecf1;--muted:#8b94a3;--accent:#5b8cff;--ok:#3ecf8e;--bad:#ef5b5b;--line:#262c35;}
@media (prefers-color-scheme:light){:root{--bg:#f6f7f9;--panel:#ffffff;--ink:#1a1f26;--muted:#616b7a;--accent:#3860d8;--ok:#1a8f5c;--bad:#c23b3b;--line:#e2e6ec;}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:2rem;}
h1{font-size:1.4rem;margin:0 0 .25rem}
.meta{color:var(--muted);font-size:.85rem;margin-bottom:1.5rem}
h2{font-size:1rem;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin:2rem 0 .75rem}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:1rem}
.card h3{margin:0 0 .5rem;font-size:.85rem;color:var(--accent)}
ul{list-style:none;margin:0;padding:0}
li{padding:.35rem 0;border-bottom:1px solid var(--line);display:flex;gap:.5rem;align-items:center;flex-wrap:wrap}
li:last-child{border-bottom:none}
.num{color:var(--accent);font-variant-numeric:tabular-nums}
.who,.pill{margin-left:auto;font-size:.75rem;color:var(--muted);background:var(--bg);border:1px solid var(--line);border-radius:999px;padding:.1rem .5rem}
.muted{color:var(--muted)}
table{width:100%;border-collapse:collapse;background:var(--panel);border:1px solid var(--line);border-radius:10px;overflow:hidden}
td{padding:.5rem .75rem;border-bottom:1px solid var(--line);font-size:.85rem}
tr:last-child td{border-bottom:none}
.ok{color:var(--ok)} .bad{color:var(--bad)}
code{font-family:ui-monospace,monospace;font-size:.85em}
.wrap{overflow-x:auto}
</style></head>
<body>
<h1>Ascend Engineering Dashboard</h1>
<div class="meta">Generated ${esc(d.generatedAt)} — read-only snapshot, no autonomous task assignment</div>

<h2>Tasks</h2>
<div class="grid">${laneCards}</div>

<h2>Reviews</h2>
<div class="card">${prRows}</div>

<h2>CI</h2>
<div class="wrap"><table><tbody>${ciRows}</tbody></table></div>

<h2>Deployments</h2>
<div class="wrap"><table><tbody>${deployRows}</tbody></table></div>

<h2>Ownership — active WORK/LOCK.md claims</h2>
<div class="card">${lockRows}</div>

<h2>Decisions — ADRs</h2>
<div class="card">${adrRows}</div>

</body></html>`;
}

const data = gather();
const html = process.argv.includes("--html");
process.stdout.write(html ? renderHtml(data) : renderMarkdown(data));
process.stdout.write("\n");
