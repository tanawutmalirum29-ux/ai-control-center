// Public mission board built from existing GitHub Issues and PRs.
// It does not create AI sessions, authenticate AI identities or certify QA.
import {OWNER,REPOS} from '../public/repositories.js';
import {taskStatus} from './read-api.js';
const FRESH=120000,STALE=900000;
const local=new Map(),pending=new Map();
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store',
 'access-control-allow-origin':'*','access-control-allow-methods':'GET,HEAD,OPTIONS','x-content-type-options':'nosniff'};
const answer=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
const fields=['TO_ROLE','REPORTS_TO','EDITABLE_PATHS','PARENT_ISSUE','AGENT_SLOT','BASE_SHA','ACCEPTANCE','SESSION_ACTIVATION','OBJECTIVE'];
export function issueFields(body=''){
 const result={};
 for(const field of fields){
  const m=String(body).match(new RegExp('^'+field+':\\s*(.*)$','im'));
  result[field.toLowerCase()]=m?m[1].trim():'';
 }
 return result;
}
function roleFrom(issue,meta){
 if(meta.to_role)return meta.to_role;
 const found=String(issue.title).match(/^\[?(CEO|PROJECT-LEAD|ENGINEER(?:-[A-Z0-9_-]+)?|CREATOR|QA-REVIEWER|COORDINATOR|DIR(?:-[A-Z])?|TL(?:-[A-Z0-9]+)?)\]?(?=[\s:.-])/i);
 return found?found[1].toUpperCase():'UNASSIGNED';
}
export function asTask(issue,repo){
 const fields=issueFields(issue.body),role=roleFrom(issue,fields),status=taskStatus(issue);
 const isAppointment=Boolean(fields.to_role||/^(\[?(?:CEO|PROJECT-LEAD|ENGINEER|QA-REVIEWER|CREATOR|COORDINATOR))/.test(issue.title));
 return {number:issue.number,title:issue.title,
  url:'https://ai-control-center.tanawutmalirum29.workers.dev/?repo='+encodeURIComponent(repo)+'&issue='+issue.number,
  github_source_url:issue.html_url||'https://github.com/'+OWNER+'/'+repo+'/issues/'+issue.number,
  role,
  agent_slot:fields.agent_slot||role,parent_issue:fields.parent_issue,
  reports_to:fields.reports_to,editable_paths:fields.editable_paths,base_sha:fields.base_sha,
  acceptance:fields.acceptance,session_activation:fields.session_activation,
  status:status.status,status_source:status.source,
  relay:isAppointment?(fields.agent_slot||role)+': '+(status.status==='APPOINTED'?'AP-ROLE':'MN')+' #'+issue.number+' '+
    'https://ai-control-center.tanawutmalirum29.workers.dev/?repo='+encodeURIComponent(repo)+'&issue='+issue.number:null,
  labels:(issue.labels||[]).map(l=>typeof l==='string'?l:l.name),
  updated_at:issue.updated_at,github_assignees:(issue.assignees||[]).map(a=>a.login)};
}
async function gh(path,fetcher){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
 try{
  const res=await fetcher('https://api.github.com'+path,{
   headers:{accept:'application/vnd.github+json','user-agent':'AI-Control-Center-Mission',
    'x-github-api-version':'2022-11-28'},signal:controller.signal});
  if(!res.ok){const err=new Error('github_request_failed');err.code=res.status;throw err;}
  return res.json();
 }finally{clearTimeout(timer);}
}
async function load(repo,fetcher){
 const root='/repos/'+OWNER+'/'+repo;
 const [issues,prs]=await Promise.all([
  gh(root+'/issues?state=open&sort=updated&per_page=100',fetcher),
  gh(root+'/pulls?state=open&per_page=100',fetcher)
 ]);
 const tasks=issues.filter(i=>!i.pull_request).map(i=>asTask(i,repo));
 const priority={APPOINTED:0,READY:1,IN_PROGRESS:2,WAITING_QA:3,QA_BLOCK:4,PAUSED:5,UNCLASSIFIED:6};
 tasks.sort((a,b)=>(priority[a.status]??7)-(priority[b.status]??7)||Date.parse(b.updated_at)-Date.parse(a.updated_at));
 return {repo:OWNER+'/'+repo,source:'PUBLIC_GITHUB',
  tasks,prs:prs.map(p=>({number:p.number,title:p.title,
   url:'https://ai-control-center.tanawutmalirum29.workers.dev/?repo='+encodeURIComponent(repo)+'&pr='+p.number,
   github_source_url:p.html_url,draft:p.draft,
   head_sha:p.head?.sha,base:p.base?.ref,updated_at:p.updated_at,
   qa:'UNVERIFIED_USE_PR_QA_ENDPOINT'})),
  counts:{open_tasks:tasks.length,appointments:tasks.filter(t=>t.relay).length,
   awaiting_relay:tasks.filter(t=>t.status==='APPOINTED').length,
   blocked:tasks.filter(t=>t.status==='QA_BLOCK').length,open_prs:prs.length},
  truncated:issues.length===100||prs.length===100,
  qa_notice:'PR checks/reviews require exact head SHA through /api/v1/pr-qa; no approval inferred',
  agent_runtime:false};
}
async function edgeGet(edge,key){
 if(!edge)return null;
 try{const response=await edge.match(new Request('https://acc-mission-cache.invalid/'+encodeURIComponent(key)));
  return response?.ok?await response.json():null;}catch{return null;}
}
async function edgeSave(edge,key,entry){
 if(!edge)return;
 try{await edge.put(new Request('https://acc-mission-cache.invalid/'+encodeURIComponent(key)),
   new Response(JSON.stringify(entry),{headers:{'cache-control':'public,max-age=900'}}));}catch{}
}
async function cached(repo,fetcher,edge,now){
 const time=typeof now==='number'?now:Date.now(),hit=local.get(repo)||await edgeGet(edge,repo);
 if(hit&&time-hit.at<FRESH){local.set(repo,hit);return {...hit.value,stale:false,cached_at:new Date(hit.at).toISOString()};}
 if(pending.has(repo))return pending.get(repo);
 const promise=(async()=>{
  try{const result=await load(repo,fetcher),entry={at:time,value:result};
   local.set(repo,entry);await edgeSave(edge,repo,entry);
   return {...result,stale:false,cached_at:new Date(time).toISOString()};}
  catch(e){if(hit&&time-hit.at<STALE)return {...hit.value,stale:true,warning:e.code||'UPSTREAM_ERROR',cached_at:new Date(hit.at).toISOString()};
   const error=new Error('github_unavailable');error.code=e.code||503;throw error;}
 })();
 pending.set(repo,promise);
 try{return await promise;}finally{pending.delete(repo);}
}
export async function missionApi(request,{fetcher=globalThis.fetch,edge=globalThis.caches?.default,now}={}){
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(!['GET','HEAD'].includes(request.method))return answer({error:'read_only'},405);
 const url=new URL(request.url),repo=url.searchParams.get('repo');
 if(url.pathname!=='/api/v1/mission')return answer({error:'not_found'},404);
 if(!REPOS.includes(repo))return answer({error:'unsupported_repo',allowed:REPOS},400);
 try{return answer(await cached(repo,fetcher,edge,now));}
 catch(e){return answer({error:'mission_unavailable',reason:e.code===403?'PUBLIC_GITHUB_RATE_LIMIT':'GITHUB_UNAVAILABLE',
  retry_after_seconds:120},503);}
}
