// AI Control Center: public read-only endpoints + owner-only GitHub App user OAuth.
// No paid OpenAI API. No credentials or GitHub tokens in browser-facing JSON.
const OWNER = 'tanawutmalirum29-ux';
const REPOS = ['ARCANA-SURVIVOR', 'ai-control-center', 'appointment-CEO', 'Staging_area'];
const WRITE_REPOS = ['ai-control-center'];
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
async function queue(name){
 const repo=OWNER+'/'+name;
 const list=await github('/repos/'+repo+'/issues?state=open&sort=updated&direction=desc&per_page=50');
 return {repo,fetched_at:new Date().toISOString(),truncated:list.length===50,read_only:true,tasks:list.filter(x=>!x.pull_request).map(x=>({number:x.number,title:x.title,role:getRole(x.title),url:'https://github.com/'+repo+'/issues/'+x.number,updated_at:x.updated_at}))};
}
async function summary(name){
 const repo=OWNER+'/'+name;
 const [issues,prs,runs]=await Promise.all([
  github('/repos/'+repo+'/issues?state=open&per_page=100'),
  github('/repos/'+repo+'/pulls?state=open&per_page=100'),
  github('/repos/'+repo+'/actions/runs?per_page=1')
 ]);
 const latest=runs.workflow_runs?.[0];
 return {repo,fetched_at:new Date().toISOString(),open_issues_in_page:issues.filter(x=>!x.pull_request).length,issues_truncated:issues.length===100,open_prs_in_page:prs.length,prs_truncated:prs.length===100,latest_qa:latest?{name:latest.name,status:latest.status,conclusion:latest.conclusion,url:latest.html_url}:null,read_only:true};
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
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:publicHeaders});
 if(request.method!=='GET'&&request.method!=='HEAD')return reply({error:'method_not_allowed',writes_enabled:false},405);
 if(path==='/api/health')return reply({service:'AI Control Center',version:3,mode:configured(env)?'github-app-owner-auth':'public-read-only',ai_provider:'none',owner:OWNER,repositories:REPOS.map(n=>OWNER+'/'+n),write_repositories:WRITE_REPOS.map(n=>OWNER+'/'+n),auth_ready:configured(env),endpoints:['/api/health','/api/auth/me','/api/v1/queue?repo=ARCANA-SURVIVOR','/api/v1/summary?repo=ARCANA-SURVIVOR','POST /api/v1/issues (owner login only)']},200,true);
 if(!['/api/v1/queue','/api/v1/summary'].includes(path))return reply({error:'not_found'},404,true);
 const name=url.searchParams.get('repo');
 if(!REPOS.includes(name))return reply({error:'repository_not_allowed',allowed:REPOS},400,true);
 try{return reply(path==='/api/v1/queue'?await queue(name):await summary(name),200,true);}
 catch{return reply({error:'github_unavailable',message:'GitHub public API unavailable or rate limited.'},503,true);}
}};