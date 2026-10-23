# GitHub-backed project workspaces

AI Control Center V5 is a GitHub broker with project-specific work branches. GitHub remains the source of truth. The existing owner GitHub App OAuth session is used to make requests from the Cloudflare Worker. Tokens are never shown to the browser.

## Instructions
1. Log in to AI Control Center with the GitHub App.
2. Select a repository and open the พื้นที่ทำงาน section.
3. Enter a task title and create a working Branch with the acc/ prefix.
4. Enter a text file path, load existing content and SHA, then save a commit. For a new file, choose ไฟล์ใหม่.
5. Create a Draft Pull Request. Perform CI, QA, mobile/browser regression checks and an independent code review before a manually authorized merge.
6. For ChatGPT Work: open the website in its Cloud Browser, authorize access and GitHub sign-in in that browser, then instruct it to operate this UI. Availability depends on plan and browser support.

The GitHub App must be installed in each repository where a workspace will write. If you installed it only on ai-control-center, additional repositories will not allow writes until you explicitly update its installation scope in GitHub Settings > Applications > Installed GitHub Apps.

## Owner-only API
- GET /api/v1/work/branches?repo=NAME
- GET /api/v1/work/file?repo=NAME&branch=acc/...&path=...
- POST /api/v1/work/branch with repo and title
- POST /api/v1/work/file with repo, branch, path, content and optional existing blob SHA
- POST /api/v1/work/pr with repo, branch, title and optional body

No anonymous writes, no direct editing of main, no PR merge or delete endpoint. Workflow, env and credential-like file paths are blocked in the editor. Workspaces store work in GitHub branches, not in a separate Cloudflare database.

## Not yet implemented
- Autonomous AI inference or persistent agents running on the website.
- Distinct, revocable per-agent API credentials and agent-specific permissions.
- Token vault, MCP endpoint, persistent work assignment database or audit log.
- Automated QA signoff, code execution or automated merge.

A secure multi-AI gateway would require a per-agent identity, scoped rights to repository/task/actions, server-generated short-lived token exchange, revocation and audit logging. Never share a permanent GitHub PAT with AI agents or put it in page source.
