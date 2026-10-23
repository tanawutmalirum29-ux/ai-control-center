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

test('public AI work queue reads Issues with central token, not anonymous rate-limited API',async()=>{
 const prior=globalThis.fetch,seen=[];
 globalThis.fetch=async(url,options={})=>{
  seen.push({path:new URL(url).pathname,auth:options.headers?.authorization});
  assert.equal(options.headers.authorization,'Bearer '+token);
  return new Response(JSON.stringify([
   {number:98,title:'[ENGINEER] Astra polishing',labels:[],updated_at:'2026-10-23T08:00:00Z'}
  ]),{status:200});
 };
 try{
  const response=await worker.fetch(new Request(base+'/api/v1/queue?repo='+repo),env);
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.tasks[0].number,98);
  assert.equal(seen.length,1);
  assert.ok(!JSON.stringify(data).includes(token));
 }finally{globalThis.fetch=prior;}
});

test('public Issue comment uses the server token without a GitHub login',async()=>{
 const prior=globalThis.fetch,seen=[];
 globalThis.fetch=async(url,options={})=>{
  seen.push({path:new URL(url).pathname,method:options.method,
   body:JSON.parse(options.body),auth:options.headers?.authorization});
  return new Response(JSON.stringify({id:601,html_url:'https://github.com/test-comment'}),{status:201});
 };
 try{
  const response=await worker.fetch(new Request(base+'/api/v1/ops/comment',{
   method:'POST',headers:{origin:base,'content-type':'application/json'},
   body:JSON.stringify({repo,number:100,comment:'QA-REVIEWER: MN #100 — verify PR #99 head SHA'})
  }),env);
  assert.equal(response.status,201,JSON.stringify(await response.clone().json()));
  const value=await response.json();
  assert.equal(value.created,true);assert.equal(value.issue,100);assert.equal(value.id,601);
  assert.deepEqual(seen.map(x=>x.path),['/repos/tanawutmalirum29-ux/ARCANA-SURVIVOR/issues/100/comments']);
  assert.equal(seen[0].auth,'Bearer '+token);
  assert.equal(seen[0].body.body,'QA-REVIEWER: MN #100 — verify PR #99 head SHA');
  assert.ok(!JSON.stringify(value).includes(token));
 }finally{globalThis.fetch=prior;}
});
test('comment endpoint requires JSON same-origin and rejects invalid input',async()=>{
 const other=new Request(base+'/api/v1/ops/comment',{method:'POST',
  headers:{origin:'https://another.example','content-type':'application/json'},
  body:JSON.stringify({repo,number:100,comment:'something'})});
 assert.equal((await worker.fetch(other,env)).status,403);
 const bad=new Request(base+'/api/v1/ops/comment',{method:'POST',
  headers:{origin:base,'content-type':'application/json'},
  body:JSON.stringify({repo,number:100,comment:''})});
 assert.equal((await worker.fetch(bad,env)).status,400);
});
