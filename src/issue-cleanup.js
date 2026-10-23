// Owner-only permanent GitHub Issue deletion.
// Never use the site's shared installation token or delegated AI credentials here.
// A preview is read-only; every delete batch rechecks ID, repository and updatedAt.
import {OWNER,WRITE_REPOS} from '../public/repositories.js';

const response=(data,status=200)=>new Response(JSON.stringify(data),{
 status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}
});
const PREVIEW_QUERY=`query PreviewIssues($owner:String!,$repo:String!,$cursor:String){
 repository(owner:$owner,name:$repo){
  issues(first:100,after:$cursor,orderBy:{field:CREATED_AT,direction:ASC}){
   totalCount pageInfo{hasNextPage endCursor}
   nodes{id number title state updatedAt}
  }
 }
}`;
const VERIFY_QUERY=`query VerifyIssues($ids:[ID!]!){
 nodes(ids:$ids){... on Issue{id number updatedAt repository{nameWithOwner}}}
}`;
const DELETE_MUTATION=`mutation DeleteIssue($id:ID!){
 deleteIssue(input:{issueId:$id}){repository{nameWithOwner}}
}`;

async function graph(token,query,variables,fetcher){
 const r=await fetcher('https://api.github.com/graphql',{
  method:'POST',
  headers:{'content-type':'application/json','accept':'application/vnd.github+json',
   'authorization':'Bearer '+token,'user-agent':'AI-Control-Center-Issue-Cleanup',
   'x-github-api-version':'2022-11-28'},
  body:JSON.stringify({query,variables})});
 let payload;
 try{payload=await r.json();}catch{throw Object.assign(Error('invalid_github_response'),{status:502});}
 if(!r.ok || !payload || (Array.isArray(payload.errors)&&payload.errors.length)){
  const msg=String(payload?.errors?.[0]?.message||payload?.message||'GitHub GraphQL request failed').slice(0,220);
  throw Object.assign(Error(msg),{status:r.status===401||r.status===403?403:502});
 }
 return payload.data;
}
function parseItems(items){
 if(!Array.isArray(items)||!items.length||items.length>5)return null;
 const ids=new Set(),numbers=new Set();
 for(const item of items){
  if(!item||typeof item!=='object'||typeof item.id!=='string'||!/^[a-zA-Z0-9_=-]{8,150}$/.test(item.id)||
   !Number.isSafeInteger(item.number)||item.number<1||
   typeof item.updatedAt!=='string'||!/^\d{4}-\d\d-\d\dT/.test(item.updatedAt)||
   ids.has(item.id)||numbers.has(item.number))return null;
  ids.add(item.id);numbers.add(item.number);
 }
 return items;
}
export async function issueCleanupApi(request,{token,fetcher=globalThis.fetch}={}){
 if(!token)return response({error:'owner_github_login_required'},401);
 const url=new URL(request.url),path=url.pathname;
 const isPreview=path==='/api/v1/maintenance/issues/preview';
 const isDelete=path==='/api/v1/maintenance/issues/delete';
 if(!isPreview&&!isDelete)return response({error:'not_found'},404);
 if((isPreview&&request.method!=='GET')||(isDelete&&request.method!=='POST'))return response({error:'method_not_allowed'},405);
 let body=null;
 if(isDelete){
  if(request.headers.get('origin')!==url.origin||
     !request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return response({error:'invalid_origin_or_content_type'},403);
  try{body=await request.json();}catch{return response({error:'invalid_json'},400);}
  if(!body||typeof body!=='object'||Array.isArray(body))return response({error:'invalid_body'},400);
 }
 const name=isPreview?url.searchParams.get('repo'):body.repo;
 if(!WRITE_REPOS.includes(name))return response({error:'repository_not_approved'},403);
 const full=OWNER+'/'+name;
 try{
  if(isPreview){
   const issues=[];let cursor=null,total=0;
   for(let page=0;page<21;page++){
    const data=await graph(token,PREVIEW_QUERY,{owner:OWNER,repo:name,cursor},fetcher);
    if(!data?.repository?.issues)return response({error:'repository_not_accessible'},403);
    const block=data.repository.issues;
    if(!Array.isArray(block.nodes)||!block.pageInfo)return response({error:'invalid_issue_page'},502);
    if(page===0)total=block.totalCount;
    if(!Number.isSafeInteger(total)||total>2000)return response({error:'too_many_issues_for_single_preview',max:2000},413);
    for(const issue of block.nodes){
     if(!issue?.id||!Number.isSafeInteger(issue.number)||!issue.updatedAt)return response({error:'invalid_issue_snapshot'},502);
     issues.push({id:issue.id,number:issue.number,title:issue.title,state:issue.state,updatedAt:issue.updatedAt});
    }
    if(!block.pageInfo.hasNextPage){
     if(issues.length!==total)return response({error:'issues_changed_during_preview',expected:total,found:issues.length},409);
     return response({repo:full,total:issues.length,issues,includes_closed:true,excludes_pull_requests:true,
      instruction:'PERMANENT DELETION. Preview is not a backup. Open and closed Issues will be deleted.'});
    }
    if(!block.pageInfo.endCursor||block.pageInfo.endCursor===cursor)return response({error:'invalid_pagination_cursor'},502);
    cursor=block.pageInfo.endCursor;
   }
   return response({error:'preview_limit_exceeded'},413);
  }
  if(body.confirm!==`DELETE ${full}`)return response({error:'confirmation_mismatch',required:`DELETE ${full}`},400);
  const items=parseItems(body.issues);
  if(!items)return response({error:'invalid_issue_batch',max:5},400);
  // Resolve the GitHub nodes again: a stale/edited Issue or a PR cannot be deleted.
  const verified=await graph(token,VERIFY_QUERY,{ids:items.map(x=>x.id)},fetcher);
  if(!Array.isArray(verified?.nodes)||verified.nodes.length!==items.length)return response({error:'verify_failed'},502);
  for(let i=0;i<items.length;i++){
   const original=items[i],current=verified.nodes[i];
   if(!current||current.id!==original.id||current.number!==original.number||
      current.updatedAt!==original.updatedAt||current.repository?.nameWithOwner!==full)
    return response({error:'issue_changed_or_mismatched',number:original.number,need_new_preview:true},409);
  }
  const deleted=[];
  for(const issue of items){
   try{
    const result=await graph(token,DELETE_MUTATION,{id:issue.id},fetcher);
    if(result?.deleteIssue?.repository?.nameWithOwner!==full)throw Object.assign(Error('unexpected_delete_result'),{status:502});
    deleted.push(issue.number);
   }catch(error){
    return response({deleted,failed:issue.number,error:'github_delete_failed',detail:error.message,
     need_new_preview:true},207);
   }
  }
  return response({deleted,permanent:true,repo:full});
 }catch(error){
  return response({error:'github_graphql_failed',detail:String(error.message||error).slice(0,220)},error.status||502);
 }
}
