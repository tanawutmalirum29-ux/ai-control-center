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
