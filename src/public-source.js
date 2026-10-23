// Public repository source reader for external agents. GET-only, public repos allowlist.
// Never calls the owner's authenticated API or returns private repository files.
import {OWNER,REPOS} from '../public/repositories.js';
const cache=new Map(),ongoing=new Map();
const send=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*','x-content-type-options':'nosniff'}});
export const refOK=ref=>typeof ref==='string'&&ref.length>0&&ref.length<=120&&/^[a-zA-Z0-9._/-]+$/.test(ref)&&
 !ref.startsWith('/')&&!ref.endsWith('/')&&!ref.includes('..')&&!ref.includes('//')&&
 !ref.split('/').some(s=>!s||s.startsWith('.')||s.endsWith('.')||s.endsWith('.lock'));
export const pathOK=p=>typeof p==='string'&&p.length<=300&&!p.includes('\\')&&
 !/[\x00-\x1f\x7f%]/.test(p)&&(p===''||!p.startsWith('/')&&!p.endsWith('/')&&p.split('/').every(x=>x&&x!=='.'&&x!=='..'));
const encodePath=p=>p.split('/').map(encodeURIComponent).join('/');
async function github(path,fetcher){
 const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),10000);
 try{
  const response=await fetcher('https://api.github.com'+path,{headers:{'accept':'application/vnd.github+json','user-agent':'AI-Control-Center-Public-Source'},signal:abort.signal});
  if(!response.ok){const e=new Error('github_http_'+response.status);e.status=response.status;throw e}
  return response.json();
 }finally{clearTimeout(timeout);}
}
function decode(s){return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(s.replace(/\s/g,'')),c=>c.charCodeAt(0)))}
async function backed(key,fetcher,load){
 const now=Date.now(),entry=cache.get(key);
 if(entry&&now-entry.at<120000)return {...entry.value,stale:false};
 if(ongoing.has(key))return ongoing.get(key);
 const pending=(async()=>{
  try{
   const value=await load(fetcher);
   cache.set(key,{at:now,value});
   if(cache.size>80)cache.delete(cache.keys().next().value);
   return {...value,stale:false};
  }catch(e){
   if(entry&&now-entry.at<900000)return {...entry.value,stale:true,warning:'GitHub temporarily unavailable'};
   throw e;
  }
 })();
 ongoing.set(key,pending);
 try{return await pending}finally{ongoing.delete(key)}
}
export async function publicSourceApi(request,{fetcher=globalThis.fetch}={}){
 const url=new URL(request.url);
 if(request.method!=='GET'&&request.method!=='HEAD')return send({error:'read_only'},405);
 const repo=url.searchParams.get('repo'),ref=url.searchParams.get('ref')||'main',path=url.searchParams.get('path')||'';
 if(!REPOS.includes(repo)||!refOK(ref)||!pathOK(path))return send({error:'invalid_repo_ref_or_path'},400);
 const mode=url.pathname.slice('/api/v1/source/'.length);
 if(!['branches','tree','file'].includes(mode))return send({error:'not_found'},404);
 const root='/repos/'+OWNER+'/'+repo;
 const key=mode+'|'+repo+'|'+ref+'|'+path;
 try{
  const value=await backed(key,fetcher,async f=>{
   if(mode==='branches'){
    const branches=await github(root+'/branches?per_page=100',f);
    return {repo,branches:branches.map(b=>({name:b.name,head_sha:b.commit?.sha})),truncated:branches.length===100,public:true};
   }
   if(mode==='tree'){
    const entries=await github(root+'/contents'+(path?'/'+encodePath(path):'')+'?ref='+encodeURIComponent(ref),f);
    if(!Array.isArray(entries))return {repo,ref,path,entries:[],note:'This path is a file, not a directory'};
    return {repo,ref,path,entries:entries.slice(0,1000).map(x=>({name:x.name,path:x.path,type:x.type,size:x.size,sha:x.sha,url:x.html_url})),public:true};
   }
   if(!path)return {repo,ref,error:'path_required'};
   const item=await github(root+'/contents/'+encodePath(path)+'?ref='+encodeURIComponent(ref),f);
   if(item.type!=='file'||item.encoding!=='base64'||item.size>150000)return {repo,ref,path,error:'file_not_small_utf8'};
   let content;
   try{content=decode(item.content||'')}catch{return {repo,ref,path,error:'file_not_utf8'}}
   return {repo,ref,path,sha:item.sha,size:item.size,content,public:true,url:item.html_url};
  });
  if(value.error)return send(value,value.error==='path_required'?400:422);
  return send(value);
 }catch(e){
  return send({error:'public_github_unavailable',github_status:e.status||null,
    reason:e.status===403?'GitHub public rate limit':e.status===404?'Repository/ref/path not found':'Upstream request failed'},503);
 }
}
