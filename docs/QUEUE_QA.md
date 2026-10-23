# Evidence-based queue and PR QA

- Browser and Worker share the public allowlist in `public/repositories.js`. The owner may add repos there only by reviewed code changes; the settings page cannot authorize a server-side repository by itself.
- Worker caches GET results for 120 seconds, retaining a best-effort stale fallback for 15 minutes (Cloudflare Cache API, with per-isolate memory fallback). The web page also keeps the last successful queue locally for one hour, explicitly flagged when reused. There is no database or paid API.
- Queue status is **only** sourced from explicit GitHub Labels: `ready`, `in-progress`, `waiting-qa`, `qa-block`, `paused`, and their normalized variations. Unknown issues show `UNCLASSIFIED` and must be reviewed by a human before starting. Status does not imply auto-execution.
- `GET /api/v1/pr-qa?repo=<allowed>&pr=<positive-number>` fetches the PR head SHA, its check runs, and its review approvals. It never equates repository-wide CI PASS with a specific PR's QA. Only approvals tied to the current head SHA count; incomplete evidence remains UNKNOWN or WAITING_QA.
- `CHECKS_PASS_REVIEWED` indicates that at least one check has passed, no check failed or remained pending, and a GitHub review on that head SHA is approved. It is **not permission to merge**: manual browser QA, branch protection, issue relation, and integration QA remain unverified.
- `QA_BLOCK` from a PR label, review changes requested, or a failed check overrides green checks. The UI displays the head SHA so reviewers can compare evidence.
- Public API and queue never permit GitHub writes. Owner GitHub OAuth can create Issues only in `ai-control-center`; no user-controlled URL/path bypasses the allowlist.
- Free/limits: GitHub unauthenticated API may be throttled; server cache is per-region best effort and can expire; failures without cache report a safe 503 reason.

## Automated tests
Run `npm test` (Node.js 20+). Tests cover status precedence, allowed repositories, rate-limit fallback, missing data behavior, PR SHA linkage, reviews, and blocking.

## Manual release QA
Check iOS Safari and Chromium at 320×568, 390×844, 768×1024, 844×390, 1440×900. Verify header wrapping, scroll-to-top, login status, queue fallback and PR QA statuses. Until verified, do **not** report browser QA PASS.
