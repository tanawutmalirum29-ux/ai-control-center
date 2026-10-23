// Owner-authenticated project workspaces: branch -> text edits -> draft pull request.
// Existing GitHub App user OAuth token stays server-side. No writes to main or deletions.
import {OWNER, REPOS,WRITE_REPOS} from '../public/repositories.js';
import {authorizeWork,taskPrefix,manager} from './role-policy.js';
import {splitLines,previewLineChange,contentDigest} from './line-editor.js';
const send=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const nameOk=name=>REPOS.includes(name);
// Work only on existing work/feature branches; never on main, backup or refs.
export const branchOk=branch=>typeof branch==='string'&&/^(?:acc|feat|fix)\/[a-z0-9][a-z0-9._/-]{0,180}$/.test(branch)&&
 !branch.includes('..')&&!branch.includes('//')&&!branch.endsWith('.')&&!branch.endsWith('/')&&
 !branch.split('/').some(p=>p.startsWith('.')||p.endsWith('.lock'));
export function pathOk(path,{repo=null}={}){
 if(typeof path!=='string'||path.length>240||path.length<1||path.startsWith('/')||path.includes('\\')||path.includes('%')||/[\x00-\x1f\x7f]/.test(path))return false;
 const parts=path.split('/');
 if(parts.some(p=>!p||p==='.'||p==='..'||p==='.'+'git'||p.length>90))return false;
 // CI stabilization for Astra explicitly needs this workflow; all other workflow files remain blocked.
 if(/^\.github\/workflows\//i.test(path)&&!(repo==='ARCANA-SURVIVOR'&&path==='.github/workflows/ci.yml'))return false;
 if(/(^|\/)\.env(?:\.|$)/i.test(path)||/(^|\/)[^/]*\.(?:pem|p12|pfx|key)$/i.test(path))return false;
 return true;
}
const encPath=path=>path.split('/').map(encodeURIComponent).join('/');
const base=repo=>'/repos/'+OWNER+'/'+repo;
const validSha=sha=>typeof sha==='string'&&/^[a-f0-9]{40}$/.test(sha);
export const MAX_TEXT_BYTES=200000;
async function requestGh(path,token,fetcher,method='GET',body){
 const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),10000);
 try{
  const response=await fetcher('https://api.github.com'+path,{
   method,headers:{accept:'application/vnd.github+json','x-github-api-version':'2022-11-28',
    'user-agent':'AI-Control-Center-Workspace',authorization:'Bearer '+token,
    ...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:abort.signal
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
   const error=new Error('github_request_failed');error.code=response.status;
   error.githubMessage=typeof data.message==='string'?data.message.slice(0,350):null;
   error.githubErrors=Array.isArray(data.errors)?data.errors.slice(0,3).map(e=>
     typeof e==='string'?e.slice(0,150):String(e.message||e.code||'unknown').slice(0,150)):[];
   throw error;
  }
  return data;
 }finally{clearTimeout(timeout);}
}
function checkedInput(value){return value&&typeof value==='object'&&!Array.isArray(value)?value:null;}
function titleOk(v){return typeof v==='string'&&v.trim().length>=3&&v.trim().length<=120;}
function editContent(v){return typeof v==='string'&&new TextEncoder().encode(v).length<=MAX_TEXT_BYTES;}
function encodeText(input){
 const bytes=new TextEncoder().encode(input);let raw='';
 for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return btoa(raw);
}
function decodeText(encoded){
 const binary=atob(encoded.replace(/\s/g,''));
 const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
 return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
export async function workApi(request,{token,allowedRepo=null,claim=null,fetcher=globalThis.fetch}={}){
 if(!token)return send({error:'owner_login_required'},401);
 const url=new URL(request.url),route=url.pathname,verb=request.method;
 const name=verb==='GET'?url.searchParams.get('repo'):undefined;
 let data=null;
 if(verb==='POST'){
  if(request.headers.get('origin')!==url.origin)return send({error:'origin_mismatch'},403);
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return send({error:'json_required'},415);
  try{data=checkedInput(await request.json());}catch{return send({error:'invalid_json'},400);}
  if(!data)return send({error:'invalid_json'},400);
 }
 const repo=verb==='GET'?name:data?.repo;
 if(!nameOk(repo))return send({error:'repository_not_allowed',allowed:REPOS},403);
 if(allowedRepo&&allowedRepo!==repo)return send({error:'agent_repo_scope_denied'},403);
 if(verb==='POST'&&!WRITE_REPOS.includes(repo))return send({error:'repository_read_only'},403);
 if(!authorizeWork(claim,route,verb,data,url.searchParams))return send({error:'agent_role_or_task_scope_denied'},403);
 const root=base(repo);
 const gh=(path,method='GET',body)=>requestGh(path,token,fetcher,method,body);
 try{
  if(route==='/api/v1/work/branches'&&verb==='GET'){
   const branches=await gh(root+'/branches?per_page=100');
   return send({repo:OWNER+'/'+repo,branches:branches.filter(b=>branchOk(b.name)&&(!claim||manager(claim.role)||b.name.startsWith(taskPrefix(claim)))).map(b=>({name:b.name,head_sha:b.commit?.sha})),truncated:branches.length===100});
  }
  if(route==='/api/v1/work/tree'&&verb==='GET'){
   const branch=url.searchParams.get('branch'),path=url.searchParams.get('path')||'';
   if(!branchOk(branch)||(path&&!pathOk(path,{repo})))return send({error:'invalid_branch_or_path'},400);
   const entries=await gh(root+'/contents'+(path?'/'+encPath(path):'')+'?ref='+encodeURIComponent(branch));
   if(!Array.isArray(entries))return send({error:'path_not_directory'},422);
   return send({repo:OWNER+'/'+repo,branch,path,entries:entries.slice(0,1000).map(i=>
    ({name:i.name,path:i.path,type:i.type,size:i.size,sha:i.sha,url:i.html_url})),truncated:entries.length>1000});
  }
  if(route==='/api/v1/work/file'&&verb==='GET'){
   const branch=url.searchParams.get('branch'),path=url.searchParams.get('path');
   if(!branchOk(branch)||!pathOk(path,{repo}))return send({error:'invalid_branch_or_path'},400);
   const entry=await gh(root+'/contents/'+encPath(path)+'?ref='+encodeURIComponent(branch));
   if(entry.type!=='file'||entry.encoding!=='base64'||entry.size>MAX_TEXT_BYTES)return send({error:'file_is_not_small_text',limit_bytes:MAX_TEXT_BYTES},422);
   let decoded;
   try{decoded=decodeText(entry.content||'');}catch{return send({error:'file_is_not_utf8'},422);}
   return send({repo:OWNER+'/'+repo,branch,path,sha:entry.sha,content:decoded});
  }
  if(route==='/api/v1/work/file-lines'&&verb==='GET'){
   const branch=url.searchParams.get('branch'),path=url.searchParams.get('path');
   const all=url.searchParams.get('all')==='true';
   const start=all?1:Number(url.searchParams.get('start')||1);
   const count=all?MAX_TEXT_BYTES:Number(url.searchParams.get('count')||40);
   if(!branchOk(branch)||!pathOk(path,{repo})||!Number.isSafeInteger(start)||start<1||
      !Number.isSafeInteger(count)||count<1||(!all&&count>80))
    return send({error:'invalid_line_reader_request'},400);
   const entry=await gh(root+'/contents/'+encPath(path)+'?ref='+encodeURIComponent(branch));
   if(entry.type!=='file'||entry.encoding!=='base64'||entry.size>MAX_TEXT_BYTES)return send({error:'file_is_not_small_text'},422);
   let content;try{content=decodeText(entry.content||'');}catch{return send({error:'file_is_not_utf8'},422);}
   const {lines}=splitLines(content);
   if(start>Math.max(1,lines.length))return send({error:'line_start_beyond_end',total_lines:lines.length},400);
   return send({repo:OWNER+'/'+repo,branch,path,sha:entry.sha,
    all,total_lines:lines.length,start,end:Math.min(start+count-1,lines.length),
    lines:lines.slice(start-1,start+count-1).map((line,i)=>({
     number:start+i,text:line.endsWith('\r')?line.slice(0,-1):line
    }))});
  }
  if(route==='/api/v1/work/patch-lines'&&verb==='POST'){
   const {branch,path,sha,start,end,replacement,preview,preview_digest}=data;
   if(!branchOk(branch)||!pathOk(path,{repo})||!validSha(sha))
    return send({error:'invalid_patch_location_or_sha',hint:'Load line view first to get file SHA'},400);
   if(typeof preview!=='boolean'||typeof replacement!=='string'||
      new TextEncoder().encode(replacement).length>16000)
    return send({error:'invalid_patch_data',hint:'Supply replacement <=16KB and preview boolean'},400);
   const entry=await gh(root+'/contents/'+encPath(path)+'?ref='+encodeURIComponent(branch));
   if(entry.type!=='file'||entry.encoding!=='base64'||entry.size>MAX_TEXT_BYTES)return send({error:'file_is_not_small_text'},422);
   if(sha!==entry.sha)return send({error:'stale_file_sha',hint:'Another commit changed this file. Reload line view before editing',
    expected_sha:sha,current_sha:entry.sha},409);
   let original;try{original=decodeText(entry.content||'');}catch{return send({error:'file_is_not_utf8'},422);}
   let edit;
   try{edit=previewLineChange(original,{start,end,replacement});}
   catch(e){return send({error:e.message||'invalid_line_patch'},400);}
   if(!editContent(edit.result))return send({error:'result_exceeds_200kb'},400);
   const originalText=edit.oldLines.map(x=>x.endsWith('\r')?x.slice(0,-1):x).join('\n');
   const replacementText=edit.newLines.map(x=>x.endsWith('\r')?x.slice(0,-1):x).join('\n');
   if(originalText.length>16000)return send({error:'patch_range_too_large',hint:'Select fewer lines'},400);
   const digest=await contentDigest(edit.result);
   if(preview)return send({preview:true,branch,path,sha,line_start:start,line_end:end,
    total_before:edit.totalBefore,total_after:edit.totalAfter,
    original_text:originalText,replacement_text:replacementText,preview_digest:digest,crlf:edit.crlf,
    note:'Preview only: no GitHub commit has occurred'});
   if(typeof preview_digest!=='string'||preview_digest!==digest)
    return send({error:'preview_outdated',hint:'Preview the exact patch again before committing'},409);
   const saved=await gh(root+'/contents/'+encPath(path),'PUT',{
    message:'fix(workspace): patch '+path+' lines '+start+'-'+end,
    content:encodeText(edit.result),branch,sha:entry.sha
   });
   return send({saved:true,branch,path,previous_sha:entry.sha,sha:saved.content?.sha,
    commit_sha:saved.commit?.sha,url:saved.content?.html_url},201);
  }
  if(route==='/api/v1/work/branch'&&verb==='POST'){
   if(!titleOk(data.title))return send({error:'invalid_title'},400);
   const info=await gh(root),defaultBranch=info.default_branch;
   if(!/^[a-zA-Z0-9._/-]{1,120}$/.test(defaultBranch||''))return send({error:'invalid_default_branch'},502);
   const baseRef=await gh(root+'/git/ref/heads/'+defaultBranch.split('/').map(encodeURIComponent).join('/'));
   const sha=baseRef.object?.sha;
   if(!validSha(sha))return send({error:'invalid_base_sha'},502);
   const slug=data.title.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,34)||'task';
   const prefix=claim&&!manager(claim.role)?taskPrefix(claim):'acc/';
   const branch=prefix+slug+'-'+crypto.randomUUID().slice(0,8);
   await gh(root+'/git/refs','POST',{ref:'refs/heads/'+branch,sha});
   return send({created:true,repo:OWNER+'/'+repo,branch,base:defaultBranch,base_sha:sha,url:'https://github.com/'+OWNER+'/'+repo+'/tree/'+branch},201);
  }
  if(route==='/api/v1/work/file'&&verb==='POST'){
   const {branch,path,content,sha}=data;
   if(!branchOk(branch))return send({error:'invalid_branch',hint:'Select an existing acc/, feat/ or fix/ branch; main is read-only'},400);
   if(!pathOk(path,{repo}))return send({error:'invalid_file_path',hint:'Only project files or ARCANA-SURVIVOR/.github/workflows/ci.yml are writable'},400);
   if(!editContent(content))return send({error:'invalid_file_content',hint:'File must be UTF-8 text up to 200 KB'},400);
   if(!(sha===undefined||validSha(sha)))return send({error:'invalid_blob_sha'},400);
   // Always read the current blob before attempting a write. GitHub can create
   // a new commit even when its content is byte-for-byte identical.
   const payload={message:'chore(workspace): '+path,content:encodeText(content),branch};
   let existing=null,existingText=null;
   try{
    existing=await gh(root+'/contents/'+encPath(path)+'?ref='+encodeURIComponent(branch));
    if(existing.type!=='file'||existing.encoding!=='base64'||!validSha(existing.sha))
     return send({error:'file_not_regular_text'},422);
    if(existing.size>MAX_TEXT_BYTES)return send({error:'file_is_not_small_text'},422);
    existingText=decodeText(existing.content||'');
   }catch(error){if(error.code!==404)throw error;}
   if(existing){
    if(sha&&sha!==existing.sha)return send({error:'stale_file_sha',expected_sha:sha,current_sha:existing.sha,
      hint:'File has changed. Reload and review Diff before saving.'},409);
    if(content===existingText)return send({error:'no_content_changes',
      sha:existing.sha,hint:'No Diff: content is identical to the current GitHub file. No Commit created.'},409);
    payload.sha=existing.sha;
   }else if(sha)return send({error:'file_was_deleted',
    hint:'The existing file disappeared. Reload before committing.'},409);
   const saved=await gh(root+'/contents/'+encPath(path),'PUT',payload);
   if(!validSha(saved.commit?.sha))return send({error:'github_commit_not_confirmed',hint:'Verify the branch before retrying'},502);
   return send({saved:true,repo:OWNER+'/'+repo,branch,path,sha:saved.content?.sha,commit_sha:saved.commit?.sha,url:saved.content?.html_url},201);
  }
  if(route==='/api/v1/work/pr'&&verb==='POST'){
   const {branch,title,body}=data;
   if(!branchOk(branch)||!titleOk(title)||!(body===undefined||(typeof body==='string'&&body.length<=3000)))return send({error:'invalid_pr_submission'},400);
   const info=await gh(root);
   const baseBranch=info.default_branch;
   // Draft only; no merge, branch deletion, or QA bypass endpoints.
   const pr=await gh(root+'/pulls','POST',{
    head:branch,base:baseBranch,title:title.trim(),
    body:(body||'')+'\n\n## QA gate\n- [ ] CI for current head SHA passes\n- [ ] Independent QA reviewer signs off\n- [ ] Mobile/browser regression verified as applicable\n\nCreated in AI Control Center workspace. Draft; manual merge authorization required.',
    draft:true
   });
   return send({created:true,repo:OWNER+'/'+repo,number:pr.number,draft:true,url:pr.html_url,head_sha:pr.head?.sha},201);
  }
  return send({error:'method_not_allowed_or_not_found'},405);
 }catch(error){
  const code=Number(error.code)||502;
  return send({error:'github_workspace_action_failed',github_status:code,github_message:error.githubMessage||null,github_errors:error.githubErrors||[],message:code===403?'GitHub App not installed on this repository or permission denied':code===404?'Branch/file not found or GitHub App missing':code===409?'Repository changed concurrently':code===422?'GitHub rejected the operation (existing PR, duplicate branch, or file SHA conflict)':'GitHub request failed'},code===403?403:code===404?404:code===409?409:code===422?422:502);
 }
}
