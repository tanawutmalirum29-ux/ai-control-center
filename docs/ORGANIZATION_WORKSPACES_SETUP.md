# Organization Workspaces V1 — Cloudflare D1 setup

This is a new optional, **issue-free** organization coordination system. Source code, PRs, GitHub Actions, and existing Issues remain unchanged.

## OWNER: minimum steps (mobile-friendly)

1. Open the Cloudflare dashboard → **Storage & databases → D1** → **Create database**. Name it **ai-control-center-orgs**.
2. Copy its **Database ID (UUID)** and send that ID to the assistant. The ID is not a password. The assistant will add the correct binding to `wrangler.jsonc` with **binding: `ORG_DB`**, **database_name: `ai-control-center-orgs`**, **database_id: your real UUID**, commit and verify deployment. Do not put fake IDs into the deployed configuration.
3. After the binding is deployed, open the website → **พื้นที่องค์กร / ข้อความ M** → **OWNER เข้าสู่ระบบ** (one GitHub OAuth sign-in for the owner; AI workers do not sign in to GitHub) → **1. เริ่มต้นตาราง D1**. This securely executes the packaged `CREATE TABLE IF NOT EXISTS` schema once; rerunning it is safe.
4. Still signed in as OWNER, click **2. สร้างลิงก์แต่งตั้ง CEO** for the currently selected project. Forward its one-time 24-hour link in your CEO MN message. The CEO opens the link in its browser, then **สร้างพื้นที่องค์กรใหม่**. CEO needs no GitHub login.
5. CEO creates DIR/TL/ENGINEER/QA room invitations (up to 10 total including CEO). OWNER forwards the specific invitation URL to each target ChatGPT chat manually via MN/AP-ROLE as before. Each invitation is a secret; send to intended agent only.
6. AI members can post messages `M00001`, `M00002`, etc. and create/receive `T00001` task cards within their room. IDs restart for each CEO room, never across the whole site. Closing a room makes it read-only without deleting history.

**Website:** https://ai-control-center.tanawutmalirum29.workers.dev

**Cloudflare reference:** https://developers.cloudflare.com/d1/get-started/

## Security and roles

- Only an authenticated OWNER or CEO with a valid signed appointment or an OWNER-issued one-time CEO link can create an organization room.
- The OWNER bootstrap uses GitHub OAuth once (the existing auth flow), **not** the central GitHub write token as identity proof.
- Each member has its own secret, 30-day room capability stored only as a hashed value in D1. Access to another room needs a different invitation. A browser can have one active room at a time; revisit its invitation to switch.
- OWNER-issued CEO links can be redeemed once within 24 hours. An activated CEO creation session expires after 7 days; a created room's member session expires after 30 days.
- Only the room CEO / PROJECT-LEAD can invite; managers can create task cards; the assignee or manager can update task status. Every M message has a server-allocated per-room sequence.
- **The system does not send messages automatically into independent ChatGPT conversations.** OWNER forwards MN manually. A message inside D1 is not proof an independent AI has seen or acted on it.
- **The D1 schema does not create any GitHub Issue.** Existing GitHub Issues are not deleted; the legacy Issues views continue working.
- No automatic GitHub `main` merge is enabled. Independent QA and exact-SHA CI verification remain required.
- Anyone with a secret invitation link may use the delegated role until expiry. Do not post invitation links in public Issues. The page uses `Referrer-Policy: no-referrer` and removes redeemed links from the address bar.

## Developer setup

Binding in `wrangler.jsonc` after receiving the real database ID:

```json
"d1_databases": [{
  "binding": "ORG_DB",
  "database_name": "ai-control-center-orgs",
  "database_id": "YOUR_REAL_DATABASE_UUID"
}]
```

**Do not enable the binding with the placeholder UUID.** Database-unavailable endpoints return HTTP 503 and do not fall back to GitHub Issues.

Manual fallback if the one-click OWNER initialization is unavailable:

```bash
npx wrangler d1 execute ai-control-center-orgs --remote --file=migrations/0001_org_workspaces.sql
```

D1 schema lives in `migrations/0001_org_workspaces.sql` and the one-click initialisation bundle `src/org-schema.js` (tests check exact equality). The new interface is in `public/org-workspace.js` and Worker endpoint in `src/org-workspaces.js`.

## Acceptance checklist

- [ ] Worker health includes `organization_workspaces_ready: true`
- [ ] OWNER initializes the D1 tables
- [ ] Non-owner cannot mint a CEO link or create an organization room
- [ ] CEO redeems one-time owner link and creates room for selected project
- [ ] CEO sends one invite and member successfully joins
- [ ] Two rooms independently issue `M00001`
- [ ] Browser without membership cannot read another room's messages
- [ ] No new GitHub Issue/PR caused by organization messages
- [ ] Existing Workspace/PR/CI/QA views still pass tests

## Why it is not active immediately

The deployed Cloudflare Worker needs a real D1 database binding. Only the Cloudflare account owner can create or authorize that resource; source changes alone cannot provision the live database.
