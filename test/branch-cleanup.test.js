import test from 'node:test';
import assert from 'node:assert/strict';
import {branchCleanupApi} from '../src/branch-cleanup.js';
import worker from '../src/worker.js';

const host='https://ai-control-center.tanawutmalirum29.workers.dev';
const repo='ARCANA-SURVIVOR', full='tanawutmalirum29-ux/'+repo;
const shaA='a'.repeat(40),shaB='b'.repeat(40),shaC='c'.repeat(40);
const preview=()=>new Request(host+'/api/v1/maintenance/branches/preview?repo='+repo);
const deleteRequest=(branches,more={})=>new Request(host+'/api/v1/maintenance/branches/delete',{
 method:'POST',headers:{origin:host,'content-type':'application/json'},
 body:JSON.stringify({repo,keep:'main',confirm:'DELETE BRANCHES '+full,
  acknowledge_unmerged:true,acknowledge_open_prs:true,branches,...more})});
const record=(name,sha=shaA,protectedBranch=false)=>({name,commit:{sha},protected:protectedBranch});
function fixture({default_branch='main',protectedBranch=false,stale=false,fail='',branches=null}={}){
 const data=branches||[record('main',shaC,true),record('acc/feature-1',shaA,protectedBranch),record('fix/mobile',shaB)];
 const state=new Map(data.map(x=>[x.name,x]));
 const calls=[],removed=[];
 const fetcher=async(uri,options)=>{
  const url=new URL(uri),path=url.pathname;
  calls.push({path,method:options.method,authorization:options.headers.authorization});
  assert.equal(options.headers.authorization,'Bearer test-owner');
  if(path==='/repos/'+full)return Response.json({full_name:full,default_branch,archived:false});
  if(path==='/repos/'+full+'/branches'){
   const page=Number(url.searchParams.get('page'));
   return Response.json(page===1?Array.from(state.values()):[]);
  }
  if(path==='/repos/'+full+'/pulls'){
   return Response.json(Number(url.searchParams.get('page'))===1?
    [{number:99,title:'PR waiting for QA',draft:true,html_url:'https://github.com/'+full+'/pull/99',
      head:{ref:'acc/feature-1',repo:{full_name:full}}}]:[]);
  }
  const branchPart='/repos/'+full+'/branches/';
  if(path.startsWith(branchPart)){
   const name=decodeURIComponent(path.slice(branchPart.length));
   const b=state.get(name);
   if(!b)return Response.json({message:'Not Found'},{status:404});
   return Response.json({...b,commit:{sha:stale?shaC:b.commit.sha}});
  }
  const refPart='/repos/'+full+'/git/refs/heads/';
  if(path.startsWith(refPart)&&options.method==='DELETE'){
   const name=decodeURIComponent(path.slice(refPart.length));
   if(name===fail)return Response.json({message:'Failed to delete branch'},{status:403});
   if(!state.has(name))return Response.json({message:'Not Found'},{status:404});
   if(name==='main')throw Error('MAIN SHOULD NEVER BE DELETED');
   state.delete(name);removed.push(name);
   return new Response(null,{status:204});
  }
  throw Error('unexpected GitHub path '+path);
 };
 return {fetcher,calls,removed,state};
}
test('retired branch maintenance routes cannot run even with central token',async()=>{
 const env={GITHUB_WRITE_TOKEN:'public-shared-token',ASSETS:{fetch:()=>new Response('ok')}};
 const r=await worker.fetch(preview(),env);
 assert.equal(r.status,410);
 const x=await worker.fetch(deleteRequest([{name:'acc/feature-1',sha:shaA}]),env);
 assert.equal(x.status,410);
});
test('read-only preview reports branch and open PR risks but excludes main',async()=>{
 const f=fixture();
 const r=await branchCleanupApi(preview(),{token:'test-owner',fetcher:f.fetcher});
 assert.equal(r.status,200);
 const d=await r.json();
 assert.equal(d.keep,'main');
 assert.deepEqual(d.branches.map(b=>b.name),['acc/feature-1','fix/mobile']);
 assert.equal(d.total,2);
 assert.equal(d.open_pr_branch_count,1);
 assert.deepEqual(d.branches[0].open_prs.map(p=>p.number),[99]);
 assert.equal(f.removed.length,0);
});
test('default branch different from main blocks preview and all deletes',async()=>{
 const f=fixture({default_branch:'master'});
 const r=await branchCleanupApi(preview(),{token:'test-owner',fetcher:f.fetcher});
 assert.equal(r.status,409);
 assert.equal((await r.json()).error,'default_branch_is_not_main');
 const x=await branchCleanupApi(deleteRequest([{name:'acc/feature-1',sha:shaA}]),{token:'test-owner',fetcher:f.fetcher});
 assert.equal(x.status,409);assert.deepEqual(f.removed,[]);
});
test('rejects main, incorrect confirmation, missing acknowledgements, and invalid refs',async()=>{
 const f=fixture();
 const values=[
  deleteRequest([{name:'main',sha:shaC}]),
  deleteRequest([{name:'acc/feature-1',sha:shaA}],{confirm:'wrong'}),
  deleteRequest([{name:'acc/feature-1',sha:shaA}],{acknowledge_unmerged:false}),
  deleteRequest([{name:'acc/feature-1',sha:shaA}],{acknowledge_open_prs:false}),
  deleteRequest([{name:'../main',sha:shaA}]),
  deleteRequest([{name:'acc/feature-1',sha:shaA},{name:'acc/feature-1',sha:shaA}])
 ];
 for(const request of values){
  const r=await branchCleanupApi(request,{token:'test-owner',fetcher:f.fetcher});
  assert.equal(r.status>=400,true);
 }
 assert.deepEqual(f.removed,[]);
});
test('stale SHA and protected branches stop a full batch before any delete',async()=>{
 for(const opts of [{stale:true},{protectedBranch:true}]){
  const f=fixture(opts);
  const r=await branchCleanupApi(deleteRequest([{name:'acc/feature-1',sha:shaA},
   {name:'fix/mobile',sha:shaB}]),{token:'test-owner',fetcher:f.fetcher});
  assert.equal(r.status,409);
  assert.deepEqual(f.removed,[]);
 }
});
test('actual delete uses only GitHub refs/heads feature paths, never main',async()=>{
 const f=fixture();
 const r=await branchCleanupApi(deleteRequest([{name:'acc/feature-1',sha:shaA},
  {name:'fix/mobile',sha:shaB}]),{token:'test-owner',fetcher:f.fetcher});
 assert.equal(r.status,200);
 assert.deepEqual((await r.json()).deleted,['acc/feature-1','fix/mobile']);
 assert.deepEqual(f.removed,['acc/feature-1','fix/mobile']);
 assert.deepEqual([...f.state.keys()],['main']);
 assert.equal(f.calls.filter(x=>x.method==='DELETE').length,2);
});
test('partial REST failure reports confirmed deletions and stops',async()=>{
 const f=fixture({fail:'fix/mobile'});
 const r=await branchCleanupApi(deleteRequest([{name:'acc/feature-1',sha:shaA},
  {name:'fix/mobile',sha:shaB}]),{token:'test-owner',fetcher:f.fetcher});
 assert.equal(r.status,207);
 const d=await r.json();
 assert.deepEqual(d.deleted,['acc/feature-1']);assert.equal(d.failed,'fix/mobile');
 assert.deepEqual(f.removed,['acc/feature-1']);
});
