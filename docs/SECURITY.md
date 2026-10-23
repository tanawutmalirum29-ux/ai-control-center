# Security model

V1 deliberately contains **no credentials and no write API**.

- GitHub data is fetched by browsers from `https://api.github.com` for public resources only.
- HTML escaping protects render paths that include GitHub-supplied text; outbound repository names must match `owner/repo` format.
- Repository preferences are stored locally; they are not authentication state.
- Issue creation links open the official GitHub website. No submission happens from this app.
- The `public/_headers` file applies Cloudflare Pages security headers, including a restricted Content Security Policy.
- Deploying to a public Pages URL does not make the control center private; avoid displaying confidential metadata or tokens.

Before adding write APIs:
1. Create a GitHub App with access only to necessary repositories and permissions.
2. Keep the App private key and any tokens in Cloudflare server-side encrypted secrets only.
3. Authenticate the human owner (for example through Cloudflare Access with verified JWT, or a correct OAuth session). Do **not** treat an arbitrary header, query string, or unverified identity as authentication.
4. Authorize actions per repository and role; protect against CSRF and replay; log actor and operation.
5. Allow merge only after automated and manual QA gates. Require explicit approval for repository deletion, branch deletion, force pushes, permission changes and spending.
6. Test all authorization checks in a staging deployment before enabling production writes.

Setting a GitHub billing budget of $0 does not make every associated service free or guarantee no new charges elsewhere. Verify free-tier limits and disable paid overages separately on each provider.
