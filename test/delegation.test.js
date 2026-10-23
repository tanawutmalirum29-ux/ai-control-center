import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {signInvite,verifyInvite,agentGateway,agentSession,delegatedAccess} from '../src/agent-gateway.js';
import {authorizeWork,authorizeOps,pathAllowed,taskPrefix} from '../src/role-policy.js';
import {workApi} from '../src/work-api.js';
const host='https://control.example',repo='ARCANA-SURVIVOR';
const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const env={GITHUB_CLIENT_ID:'Iv1.demo',GITHUB_CLIENT_SECRET:'test-only-secret',
 GITHUB_APP_PRIVATE_KEY:privateKey.export({type:'pkcs1',format:'pem'}).toString()};
const request=(url,method='GET',body)=>new Request(host+url,{
 method,headers:body?{'origin':host,'content-type':'application/json'}:{},
 body:body?JSON.stringify(body):undefined});
const apiMock=async(url,init)=>{
 const path=new URL(url).pathname;
 let data;
 if(path.endsWith('/installation'))data={id:8765};
 else if(path.endsWith('/access_tokens'))data={token:'ghs_test_installation',expires_at:new Date(Date.now()+3600000).toISOString()};
 else if(path.endsWith('/issues/98'))data={number:98,state:'open',
  body:'TO_ROLE: ENGINEER\nAGENT_SLOT: ENGINEER-VISUAL\nPARENT_ISSUE: #79\nEDITABLE_PATHS: src/visual/*'};
 else if(path.endsWith('/issues/97'))data={number:97,state:'open',
  body:'TO_ROLE: QA-REVIEWER\nAGENT_SLOT: QA-REVIEWER\nPARENT_ISSUE: #79\nEDITABLE_PATHS: HOLD'};
 else return new Response(JSON.stringify({message:'not found'}),{status:404});
 return new Response(JSON.stringify(data),{status:200});
};
test('owner must bootstrap manager: public visitor and worker cannot create CEO link',async()=>{
 const u='/api/agent/invite',input={repo,role:'CEO',slot:'CEO',minutes:10080};
 assert.equal((await agentGateway(request(u,'POST',input),env,new URL(host+u),{fetcher:apiMock})).status,401);
 const engineer={v:2,repo,role:'ENGINEER',issue:98,slot:'ENGINEER-VISUAL',
  editable_paths:'src/visual/*',issued:Date.now(),exp:Date.now()+600000};
 const ticket=await signInvite(env,engineer);
 const cookie='__Host-acc_agent='+ticket;
 const r=await agentGateway(new Request(host+u,{method:'POST',headers:{origin:host,'content-type':'application/json',cookie},
  body:JSON.stringify(input)}),env,new URL(host+u),{fetcher:apiMock});
 assert.equal(r.status,401);
});
test('OWNER can issue CEO link, CEO can issue engineer link bound to existing issue',async()=>{
 const u='/api/agent/invite';
 const initial=await agentGateway(request(u,'POST',{repo,role:'CEO',slot:'CEO',minutes:10080}),env,new URL(host+u),
  {owner:true,fetcher:apiMock});
 assert.equal(initial.status,200);
 const first=await initial.json();
 assert.equal(first.role,'CEO');
 const activate=await agentGateway(new Request(first.url),env,new URL(first.url));
 assert.equal(activate.status,302);
 const cookie=activate.headers.get('set-cookie').split(';')[0];
 const claim=await agentSession(new Request(host+'/test',{headers:{cookie}}),env);
 assert.equal(claim.role,'CEO');
 assert.equal(claim.repo,repo);
 const child=await agentGateway(new Request(host+u,{
  method:'POST',headers:{origin:host,'content-type':'application/json',cookie},
  body:JSON.stringify({repo,role:'ENGINEER',slot:'ENGINEER-VISUAL',issue:98,minutes:720})
 }),env,new URL(host+u),{fetcher:apiMock});
 assert.equal(child.status,200);
 const out=await child.json();
 const childToken=new URL(out.url).searchParams.get('ticket');
 const worker=await verifyInvite(env,childToken);
 assert.equal(worker.issue,98);
 assert.equal(worker.role,'ENGINEER');
 assert.equal(worker.editable_paths,'src/visual/*');
 const me=await agentGateway(new Request(host+'/api/agent/me',{headers:{cookie}}),env,new URL(host+'/api/agent/me'));
 assert.equal((await me.json()).can_delegate,true);
 const otherRepo=await agentGateway(new Request(host+u,{
  method:'POST',headers:{origin:host,'content-type':'application/json',cookie},
  body:JSON.stringify({repo:'ant-project',role:'ENGINEER',slot:'ENGINEER-VISUAL',issue:98})
 }),env,new URL(host+u),{fetcher:apiMock});
 assert.equal(otherRepo.status,403);
 const invalidRole=await agentGateway(new Request(host+u,{
  method:'POST',headers:{origin:host,'content-type':'application/json',cookie},
  body:JSON.stringify({repo,role:'CEO',slot:'CEO'})
 }),env,new URL(host+u),{fetcher:apiMock});
 assert.equal(invalidRole.status,403);
});
test('CEO cannot issue link where Issue role or slot does not match',async()=>{
 const {url}=await (await agentGateway(request('/api/agent/invite','POST',{repo,role:'CEO',slot:'CEO'}),env,new URL(host+'/api/agent/invite'),{owner:true,fetcher:apiMock})).json();
 const ceoCookie=(await agentGateway(new Request(url),env,new URL(url))).headers.get('set-cookie').split(';')[0];
 const req=new Request(host+'/api/agent/invite',{method:'POST',headers:{origin:host,'content-type':'application/json',cookie:ceoCookie},
  body:JSON.stringify({repo,role:'QA-REVIEWER',slot:'QA-REVIEWER',issue:98})});
 assert.equal((await agentGateway(req,env,new URL(req.url),{fetcher:apiMock})).status,409);
});
test('server policy isolates engineer branch, files and QA review',()=>{
 const engineer={role:'ENGINEER',repo,issue:98,editable_paths:'src/visual/*'};
 const qa={role:'QA-REVIEWER',repo,issue:97,editable_paths:'HOLD'};
 const ceo={role:'CEO',repo,issue:0};
 assert.equal(taskPrefix(engineer),'acc/issue-98-');
 assert.equal(pathAllowed('src/visual/A.js',engineer.editable_paths),true);
 assert.equal(pathAllowed('src/other.js',engineer.editable_paths),false);
 assert.equal(pathAllowed('src/all.js','*'),false);
 const get=new URLSearchParams({branch:'acc/issue-98-a'});
 assert.equal(authorizeWork(engineer,'/api/v1/work/file','POST',{branch:'acc/issue-98-a',path:'src/visual/a.js'},get),true);
 assert.equal(authorizeWork(engineer,'/api/v1/work/file','POST',{branch:'acc/issue-98-a',path:'src/other.js'},get),false);
 assert.equal(authorizeWork(engineer,'/api/v1/work/file','POST',{branch:'acc/issue-99-a',path:'src/visual/a.js'},get),false);
 assert.equal(authorizeWork(qa,'/api/v1/work/file','POST',{branch:'acc/issue-97-a',path:'src/visual/a.js'},get),false);
 assert.equal(authorizeWork(ceo,'/api/v1/work/file','POST',{branch:'acc/any',path:'src/anything'},get),true);
 assert.equal(authorizeOps(engineer,'/api/v1/ops/issue','POST',{repo,title:'bad'},get),false);
 assert.equal(authorizeOps(engineer,'/api/v1/ops/comment','POST',{number:99},get),false);
 assert.equal(authorizeOps(engineer,'/api/v1/ops/comment','POST',{number:98},get),true);
 assert.equal(authorizeOps(qa,'/api/v1/ops/status','POST',{number:97,status:'QA_BLOCK'},get),true);
 assert.equal(authorizeOps(qa,'/api/v1/ops/status','POST',{number:97,status:'READY'},get),false);
});
test('GitHub work API rejects out-of-scope request before hitting GitHub',async()=>{
 const claim={role:'ENGINEER',repo,issue:98,editable_paths:'src/visual/*'};
 let hits=0;
 const f=async()=>{hits++;throw Error('should not be called');};
 for(const body of [
  {repo,branch:'main',path:'src/visual/a.js',content:'X'},
  {repo,branch:'acc/issue-98-good',path:'src/unsafe.js',content:'X'},
  {repo:'ant-project',branch:'acc/issue-98-good',path:'src/visual/a.js',content:'X'}
 ]){
  const result=await workApi(request('/api/v1/work/file','POST',body),{token:'test',allowedRepo:repo,claim,fetcher:f});
  assert.equal(result.status,403);
 }
 assert.equal(hits,0);
});

test('OWNER or CEO can grant independent guest work without organizational issue',async()=>{
 const u='/api/agent/invite';
 const base={repo,role:'GUEST-ENGINEER',slot:'GUEST-ENGINEER',issue:0,reason:'Continue existing Astra work',minutes:720};
 const publicResult=await agentGateway(request(u,'POST',base),env,new URL(host+u),{fetcher:apiMock});
 assert.equal(publicResult.status,401);
 const owned=await agentGateway(request(u,'POST',base),env,new URL(host+u),{owner:true,fetcher:apiMock});
 assert.equal(owned.status,200);
 const ownerResult=await owned.json();
 assert.equal(ownerResult.issue,0);
 assert.equal(ownerResult.task,'Continue existing Astra work');
 const ticket=new URL(ownerResult.url).searchParams.get('ticket');
 const guest=await verifyInvite(env,ticket);
 assert.equal(guest.role,'GUEST-ENGINEER');
 assert.equal(guest.editable_paths,'PROJECT_FILES');
 assert.equal(guest.task,'Continue existing Astra work');
 assert.match(taskPrefix(guest),/^acc\/guest-[a-z0-9_-]{12}-$/);
 const activated=await agentGateway(new Request(ownerResult.url),env,new URL(ownerResult.url));
 assert.equal(activated.status,302);
 assert.ok(activated.headers.get('location').endsWith('#workspace'));
 const cookie=activated.headers.get('set-cookie').split(';')[0];
 const me=await agentGateway(new Request(host+'/api/agent/me',{headers:{cookie}}),env,new URL(host+'/api/agent/me'));
 const viewer=await me.json();
 assert.equal(viewer.agent_authenticated,true);
 assert.equal(viewer.agent_task,'Continue existing Astra work');
 assert.equal(viewer.can_delegate,false);
});
test('guest may edit project files only on own guest branch, not Issue management or main',async()=>{
 const url=host+'/api/agent/invite';
 const owned=await agentGateway(request('/api/agent/invite','POST',
 {repo,role:'GUEST-ENGINEER',slot:'GUEST-ENGINEER',reason:'Fix existing game tests'}),
 env,new URL(url),{owner:true,fetcher:apiMock});
 const guest=await verifyInvite(env,new URL((await owned.json()).url).searchParams.get('ticket'));
 const branch=taskPrefix(guest)+'fix-ui-12345678';
 assert.equal(authorizeWork(guest,'/api/v1/work/branch','POST',{title:'Fix UI',repo},new URLSearchParams()),true);
 assert.equal(authorizeWork(guest,'/api/v1/work/file','POST',{branch,path:'src/ui.js',content:'yes'},new URLSearchParams()),true);
 assert.equal(authorizeWork(guest,'/api/v1/work/file','POST',{branch:'acc/other-worker',path:'src/ui.js'},new URLSearchParams()),false);
 assert.equal(authorizeWork(guest,'/api/v1/work/file','POST',{branch:'main',path:'src/ui.js'},new URLSearchParams()),false);
 assert.equal(authorizeWork(guest,'/api/v1/work/pr','POST',{branch},new URLSearchParams()),true);
 assert.equal(authorizeOps(guest,'/api/v1/ops/issue','POST',{repo},new URLSearchParams()),false);
 assert.equal(authorizeOps(guest,'/api/v1/ops/comment','POST',{number:98},new URLSearchParams()),false);
 let called=0;
 const fakeFetch=async()=>{called++;throw Error('unexpected GitHub mutation');};
 const result=await workApi(request('/api/v1/work/file','POST',{repo,branch:'main',path:'src/ui.js',content:'test'}),
   {token:'mock',claim:guest,allowedRepo:repo,fetcher:fakeFetch});
 assert.equal(result.status,403);
 assert.equal(called,0);
});
test('Guest invitation requires a nonempty task and cannot create organizational CEO',async()=>{
 const u='/api/agent/invite';
 const noTask=await agentGateway(request(u,'POST',{repo,role:'GUEST-ENGINEER',slot:'GUEST-ENGINEER'}),env,new URL(host+u),{owner:true});
 assert.equal(noTask.status,400);
});

test('owner OAuth guest fallback works without GitHub App Private Key',async()=>{
 const noPrivate={GITHUB_CLIENT_ID:env.GITHUB_CLIENT_ID,GITHUB_CLIENT_SECRET:env.GITHUB_CLIENT_SECRET};
 const route='/api/agent/invite',oauth='ghu_owner_access_token_test_only_123456789';
 const ownerSession={user:'tanawutmalirum29-ux',token:oauth,exp:Date.now()+3.5*3600000};
 const input={repo,role:'GUEST-ENGINEER',slot:'GUEST-ENGINEER',issue:0,
  reason:'Continue game UI work',minutes:180};
 let requestToGh=0;
 const response=await agentGateway(request(route,'POST',input),noPrivate,new URL(host+route),
  {owner:true,ownerSession,fetcher:async()=>{requestToGh++;throw Error('should not call GitHub to mint guest');}});
 assert.equal(response.status,200);
 const link=(await response.json()).url;
 const ticket=new URL(link).searchParams.get('ticket');
 const signed=await verifyInvite(noPrivate,ticket);
 assert.equal(signed.role,'GUEST-ENGINEER');
 assert.ok(signed.oauth_box);
 assert.ok(!ticket.includes(oauth),'raw OAuth token must not appear in URL');
 const cookie='__Host-acc_agent='+ticket;
 const delegated=await delegatedAccess(new Request(host+'/api/v1/work/branches?repo='+repo,{headers:{cookie}}),noPrivate);
 assert.equal(delegated.token,oauth);
 assert.equal(delegated.repo,repo);
 assert.equal(delegated.claim.role,'GUEST-ENGINEER');
 assert.equal(requestToGh,0);
 const invalid=await agentGateway(request(route,'POST',{...input,minutes:720}),noPrivate,new URL(host+route),
  {owner:true,ownerSession});
 assert.equal(invalid.status,400);
 const outsider=await agentGateway(request(route,'POST',input),noPrivate,new URL(host+route),
  {owner:false,ownerSession:null});
 assert.equal(outsider.status,401);
});

test('guest authenticated tree read is limited to its own branch',async()=>{
 const response=await agentGateway(request('/api/agent/invite','POST',
  {repo,role:'GUEST-ENGINEER',slot:'GUEST-ENGINEER',reason:'Inspect source'}),
  env,new URL(host+'/api/agent/invite'),{owner:true});
 assert.equal(response.status,200);
 const claim=await verifyInvite(env,new URL((await response.json()).url).searchParams.get('ticket'));
 const branch=taskPrefix(claim)+'tree-12345678';
 let count=0;
 const fake=async url=>{
  count++;
  assert.equal(new URL(url).pathname,'/repos/tanawutmalirum29-ux/'+repo+'/contents/src');
  return new Response(JSON.stringify([{name:'a.js',path:'src/a.js',type:'file',sha:'a'.repeat(40)}]),{status:200});
 };
 const url='/api/v1/work/tree?repo='+repo+'&branch='+encodeURIComponent(branch)+'&path=src';
 const res=await workApi(request(url),{token:'test',claim,allowedRepo:repo,fetcher:fake});
 assert.equal(res.status,200);
 assert.equal((await res.json()).entries[0].path,'src/a.js');
 assert.equal(count,1);
 const denied=await workApi(request('/api/v1/work/tree?repo='+repo+'&branch=acc/another-worker&path=src'),
  {token:'test',claim,allowedRepo:repo,fetcher:fake});
 assert.equal(denied.status,403);
 assert.equal(count,1);
});
