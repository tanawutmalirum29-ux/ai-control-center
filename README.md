# AI Control Center

ศูนย์จัดการโปรเจกต์ GitHub ผ่านเว็บไซต์สำหรับ OWNER และ AI ที่เปิดเว็บด้วย ChatGPT Work / เครื่องมือเบราว์เซอร์ที่ได้รับอนุญาต

- **Production:** https://ai-control-center.tanawutmalirum29.workers.dev
- **Code:** https://github.com/tanawutmalirum29-ux/ai-control-center
- **Organization rules:** https://github.com/tanawutmalirum29-ux/ai-organization-hub
- **Staging:** https://github.com/tanawutmalirum29-ux/Staging_area
- **Cost model:** Cloudflare Workers / GitHub Free, no paid OpenAI API

## Real capabilities (V8)

| Feature | Support |
| --- | --- |
| Read Issues, PRs, QA and task queue | Public read-only API with 2-minute edge cache and stale fallback |
| Role/status evidence | Label-based READY / IN_PROGRESS / WAITING_QA / QA_BLOCK / PAUSED; APPOINTED from explicit manual activation hold |
| PR QA | Inspect checks and reviews on exact PR head SHA; not a substitute for manual QA |
| Organization | Six bundled Markdown documents from ai-organization-hub/main, pinned by SHA; optional live comparison |
| Issue creation | Owner GitHub App sign-in, role/scope/3-repo links/organization snapshot SHA in Issue body |
| Issue comments, GitHub assignees and human status labels | Owner-only operations API; does not wake an AI agent |
| Workspaces | Create `acc/` Branch, edit UTF-8 text files ≤45 KB, commit to Branch, create Draft PR |
| Actions | Owner-only list Workflows, Runs and Jobs/Steps; dispatch on `acc/` Branch requires Actions Write permission and explicit confirmation |
| Automated code checks | `npm run check` + `npm test` via .github/workflows/qa.yml |
| Merge, repository deletion, branch deletion | Not exposed through the website |
| Autonomous agents, independent agent auth, durable claims, multi-agent execution | **Not implemented** |

## First-time setup

1. Create/install your GitHub App on **selected repositories** in GitHub Settings > Developer settings > GitHub Apps. Minimum Issues RW, Contents RW, Pull requests RW, Actions Read. To dispatch Actions, intentionally enable Actions Write and authorize the updated installation permissions.
2. Configure GitHub App callback URL `https://ai-control-center.tanawutmalirum29.workers.dev/api/auth/callback`.
3. In Cloudflare Worker > Settings > Variables and Secrets, add two **Secret-type** variables: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`. Never paste the client secret, PAT, or private key into the repository, website inputs or ChatGPT messages.
4. Open Production and click **เชื่อมต่อ GitHub**. Only the configured GitHub owner is permitted to authenticate.
5. For a new work order, choose the Repository > **ควบคุมงาน** > create Issue with role/scope/QA. To edit code, go to **พื้นที่ทำงาน** and create a Branch. After edits, create a **Draft PR** for QA.
6. For current organization rules, go to **องค์กร AI**. Full copies are embedded in `public/organization-bundle.json`; press **อ่านกฎล่าสุด** to compare pinned snapshot SHA against the live organization main. If newer, re-bundle from the latest verified main before using the template for a new mandate.

The control center uses GitHub as its source of truth for code, Issues, labels, assignments, comments, CI and branch history. No extra database has been provisioned.

## GitHub APIs

Public: `/api/health`, `/api/v1/repositories`, `/api/v1/queue`, `/api/v1/summary`, `/api/v1/pr-qa`, `/api/v1/organization` (live), `/api/v1/organization/bundle` (pinned), and `/api/v1/organization/bundle/document?name=RULES.md`.

Owner-only: `/api/auth/me`, `/api/v1/work/*`, and `/api/v1/ops/*` (issues, comments, assignment, status, workflows, runs, jobs, guarded dispatch).

Writes require owner authorization and same-origin JSON. Tokens are held inside encrypted, Secure, HttpOnly session cookies handled by the Worker, not exposed to JavaScript. The GitHub App must also be installed on the target Repository.

## QA and safeguards

- All edits go through an isolated `acc/` Branch; direct editing of `main` is blocked by the workspace API.
- PR creation is **Draft only**. CI pass is not independent QA, and `CHECKS_PASS_REVIEWED` is not permission to merge.
- No browser-based Delete/Merge buttons or endpoints. Workflow dispatch is restricted to `acc/` Branches and requires explicit confirmation.
- Assignment of a GitHub issue to a username is not execution of a ChatGPT agent. A generated AP-ROLE is an instruction record awaiting real session activation by the OWNER.
- The website currently has **one authorized OWNER GitHub identity**, not distinct AI agent credentials. Multiple browser sessions sharing that owner identity must not be treated as separately authorized engineers or independent QA.
- The bundled organization rules can become older than `ai-organization-hub/main`; snapshot SHA and live SHA are displayed separately.

## Development

```bash
npm run check
npm test
npx wrangler deploy
```

The GitHub workflow `.github/workflows/qa.yml` runs syntax checks and Node unit tests. Production deploy is handled by the existing Cloudflare Workers Build integration. Browser tests, real GitHub App permission tests, and exact PR QA still require separate real-world verification.

## Next engineering phase

True autonomous multi-AI orchestration requires per-agent identities and revocable scopes, durable assignment/lease state, branch/file ownership, an audit log, safe execution sandbox, MCP/agent gateway and independent QA approvals. A public URL, GitHub Issue, or ChatGPT Plus subscription does not by itself start an AI worker. Do not distribute shared permanent PATs to AI workers.

Detailed setup: [docs/GITHUB_APP_SETUP.md](docs/GITHUB_APP_SETUP.md), [docs/WORKSPACES.md](docs/WORKSPACES.md), [docs/QUEUE_QA.md](docs/QUEUE_QA.md), [docs/SECURITY.md](docs/SECURITY.md).

## CEO-first workflow
The default home is CEO Dashboard. Each repo is a separate project; CEO appoints Engineer/QA directly under a parent CEO issue. Work orders are GitHub Issues with AGENT_SLOT, PARENT_ISSUE, REPORTS_TO, EDITABLE_PATHS, organization snapshot SHA and three repository links. Relay Inbox renders one-line AP-ROLE messages for OWNER to deliver to a separate ChatGPT session. My Work filters by role and links to the existing branch editor. The Mission Board API GET /api/v1/mission?repo=... is public read-only and cached 2 minutes, with stale fallback. CEO operations require an authorized browser session, as before. A GitHub Issue cannot instantiate an AI; a role filter is not agent authentication. No implicit merge or QA bypass.

## V11 — Owner → CEO → task agent delegation
The owner uses the signed-in GitHub OAuth session only to issue the first CEO link on the CEO Dashboard. CEO activates a repo-scoped 7-day link without GitHub login, creates appointment Issues and delegates existing Engineer/QA Issues for 12 hours. Engineer can edit only acc/issue-N-* Branches and EDITABLE_PATHS, and may comment/update their Issue. QA can read, comment and set WAITING_QA/QA_BLOCK on its own Issue; QA cannot change code. No merge or delete. Server verifies signed claims on every work/ops request, using a GitHub App installation token behind Cloudflare. Prerequisites: GITHUB_APP_PRIVATE_KEY Secret, Client ID/Secret, App installed and permitted on selected repositories. The role link identifies an authorized browser session, not whether it is AI. Existing V1 invitations are invalidated. No database-based revocation yet; expiry is enforced.
