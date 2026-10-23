import test from 'node:test';
import assert from 'node:assert/strict';
import {issueCleanupApi} from '../src/issue-cleanup.js';
import worker from '../src/worker.js';
const base='https://ai-control-center.tanawutmalirum29.workers.dev';
const repo='ARCANA-SURVIVOR', full='tanawutmalirum29-ux/'+repo;
const item={id:'I_kwD123456789012',number:3,title:'Sample',state:'CLOSED',updatedAt:'2026-10-23T12:00:00Z'};
function run(method,route,body){
 return new Request(base+'/api/v1/maintenance/issues/'+route,{method,headers:body?{origin:base,'content-type':'application/json'}:{},
 body:body?JSON.stringify(body):undefined});
}
function fixture(){
 const calls=[];
 const fetcher=async(_,options)=>{
  const q=JSON.parse(options.body);calls.push(q);
  let data;
  if(q.query.includes('PreviewIssues'))data={repository:{issues:{totalCount:1,pageInfo:{hasNextPage:false,endCursor:null},nodes:[item]}}};
  if(q.query.includes('VerifyIssues'))data={nodes:[{id:item.id,number:item.number,updatedAt:item.updatedAt,repository:{nameWithOwner:full}}]};
  if(q.query.includes('DeleteIssue'))data={deleteIssue:{repository:{nameWithOwner:full}}};
  return new Response(JSON.stringify({data}));
 };
 return {calls,fetcher};
}
test('retired Issue deletion routes cannot run with central token',async()=>{
 const env={GITHUB_WRITE_TOKEN:'central-test-credential',ASSETS:{fetch:()=>new Response('ok')}};
 const r=await worker.fetch(run('GET','preview?repo='+repo),env);
 assert.equal(r.status,410);
});
test('preview includes closed Issues and is non-destructive',async()=>{
 const f=fixture();
 const r=await issueCleanupApi(run('GET','preview?repo='+repo),{token:'owner-session',fetcher:f.fetcher});
 const body=await r.json();
 assert.equal(body.total,1);assert.equal(body.issues[0].state,'CLOSED');
 assert.equal(f.calls.filter(x=>x.query.includes('DeleteIssue')).length,0);
});
test('confirmation and origin required for permanent deletion',async()=>{
 const f=fixture();
 const data={repo,issues:[item],confirm:'WRONG'};
 const r=await issueCleanupApi(run('POST','delete',data),{token:'owner-session',fetcher:f.fetcher});
 assert.equal(r.status,400);assert.equal(f.calls.length,0);
});
test('verified Issue deletion uses GraphQL, never closes instead',async()=>{
 const f=fixture();
 const data={repo,issues:[item],confirm:'DELETE '+full};
 const r=await issueCleanupApi(run('POST','delete',data),{token:'owner-session',fetcher:f.fetcher});
 assert.equal(r.status,200);assert.deepEqual((await r.json()).deleted,[3]);
 assert.equal(f.calls.some(x=>x.query.includes('deleteIssue(input:')),true);
});
