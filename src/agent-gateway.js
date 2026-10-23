// Invite-based browser access: no GitHub sign-in for an AI worker.
// GitHub App private key stays in Cloudflare Worker Secrets. No public write endpoints.
import {OWNER,REPOS,WRITE_REPOS} from '../public/repositories.js';
import {ROLES,manager,coder} from './role-policy.js';
const bytes=new TextEncoder(), decode=new TextDecoder();
const to64=data=>btoa(String.fromCharCode(...data)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
const from64=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),c=>c.charCodeAt(0));
const err=(error,status=400)=>new Response(JSON.stringify({error}),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const cookie=(name,value,age)=>name+'='+value+'; Path=/; Max-Age='+age+'; HttpOnly; Secure; SameSite=Lax';
export const issuerReady=env=>Boolean(env.GITHUB_CLIENT_SECRET&&env.GITHUB_CLIENT_ID&&env.GITHUB_APP_PRIVATE_KEY);
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
 if(!issuerReady(env)||typeof value!=='string'||value.length>4000||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value))return null;
 try{
  const [p,s]=value.split('.');
  if(!await crypto.subtle.verify('HMAC',await hmac(env),from64(s),bytes.encode(p)))return null;
  const v=JSON.parse(decode.decode(from64(p)));
  if(v.v!==2||!WRITE_REPOS.includes(v.repo)||!ROLES.includes(v.role)||
      typeof v.exp!=='number'||Date.now()>=v.exp||
      v.exp-Date.now()>8*86400000||!Number.isFinite(v.issued)||v.issued>Date.now()+60000||
      v.issued>Date.now()||!Number.isSafeInteger(v.issue)||v.issue<0||
      typeof v.slot!=='string'||v.slot.length>40||typeof v.editable_paths!=='string'||v.editable_paths.length>800||
      ((!manager(v.role))&&v.issue<1))return null;
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
 const body=Uint8Array.from([2,1,0,...algorithm,4,...asnLength(der.length),...der]);
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
 const existing=await agentSession(request,env);
 if(path==='/api/agent/me'){
  return new Response(JSON.stringify({configured:issuerReady(env),agent_authenticated:Boolean(existing),
   agent_repo:existing?.repo||null,agent_role:existing?.role||null,agent_slot:existing?.slot||null,
   agent_issue:existing?.issue||null,agent_expires_at:existing?new Date(existing.exp).toISOString():null,
   can_delegate:Boolean(existing&&manager(existing.role)),can_write:Boolean(existing)}),
   {headers:{'content-type':'application/json','cache-control':'no-store'}});
 }
 if(path==='/api/agent/invite'){
  if(request.method!=='POST')return err('method_not_allowed',405);
  if(!owner&&!(existing&&manager(existing.role)))return err('owner_or_ceo_required',401);
  if(!issuerReady(env))return err('github_app_private_key_not_configured',503);
  if(request.headers.get('origin')!==url.origin||
      !request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return err('origin_or_content_type',403);
  let input;try{input=await request.json()}catch{return err('invalid_json')}
  if(!input||!WRITE_REPOS.includes(input.repo)||!ROLES.includes(input.role))return err('invalid_repo_or_role');
  if(owner&&!manager(input.role))return err('owner_must_bootstrap_ceo',403);
  if(!owner&&(!existing||existing.repo!==input.repo||manager(input.role)))return err('ceo_can_only_delegate_in_own_repo',403);
  const role=input.role;
  const issue=Number(input.issue||0);
  if(!Number.isSafeInteger(issue)||issue<0||(!manager(role)&&issue<1))return err('issue_required_for_worker');
  let slot=String(input.slot||role).trim().toUpperCase(),editable='HOLD';
  if(!/^[A-Z][A-Z0-9_-]{0,39}$/.test(slot))return err('invalid_agent_slot');
  // Engineer and QA rights come from an existing role appointment Issue.
  if(!manager(role)||issue){
   let installation;
   try{installation=await installationToken(env,input.repo,fetcher);}
   catch{return err('github_app_installation_not_ready',503);}
   let task;
   try{task=await gh('/repos/'+OWNER+'/'+input.repo+'/issues/'+issue,installation,fetcher);}
   catch{return err('appointment_issue_not_accessible',404);}
   const text=String(task.body||'');
   const claimedRole=text.match(/^TO_ROLE:\s*(.+)$/im)?.[1].trim().toUpperCase();
   const claimedSlot=text.match(/^AGENT_SLOT:\s*(.+)$/im)?.[1].trim().toUpperCase();
   if(task.state!=='open'||task.pull_request||claimedRole!==role||claimedSlot!==slot)
     return err('appointment_role_slot_or_state_mismatch',409);
   if(!manager(role)&&!/^PARENT_ISSUE:\s*#[1-9]\d*$/im.test(text))
     return err('worker_parent_mission_missing',409);
   editable=text.match(/^EDITABLE_PATHS:\s*(.*)$/im)?.[1].trim()||'HOLD';
   if(coder(role)&&(!editable||editable==='HOLD'))
     return err('editable_paths_not_granted_in_issue',409);
  }
  const minutes=Number(input.minutes||(manager(role)?7*1440:720));
  const max=manager(role)?7*1440:1440;
  if(!Number.isInteger(minutes)||minutes<15||minutes>max)return err('invalid_minutes');
  const now=Date.now(),payload={v:2,repo:input.repo,role,issue,slot,editable_paths:editable,
   issued:now,exp:now+minutes*60000,nonce:to64(crypto.getRandomValues(new Uint8Array(16)))};
  const ticket=await signInvite(env,payload);
  return new Response(JSON.stringify({created:true,repo:input.repo,role,slot,issue,
   expires_at:new Date(payload.exp).toISOString(),
   url:url.origin+'/api/agent/activate?ticket='+encodeURIComponent(ticket),
   note:'Anyone holding this link may exercise its delegated task permissions until expiry.'}),
   {headers:{'content-type':'application/json','cache-control':'no-store','referrer-policy':'no-referrer'}});
 }
 if(path==='/api/agent/activate'){
  if(request.method!=='GET')return err('method_not_allowed',405);
  const invite=await verifyInvite(env,url.searchParams.get('ticket'));
  if(!invite)return err('invite_expired_or_invalid',401);
  const location='/?agent_repo='+encodeURIComponent(invite.repo)+'#'+(manager(invite.role)?'ceo':'mywork');
  const headers=new Headers({location,'cache-control':'no-store','referrer-policy':'no-referrer'});
  headers.set('set-cookie',cookie('__Host-acc_agent',url.searchParams.get('ticket'),Math.min(8*86400,Math.ceil((invite.exp-Date.now())/1000))));
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
 try{return {token:await installationToken(env,repo,fetcher),repo,agent:true,claim:agent};}
 catch(error){return {denied:true,error:String(error.message||error)};}
}
