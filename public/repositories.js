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
export const WRITE_REPOS = Object.freeze(['ai-control-center']);
export const FULL_REPOS = Object.freeze(REPOS.map(name => `${OWNER}/${name}`));
