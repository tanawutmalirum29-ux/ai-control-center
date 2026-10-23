// Single source of truth used by Cloudflare Worker and browser modules.
// Public repositories only. Direct writes remain explicitly restricted.
export const OWNER = 'tanawutmalirum29-ux';
export const REPOS = Object.freeze([
  'ARCANA-SURVIVOR',
  'ai-control-center',
  'ai-organization-hub',
  'ant-project',
  'appointment-CEO',
  'Staging_area'
]);
// GitHub App installation and permission are separately checked on every real write.
// The central organization policy repository remains read-only.
export const WRITE_REPOS = Object.freeze(['ARCANA-SURVIVOR','ai-control-center','ant-project','appointment-CEO','Staging_area']);
export const FULL_REPOS = Object.freeze(REPOS.map(name => `${OWNER}/${name}`));
