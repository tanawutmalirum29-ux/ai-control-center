// Issue and pull-request reader for AI agents; data stays on AI Control Center.
// Uses the same central GitHub credential as the work API, never exposes it.
import {OWNER,REPOS} from '../public/repositories.js';
const respond=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{
 'content-type':'application/json; charset=utf-8','cache-control':'no-store',
 'access-control-allow-origin':'*','access-control-allow-methods':'GET,HEAD,OPTIONS',
 'x-content-type-options':'nosniff'
}});
const memory=new Map();
const MAX_AGE=60000;
const normalizeText=x=>typeof x==='string'?x.slice(0,120000):'';
async function fetchGh(path,fetcher){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),11000);
 try{
  const r=await fetcher('https://api.github.com'+path,{headers:{
   accept:'application/vnd.github+json','user-agent':'AI-Control-Center-Detail',
   'x-github-api-version':'2022-11-28'},signal:ctrl.signal});
  if(!r.ok){const e=new Error('upstream');e.status=r.status;throw e;}
  return r.json();
 }finally{clearTimeout(timer);}
}
function actor(x){return x?.user?.login||'unknown';}
async function getDetail(repo,kind,number,fetcher){
 const root='/repos/'+OWNER+'/'+repo;
 if(kind==='issue'){
  const [issue,comments]=await Promise.all([
   fetchGh(root+'/issues/'+number,fetcher),
   fetchGh(root+'/issues/'+number+'/comments?per_page=100',fetcher)
  ]);
  if(issue.pull_request)return {error:'use_pr_for_pull_request'};
  return {kind,repo:OWNER+'/'+repo,number,title:issue.title||'',state:issue.state,
   body:normalizeText(issue.body),author:actor(issue),updated_at:issue.updated_at,
   labels:(issue.labels||[]).map(i=>i.name).filter(Boolean),
   assignees:(issue.assignees||[]).map(a=>a.login),
   comments:comments.map(c=>({id:c.id,author:actor(c),body:normalizeText(c.body),
    created_at:c.created_at,updated_at:c.updated_at})),
   comments_truncated:comments.length===100,source:'GITHUB_API_VIA_CONTROL_CENTER'};
 }
 const [pr,files,comments]=await Promise.all([
  fetchGh(root+'/pulls/'+number,fetcher),
  fetchGh(root+'/pulls/'+number+'/files?per_page=100',fetcher),
  fetchGh(root+'/issues/'+number+'/comments?per_page=100',fetcher)
 ]);
 return {kind,repo:OWNER+'/'+repo,number,title:pr.title||'',state:pr.state,
  body:normalizeText(pr.body),author:actor(pr),updated_at:pr.updated_at,
  draft:Boolean(pr.draft),head_sha:pr.head?.sha||null,head_branch:pr.head?.ref||null,
  base_branch:pr.base?.ref||null,mergeable:pr.mergeable??null,
  files:files.map(f=>({filename:f.filename,status:f.status,additions:f.additions,
   deletions:f.deletions,patch:normalizeText(f.patch)})),
  files_truncated:files.length===100,
  comments:comments.map(c=>({id:c.id,author:actor(c),body:normalizeText(c.body),created_at:c.created_at})),
  comments_truncated:comments.length===100,source:'GITHUB_API_VIA_CONTROL_CENTER',
  note:'PR code review and CI must be verified against exact head SHA separately'};
}
export async function detailApi(request,{fetcher=globalThis.fetch,now=Date.now()}={}){
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{
  'access-control-allow-origin':'*','access-control-allow-methods':'GET,HEAD,OPTIONS'}});
 if(request.method!=='GET'&&request.method!=='HEAD')return respond({error:'read_only'},405);
 const url=new URL(request.url),repo=url.searchParams.get('repo'),kind=url.searchParams.get('kind')||'issue',
  value=url.searchParams.get('number');
 if(url.pathname!=='/api/v1/detail')return respond({error:'not_found'},404);
 if(!REPOS.includes(repo)||!['issue','pr'].includes(kind)||!/^([1-9]\d{0,7})$/.test(value||''))
  return respond({error:'invalid_repo_kind_or_number'},400);
 const number=Number(value),cacheKey=repo+':'+kind+':'+number;
 const cached=memory.get(cacheKey);
 if(cached&&now-cached.at<MAX_AGE)return respond({...cached.value,stale:false});
 try{
  const detail=await getDetail(repo,kind,number,fetcher);
  if(detail.error)return respond(detail,422);
  memory.set(cacheKey,{at:now,value:detail});
  if(memory.size>100)memory.delete(memory.keys().next().value);
  return respond({...detail,stale:false});
 }catch(e){
  if(cached&&now-cached.at<900000)return respond({...cached.value,stale:true,
   warning:'GITHUB_TEMPORARILY_UNAVAILABLE'});
  return respond({error:'github_detail_unavailable',github_status:e.status||null},e.status===404?404:503);
 }
}
