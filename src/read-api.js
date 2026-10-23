// Public, read-only API. Origin-restricted repository allowlist and edge caching.
// Evidence-first classification: absence of QA data MUST NOT imply passing QA.
import {OWNER, REPOS, FULL_REPOS} from '../public/repositories.js';
export const FRESH_MS=120000;
export const STALE_MS=900000;
const LIMIT=60;
const fallback=new Map();
const inflight=new Map();
const publicHeaders={
 'content-type':'application/json; charset=utf-8',
 'cache-control':'no-store',
 'access-control-allow-origin':'*',
 'access-control-allow-methods':'GET, HEAD, OPTIONS',
 'x-content-type-options':'nosniff'
};
const respond=(payload,status=200)=>new Response(JSON.stringify(payload),{status,headers:publicHeaders});
export function taskStatus(issue){
 const labels=(issue.labels||[]).map(x=>typeof x==='string'?x:x.name).filter(Boolean).map(x=>x.toUpperCase().replace(/[\s/:-]+/g,'_'));
 const has=(...names)=>names.some(n=>labels.includes(n));
 // Explicit human labels only; never infer READY from assignment or a green CI check.
 if(has('QA_BLOCK','QA_BLOCKED','BLOCKED','HOLD_QA','QA_HOLD'))return {status:'QA_BLOCK',source:'label'};
 if(has('PAUSED','ON_HOLD','HOLD','STATUS_PAUSED'))return {status:'PAUSED',source:'label'};
 if(has('WAITING_QA','QA_PENDING','PENDING_QA','READY_FOR_QA','STATUS_WAITING_QA'))return {status:'WAITING_QA',source:'label'};
 if(has('IN_PROGRESS','INPROGRESS','WIP','DOING','STATUS_IN_PROGRESS'))return {status:'IN_PROGRESS',source:'label'};
 if(has('READY','TODO','TO_DO','STATUS_READY'))return {status:'READY',source:'label'};
 if(/^SESSION_ACTIVATION:\s*AWAITING_OWNER_RELAY\s*$/im.test(issue.body||''))return {status:'APPOINTED',source:'appointment_body'};
 return {status:'UNCLASSIFIED',source:'no_status_label'};
}
export function reviewStatus(reviews){
 const latest=new Map();
 for(const r of reviews){
  if(!r.user?.login||!r.state)continue;
  if(r.state==='COMMENTED'||r.state==='PENDING')continue;
  const prev=latest.get(r.user.login);
  if(!prev||new Date(r.submitted_at||0)>=new Date(prev.submitted_at||0))latest.set(r.user.login,r);
 }
 const states=[...latest.values()].map(r=>r.state);
 return {approval_count:states.filter(s=>s==='APPROVED').length,changes_requested:states.includes('CHANGES_REQUESTED'),state:states.includes('CHANGES_REQUESTED')?'CHANGES_REQUESTED':states.includes('APPROVED')?'APPROVED':'NO_APPROVAL'};
}
export function qaAssessment(pr,checks,reviews,checksComplete=true,reviewsComplete=true){
 const labels=(pr.labels||[]).map(x=>(typeof x==='string'?x:x.name)||'').map(x=>x.toLowerCase());
 const explicitBlock=labels.some(x=>['qa-block','qa_block','qa blocked','blocked','hold'].includes(x));
 const checkList=Array.isArray(checks)?checks:[];
 const fail=checkList.some(c=>['failure','timed_out','cancelled','action_required'].includes(c.conclusion));
 const pending=checkList.some(c=>c.status!=='completed'||!['success','neutral','skipped'].includes(c.conclusion));
 const currentReviews=(Array.isArray(reviews)?reviews:[]).filter(r=>r.state!=='APPROVED'||(pr.head?.sha&&r.commit_id===pr.head.sha));
 const result=reviewStatus(currentReviews);
 const checksState=!checksComplete||!checkList.length?'UNKNOWN':fail?'FAIL':pending?'PENDING':checkList.some(c=>c.conclusion==='success')?'PASS':'UNKNOWN';
 let gate='WAITING_QA';
 if(explicitBlock||result.changes_requested||fail)gate='QA_BLOCK';
 else if(!checksComplete||!reviewsComplete||!checkList.length)gate='UNKNOWN';
 else if(checksState==='PASS'&&result.approval_count>0&&!pr.draft)gate='CHECKS_PASS_REVIEWED';
 return {gate,checks_state:checksState,review_state:reviewsComplete?result.state:'UNKNOWN',approval_count:result.approval_count,changes_requested:result.changes_requested,merge_safe:false,manual_qa_verified:false};
}
export function linkedIssueNumbers(body){
 const set=new Set();
 for(const m of String(body||'').matchAll(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+(?:[\w.-]+\/)?#(\d+)\b/gi)){
  if(+m[1]>0)set.add(Number(m[1]));
 }
 return [...set].slice(0,25);
}
function cause(error){
 if(error?.code===403||error?.code===429)return 'GITHUB_RATE_LIMIT_OR_FORBIDDEN';
 if(error?.code===404)return 'GITHUB_NOT_FOUND';
 if(error?.code===401)return 'GITHUB_UNAUTHORIZED';
 if(error?.name==='AbortError'||error?.message==='upstream_timeout')return 'GITHUB_TIMEOUT';
 return 'GITHUB_UNAVAILABLE';
}
async function gh(path,fetcher){
 const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),10000);
 try{
  const res=await fetcher('https://api.github.com'+path,{headers:{Accept:'application/vnd.github+json','User-Agent':'AI-Control-Center-Free','X-GitHub-Api-Version':'2022-11-28'},signal:ctrl.signal});
  if(!res.ok){const e=new Error('upstream');e.code=res.status;throw e;}
  return await res.json();
 }finally{clearTimeout(timer);}
}
function getCache(id,now){
 const m=fallback.get(id);
 if(!m)return null;
 if(now-m.at>STALE_MS){fallback.delete(id);return null;}
 return m;
}
async function edgeLoad(cache,key){
 if(!cache)return null;
 try{const r=await cache.match(new Request('https://acc-edge-cache.local/'+encodeURIComponent(key)));
  return r?.ok?await r.json():null;}catch{return null;}
}
async function edgeSave(cache,key,entry,ttl){
 if(!cache)return;
 try{await cache.put(new Request('https://acc-edge-cache.local/'+encodeURIComponent(key)),new Response(JSON.stringify(entry),{headers:{'cache-control':'public,max-age='+Math.floor(ttl/1000)}}));}catch{/* Edge cache best-effort */}
}
async function withCache(key,producer,{fetcher,edge,now,forceFresh=false}={}){
 const time=typeof now==='number'?now:Date.now();
 const local=getCache(key,time);
 if(!forceFresh&&local&&time-local.at<FRESH_MS)return {...local.value,stale:false,cached_at:new Date(local.at).toISOString()};
 const fresh=forceFresh?null:await edgeLoad(edge,key+'-fresh');
 if(fresh&&time-fresh.at<FRESH_MS){fallback.set(key,fresh);return {...fresh.value,stale:false,cached_at:new Date(fresh.at).toISOString()};}
 if(!forceFresh&&inflight.has(key))return inflight.get(key);
 const pending=(async()=>{
  try{
   const value=await producer(fetcher);
   const entry={at:time,value};
   fallback.set(key,entry);
   if(fallback.size>LIMIT)fallback.delete(fallback.keys().next().value);
   await Promise.all([edgeSave(edge,key+'-fresh',entry,FRESH_MS),edgeSave(edge,key+'-stale',entry,STALE_MS)]);
   return {...value,stale:false,cached_at:new Date(time).toISOString()};
  }catch(error){
   const old=getCache(key,time)||await edgeLoad(edge,key+'-stale');
   const warning=cause(error);
   if(!forceFresh&&old&&time-old.at<=STALE_MS)return {...old.value,stale:true,cached_at:new Date(old.at).toISOString(),warning};
   const e=new Error('github_unavailable');e.reason=warning;throw e;
  }
 })();
 inflight.set(key,pending);
 try{return await pending;}finally{inflight.delete(key);}
}
async function queue(repo,fetcher){
 const issues=await gh('/repos/'+OWNER+'/'+repo+'/issues?state=open&sort=updated&direction=desc&per_page=100',fetcher);
 const tasks=issues.filter(x=>!x.pull_request).map(issue=>({
  number:issue.number,title:issue.title,role:role(issue.title),...taskStatus(issue),
  labels:(issue.labels||[]).map(x=>typeof x==='string'?x:x.name).filter(Boolean),
  url:'https://ai-control-center.tanawutmalirum29.workers.dev/?repo='+encodeURIComponent(repo)+'&issue='+issue.number,
  github_source_url:'https://github.com/'+OWNER+'/'+repo+'/issues/'+issue.number,
  updated_at:issue.updated_at
 }));
 const priority={READY:0,WAITING_QA:1,IN_PROGRESS:2,UNCLASSIFIED:3,APPOINTED:4,QA_BLOCK:5,PAUSED:6};
 tasks.sort((a,b)=>priority[a.status]-priority[b.status]||Date.parse(b.updated_at)-Date.parse(a.updated_at));
 return {repo:OWNER+'/'+repo,fetched_at:new Date().toISOString(),truncated:issues.length===100,read_only:true,tasks};
}
function role(title=''){
 const m=String(title).match(/^\[?(CEO|DIR(?:-[A-Z])?|TL(?:-[A-Z0-9]+)?|ENGINEER(?:-[A-Z0-9]+)?|QA-REVIEWER|PROJECT-LEAD)\]?(?=[\s:-])/i);
 return m?m[1].toUpperCase():'UNASSIGNED';
}
async function summary(repo,fetcher){
 const root='/repos/'+OWNER+'/'+repo;
 const [issues,prs,runs]=await Promise.all([
  gh(root+'/issues?state=open&per_page=100',fetcher),
  gh(root+'/pulls?state=open&per_page=100',fetcher),
  gh(root+'/actions/runs?per_page=1',fetcher)
 ]);
 const latest=runs.workflow_runs?.[0];
 return {repo:OWNER+'/'+repo,open_issues_in_page:issues.filter(x=>!x.pull_request).length,
  issues_truncated:issues.length===100,open_prs_in_page:prs.length,prs_truncated:prs.length===100,
  latest_repository_ci:latest?{name:latest.name,status:latest.status,conclusion:latest.conclusion,sha:latest.head_sha,url:latest.html_url}:null,
  pr_qa_is_separate:true,read_only:true};
}
async function prQA(repo,number,fetcher){
 const root='/repos/'+OWNER+'/'+repo;
 const pr=await gh(root+'/pulls/'+number,fetcher);
 const sha=pr.head?.sha;
 if(!/^[0-9a-f]{40}$/.test(sha||''))throw Error('invalid_sha');
 const [checkResult,reviewResult]=await Promise.allSettled([
  gh(root+'/commits/'+sha+'/check-runs?per_page=100',fetcher),
  gh(root+'/pulls/'+number+'/reviews?per_page=100',fetcher)
 ]);
 const checks=checkResult.status==='fulfilled'?(checkResult.value.check_runs||[]):[];
 const reviews=reviewResult.status==='fulfilled'?reviewResult.value:[];
 const assessment=qaAssessment(pr,checks,reviews,checkResult.status==='fulfilled'&&checks.length<100,reviewResult.status==='fulfilled'&&reviews.length<100);
 return {repo:OWNER+'/'+repo,pr:number,title:pr.title,head_sha:sha,pr_url:pr.html_url,
  linked_issue_numbers:linkedIssueNumbers(pr.body),...assessment,
  checks:checks.slice(0,100).map(x=>({name:x.name,status:x.status,conclusion:x.conclusion,head_sha:x.head_sha,url:x.html_url})),
  checks_truncated:checks.length===100,review_data_complete:reviewResult.status==='fulfilled',
  checks_data_complete:checkResult.status==='fulfilled',updated_at:pr.updated_at,
  warning:checkResult.status!=='fulfilled'||reviewResult.status!=='fulfilled'?'PARTIAL_GITHUB_DATA':null};
}
export async function readApi(request,{fetcher=globalThis.fetch,edge=globalThis.caches?.default,now}={}){
 const url=new URL(request.url);const path=url.pathname;
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:publicHeaders});
 if(!['GET','HEAD'].includes(request.method))return respond({error:'method_not_allowed'},405);
 if(path==='/api/v1/repositories')return respond({owner:OWNER,repositories:FULL_REPOS,read_only:true});
 if(!['/api/v1/queue','/api/v1/summary','/api/v1/pr-qa'].includes(path))return respond({error:'not_found'},404);
 const repo=url.searchParams.get('repo');
 if(!REPOS.includes(repo))return respond({error:'repository_not_allowed',allowed:REPOS},400);
 let key=path+'?repo='+repo;
 let number=null;
 if(path==='/api/v1/pr-qa'){
  const raw=url.searchParams.get('pr');
  if(!/^[1-9]\d{0,7}$/.test(raw||''))return respond({error:'invalid_pr_number'},400);
  number=Number(raw);key+='&pr='+number;
 }
 try{
  const produce=path==='/api/v1/queue'?f=>queue(repo,f):path==='/api/v1/summary'?f=>summary(repo,f):f=>prQA(repo,number,f);
  const result=await withCache(key,produce,{fetcher,edge,now,forceFresh:path==='/api/v1/pr-qa'||url.searchParams.get('fresh')==='1'});
  return respond(result);
 }catch(e){return respond({error:'github_unavailable',reason:e.reason||'GITHUB_UNAVAILABLE',stale:false,retry_after_seconds:120},503);}
}
