import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import {centralGithubAccess,centralCredentialConfigured} from '../src/central-github.js';

const base='https://ai-control-center.tanawutmalirum29.workers.dev';
const repo='ARCANA-SURVIVOR';
const token='test-only-token';
const env={GITHUB_WRITE_TOKEN:token,ASSETS:{fetch:()=>new Response('ok')}};

test('central credential stays in the Worker and only works on enabled repos',async()=>{
 assert.equal(centralCredentialConfigured(env),true);
 assert.equal((await centralGithubAccess(env,repo)).token,token);
 assert.equal((await centralGithubAccess(env,'ai-organization-hub')).token,undefined);
 assert.equal((await centralGithubAccess({},repo)).error,'server_github_write_credential_missing');
 const status=await worker.fetch(new Request(base+'/api/health'),env);
 const health=await status.json();
 assert.equal(health.central_credential_present,true);
 assert.equal(JSON.stringify(health).includes(token),false);
});
test('anonymous Worker API creates only an acc/ work branch using central token',async()=>{
 const prior=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,options={})=>{
  calls.push({path:new URL(url).pathname,method:options.method,auth:options.headers?.authorization});
  assert.equal(options.headers.authorization,'Bearer '+token);
  const path=new URL(url).pathname;
  let json={default_branch:'main'};
  if(path.endsWith('/git/ref/heads/main'))json={object:{sha:'a'.repeat(40)}};
  if(path.endsWith('/git/refs'))json={ref:'refs/heads/acc/anonymous-smoke'};
  return new Response(JSON.stringify(json),{status:path.endsWith('/git/refs')?201:200});
 };
 try{
  const res=await worker.fetch(new Request(base+'/api/v1/work/branch',{
   method:'POST',headers:{origin:base,'content-type':'application/json'},
   body:JSON.stringify({repo,title:'Fix mobile source'})
  }),env);
  const data=await res.json();
  assert.equal(res.status,201,JSON.stringify(data));
  assert.match(data.branch,/^acc\/fix-mobile-source-[a-f0-9]{8}$/);
  assert.equal(calls.filter(x=>x.method==='POST').length,1);
  assert.ok(!JSON.stringify(data).includes(token));
 }finally{globalThis.fetch=prior;}
});
test('anonymous write is not available when secret is absent, and main is never writable',async()=>{
 const no=await worker.fetch(new Request(base+'/api/v1/work/branch',{
  method:'POST',headers:{origin:base,'content-type':'application/json'},
  body:JSON.stringify({repo,title:'Fix source'})
 }),{ASSETS:{fetch:()=>new Response('ok')}});
 assert.equal(no.status,401);
 const blocked=await worker.fetch(new Request(base+'/api/v1/work/file',{
  method:'POST',headers:{origin:base,'content-type':'application/json'},
  body:JSON.stringify({repo,branch:'main',path:'src/game.js',content:'X'})
 }),env);
 assert.equal(blocked.status,400);
});

test('AI QA can inspect CI and job status through Worker, no GitHub page or login',async()=>{
 const previous=globalThis.fetch,seen=[];
 globalThis.fetch=async(url,init={})=>{
  const path=new URL(url).pathname;
  seen.push({path,auth:init.headers?.authorization});
  if(path.endsWith('/actions/runs'))return new Response(JSON.stringify({
   workflow_runs:[{id:987,name:'QA',status:'completed',conclusion:'success',
    head_sha:'a'.repeat(40),head_branch:'main'}]}),{status:200});
  if(path.endsWith('/actions/runs/987/jobs'))return new Response(JSON.stringify({
   jobs:[{id:4,name:'browser-qa',status:'completed',conclusion:'success',steps:[]}]}),{status:200});
  throw Error('unexpected upstream '+path);
 };
 try{
  for(const [urlPart,expected] of [['runs',{key:'runs',name:'QA'}],
   ['jobs?run=987',{key:'jobs',name:'browser-qa'}]]){
   const join=urlPart.includes('?')?'&':'?';
   const resp=await worker.fetch(new Request(base+'/api/v1/ops/'+urlPart+join+'repo='+repo),env);
   const value=await resp.json();
   assert.equal(resp.status,200,JSON.stringify(value));
   assert.equal(value[expected.key][0].name,expected.name);
  }
  assert.equal(seen.length,2);
  assert.ok(seen.every(x=>x.auth==='Bearer '+token));
 }finally{globalThis.fetch=previous}
});
test('retired Issue, comment and role invitation endpoints reject all direct callers before GitHub',async()=>{
 const paths=['/api/v1/issues','/api/v1/queue','/api/v1/detail','/api/agent/invite',
  '/api/v1/ops/issue','/api/v1/ops/issues','/api/v1/ops/comment',
  '/api/v1/ops/comments','/api/v1/ops/assign','/api/v1/ops/status'];
 const prior=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;throw Error('retired endpoint must not touch GitHub')};
 try{
  for(const path of paths){
   for(const method of ['GET','POST']){
    const response=await worker.fetch(new Request(base+path,{method,
     ...(method==='POST'?{headers:{origin:base,'content-type':'application/json'},body:JSON.stringify({repo,number:100,comment:'would write Issue'})}:{})}),env);
    assert.equal(response.status,410,path+' '+method);
    assert.equal((await response.json()).error,'legacy_issue_workflow_retired');
   }
  }
  assert.equal(calls,0,'retired API cannot access GitHub even with site-wide write token');
 }finally{globalThis.fetch=prior}
});
