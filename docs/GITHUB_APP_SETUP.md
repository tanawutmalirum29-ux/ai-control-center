# Connect the owner GitHub App (no paid API)

The GitHub App must already be **installed on ai-control-center**. This uses GitHub App **user-to-server OAuth** (not an installation private key).

1. Open https://github.com/settings/apps and select your newly created GitHub App.
2. Set **Callback URL** to this exact address:
   https://ai-control-center.tanawutmalirum29.workers.dev/api/auth/callback
3. In the GitHub App **General** screen, copy **Client ID**. Under **Client secrets**, generate one secret.
4. Open https://dash.cloudflare.com > Workers & Pages > ai-control-center > Settings > Variables and Secrets.
   Add **two Secret-type variables** (not plaintext):
   - GITHUB_CLIENT_ID : your GitHub App Client ID
   - GITHUB_CLIENT_SECRET : your GitHub App Client Secret
   Click Deploy/Save for the secrets to take effect.
5. Visit https://ai-control-center.tanawutmalirum29.workers.dev. Press **เชื่อมต่อ GitHub** and authorize only as tanawutmalirum29-ux.

Do not send your client secret or access tokens in ChatGPT, a GitHub Issue, or your repository.

Security boundaries:
- The website authorizes user identity via GitHub OAuth, restricted to the owner account.
- Only the ai-control-center repository supports direct Issue creation. No code pushes, merges, deletes, or GitHub API token displayed client-side.
- OAuth state and sessions are carried by Secure, HttpOnly, SameSite=Lax host-only cookies. The session encrypts the GitHub token with a key derived from the client secret; it expires within six hours.
- Same-origin POST checks protect issue creation and logout.
- Public queue and summary remain GET-only. No anonymous write endpoints.
- If a Client Secret is compromised, revoke it from GitHub and rotate it in Cloudflare.

Other GitHub App settings:
- Request user authorization during installation: optional; not required for the login button.
- Webhook Active: off for now.
- Repository permissions: Issues Read & Write, Contents Read & Write, Pull requests Read & Write, Actions Read-only (only Issues used at this stage).
- Repository access: Only selected repositories; ai-control-center first.

Status checking: /api/health returns auth_ready true after both secrets are configured; /api/auth/me confirms whether the owner is logged in.
