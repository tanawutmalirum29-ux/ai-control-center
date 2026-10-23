import test from 'node:test';
import assert from 'node:assert/strict';
import {taskStatus, qaAssessment, linkedIssueNumbers,readApi} from '../src/read-api.js';
const base='https://test.example/api/v1/';
const issue=(number,label)=>({number,title:'[ENGINEER] Task '+number,updated_at:'2026-10-23T00:00:00Z',labels:label?[{name:label}]:[]});
const mock=(overrides={})=>async url=>{
 const u=new URL(url);let data;
 if(u.pathname.includes('/pulls/9/reviews'))data=overrides.reviews??[];
 else if(u.pathname.includes('/pulls/9'))data=overrides.pr??{title:'Patch',labels:[],draft:false,head:{sha:'a'.repeat(40)},body:'Fixes #12',html_url:'https://github.com/example/pr/9'};
 else if(u.pathname.includes('/check-runs'))data={check_runs:overrides.checks??[]};
 else if(u.pathname.includes('/issues?')||u.pathname.endsWith('/issues'))data=overrides.issues??[issue(1,'ready'),issue(2,'QA_BLOCK'),issue(3)];
 else if(u.pathname.includes('/actions/runs'))data={workflow_runs:[]};
 else if(u.pathname.includes('/pulls?'))data=[];
 else data={};
 return new Response(JSON.stringify(data),{status:overrides.fail?403:200});
};
function request(path){return new Request(base+path)}
test('explicit classification and fail-closed unknown',()=>{
 assert.equal(taskStatus(issue(1,'qa-block')).status,'QA_BLOCK');
 assert.equal(taskStatus(issue(1,'waiting-qa')).status,'WAITING_QA');
 assert.equal(taskStatus(issue(1,'in-progress')).status,'IN_PROGRESS');
 assert.equal(taskStatus(issue(1,'paused')).status,'PAUSED');
 assert.equal(taskStatus(issue(1,'ready')).status,'READY');
 assert.equal(taskStatus(issue(1)).status,'UNCLASSIFIED');
});
test('queue sorting and repo allowlist',async()=>{
 const r=await readApi(request('queue?repo=ant-project'),{fetcher:mock(),edge:null,now:1711111111111});
 const data=await r.json();assert.equal(data.tasks[0].status,'READY');assert.equal(data.tasks[1].status,'UNCLASSIFIED');assert.equal(data.tasks[2].status,'QA_BLOCK');
 const deny=await readApi(request('queue?repo=external'),{fetcher:mock(),edge:null});assert.equal(deny.status,400);
});
test('GitHub rate limit returns stale data with warning',async()=>{
 const r1=await readApi(request('queue?repo=ai-organization-hub'),{fetcher:mock(),edge:null,now:1711112111111});assert.equal((await r1.json()).stale,false);
 const r2=await readApi(request('queue?repo=ai-organization-hub'),{fetcher:mock({fail:true}),edge:null,now:1711112111111+121000});
 const data=await r2.json();assert.equal(data.stale,true);assert.equal(data.warning,'GITHUB_RATE_LIMIT_OR_FORBIDDEN');assert.equal(data.tasks.length,3);
});
test('no cache on upstream failure gives meaningful 503',async()=>{
 const r=await readApi(request('queue?repo=appointment-CEO'),{fetcher:mock({fail:true}),edge:null,now:1711113111111});
 assert.equal(r.status,503);assert.equal((await r.json()).reason,'GITHUB_RATE_LIMIT_OR_FORBIDDEN');
});
test('never call green repository CI a PR approval',()=>{
 assert.equal(qaAssessment({},[{status:'completed',conclusion:'success'}],[]).gate,'WAITING_QA');
 assert.equal(qaAssessment({},[],[{user:{login:'q'},state:'APPROVED'}]).gate,'UNKNOWN');
 assert.equal(qaAssessment({labels:[{name:'QA-BLOCK'}]},[{status:'completed',conclusion:'success'}],[{user:{login:'q'},state:'APPROVED'}]).gate,'QA_BLOCK');
});
test('PR QA links head SHA checks and QA reviewer state',async()=>{
 const sha='a'.repeat(40);
 const r=await readApi(request('pr-qa?repo=ant-project&pr=9'),{fetcher:mock({checks:[{name:'build',status:'completed',conclusion:'success',head_sha:sha}],reviews:[{user:{login:'QA'},state:'APPROVED',commit_id:sha,submitted_at:'2026-10-23T01:00:00Z'}]}),edge:null,now:1711114111111});
 const d=await r.json();assert.equal(d.head_sha,sha);assert.equal(d.gate,'CHECKS_PASS_REVIEWED');assert.equal(d.merge_safe,false);assert.deepEqual(d.linked_issue_numbers,[12]);
 assert.equal((await readApi(request('pr-qa?repo=ant-project&pr=abc'),{fetcher:mock()})).status,400);
});
test('review requested changes invalidates prior approval',()=>{
 const q=qaAssessment({},[{status:'completed',conclusion:'success'}],[{user:{login:'qa'},state:'APPROVED',submitted_at:'2026-10-21T00:00:00Z'},{user:{login:'qa'},state:'CHANGES_REQUESTED',submitted_at:'2026-10-22T00:00:00Z'}]);
 assert.equal(q.gate,'QA_BLOCK');
 assert.deepEqual(linkedIssueNumbers('Fixes #2, resolves #8 and text #5'),[2,8]);
});

test('PR #99 HEAD is refreshed on every PR QA request, never stale after a new commit',async()=>{
 const repo='ARCANA-SURVIVOR',number=99,first='a'.repeat(40),second='b'.repeat(40);
 let current=first,seen=[];
 const fetcher=async url=>{
  const u=new URL(url),p=u.pathname;seen.push(p);
  let value;
  if(p.endsWith('/pulls/99'))value={title:'Astra PR #99',head:{sha:current},labels:[],draft:true,body:''};
  else if(p.endsWith('/reviews'))value=[];
  else if(p.endsWith('/check-runs'))value={check_runs:[{name:'build',status:'completed',conclusion:'success',head_sha:current}]};
  else throw Error('unexpected '+p);
  return new Response(JSON.stringify(value),{status:200});
 };
 const url='https://test.example/api/v1/pr-qa?repo='+repo+'&pr='+number;
 const firstRes=await readApi(new Request(url),{fetcher,edge:null,now:1750000000000});
 assert.equal((await firstRes.json()).head_sha,first);
 current=second;
 const secondRes=await readApi(new Request(url),{fetcher,edge:null,now:1750000000100});
 const value=await secondRes.json();
 assert.equal(value.head_sha,second);
 assert.equal(value.checks[0].head_sha,second);
 assert.equal(value.stale,false);
 assert.equal(seen.filter(x=>x.endsWith('/pulls/99')).length,2);
 current=first;
 const failed=await readApi(new Request(url+'unsafefresh'),{
  fetcher:async()=>new Response('{}',{status:403}),edge:null,now:1750000000200});
 assert.equal(failed.status,503,'failed fresh PR query must not return cached SHA');
});
