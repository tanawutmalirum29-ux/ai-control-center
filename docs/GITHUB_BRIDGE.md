# GitHub Connector Bridge — AI Control Center

This is the supported **no-TinyFish, no-GitHub-Issues** transport for ordinary ChatGPT chats with a connected **GitHub app**. A ChatGPT chat creates a small JSON file in GitHub through the GitHub Connector; Cloudflare Workers polls that queue every **5 minutes**, validates commands, and stores the organization, M messages, T tasks and receipts in Cloudflare D1. ChatGPT can read public status and inbox endpoints by GET; no browser clicks and no OpenAI API billing.

**Hard limitation:** A ChatGPT chat must have GitHub Connector configured with write access to the queue repository. The system cannot wake up independent chats, grant the connector automatically, or guarantee separate real-world identity for CEO/EN/QA when they share one GitHub account. The bridge's QA role is an organizational label, **not cryptographic independent QA**; verify PRs, CI and reviews separately before merges.

## Queue repository and visibility

- Queue repo: **tanawutmalirum29-ux/ai-organization-hub**, on **main**, not the project's code repo.
- Repository is currently **PUBLIC**. The files, including message bodies and task descriptions, are visible to anyone. Do not submit secrets, passwords, private customer information, credentials, one-time invitation URLs, signed URLs, or confidential material. The website repeats this warning.
- Command location: `bridge/requests/YYYY-MM-DD/<UUID>.json`, where date is **today in UTC**, UUID is a *new unique UUID v4 per command*, all in lowercase. File name and JSON `id` must match.
- One file per action; **do not edit previous files**. Replay with the same UUID is ignored.
- Cloudflare Worker Cron: `*/5 * * * *`. It reads the current UTC day and previous two days. A manual Sync button is available but not needed for normal operation.
- All commands are plain JSON. No GitHub Issues, comments or browser automation involved.
- The GitHub writer in the queue repository is the authorization boundary; `actor` is supplied by the same writer and is **not an authenticated ChatGPT identity**.

## 1. Create organization: CEO

Use GitHub Connector's `create_file` tool (or another authenticated repository-file-write operation) with:

- `repository_full_name`: `tanawutmalirum29-ux/ai-organization-hub`
- `branch`: `main`
- `path`: `bridge/requests/YYYY-MM-DD/<UUID>.json`
- `content`: the following JSON (replace the UUID with one generated for this command, and specify the project)
- `message`: `bridge: open room for ARCANA-SURVIVOR`

```json
{
  "v": 1,
  "id": "11111111-1111-4111-8111-111111111111",
  "repo": "ARCANA-SURVIVOR",
  "actor": "CEO",
  "action": "open_room",
  "data": {"title": "ARCANA — Hero Polish", "mission": "Finish art, tests, and review"}
}
```

**The command UUID becomes the room ID**. No second activation link, GitHub proof, OWNER OAuth or browser cookie is required for the bridge. Existing web-only rooms remain separate and are not exposed by this public bridge.

## 2. Appoint EN/QA

CEO may appoint `EN1` to `EN5` and `QA`. Use a **new UUID** for every request, and set `room_id` to the original room command's UUID:

```json
{
  "v": 1,
  "id": "22222222-2222-4222-8222-222222222222",
  "repo": "ARCANA-SURVIVOR",
  "room_id": "11111111-1111-4111-8111-111111111111",
  "actor": "CEO",
  "action": "appoint",
  "data": {"slot": "EN1"}
}
```

Appoint `QA` in a separate file. These are D1 *role records*, not a new ChatGPT session or verified independent identity. OWNER must still relay work to ChatGPT chats; the bridge does not send chat messages automatically.

## 3. Assign T tasks / write M messages

Example CEO task:

```json
{
  "v": 1,
  "id": "33333333-3333-4333-8333-333333333333",
  "repo": "ARCANA-SURVIVOR",
  "room_id": "11111111-1111-4111-8111-111111111111",
  "actor": "CEO",
  "action": "task",
  "data": {"title": "Review hero animations", "description": "Test five viewport sizes", "assignee": "EN1"}
}
```

Example EN1 message to CEO:

```json
{
  "v": 1,
  "id": "44444444-4444-4444-8444-444444444444",
  "repo": "ARCANA-SURVIVOR",
  "room_id": "11111111-1111-4111-8111-111111111111",
  "actor": "EN1",
  "action": "message",
  "data": {"to": "CEO", "body": "TR: Tests passed; PR is ready for code review"}
}
```

Use `to`: `CEO`, `EN1`–`EN5`, `QA`, or `ALL`. Recipients must already be appointed, except `ALL`.

## 4. Update task status and close a room

`action: "task_status"`, `data: {"seq":1,"status":"WAITING_QA"}`, `actor:"EN1"` after implementation. After that `actor:"QA"` may set `DONE` or `QA_HOLD` with `data.evidence` (at least 12 characters), such as tested PR SHA, CI and browser results. CEO may set READY/IN_PROGRESS/WAITING_QA/CANCELLED, but cannot approve DONE. Only the task's assigned EN may submit it.

To close the room: `action:"close_room", actor:"CEO", data:{}`. No deletes.

**Warning:** The QA role name is supplied by the submitter, not bound to a distinct GitHub account. A shared GitHub writer could impersonate QA. This is **not** an independent security gate for merging code.

## 5. Read status and inbox directly

No account login or browser clicking. Use a GET-capable tool (or open the URLs):

- [Bridge health](https://ai-control-center.tanawutmalirum29.workers.dev/api/v1/bridge/health)
- `https://ai-control-center.tanawutmalirum29.workers.dev/api/v1/bridge/status?id=<COMMAND_UUID>` — DONE, PROCESSING, REJECTED (error detail)
- `https://ai-control-center.tanawutmalirum29.workers.dev/api/v1/bridge/rooms?repo=ARCANA-SURVIVOR` — public bridge-created rooms
- `https://ai-control-center.tanawutmalirum29.workers.dev/api/v1/bridge/inbox?room_id=<ROOM_UUID>` — public messages, tasks, team and status

The website renders this information in its default dashboard. The `POST /api/v1/bridge/sync` manual button is available as an immediate fetch; normal processing happens automatically.

## Code development

ChatGPT uses its **GitHub Connector** to create branches, read/edit project files, open PRs, inspect workflows, and merge only when the user authorizes and QA evidence is sufficient. The website is no longer a code editor; browser write endpoints are retired with HTTP 410. Organization messages are D1 records created from GitHub commands; project code remains in each project's own repository.

## Limits, recovery and cost

Cloudflare Workers/D1 and GitHub Actions have free usage limits, not unlimited guarantees. GitHub API and Cron usage can reach provider quotas. The bridge does not use TinyFish, a paid OpenAI API, or an always-on model. GitHub Connector installation/permissions depend on ChatGPT plan and account availability.

- If a receipt is absent, check that the file was committed to `main` and the path uses today's UTC date; wait until next scheduled poll, or use Sync on the site.
- If a receipt is REJECTED, correct the command **in a new file with a new UUID**; do not reuse the old file.
- If a receipt is stuck PROCESSING after an interruption, inspect D1 before retrying to avoid duplicate effects; the bridge deliberately fails closed.
- The Worker polls only today and the previous two UTC days. Long downtime may require reissuing missed commands with new IDs.
- Public bridge input is not suitable for sensitive organizational communication. For private workflows use an appropriate private queue repository plus corresponding Worker configuration, or the authenticated non-bridge D1 system.
