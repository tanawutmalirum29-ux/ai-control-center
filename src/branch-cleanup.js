// OWNER-only branch cleanup. Keeps main; refuses to touch other default branches.
// No shared-site GitHub credential, delegated agent token, merge, or force push.
import {OWNER,WRITE_REPOS} from '../public/repositories.js';

const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{
 'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'
}});
const safeRef=name=>typeof name==='string'&&name.length>0&&name.length<=255&&name!=='main'&&name!=='@'&&
 !/[\x00-\x20~^:?*\[\\]/.test(name)&&!name.includes('..')&&!name.includes('//')&&!name.includes('@{')&&
 !name.startsWith('/')&&!name.endsWith('/')&&
 !name.split('/').some(s=>!s||s.startsWith('.')||s.endsWith('.')||s.endsWith('.lock'));
const safeSha=sha=>typeof sha==='string'&&/^[0-9a-f]{40}$/.test(sha);
const refPath=name=>name.split('/').map(encodeURIComponent).join('/');
async function github(token,path,fetcher,method='GET'){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{
  const r=await fetcher('https://api.github.com'+path,{
   method,signal:controller.signal,
   headers:{accept:'application/vnd.github+json',authorization:'Bearer '+token,
    'user-agent':'AI-Control-Center-Branch-Cleanup','x-github-api-version':'2022-11-28'}});
  if(r.status===204&&r.ok)return null;
  const data=await r.json().catch(()=>null);
  if(!r.ok)throw Object.assign(Error(String(data?.message||'github_request_failed').slice(0,250)),{status:r.status});
  return data;
 }finally{clearTimeout(timer);}
}
async function repository(token,prefix,fetcher){
 const r=await github(token,prefix,fetcher);
 if(!r||r.full_name!==prefix.slice('/repos/'.length))throw Object.assign(Error('repository_identity_mismatch'),{status:403});
 if(r.default_branch!=='main')throw Object.assign(Error('default_branch_is_not_main'),{status:409,default_branch:r.default_branch});
 if(r.archived)throw Object.assign(Error('repository_archived'),{status:409});
 return r;
}
async function openPullRequests(token,prefix,fetcher){
 const prs=[], seen=new Set(),full=prefix.slice('/repos/'.length);
 for(let page=1;page<=21;page++){
  const rows=await github(token,prefix+'/pulls?state=open&per_page=100&page='+page,fetcher);
  if(!Array.isArray(rows))throw Error('invalid_pull_request_list');
  if(page===21&&rows.length)throw Object.assign(Error('too_many_open_prs_to_verify'),{status:413});
  for(const pr of rows){
   if(pr.head?.repo?.full_name!==full||!safeRef(pr.head?.ref))continue;
   if(seen.has(pr.number))continue;
   seen.add(pr.number);
   prs.push({number:pr.number,branch:pr.head.ref,title:String(pr.title||'').slice(0,160),
    draft:Boolean(pr.draft),url:pr.html_url});
  }
  if(rows.length<100)break;
 }
 return prs;
}
async function branches(token,prefix,fetcher){
 const items=[], names=new Set();
 for(let page=1;page<=21;page++){
  const rows=await github(token,prefix+'/branches?per_page=100&page='+page,fetcher);
  if(!Array.isArray(rows))throw Error('invalid_branch_list');
  if(page===21&&rows.length)throw Object.assign(Error('too_many_branches_to_preview'),{status:413});
  for(const row of rows){
   if(row.name==='main')continue;
   if(!safeRef(row.name)||!safeSha(row.commit?.sha)||typeof row.protected!=='boolean'||
     names.has(row.name))throw Error('invalid_or_duplicate_branch');
   names.add(row.name);
   items.push({name:row.name,sha:row.commit.sha,protected:row.protected});
  }
  if(rows.length<100)break;
 }
 return items;
}
const validBatch=list=>Array.isArray(list)&&list.length>0&&list.length<=5&&
 list.every((b,i)=>b&&safeRef(b.name)&&safeSha(b.sha)&&
 list.findIndex(x=>x?.name===b.name)===i);
export async function branchCleanupApi(request,{token,fetcher=globalThis.fetch}={}){
 if(!token)return reply({error:'owner_github_login_required'},401);
 const url=new URL(request.url),path=url.pathname,preview=path==='/api/v1/maintenance/branches/preview';
 const deleting=path==='/api/v1/maintenance/branches/delete';
 if(!preview&&!deleting)return reply({error:'not_found'},404);
 if((preview&&request.method!=='GET')||(deleting&&request.method!=='POST'))
  return reply({error:'method_not_allowed'},405);
 let data=null;
 if(deleting){
  if(request.headers.get('origin')!==url.origin||
    !request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
   return reply({error:'invalid_origin_or_content_type'},403);
  try{data=await request.json();}catch{return reply({error:'invalid_json'},400);}
  if(!data||typeof data!=='object'||Array.isArray(data))return reply({error:'invalid_body'},400);
 }
 const name=preview?url.searchParams.get('repo'):data.repo;
 if(!WRITE_REPOS.includes(name))return reply({error:'repository_not_approved'},403);
 const prefix='/repos/'+OWNER+'/'+name,full=OWNER+'/'+name;
 try{
  await repository(token,prefix,fetcher);
  if(preview){
   const [list,prs]=await Promise.all([
    branches(token,prefix,fetcher),openPullRequests(token,prefix,fetcher)
   ]);
   const byBranch=new Map();
   for(const pr of prs){
    if(!byBranch.has(pr.branch))byBranch.set(pr.branch,[]);
    byBranch.get(pr.branch).push({number:pr.number,title:pr.title,url:pr.url,draft:pr.draft});
   }
   const result=list.map(b=>({...b,open_prs:byBranch.get(b.name)||[]}));
   return reply({repo:full,default_branch:'main',keep:'main',total:result.length,
    protected_count:result.filter(x=>x.protected).length,
    open_pr_branch_count:result.filter(x=>x.open_prs.length).length,
    branches:result,warning:'Deletion can discard unmerged commits and break open PRs. No automatic backups are made.'});
  }
  if(data.confirm!=='DELETE BRANCHES '+full||data.keep!=='main')
   return reply({error:'confirmation_mismatch',required:'DELETE BRANCHES '+full},400);
  if(data.acknowledge_unmerged!==true||data.acknowledge_open_prs!==true)
   return reply({error:'risk_acknowledgement_required'},400);
  if(!validBatch(data.branches))return reply({error:'invalid_branch_batch',max:5},400);
  // Freshly re-read every branch in the batch. Stop before deleting anything if
  // a protected, changed, missing or primary branch is encountered.
  for(const item of data.branches){
   let current;
   try{current=await github(token,prefix+'/branches/'+refPath(item.name),fetcher);}
   catch(error){
    if(error.status===404)return reply({error:'branch_missing_since_preview',branch:item.name,need_new_preview:true},409);
    throw error;
   }
   if(current?.name!==item.name||!safeSha(current.commit?.sha)||
    current.commit.sha!==item.sha||current.protected!==false)
    return reply({error:'branch_changed_or_protected',branch:item.name,need_new_preview:true},409);
  }
  const deleted=[];
  for(const item of data.branches){
   try{
    // Reduce the race between preflight and delete; GitHub REST deletion has no SHA CAS.
    const latest=await github(token,prefix+'/branches/'+refPath(item.name),fetcher);
    if(latest?.name!==item.name||latest.commit?.sha!==item.sha||latest.protected!==false)
     throw Object.assign(Error('branch_changed_before_delete'),{status:409});
    await github(token,prefix+'/git/refs/heads/'+refPath(item.name),fetcher,'DELETE');
    deleted.push(item.name);
   }catch(error){
    return reply({repo:full,deleted,failed:item.name,error:'github_branch_delete_failed',
     detail:error.message,need_new_preview:true},207);
   }
  }
  return reply({repo:full,deleted,kept:'main',deleted_count:deleted.length});
 }catch(error){
  return reply({error:error.message||'github_branch_cleanup_failed',
   default_branch:error.default_branch||undefined,
   github_status:error.status||undefined},[400,403,404,409,413].includes(error.status)?error.status:502);
 }
}
