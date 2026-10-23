// AI Control Center: actual production routes only.
// ChatGPT uses GitHub Connector; Cloudflare Cron consumes GitHub JSON commands into D1.
// Browser is a read-only work/QA dashboard, not an agent emulator or code editor.
import {OWNER,REPOS,WRITE_REPOS} from '../public/repositories.js';
import {readApi} from './read-api.js';
import {opsApi} from './ops-api.js';
import {githubBridgeApi,syncGithubBridge} from './github-bridge.js';
import {centralGithubAccess,centralCredentialConfigured} from './central-github.js';
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{
 'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',
 'access-control-allow-origin':'*'}});
const credentialedFetcher=token=>(url,init={})=>fetch(url,{...init,headers:{...init.headers,authorization:'Bearer '+token}});
const readonlyOps=['/api/v1/ops/runs','/api/v1/ops/jobs','/api/v1/ops/workflows'];
const readonlyInfo=['/api/v1/repositories','/api/v1/summary','/api/v1/pr-qa'];
export default {
 async fetch(request,env){
  const url=new URL(request.url),path=url.pathname;
  if(!path.startsWith('/api/'))return env.ASSETS.fetch(request);
  if(path==='/api/health')return reply({
   service:'AI Control Center',version:20,owner:OWNER,ai_provider:'none',no_browser_automation:true,
   repositories:REPOS.map(name=>OWNER+'/'+name),
   write_repositories:WRITE_REPOS.map(name=>OWNER+'/'+name),
   central_credential_present:centralCredentialConfigured(env),organization_database_ready:Boolean(env.ORG_DB),
   github_bridge_ready:Boolean(env.ORG_DB),
   bridge_repository:OWNER+'/ai-organization-hub',queue_path:'bridge/requests/YYYY-MM-DD/UUID.json',
   poll_schedule:'*/5 * * * *',
   endpoints:['/api/v1/bridge/health','/api/v1/bridge/status','/api/v1/bridge/rooms',
    '/api/v1/bridge/inbox','POST /api/v1/bridge/sync (same-origin)',
    '/api/v1/repositories','/api/v1/summary','/api/v1/pr-qa','/api/v1/ops/runs','/api/v1/ops/jobs']
  });
  if(path.startsWith('/api/v1/bridge/')){
   const shared=await centralGithubAccess(env,'ai-control-center');
   return githubBridgeApi(request,{db:env.ORG_DB,token:shared.token||null});
  }
  // Remove old HTTP write capability, even for callers that know the old URLs.
  if(request.method!=='GET'||path.startsWith('/api/auth/')||path.startsWith('/api/agent/')||
   path.startsWith('/api/v1/work/')||path.startsWith('/api/v1/org/')||
   path.startsWith('/api/v1/maintenance/')||path.startsWith('/api/v1/ops/issue')||
   path.startsWith('/api/v1/ops/comment')||path.startsWith('/api/v1/ops/assign')||
   path.startsWith('/api/v1/issues')||path.startsWith('/api/v1/queue')||
   path.startsWith('/api/v1/detail')||path.startsWith('/api/v1/source/')||
   path.startsWith('/api/v1/organization')||path==='/api/v1/mission')
    return reply({error:'browser_write_retired',use:'GitHub Connector; see /api/v1/bridge/health'},410);
  if(readonlyOps.includes(path)){
   const shared=await centralGithubAccess(env,url.searchParams.get('repo'));
   if(!shared.token)return reply({error:'ci_read_unavailable'},503);
   return opsApi(request,{token:shared.token});
  }
  if(readonlyInfo.includes(path)){
   const shared=await centralGithubAccess(env,url.searchParams.get('repo'));
   return readApi(request,shared.token?{fetcher:credentialedFetcher(shared.token)}:{});
  }
  return reply({error:'not_found'},404);
 },
 async scheduled(_event,env,ctx){
  const run=async()=>{
   const shared=await centralGithubAccess(env,'ai-control-center');
   const result=await syncGithubBridge({db:env.ORG_DB,token:shared.token||null});
   if(!result.ok)console.error('bridge sync errors:',result.errors);
  };
  ctx.waitUntil(run());
 }
};
