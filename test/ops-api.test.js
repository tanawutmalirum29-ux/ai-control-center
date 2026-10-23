import test from 'node:test';
import assert from 'node:assert/strict';
import {makeTaskBody,opsApi} from '../src/ops-api.js';
const host='https://ai-control-center.tanawutmalirum29.workers.dev';
const repo='ai-control-center', token='owner-test-token';
const req=(type,path,body,origin=host)=>new Request(host+'/api/v1/ops/'+path,{
 method:type,headers:body===undefined?{}:{origin,'content-type':'application/json'},
 body:body===undefined?undefined:JSON.stringify({repo,...body})});
const seen=[];
const fetcher=async(url,opts)=>{
 const pathname=new URL(url).pathname;
 const body=opts.body?JSON.parse(opts.body):null;
 seen.push({path:pathname,method:opts.method,body});
 let data={};
 if(pathname.endsWith('/issues'))data=opts.method==='GET'?[]:{number:3,title:'[ENGINEER] Task',state:'open',html_url:'https://github.com/a/issues/3',labels:[],assignees:[]};
 if(pathname.endsWith('/issues/3/comments'))data={id:5,html_url:'https://github.com/a/issues/3#issuecomment-5'};
 if(pathname.endsWith('/issues/3/assignees'))data={assignees:[{login:'test-user'}]};
 if(pathname.endsWith('/actions/workflows'))data={workflows:[{id:42,name:'Test',state:'active',path:'.github/workflows/test.yml'}],total_count:1};
 if(pathname.endsWith('/actions/workflows/42/dispatches'))data={workflow_run_id:777};
 if(pathname.endsWith('/actions/runs'))data={workflow_runs:[{id:777,name:'Test',status:'completed',conclusion:'success',head_sha:'a'.repeat(40),head_branch:'acc/bug'}]};
 if(pathname.endsWith('/actions/runs/777/jobs'))data={jobs:[{id:8,name:'Browser QA',status:'completed',conclusion:'success',steps:[]}]};
 return new Response(JSON.stringify(data),{status:200});
};
test('no unauthenticated, cross origin or unsupported repository action',async()=>{
 assert.equal((await opsApi(req('POST','issue',{role:'ENGINEER',title:'Fix game'}))).status,401);
 assert.equal((await opsApi(req('POST','issue',{role:'ENGINEER',title:'Fix game'},'https://evil.example'),{token,fetcher})).status,403);
 assert.equal((await opsApi(req('POST','issue',{role:'ENGINEER',title:'Fix game',repo:'other'}),{token,fetcher})).status,400);
});
test('Issue assignment body pins three repo links and no auto activation',()=>{
 const s=makeTaskBody({role:'ENGINEER',title:'Fix game',editable_paths:'src/ui/*',parent_issue:3,agent_slot:'ENGINEER-UI'},repo);
 assert.match(s,/PROJECT_REPO: https:\/\/github.com\/tanawutmalirum29-ux\/ai-control-center/);
 assert.match(s,/ORG_WORKSPACE_REPO: https:\/\/github.com\/tanawutmalirum29-ux\/ai-organization-hub/);
 assert.match(s,/STAGING_REPO: https:\/\/github.com\/tanawutmalirum29-ux\/Staging_area/);
 assert.match(s,/SESSION_ACTIVATION: AWAITING_OWNER_RELAY/);
 assert.match(s,/ORG_RULES_SNAPSHOT_SHA: [a-f\d]{40}/);
 assert.match(s,/PARENT_ISSUE: #3/);
 assert.match(s,/AGENT_SLOT: ENGINEER-UI/);
 assert.match(s,/SCHEDULE_REQUEST: EVERY_1_HOUR/);
 assert.match(s,/SCHEDULE_TARGET: RECEIVING_CHAT_ONLY/);
 assert.match(s,/SCHEDULE_CHECK: https:\/\/ai-control-center/);
 assert.match(s,/ตั้งงานประจำทุก 1 ชั่วโมงหนึ่งงาน/);
});
test('create issue, comment and assign actual GitHub user',async()=>{
 seen.length=0;
 let r=await opsApi(req('POST','issue',{role:'ENGINEER',title:'Fix game',scope:'Fix UI',parent_issue:3,agent_slot:'ENGINEER-UI'}),{token,fetcher});
 assert.equal(r.status,201);
 assert.equal((await r.json()).activation,'AWAITING_OWNER_RELAY');
 assert.equal(seen.at(-1).method,'POST');
 assert.match(seen.at(-1).body.body,/EDITABLE_PATHS/);
 r=await opsApi(req('POST','comment',{number:3,comment:'MN: Fixed; QA pending'}),{token,fetcher});
 assert.equal(r.status,201);
 r=await opsApi(req('POST','assign',{number:3,username:'test-user'}),{token,fetcher});
 assert.equal(r.status,200);
 assert.deepEqual((await r.json()).assignees,['test-user']);
});
test('workflow dispatch requires confirmed work branch, never main',async()=>{
 const basic={workflow:'42'};
 for(const body of [{...basic,branch:'main',confirm:'RUN_WORKFLOW'},{...basic,branch:'acc/bug',confirm:''},{...basic,branch:'acc/../main',confirm:'RUN_WORKFLOW'}]){
  const r=await opsApi(req('POST','dispatch',body),{token,fetcher});
  assert.equal(r.status,400);
 }
 seen.length=0;
 const r=await opsApi(req('POST','dispatch',{...basic,branch:'acc/bug',confirm:'RUN_WORKFLOW',inputs:{debug:'false'}}),{token,fetcher});
 assert.equal(r.status,202);
 const d=await r.json();
 assert.equal(d.dispatched,true);assert.equal(d.qa_pass,false);assert.equal(d.ci_pass,false);
 assert.deepEqual(seen.at(-1).body,{ref:'acc/bug',inputs:{debug:'false'}});
});
test('reads workflow and jobs but never exposes merge/delete routes',async()=>{
 let r=await opsApi(req('GET','runs?repo='+repo),{token,fetcher});
 assert.equal(r.status,200);
 assert.equal((await r.json()).runs[0].head_sha,'a'.repeat(40));
 r=await opsApi(req('GET','jobs?repo='+repo+'&run=777'),{token,fetcher});
 assert.equal(r.status,200);
 assert.equal((await r.json()).jobs[0].name,'Browser QA');
 r=await opsApi(req('POST','merge',{number:3}),{token,fetcher});
 assert.equal(r.status,405);
 r=await opsApi(req('POST','delete',{number:3}),{token,fetcher});
 assert.equal(r.status,405);
});
