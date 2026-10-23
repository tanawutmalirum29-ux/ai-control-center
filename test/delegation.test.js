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
