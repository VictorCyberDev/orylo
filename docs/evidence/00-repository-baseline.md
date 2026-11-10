# 00 — Repository baseline (source of truth before first write)

Captured: 2026-11-10 (session start), before any file was written.

| Check | Method | Result |
|---|---|---|
| Local clone state | `git status`, `git log`, `ls -la` | Empty working tree; local branch `claude/beautiful-ptolemy-87we05` has **no commits** |
| Remote branches | GitHub API `list_branches` | `[]` — no branches (not even `main`) |
| Pull requests (all states) | GitHub API `list_pull_requests` | `[]` |
| Issues (all states) | GitHub API `list_issues` | `[]` (totalCount 0) |
| Tracked files / manifests / CI / env files | `ls`, `git ls-files` | None |
| Existing eGain material | filesystem | None |

## Deviations from the mandate (recorded, not hidden)

* **Branch name.** The mandate names `feat/orylo-complete-platform-20261110`. The execution harness
  for this session designates `claude/beautiful-ptolemy-87we05` and forbids pushing to any other
  branch without permission. All work is therefore committed to the harness branch. Renaming is a
  single `git branch -m` + push once the owner authorizes it.
* **`main` does not exist remotely.** The repository has no commits, so the "default branch `main`"
  has nothing on it yet. A pull request needs a base branch; creating `main` is an owner decision
  and is listed in the owner-authorization list in the final report.

## Toolchain observed in the build environment

| Tool | Version |
|---|---|
| Node.js | v22.23.4 |
| npm / pnpm | 10.9.9 / 10.28.0 |
| PostgreSQL server (apt) | 16.15 (started locally via `pg_ctlcluster`) |
| Docker CLI | present, **daemon not running** — Docker Compose files are provided but were *not* exercised here |
| Chromium + Playwright | pre-installed under `/opt/pw-browsers` |

## eGain access at baseline

No eGain credentials, trial tenant URL, API keys or browser session are available in this
environment. Consequently **no live eGain configuration or published agent can be verified from
this session**. See `docs/hackathon/entitlement-audit.md`.

Public hackathon rules were read from <https://www.egain.com/ai-agent-hackathon/> on 2026-11-10
(page `modifiedTime` 2026-11-09). It states **November 15, 11:59 PM PST** as the submission
deadline; the internal target stays **November 12, 2026 23:30 Africa/Lagos** per the mandate.
