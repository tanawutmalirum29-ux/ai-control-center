// One site-wide GitHub credential. No browser login, invitation or role claims.
// Anyone who can load the public website can call the supported write APIs.
// GitHub still requires a credential, supplied once as a Cloudflare Secret.
import {installationToken,issuerReady} from './agent-gateway.js';
import {WRITE_REPOS} from '../public/repositories.js';

export const centralCredentialConfigured=env=>Boolean(
 (typeof env.GITHUB_WRITE_TOKEN==='string'&&env.GITHUB_WRITE_TOKEN.trim())||
 (typeof env.GITHUB_TOKEN==='string'&&env.GITHUB_TOKEN.trim())||issuerReady(env)
);
export async function centralGithubAccess(env,repo,fetcher=globalThis.fetch){
 if(!WRITE_REPOS.includes(repo))return {error:'unsupported_write_repository'};
 const direct=env.GITHUB_WRITE_TOKEN||env.GITHUB_TOKEN;
 if(typeof direct==='string'&&direct.trim())return {token:direct.trim(),source:'server_secret'};
 if(issuerReady(env)){
  try{return {token:await installationToken(env,repo,fetcher),source:'github_app_installation'};}
  catch(error){return {error:'github_app_not_installed_or_token_failed',detail:String(error?.message||error)};}
 }
 return {error:'server_github_write_credential_missing'};
}
