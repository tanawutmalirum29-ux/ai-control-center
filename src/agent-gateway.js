// Invite-based browser access: no GitHub sign-in for an AI worker.
// GitHub App private key stays in Cloudflare Worker Secrets. No public write endpoints.
import {OWNER,REPOS} from '../public/repositories.js';
const bytes=new TextEncoder(), decode=new TextDecoder();
const to64=data=>btoa(String.fromCharCode(...data)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
const from64=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),c=>c.charCodeAt(0));
const err=(error,status=400)=>new Response(JSON.stringify({error}),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const cookie=(name,value,age)=>name+'='+value+'; Path=/; Max-Age='+age+'; HttpOnly; Secure; SameSite=Lax';
const issuerReady=env=>Boolean(env.GITHUB_CLIENT_SECRET&&env.GITHUB_CLIENT_ID&&env.GITHUB_APP_PRIVATE_KEY);
const cache=new Map();
async function hmac(env){
 return crypto.subtle.importKey('raw',bytes.encode('ACC_DELEGATION_V1:'+env.GITHUB_CLIENT_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
export async function signInvite(env,payload){
 const encoded=to64(bytes.encode(JSON.stringify(payload)));
 const sig=await crypto.subtle.sign('HMAC',await hmac(env),bytes.encode(encoded));
 return encoded+'.'+to64(new Uint8Array(sig));
}
export async function verifyInvite(env,value){
 if(!issuerReady(env)||typeof value!=='string'||value.length>1200||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value))return null;
 try{
  const [p,s]=value.split('.');
  if(!await crypto.subtle.verify('HMAC',await hmac(env),from64(s),bytes.encode(p)))return null;
  const v=JSON.parse(decode.decode(from64(p)));
  if(v.v!==1||!REPOS.includes(v.repo)||typeof v.exp!=='number'||Date.now()>=v.exp||
      v.exp-Date.now()>4*3600000||!Number.isFinite(v.issued)||v.issued>Date.now()+60000)return null;
  return v;
 }catch{return null;}
}
function currentCookie(request){
 const c=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('__Host-acc_agent='));
 return c?c.slice('__Host-acc_agent='.length):'';
}
export async function agentSession(request,env){
 return verifyInvite(env,currentCookie(request));
}
function asnLength(n){if(n<128)return [n];if(n<256)return [0x81,n];return [0x82,(n>>8)&255,n&255];}
function pkcs8FromPkcs1(der){
 const algorithm=Uint8Array.from([0x30,0x0d,0x06,0x09,0x2a,0x86,0x48,0x86,0xf7,0x0d,0x01,0x01,0x01,0x05,0x00]);
 const body=Uint8Array.from([0,2,1,0,...algorithm,4,...asnLength(der.length),...der]);
 return Uint8Array.from([0x30,...asnLength(body.length),...body]);
}
async function appJwt(env){
 const pem=env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g,'\n').trim();
 const rsa=pem.includes('BEGIN RSA PRIVATE KEY');
 const raw=pem.replace(/-----BEGIN (?:RSA )?PRIVATE KEY-----|-----END (?:RSA )?PRIVATE KEY-----|\s/g,'');
 const keyBytes=Uint8Array.from(atob(raw),c=>c.charCodeAt(0));
 const key=await crypto.subtle.importKey('pkcs8',rsa?pkcs8FromPkcs1(keyBytes):keyBytes,
  {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
 const now=Math.floor(Date.now()/1000);
 const header=to64(bytes.encode('{"alg":"RS256","typ":"JWT"}'));
 const payload=to64(bytes.encode(JSON.stringify({iat:now-60,exp:now+540,iss:env.GITHUB_CLIENT_ID})));
 const message=header+'.'+payload;
 const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,bytes.encode(message));
 return message+'.'+to64(new Uint8Array(signature));
}
async function gh(path,token,fetcher,method='GET',body){
 const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),12000);
 try{
  const response=await fetcher('https://api.github.com'+path,{
   method,headers:{accept:'application/vnd.github+json','x-github-api-version':'2022-11-28',
    'user-agent':'AI-Control-Center-Gateway',authorization:'Bearer '+token,
    ...(body?{'content-type':'application/json'}:{})},
   signal:ctrl.signal,body:body?JSON.stringify(body):undefined});
  const json=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error('github_app_http_'+response.status);error.status=response.status;throw error;}
  return json;
 }finally{clearTimeout(timeout);}
}
export async function installationToken(env,repo,fetcher=globalThis.fetch){
 if(!issuerReady(env)||!REPOS.includes(repo))throw Error('installation_not_configured');
 const cached=cache.get(repo);
 if(cached?.until>Date.now())return cached.token;
 const jwt=await appJwt(env);
 const installation=await gh('/repos/'+OWNER+'/'+repo+'/installation',jwt,fetcher);
 if(!Number.isSafeInteger(installation.id))throw Error('installation_not_found');
 const access=await gh('/app/installations/'+installation.id+'/access_tokens',jwt,fetcher,'POST',{repositories:[repo]});
 if(typeof access.token!=='string'||!access.token)throw Error('no_installation_token');
 const expire=Math.min(Date.now()+45*60000,Date.parse(access.expires_at||0)-5*60000);
 cache.set(repo,{token:access.token,until:Number.isFinite(expire)?expire:Date.now()+30*60000});
 return access.token;
}
export async function agentGateway(request,env,url,{owner=false,fetcher=globalThis.fetch}={}){
 const path=url.pathname;
 if(path==='/api/agent/me'){
  const a=await agentSession(request,env);
  return new Response(JSON.stringify({configured:issuerReady(env),agent_authenticated:Boolean(a),agent_repo:a?.repo||null,
    agent_expires_at:a?new Date(a.exp).toISOString():null,owner_required_for_invites:true}),{headers:{'content-type':'application/json','cache-control':'no-store'}});
 }
 if(path==='/api/agent/invite'){
  if(request.method!=='POST')return err('method_not_allowed',405);
  if(!owner)return err('owner_login_required',401);
  if(!issuerReady(env))return err('github_app_private_key_not_configured',503);
  if(request.headers.get('origin')!==url.origin||
      !request.headers.get('content-type')?.startsWith('application/json'))return err('origin_or_content_type',403);
  let input;try{input=await request.json()}catch{return err('invalid_json')}
  if(!REPOS.includes(input?.repo))return err('invalid_repo');
  const minutes=Number(input.minutes||120);
  if(!Number.isInteger(minutes)||minutes<15||minutes>240)return err('invalid_minutes');
  const now=Date.now(),payload={v:1,repo:input.repo,issued:now,exp:now+minutes*60000,
    nonce:to64(crypto.getRandomValues(new Uint8Array(16)))};
  const ticket=await signInvite(env,payload);
  return new Response(JSON.stringify({created:true,repo:input.repo,expires_at:new Date(payload.exp).toISOString(),
    url:url.origin+'/api/agent/activate?ticket='+encodeURIComponent(ticket),reusable_until_expiry:true}),
    {headers:{'content-type':'application/json','cache-control':'no-store'}});
 }
 if(path==='/api/agent/activate'){
  if(request.method!=='GET')return err('method_not_allowed',405);
  const invite=await verifyInvite(env,url.searchParams.get('ticket'));
  if(!invite)return err('invite_expired_or_invalid',401);
  const headers=new Headers({location:'/?agent_repo='+encodeURIComponent(invite.repo)+'#workspace',
    'cache-control':'no-store','referrer-policy':'no-referrer'});
  headers.set('set-cookie',cookie('__Host-acc_agent',url.searchParams.get('ticket'),Math.min(14400,Math.ceil((invite.exp-Date.now())/1000))));
  return new Response(null,{status:302,headers});
 }
 return err('not_found',404);
}
export async function delegatedAccess(request,env,{fetcher=globalThis.fetch}={}){
 const agent=await agentSession(request,env);
 if(!agent)return null;
 const url=new URL(request.url);
 let repo=url.searchParams.get('repo');
 if(request.method==='POST'){
  try{repo=(await request.clone().json()).repo}catch{return {denied:true}}
 }
 if(repo!==agent.repo)return {denied:true};
 try{return {token:await installationToken(env,repo,fetcher),repo,agent:true};}
 catch(error){return {denied:true,error:String(error.message||error)};}
}
