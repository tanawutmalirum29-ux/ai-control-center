// AI Control Center: public read-only endpoints + owner-only GitHub App user OAuth.
// No paid OpenAI API. No credentials or GitHub tokens in browser-facing JSON.
import {OWNER, REPOS, WRITE_REPOS} from '../public/repositories.js';
import {readApi} from './read-api.js';
import {workApi} from './work-api.js';
import {organizationApi} from './organization-api.js';
import {opsApi} from './ops-api.js';
import {agentGateway,agentSession,delegatedAccess,issuerReady} from './agent-gateway.js';
import {publicSourceApi} from './public-source.js';
import {missionApi} from './mission-api.js';
const jsonHeaders = {'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const publicHeaders = {...jsonHeaders,'access-control-allow-origin':'*','access-control-allow-methods':'GET, HEAD, OPTIONS'};
const reply=(data,status=200,isPublic=false)=>new Response(JSON.stringify(data),{status,headers:isPublic?publicHeaders:jsonHeaders});
const textBytes = new TextEncoder();
const toB64=(bytes)=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
function fromB64(value){ const x=value.replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(x+'='.repeat((4-x.length%4)%4)),c=>c.charCodeAt(0)); }
function cookie(request,name){
  const part=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='));
  return part?part.slice(name.length+1):null;
}
const secureCookie=(name,value,maxAge,extra='')=>name+'='+value+'; Path=/; Max-Age='+maxAge+'; HttpOnly; Secure; SameSite=Lax'+extra;
const clearCookie=name=>secureCookie(name,'',0);
const configured=env=>Boolean(env.GITHUB_CLIENT_ID&&env.GITHUB_CLIENT_SECRET);
async function keyFor(env){
 const hash=await crypto.subtle.digest('SHA-256',textBytes.encode('ACC_SESSION_COOKIE_V1:'+env.GITHUB_CLIENT_SECRET));
 return crypto.subtle.importKey('raw',hash,'AES-GCM',false,['encrypt','decrypt']);
}
async function seal(env,data){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv},await keyFor(env),textBytes.encode(JSON.stringify(data)));
 return toB64(iv)+'.'+toB64(new Uint8Array(ciphertext));
}
async function session(request,env){
 const value=cookie(request,'__Host-acc_session');
 if(!value||!configured(env))return null;
 try{
  const [iv,data,...rest]=value.split('.');
  if(rest.length||!iv||!data)return null;
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64(iv)},await keyFor(env),fromB64(data));
  const parsed=JSON.parse(new TextDecoder().decode(plain));
  if(parsed.user!==OWNER||!parsed.token||!Number.isFinite(parsed.exp)||Date.now()>=parsed.exp)return null;
  return parsed;
 }catch{return null;}
}
function redirect(url,cookies=[]){
 const h=new Headers({'location':url,'cache-control':'no-store','referrer-policy':'no-referrer'});
 cookies.forEach(c=>h.append('set-cookie',c));
 return new Response(null,{status:302,headers:h});
}
async function github(path,token=null,options={}){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),10000);
 try{
  const headers={'accept':'application/vnd.github+json','user-agent':'AI-Control-Center-Free','x-github-api-version':'2022-11-28'};
  if(token)headers.authorization='Bearer '+token;
  if(options.body)headers['content-type']='application/json';
  const res=await fetch('https://api.github.com'+path,{method:options.method||'GET',headers,body:options.body?JSON.stringify(options.body):undefined,signal:controller.signal});
  const data=await res.json().catch(()=>({}));
  if(!res.ok){ const error=new Error('github_error');error.code=res.status;throw error; }
  return data;
 }finally{clearTimeout(timer);}
}
async function auth(request,env,url){
 const path=url.pathname;
 if(path==='/api/auth/me'){
  const s=await session(request,env);
  return reply({configured:configured(env),authenticated:Boolean(s),login:s?.user||null,write_repositories:s?WRITE_REPOS.map(n=>OWNER+'/'+n):[]});
 }
 if(path==='/api/auth/login'&&request.method==='GET'){
  if(!configured(env))return reply({error:'github_app_not_configured',required:['GITHUB_CLIENT_ID','GITHUB_CLIENT_SECRET']},503);
  const state=toB64(crypto.getRandomValues(new Uint8Array(24)));
  const callback=url.origin+'/api/auth/callback';
  const oauth=new URL('https://github.com/login/oauth/authorize');
  oauth.searchParams.set('client_id',env.GITHUB_CLIENT_ID);
  oauth.searchParams.set('redirect_uri',callback);
  oauth.searchParams.set('state',state);
  return redirect(oauth.toString(),[secureCookie('__Host-acc_oauth',state,600)]);
 }
 if(path==='/api/auth/callback'&&request.method==='GET'){
  const state=url.searchParams.get('state');
  const code=url.searchParams.get('code');
  if(!configured(env)||!state||!code||!cookie(request,'__Host-acc_oauth')||state!==cookie(request,'__Host-acc_oauth'))
   return reply({error:'invalid_oauth_state'},403);
  const callback=url.origin+'/api/auth/callback';
  try{
   const response=await fetch('https://github.com/login/oauth/access_token',{
    method:'POST',headers:{'accept':'application/json','content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({client_id:env.GITHUB_CLIENT_ID,client_secret:env.GITHUB_CLIENT_SECRET,code,redirect_uri:callback}).toString()
   });
   const tokens=await response.json();
   if(!response.ok||!tokens.access_token)throw Error('oauth_exchange_failed');
   const user=await github('/user',tokens.access_token);
   if(user.login!==OWNER)return reply({error:'owner_only_login'},403);
   const ttl=Math.min(6*60*60,Math.max(60,(Number(tokens.expires_in)||6*60*60)-60));
   const encrypted=await seal(env,{user:OWNER,token:tokens.access_token,exp:Date.now()+ttl*1000});
   return redirect(url.origin+'/',[secureCookie('__Host-acc_session',encrypted,ttl),clearCookie('__Host-acc_oauth')]);
  }catch{return reply({error:'github_login_failed',message:'Check GitHub App callback URL and client secret.'},502);}
 }
 if(path==='/api/auth/logout'&&request.method==='POST'){
  if(request.headers.get('origin')!==url.origin)return reply({error:'forbidden_origin'},403);
  return new Response(null,{status:204,headers:{'set-cookie':clearCookie('__Host-acc_session'),'cache-control':'no-store'}});
 }
 return reply({error:'not_found'},404);
}
function getRole(title=''){
 const m=String(title).match(/^\[?(CEO|DIR(?:-[A-Z])?|TL(?:-[A-Z0-9]+)?|ENGINEER(?:-[A-Z0-9]+)?|QA-REVIEWER|PROJECT-LEAD)\]?(?=[\s:-])/i);
 return m?m[1].toUpperCase():'UNASSIGNED';
}
async function newIssue(request,env,url){
 if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
 if(request.headers.get('origin')!==url.origin)return reply({error:'forbidden_origin'},403);
 if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return reply({error:'json_required'},415);
 const s=await session(request,env);
 if(!s)return reply({error:'login_required'},401);
 let body;
 try{body=await request.json();}catch{return reply({error:'invalid_json'},400);}
 if(!body||typeof body!=='object')return reply({error:'invalid_body'},400);
 const name=body.repo;
 const title=typeof body.title==='string'?body.title.trim():'';
 const detail=typeof body.body==='string'?body.body.trim():'';
 if(!WRITE_REPOS.includes(name))return reply({error:'repository_not_approved',allowed:WRITE_REPOS},403);
 if(!title||title.length>120||detail.length>4000)return reply({error:'invalid_issue_content'},400);
 try{
  const result=await github('/repos/'+OWNER+'/'+name+'/issues',s.token,{method:'POST',body:{title,body:detail}});
  return reply({created:true,repo:OWNER+'/'+name,number:result.number,url:result.html_url},201);
 }catch(err){return reply({error:'github_issue_failed',github_status:err.code||502},502);}
}
export default {async fetch(request,env){
 const url=new URL(request.url);
 const path=url.pathname;
 if(!path.startsWith('/api/'))return env.ASSETS.fetch(request);
 if(path.startsWith('/api/auth/'))return auth(request,env,url);
 if(path==='/api/v1/issues')return newIssue(request,env,url);
 if(path.startsWith('/api/agent/')){
  const s=path==='/api/agent/invite'?await session(request,env):null;
  return agentGateway(request,env,url,{owner:Boolean(s),ownerSession:s});
 }
 if(path.startsWith('/api/v1/source/'))return publicSourceApi(request);
 if(path==='/api/v1/mission')return missionApi(request);
 if(path.startsWith('/api/v1/ops/')||path.startsWith('/api/v1/work/')){
  const s=await session(request,env);
  const access=s?{token:s.token,repo:null,claim:null}:await delegatedAccess(request,env);
  if(access?.denied)return reply({error:'agent_access_denied',details:access.error||'wrong_repository_or_installation'},403);
  if(path.startsWith('/api/v1/ops/'))return opsApi(request,{token:access?.token,allowedRepo:access?.repo,claim:access?.claim});
  return workApi(request,{token:access?.token,allowedRepo:access?.repo,claim:access?.claim});
 }
 if(path==='/api/v1/organization'||path==='/api/v1/organization/document'||path==='/api/v1/organization/bundle'||path==='/api/v1/organization/bundle/document')return organizationApi(request);
 if(path==='/api/health')return reply({
  service:'AI Control Center',version:12,owner:OWNER,ai_provider:'none',
  repositories:REPOS.map(name=>OWNER+'/'+name),
  write_repositories:WRITE_REPOS.map(name=>OWNER+'/'+name),
  auth_ready:configured(env),delegation_ready:issuerReady(env),guest_oauth_ready:configured(env),qa_note:'PR QA and head SHA are inspected separately from repository CI',
  endpoints:['/api/health','/api/auth/me','/api/v1/repositories','/api/v1/queue?repo=ARCANA-SURVIVOR','/api/v1/summary?repo=ARCANA-SURVIVOR','/api/v1/pr-qa?repo=ARCANA-SURVIVOR&pr=1','POST /api/v1/issues (owner only)','/api/v1/organization','/api/v1/organization/document?name=RULES.md','/api/v1/organization/bundle','/api/v1/ops/issues','/api/v1/ops/workflows','/api/v1/ops/runs','/api/v1/ops/jobs','POST /api/v1/ops/issue','POST /api/v1/ops/comment','POST /api/v1/ops/assign','POST /api/v1/ops/status','POST /api/v1/ops/dispatch (Actions write required)','/api/v1/source/branches','/api/v1/source/tree','/api/v1/source/file','/api/agent/me','POST /api/agent/invite','GET /api/agent/activate','GET /api/v1/mission?repo=ARCANA-SURVIVOR','GET /api/v1/work/branches','GET /api/v1/work/tree','GET /api/v1/work/file','POST /api/v1/work/branch','POST /api/v1/work/file','POST /api/v1/work/pr (draft only)']
 },200,true);
 return readApi(request);
}};
