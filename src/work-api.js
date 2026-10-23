// Owner-authenticated project workspaces: branch -> text edits -> draft pull request.
// Existing GitHub App user OAuth token stays server-side. No writes to main or deletions.
import {OWNER, REPOS} from '../public/repositories.js';
const send=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const nameOk=name=>REPOS.includes(name);
const branchOk=branch=>typeof branch==='string'&&/^acc\/[a-z0-9][a-z0-9._-]{0,90}$/.test(branch)&&!branch.includes('..')&&!branch.endsWith('.');
export function pathOk(path){
 if(typeof path!=='string'||path.length>240||path.length<1||path.startsWith('/')||path.includes('\\')||path.includes('%')||/[\x00-\x1f\x7f]/.test(path))return false;
 const parts=path.split('/');
 if(parts.some(p=>!p||p==='.'||p==='..'||p==='.'+'git'||p.length>90))return false;
 if(/^\.github\/workflows\//i.test(path)||/(^|\/)\.env(?:\.|$)/i.test(path)||/(^|\/)[^/]*\.(?:pem|p12|pfx|key)$/i.test(path))return false;
 return true;
}
const encPath=path=>path.split('/').map(encodeURIComponent).join('/');
const base=repo=>'/repos/'+OWNER+'/'+repo;
const validSha=sha=>typeof sha==='string'&&/^[a-f0-9]{40}$/.test(sha);
async function requestGh(path,token,fetcher,method='GET',body){
 const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),10000);
 try{
  const response=await fetcher('https://api.github.com'+path,{
   method,headers:{accept:'application/vnd.github+json','x-github-api-version':'2022-11-28',
    'user-agent':'AI-Control-Center-Workspace',authorization:'Bearer '+token,
    ...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:abort.signal
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error('github_request_failed');error.code=response.status;throw error;}
  return data;
 }finally{clearTimeout(timeout);}
}
function checkedInput(value){return value&&typeof value==='object'&&!Array.isArray(value)?value:null;}
function titleOk(v){return typeof v==='string'&&v.trim().length>=3&&v.trim().length<=120;}
function editContent(v){return typeof v==='string'&&new TextEncoder().encode(v).length<=45000;}
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
export async function workApi(request,{token,allowedRepo=null,fetcher=globalThis.fetch}={}){
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
 const root=base(repo);
 const gh=(path,method='GET',body)=>requestGh(path,token,fetcher,method,body);
 try{
  if(route==='/api/v1/work/branches'&&verb==='GET'){
   const branches=await gh(root+'/branches?per_page=100');
   return send({repo:OWNER+'/'+repo,branches:branches.filter(b=>branchOk(b.name)).map(b=>({name:b.name,head_sha:b.commit?.sha})),truncated:branches.length===100});
  }
  if(route==='/api/v1/work/file'&&verb==='GET'){
   const branch=url.searchParams.get('branch'),path=url.searchParams.get('path');
   if(!branchOk(branch)||!pathOk(path))return send({error:'invalid_branch_or_path'},400);
   const entry=await gh(root+'/contents/'+encPath(path)+'?ref='+encodeURIComponent(branch));
   if(entry.type!=='file'||entry.encoding!=='base64'||entry.size>45000)return send({error:'file_is_not_small_text'},422);
   let decoded;
   try{decoded=decodeText(entry.content||'');}catch{return send({error:'file_is_not_utf8'},422);}
   return send({repo:OWNER+'/'+repo,branch,path,sha:entry.sha,content:decoded});
  }
  if(route==='/api/v1/work/branch'&&verb==='POST'){
   if(!titleOk(data.title))return send({error:'invalid_title'},400);
   const info=await gh(root),defaultBranch=info.default_branch;
   if(!/^[a-zA-Z0-9._/-]{1,120}$/.test(defaultBranch||''))return send({error:'invalid_default_branch'},502);
   const baseRef=await gh(root+'/git/ref/heads/'+defaultBranch.split('/').map(encodeURIComponent).join('/'));
   const sha=baseRef.object?.sha;
   if(!validSha(sha))return send({error:'invalid_base_sha'},502);
   const slug=data.title.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||'task';
   const branch='acc/'+slug+'-'+crypto.randomUUID().slice(0,8);
   await gh(root+'/git/refs','POST',{ref:'refs/heads/'+branch,sha});
   return send({created:true,repo:OWNER+'/'+repo,branch,base:defaultBranch,base_sha:sha,url:'https://github.com/'+OWNER+'/'+repo+'/tree/'+branch},201);
  }
  if(route==='/api/v1/work/file'&&verb==='POST'){
   const {branch,path,content,sha}=data;
   if(!branchOk(branch)||!pathOk(path)||!editContent(content)||!(sha===undefined||validSha(sha)))return send({error:'invalid_file_submission'},400);
   // No main writes: only branches minted under "acc/" are allowed.
   const payload={message:'chore(workspace): '+path,content:encodeText(content),branch};
   if(sha)payload.sha=sha;
   const saved=await gh(root+'/contents/'+encPath(path),'PUT',payload);
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
  return send({error:'github_workspace_action_failed',github_status:code,message:code===403?'GitHub App not installed on this repository or permission denied':code===404?'Branch/file not found or GitHub App missing':code===409?'Repository changed concurrently':code===422?'GitHub rejected the operation (existing PR, duplicate branch, or file SHA conflict)':'GitHub request failed'},code===403?403:code===404?404:code===409?409:code===422?422:502);
 }
}
