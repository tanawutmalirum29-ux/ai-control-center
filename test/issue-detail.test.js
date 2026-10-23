import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {detailApi} from '../src/issue-detail.js';

const root='https://ai-control-center.example',repo='ARCANA-SURVIVOR';
const issue={number:98,title:'Astra Star Mage visual polish',body:'TASK: Adjust cape and staff\nQA: Check 8-way animation',
 state:'open',user:{login:'owner'},labels:[{name:'in progress'}],assignees:[],updated_at:'2026-10-23T07:00:00Z'};
const comments=[{id:1,body:'Check back-facing cape alignment',user:{login:'reviewer'},created_at:'2026-10-23T07:10:00Z'}];
const pr={number:99,title:'Astra visual work',body:'Draft visual adjustments',state:'open',draft:true,
 user:{login:'author'},head:{sha:'a'.repeat(40),ref:'acc/astra'},base:{ref:'main'}};
const files=[{filename:'src/astra.js',status:'modified',additions:2,deletions:1,patch:'@@ -1 +1 @@\n-before\n+after'}];
function fetcher(visited){
 return async url=>{
  const path=new URL(url).pathname;visited.push(path);
  let value;
  if(path.endsWith('/issues/98'))value=issue;
  else if(path.endsWith('/issues/98/comments'))value=comments;
  else if(path.endsWith('/pulls/99'))value=pr;
  else if(path.endsWith('/pulls/99/files'))value=files;
  else if(path.endsWith('/issues/99/comments'))value=comments;
  else return new Response('{}',{status:404});
  return new Response(JSON.stringify(value),{status:200});
 };
}
test('read Issue #98 full body and comments inside Control Center',async()=>{
 const visited=[];
 const r=await detailApi(new Request(root+'/api/v1/detail?repo='+repo+'&number=98'),{fetcher:fetcher(visited),now:1});
 assert.equal(r.status,200);
 const data=await r.json();
 assert.equal(data.title,issue.title);
 assert.equal(data.body,issue.body);
 assert.equal(data.comments[0].body,comments[0].body);
 assert.ok(!JSON.stringify(data).includes('ghp_'));
 assert.equal(visited.length,2);
});
test('read PR #99 including changed filenames, patch and exact head SHA',async()=>{
 const visited=[];
 const r=await detailApi(new Request(root+'/api/v1/detail?repo='+repo+'&kind=pr&number=99'),{fetcher:fetcher(visited),now:1});
 assert.equal(r.status,200);
 const data=await r.json();
 assert.equal(data.head_sha,'a'.repeat(40));
 assert.equal(data.files[0].filename,'src/astra.js');
 assert.match(data.files[0].patch,/after/);
 assert.equal(visited.length,3);
});
test('invalid repo, malformed issue and writes cannot access GitHub',async()=>{
 const fetchNever=async()=>{throw Error('should not fetch GitHub');};
 for(const u of ['?repo=other&number=98','?repo='+repo+'&number=abc','?repo='+repo+'&number=0']){
  const r=await detailApi(new Request(root+'/api/v1/detail'+u),{fetcher:fetchNever});
  assert.equal(r.status,400);
 }
 const r=await detailApi(new Request(root+'/api/v1/detail?repo='+repo+'&number=98',{method:'POST'}),{fetcher:fetchNever});
 assert.equal(r.status,405);
});
test('Issue reader has been removed from AI website; deep-linked API is retired',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 const html=read('public/index.html'),worker=read('src/worker.js');
 assert.ok(!html.includes('id="view-issue"'));
 assert.ok(!html.includes('src="./issue-reader.js"'));
 assert.ok(!html.includes('id="detail-comment-form"'));
 assert.ok(worker.includes("'/api/v1/detail'"));
 assert.ok(worker.includes('legacy_issue_workflow_retired'));
});
