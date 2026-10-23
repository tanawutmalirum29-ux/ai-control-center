import test from 'node:test';
import assert from 'node:assert/strict';
import {issueFields,asTask,missionApi} from '../src/mission-api.js';

const owner='tanawutmalirum29-ux';
const issues=[
 {number:80,title:'[CEO] Product mission',body:'TO_ROLE: CEO\nAGENT_SLOT: CEO\nREPORTS_TO: OWNER\nSESSION_ACTIVATION: AWAITING_OWNER_RELAY',labels:[],state:'open',updated_at:'2026-10-23T01:00:00Z',html_url:'https://github.com/'+owner+'/ARCANA-SURVIVOR/issues/80'},
 {number:81,title:'[ENGINEER] Fix UI',body:'TO_ROLE: ENGINEER\nAGENT_SLOT: ENGINEER-UI\nPARENT_ISSUE: #80\nREPORTS_TO: PROJECT-LEAD #80\nEDITABLE_PATHS: src/ui/*\nSESSION_ACTIVATION: AWAITING_OWNER_RELAY',labels:[],state:'open',updated_at:'2026-10-23T02:00:00Z',html_url:'https://github.com/'+owner+'/ARCANA-SURVIVOR/issues/81'}
];
const prs=[{number:88,title:'UI change',draft:true,head:{sha:'a'.repeat(40)},base:{ref:'main'},html_url:'https://github.com/'+owner+'/ARCANA-SURVIVOR/pull/88'}];
test('read appointment metadata and one-line relay',()=>{
 const fields=issueFields(issues[1].body);
 assert.equal(fields.agent_slot,'ENGINEER-UI');
 assert.equal(fields.parent_issue,'#80');
 assert.equal(fields.editable_paths,'src/ui/*');
 const item=asTask(issues[1],'ARCANA-SURVIVOR');
 assert.equal(item.role,'ENGINEER');
 assert.equal(item.status,'APPOINTED');
 assert.equal(item.relay,'ENGINEER-UI: AP-ROLE #81 https://ai-control-center.tanawutmalirum29.workers.dev/?repo=ARCANA-SURVIVOR&issue=81');
 const todo=asTask({...issues[1],labels:[{name:'IN_PROGRESS'}]},'ARCANA-SURVIVOR');
 assert.match(todo.relay,/ENGINEER-UI: MN #81/);
 assert.equal(todo.status,'IN_PROGRESS');
});
test('public board displays CEO/worker, PR head SHA and no QA claims',async()=>{
 let count=0;
 const fetcher=async(url)=>{
  count++;
  const path=new URL(url).pathname;
  if(path.endsWith('/issues'))return new Response(JSON.stringify([...issues,{number:2,pull_request:{},title:'PR placeholder'}]),{status:200});
  if(path.endsWith('/pulls'))return new Response(JSON.stringify(prs),{status:200});
  throw Error('unexpected '+path);
 };
 const url='https://control.example/api/v1/mission?repo=ARCANA-SURVIVOR';
 const result=await missionApi(new Request(url),{fetcher,edge:null,now:1700000000000});
 assert.equal(result.status,200);
 const data=await result.json();
 assert.equal(data.tasks.length,2);assert.equal(data.counts.awaiting_relay,2);
 assert.equal(data.counts.open_prs,1);
 assert.equal(data.prs[0].head_sha,'a'.repeat(40));
 assert.equal(data.prs[0].qa,'UNVERIFIED_USE_PR_QA_ENDPOINT');
 assert.equal(data.agent_runtime,false);
 const cached=await missionApi(new Request(url),{fetcher:async()=>{throw Error('should be cached')},edge:null,now:1700000030000});
 assert.equal((await cached.json()).stale,false);
 assert.equal(count,2);
});
test('anonymous GET only; unknown project rejected',async()=>{
 const no=await missionApi(new Request('https://control.example/api/v1/mission?repo=other'));
 assert.equal(no.status,400);
 const writing=await missionApi(new Request('https://control.example/api/v1/mission?repo=ARCANA-SURVIVOR',{method:'POST'}));
 assert.equal(writing.status,405);
});

test('fresh mission ignores cached previous PR head and rejects stale fallback',async()=>{
 const repo='ant-project',first='1'.repeat(40),second='2'.repeat(40);
 let live=first;
 const fetcher=async url=>{
  const p=new URL(url).pathname;
  if(p.endsWith('/issues'))return new Response(JSON.stringify([]),{status:200});
  if(p.endsWith('/pulls'))return new Response(JSON.stringify([{number:99,title:'Astra',head:{sha:live,ref:'feat/astra'},
   base:{ref:'main'},state:'open',draft:true}]),{status:200});
  throw Error('Unexpected '+p);
 };
 const url='https://control.example/api/v1/mission?repo='+repo;
 const firstResponse=await missionApi(new Request(url),{fetcher,edge:null,now:1750000000000});
 assert.equal((await firstResponse.json()).prs[0].head_sha,first);
 live=second;
 const latest=await missionApi(new Request(url+'&fresh=1'),{fetcher,edge:null,now:1750000000500});
 assert.equal((await latest.json()).prs[0].head_sha,second);
 const failed=await missionApi(new Request(url+'&fresh=1'),{
  fetcher:async()=>new Response('{}',{status:403}),edge:null,now:1750000000600});
 assert.equal(failed.status,503,'fresh HEAD must never silently return stale mission');
});
