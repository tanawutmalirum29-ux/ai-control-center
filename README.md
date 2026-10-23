# AI Control Center

Free-first operations dashboard for GitHub projects. No paid OpenAI API, no GitHub credentials in browser code.

## V1 features
- Responsive Thai-language dashboard for GitHub public repositories.
- Live open Issues, Pull Requests, and GitHub Actions workflow runs, with 2-minute in-memory request caching.
- Switch and manage the repositories tracked on this device.
- Prepare a role-based work order (`CEO`, `DIR`, `TL`, `ENGINEER`, `QA-REVIEWER`) and open GitHub to **review and submit** it as an Issue.
- Direct links to pull requests and QA runs. **No merging, deleting, or pushing from the website in V1.**

## Deploy to Cloudflare Workers (current project type)
The existing Cloudflare app `ai-control-center` is a **Worker**, not a Pages project. The included `wrangler.jsonc` deploys the static `public/` website without an OpenAI API key or a server-side secret.

1. Open Cloudflare > **Workers & Pages** > **ai-control-center**.
2. Go to **Settings > Build**. Select production branch `main`, leave build command blank, and use deploy command `npx wrangler deploy` (project root `/`).
3. On **Deployments**, inspect the latest build and retry if required after this configuration is merged.
4. Open the **Domains** tab, enable the free **workers.dev** subdomain for this Worker, and use the resulting URL. **No custom domain purchase is needed.**
5. Check that the website loads, not just a default Worker response. If a build fails, check build logs before retrying.

**Note:** The GitHub repository can remain public as this version contains only public code. Do not commit Cloudflare or GitHub tokens. Cloudflare may apply different Worker static-asset routing limits under the Free plan.

## Alternative: Deploy on Cloudflare Pages (Free)
1. Cloudflare Dashboard > **Workers & Pages** > **Create** > **Pages** > **Connect to Git**.
2. Authorize your GitHub account and select `tanawutmalirum29-ux/ai-control-center`.
3. Production branch: `main`.
4. Framework preset: **None**; build command: **leave blank**; output directory: `public`.
5. Deploy. Cloudflare gives a `*.pages.dev` address. No domain purchase is needed.

The web app has **no dependencies, no build step and no environment secrets**. Pushes to `main` deploy automatically after Git integration is configured. GitHub Actions is not required for this static deployment.

## Important limits
- The dashboard uses public unauthenticated GitHub REST endpoints (typically 60 requests/hour per originating IP). It cannot read private repositories or modify GitHub directly.
- Issue creation opens GitHub for the signed-in owner to submit. The dashboard does not submit or write issues by itself.
- GPT in ChatGPT can separately access GitHub using an authorized connector, but **this website is not an autonomous GPT agent**. No promise of persistent/background AI execution.
- Private repositories and direct writes require an authenticated server-side GitHub App integration with narrowly scoped permissions; see [Security](docs/SECURITY.md).
- No paid OpenAI API or paid Cloudflare features are required for V1. Usage stays subject to each provider's free-plan limits.

## Next phase
Secure backend (Cloudflare Worker + GitHub App + owner authentication) followed by an authenticated tool/MCP interface and approval-gated merges. Never expose installation tokens, personal access tokens or private keys in the frontend or repository.

## V2: AI Work Queue and Public Bridge (Free)

Production URL: https://ai-control-center.tanawutmalirum29.workers.dev/

- AI Work Queue lists up to 50 recent open issues on supported public repositories; copy MN commands for a ChatGPT session with GitHub connector.
- GET /api/health returns capability discovery. GET /api/v1/queue?repo=ARCANA-SURVIVOR returns issue work queue. GET /api/v1/summary?repo=ARCANA-SURVIVOR returns latest summary.
- API is public **read only**. Write methods blocked (405); GitHub repositories allowlisted; no OpenAI API, GitHub tokens, or Cloudflare secrets.
- This is not an autonomous background GPT agent. ChatGPT writes to GitHub only through separately authorized GitHub connector. Do not put tokens in public frontend.
- Worker deployment: npx wrangler deploy (static assets in public, Worker entrypoint in src).

## GitHub App owner login (V3)
See [docs/GITHUB_APP_SETUP.md](docs/GITHUB_APP_SETUP.md). After adding Client ID and Client Secret as Cloudflare Secrets, owner login and direct Issue creation are available **only for ai-control-center**. No paid OpenAI API used.

## V4: Reliable work queue and PR-specific QA
- Source of truth for both Worker and browser: `public/repositories.js`, including ant-project and ai-organization-hub.
- Worker cache: 2 minutes, stale fallback up to 15 minutes; client queue retains most recent data up to one hour and marks stale content.
- Issue statuses from explicit labels only; without status labels, `UNCLASSIFIED`.
- PR QA is inspected on demand via `/api/v1/pr-qa?repo=...&pr=...`. Includes head SHA, check runs, latest reviewer state, and linked issue references. It **never** authorizes merge.
- No changes to owner OAuth or to write permissions. Read `docs/QUEUE_QA.md` for contract and limitations.
- Run `npm test` (Node 20+) for the no-dependency unit tests.

## V5: GitHub-backed project workspaces
Owner GitHub App login allows dedicated `acc/` branches, reading/editing UTF-8 files and creating Draft Pull Requests for QA via the website. No direct pushes to main, merge, delete, AI model API, or unapproved third-party bot token. See [docs/WORKSPACES.md](docs/WORKSPACES.md).

## V6: Live organization policy bridge
The website displays the current ai-organization-hub/main rules, commands, source SHA and all three repository links for the selected project. The /api/v1/organization and /api/v1/organization/document endpoints are public read-only. The copyable work order cites the pinned organization source SHA. This does not implement autonomous agents, credentials per AI, automatic dispatch, full Actions or Issue editing, project-role permission enforcement, or Merge.

## V7: Embedded organization and owner operations
All 6 public organization policy files are bundled at [public/organization-bundle.json](public/organization-bundle.json), pinned to a specific main SHA. The Organization tab renders the embedded docs and templates offline from GitHub API. The Operations tab adds GitHub App owner-only issue creation with three-repository governance context, comments, assignment to real GitHub users, Actions workflows/runs/jobs, and guarded workflow dispatch on acc/ work branches (requires separate Actions Write permission). No AI model running on the website, multi-agent identities, job-claim database, merge or delete. No token is exposed to browser.
