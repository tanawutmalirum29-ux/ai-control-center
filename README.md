# AI Control Center

ศูนย์จัดการโปรเจกต์ GitHub ผ่านเว็บไซต์สำหรับ OWNER และ AI ที่เปิดเว็บด้วย ChatGPT Work / เครื่องมือเบราว์เซอร์ที่ได้รับอนุญาต

- **Production:** https://ai-control-center.tanawutmalirum29.workers.dev
- **Code:** https://github.com/tanawutmalirum29-ux/ai-control-center
- **Organization rules:** https://github.com/tanawutmalirum29-ux/ai-organization-hub
- **Staging:** https://github.com/tanawutmalirum29-ux/Staging_area
- **Cost model:** Cloudflare Workers / GitHub Free, no paid OpenAI API

## Current organization workflow (October 2026)

**AI workspace first:** the Organization Rooms tab is the default landing page. Each project/mission gets its own Cloudflare D1 room, M-numbered messages and T-numbered task cards, without creating GitHub Issues. The CEO chooses EN1–EN5 and appoints an independent QA. Previous Issue-based CEO pages are retained under Advanced and described later in this README as legacy flows.

**First CEO:** either an authenticated OWNER creates a private one-time link, **or** a permitted GitHub repository writer clicks **เตรียม CEO ด้วยสิทธิ์เขียน GitHub**, creates the exact generated GitHub proof Branch from `main`, then activates the separate private 24-hour CEO link. Existing verified CEOs can issue successor links without OWNER approval. Anonymous visitors and GitHub read-only users cannot become CEO.

See [Organization Workspaces setup](docs/ORGANIZATION_WORKSPACES_SETUP.md) for exact steps and trust limits. GitHub write-proof verification does not mean ChatGPT chats are awakened automatically, and CI alone does not replace independent QA.

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
| Merge and repository deletion | Not exposed through the website |
| Bulk Git Branch deletion | Owner-only Preview + SHA-verified batches, always retains default branch `main`, refuses protected branches and reports open PRs |
| Permanent Issue deletion | Owner-only Preview + confirmed batched GitHub GraphQL deleteIssue, including Open/Closed, excluding PRs |
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
- No browser-based Merge or repository deletion buttons. Branch deletion and Issue deletion are OWNER-only exceptions requiring preview, typed repository confirmation, checkbox, and fresh GitHub node verification. Workflow dispatch is restricted to `acc/` Branches and requires explicit confirmation.
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

## V12 — Independent AI (not an organization role)

OWNER or an authorized CEO can issue a limited GUEST-ENGINEER link from CEO Dashboard > AI ภายนอกที่กำลังทำงาน. No AP-ROLE or organization membership is needed. The existing AI receives a one-line MN link, opens Workspace, creates its own guest branch, commits text files and opens a Draft PR. Main merges, delete operations, Issue mutations and delegation are not permitted.

Without GITHUB_APP_PRIVATE_KEY, OWNER may still mint a short temporary guest link from the existing GitHub App OAuth session, capped by its remaining lifetime. The signed link contains an AES-GCM encrypted OAuth credential; the Worker decrypts it server-side and enforces guest branch isolation. No plaintext GitHub OAuth token is sent to JavaScript. GitHub App installation and permissions on the target project are still required. Possession of the URL grants use until expiry. GitHub App installation-based team delegation remains separately configured.

## Permanent Issue cleanup (OWNER only)

The **ศูนย์สั่งงาน GitHub** page includes a permanently destructive Issue cleanup panel for the selected repository. GitHub GraphQL `deleteIssue` removes the issue itself (and its discussion), not just its state. Open and closed Issues are included, but pull requests are excluded. The GitHub issue-number sequence cannot be reset by deletion.

1. Sign into the configured GitHub App as the exact repository owner (server-verified encrypted owner session); a central `GITHUB_WRITE_TOKEN` or delegated AI credential can **never** authorize deletion.
2. Select the repository, open **ศูนย์สั่งงาน GitHub**, and click **ตรวจรายการ (Preview)**. Inspect the total and export the JSON snapshot if needed. This export is *not* a backup of comments or attachments.
3. Tick the Issues to delete, or click **เลือกทั้งหมด**. Click **ลบ Issues ที่เลือก**, inspect the on-page repository and selected-count summary, then click **ยืนยัน ลบถาวร** (or Cancel). No phrase typing is required. The browser generates the repository confirmation field for the authenticated API, which still checks exact IDs and updated timestamps. Each batch deletes up to five issues and stops on mismatch or GitHub errors.
4. Verify the final recount reads 0. GitHub Actions unit tests use mocked GraphQL: they never delete real issues. In addition, manual owner-login and live GraphQL permission checks must be performed against a **disposable test repository** before relying on deletion for important data.

API: `GET /api/v1/maintenance/issues/preview?repo=...` and `POST /api/v1/maintenance/issues/delete`. Both strictly require the owner OAuth session. The GitHub App must have suitable permissions for the GraphQL mutation, and GitHub itself requires the personal account owner for permanent deletion. This intentionally is not available to CEO/Engineer/QA delegated sessions or anonymous central-token users.

## Cleanup Git Branches (keep `main` only)

Select a repository and open **Operations / Cleanup**. The **ลบ Branch ทั้งหมด — เก็บ main เท่านั้น** panel is separate from permanent Issue deletion.

1. Sign in to GitHub as the exact configured OWNER account. Central site-wide tokens, public users, and delegated AI agent sessions cannot call the deletion API.
2. Press **ตรวจ Branch (Preview)**. The server reads the real repository's default branch and refuses to continue unless it is exactly `main`; it reads ALL branches and lists Open PRs for same-repository head branches. `main` is never considered a candidate. A branch protection flag blocks the bulk run until that branch is handled separately. Protected `main` is safe.
3. Review the branch list, PR references and commit SHAs. Make a backup **outside this tool** if there is code that is not yet merged. Copying Preview JSON is a list of references, **not** a code backup.
4. Tick individual Branches, use **เลือกทั้งหมดที่ลบได้** (excludes protected branches and main), or use **เลือกเฉพาะไม่มี PR** to avoid branches with open PRs. Click **ลบ Branch ที่เลือก** and review the warning including how many selected branches have open PRs. Click **ยืนยัน ลบ Branch** or **ยกเลิก**. No typing is required; the browser sends the exact repository confirmation and risk acknowledgements only after this second click. The server checks branch SHAs and protection flags and deletes in batches of five.
5. The browser refreshes a fresh Preview to confirm the final number of non-`main` branches remaining. If 0, only `main` remains; if nonzero, inspect the error and any remaining protected branches.

**Important:** Deleting branches with open PRs can disrupt those PRs. The tool does not merge PRs, recover commits, save ZIP archives or force-remove GitHub rulesets. It cannot reset GitHub Issue numbering. GitHub's REST Delete a reference API requires repository Contents: Write permission, and responds with 204 on successful deletion. Deploying the code and passing mocked tests does not prove your GitHub OAuth installation has this permission. Validate one disposable test branch in a disposable repository before mass deleting production work.

Owner-only endpoints: `GET /api/v1/maintenance/branches/preview?repo=...` and `POST /api/v1/maintenance/branches/delete`. The deletion endpoint checks explicit acknowledgement fields, the name-specific confirmation phrase, default branch, branch name, exact head SHA and protection flag on each batch. The API rejects `main` under all inputs.

### Simple click-based deletion UI (October 23, 2026)

Both cleanup panels use only mouse/touch/keyboard selection: load preview → select individual or all items → click Delete Selected → review the selected repository and count → click Final Confirm. Changing repository or selection closes the confirmation; successful/partial deletion triggers a fresh GitHub recount. Protected branches are not selectable. Keeping the backend's exact confirmation phrase is intentional to prevent ambiguous API calls, even though the user never has to type it.
