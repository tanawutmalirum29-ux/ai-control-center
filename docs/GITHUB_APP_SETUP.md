# AI Control Center: one-time GitHub App setup

The AI Control Center uses one GitHub App to access GitHub from Cloudflare. Engineer, QA, and CEO do **not** connect their own GitHub accounts. The only initial owner action is to authorize OWNER once to issue the first CEO link.

## One-time requirements

1. Use your existing GitHub App (the App is not the same as a personal access token). Ensure it is installed on selected repositories, including **ARCANA-SURVIVOR** and **ai-control-center**. Keep the central governance repo **ai-organization-hub** read-only.
2. In GitHub App permissions choose **Contents: Read/Write**, **Issues: Read/Write**, **Pull requests: Read/Write**, **Actions: Read** (optional Write for explicit Workflow Dispatch), and **Metadata: Read**. Complete any prompted installation permission update.
3. At GitHub App > General, set callback URL to **https://ai-control-center.tanawutmalirum29.workers.dev/api/auth/callback**. Obtain the App Client ID and create a Client Secret and a Private Key (.pem).
4. In Cloudflare Workers > ai-control-center > Settings > Variables and Secrets save these **as encrypted Secrets**:
   - `GITHUB_CLIENT_ID`: GitHub App Client ID
   - `GITHUB_CLIENT_SECRET`: GitHub App OAuth Client Secret
   - `GITHUB_APP_PRIVATE_KEY`: full text of the GitHub App .pem Private Key (including BEGIN/END lines)
5. Confirm **/api/health** reports `delegation_ready: true`; this flag proves secrets are present, not that installation permissions have passed a write test.
6. OWNER signs in at the website **once** using “เชื่อม GitHub” and chooses a Repository > CEO Dashboard > **ออกลิงก์แต่งตั้ง CEO**. Send that AP-ROLE line to the CEO chat.

## Normal mission cycle (no personal GitHub login for ChatGPT agents)

- CEO opens the link and receives a signed **7-day** project management session in an HttpOnly cookie. CEO can create appointment Issues, read operations, create workspaces and PRs.
- CEO creates a proper Engineer/QA appointment Issue with `TO_ROLE`, `AGENT_SLOT`, `PARENT_ISSUE`, and `EDITABLE_PATHS`. CEO selects that Issue under “ตั้งต้น CEO และส่งสิทธิ์ต่อให้ทีม” and creates a signed **12-hour** per-task link.
- OWNER simply relays the one-line AP-ROLE message to the recipient's existing ChatGPT chat.
- Engineer may commit UTF-8 text files only inside the specified `EDITABLE_PATHS`, on a new task-namespaced `acc/issue-N-...` branch, then open a Draft PR. QA may read, comment and set WAITING_QA or QA_BLOCK for its own Issue but cannot commit.
- CEO reviews evidence and independent QA before any separate authorized merge. The website does not provide Merge/Delete endpoints.

## Limits and correct expectations

GitHub App must have an installation granting access to each repo; a repo's inclusion in `WRITE_REPOS` alone does **not** grant permission. No GitHub credential is sent to the browser. Link possession is the identity: anyone with a signed link can act within its scope until expiry. This is **not** an AI-versus-human detector. Links are reusable until expiry; no self-service revocation or database-backed task lease exists yet. If an invite is compromised, rotate the signing secret, which invalidates all existing sessions. Existing V1 signed links are not accepted after the v2 update.

There is still **no autonomous AI runtime**; creating an Issue cannot start a new ChatGPT session. OWNER remains the relay between separately running chats, consistent with the chosen workflow.

For verification, see `test/delegation.test.js`, `test/work-api.test.js` and `test/ops-api.test.js`, and GitHub Actions QA on main. Do not interpret a successful CI or Cloudflare deployment as proof that GitHub App secrets and installation permissions are configured in production.

## Existing independent AI: minimal handoff

If /api/health reports auth_ready=true and delegation_ready=false, owner may use an OAuth-backed guest link without adding a Cloudflare private key.

- OWNER opens AI Control Center and logs in to GitHub once.
- Selects ARCANA-SURVIVOR, then CEO Dashboard > AI ภายนอกที่กำลังทำงาน.
- Enters a short instruction and clicks ออกลิงก์ AI อิสระ; send the generated one-line MN URL to the AI already working.
- AI opens link, goes to Workspace, creates an isolated acc/guest branch, reads files, edits, commits and creates Draft PR.

The encrypted delegation uses AES-GCM + HMAC tied to GITHUB_CLIENT_SECRET, limited to the original owner OAuth session expiry and four hours maximum. The URL is a bearer capability and can be used by anyone who receives it. Do not publish it. No live authenticated GitHub write test has been certified as part of CI.
