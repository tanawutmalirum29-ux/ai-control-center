import test from 'node:test';import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import {centralGithubAccess,centralCredentialConfigured} from '../src/central-github.js';
const base='https://ai-control-center.tanawutmalirum29.workers.dev';
const env={GITHUB_WRITE_TOKEN:'test-only-token',ASSETS:{fetch:()=>new Response('ok')}};
test('GitHub credential stays server-side with allowed source repository',async()=>{
 assert.equal(centralCredentialConfigured(env),true);
 assert.equal((await centralGithubAccess(env,'ai-control-center')).token,'test-only-token');
 assert.equal((await centralGithubAccess(env,'ai-organization-hub')).token,undefined);
 const status=await worker.fetch(new Request(base+'/api/health'),env);
 assert.equal(status.status,200);
 assert.equal(JSON.stringify(await status.json()).includes('test-only-token'),false);
});
test('Retired browser writes are rejected without contacting GitHub',async()=>{
 const prior=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;throw Error('should never be invoked')};
 try{
  for(const path of ['/api/v1/work/branch','/api/v1/work/file','/api/v1/work/pr','/api/v1/ops/comment','/api/v1/ops/dispatch','/api/agent/register']){
   const r=await worker.fetch(new Request(base+path,{method:'POST',headers:{origin:base,'content-type':'application/json'},body:'{}'}),env);
   assert.equal(r.status,410,path);
   assert.equal((await r.json()).error,'browser_write_retired');
  }
  assert.equal(calls,0);
 }finally{globalThis.fetch=prior}
});
test('Read-only QA/CI remains available with central GitHub token',async()=>{
 const prev=globalThis.fetch;globalThis.fetch=async(url,init={})=>{
  assert.equal(init.headers.authorization,'Bearer test-only-token');
  const path=new URL(url).pathname;
  if(path.endsWith('/actions/runs'))return new Response(JSON.stringify({workflow_runs:[{id:42,name:'QA',status:'completed',conclusion:'success',head_sha:'a'.repeat(40)}]}));
  throw Error('unexpected '+path);
 };
 try{
  const r=await worker.fetch(new Request(base+'/api/v1/ops/runs?repo=ARCANA-SURVIVOR'),env);
  assert.equal(r.status,200);assert.equal((await r.json()).runs[0].name,'QA');
 }finally{globalThis.fetch=prev}
});
