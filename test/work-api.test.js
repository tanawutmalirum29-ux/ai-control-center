import test from 'node:test';
import assert from 'node:assert/strict';
import {pathOk, workApi} from '../src/work-api.js';
const host='https://ai-control-center.tanawutmalirum29.workers.dev';
const post=(action,body,origin=host)=>new Request(host+'/api/v1/work/'+action,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
const json=(body,status=200)=>new Response(JSON.stringify(body),{status});
const token='sample';
const repo='ai-control-center';
function mocked(calls){
 return async(url,opts)=>{
  const path=new URL(url).pathname;
  calls.push({path,method:opts.method,body:opts.body?JSON.parse(opts.body):null});
  if(path.endsWith('/git/ref/heads/main'))return json({object:{sha:'a'.repeat(40)}});
  if(path.endsWith('/git/refs'))return json({ref:'refs/heads/acc/test-abc'},201);
  if(path.endsWith('/contents/src/app.js'))return json({content:{sha:'b'.repeat(40)},commit:{sha:'c'.repeat(40)}},201);
  if(path.endsWith('/pulls'))return json({number:3,html_url:'https://github.com/pull/3',head:{sha:'c'.repeat(40)}},201);
  if(path.endsWith('/branches'))return json([{name:'main',commit:{sha:'a'.repeat(40)}},{name:'acc/staged',commit:{sha:'b'.repeat(40)}}]);
  return json({default_branch:'main'});
 };
}
test('owner login and same-origin required',async()=>{
 assert.equal((await workApi(post('branch',{repo,title:'Fix bug'}))).status,401);
 assert.equal((await workApi(post('branch',{repo,title:'Fix bug'},'https://evil.example'),{token,fetcher:mocked([])})).status,403);
});
test('workspace branch comes from default and uses acc prefix',async()=>{
 const calls=[];
 const res=await workApi(post('branch',{repo,title:'Fix mobile view'}),{token,fetcher:mocked(calls)});
 const data=await res.json();
 assert.equal(res.status,201);
 assert.match(data.branch,/^acc\/fix-mobile-view-[a-f0-9]{8}$/);
 assert.equal(data.base,'main');
 assert.equal(calls.at(-1).body.ref,'refs/heads/'+data.branch);
});
test('no direct writes to main or unsafe paths',async()=>{
 assert.equal(pathOk('src/file.js'),true);
 assert.equal(pathOk('.github/workflows/ci.yml'),false);
 assert.equal(pathOk('../.env'),false);
 for(const branch of ['main','acc/../main','refs/heads/main']){
  assert.equal((await workApi(post('file',{repo,branch,path:'src/app.js',content:'hello'}),{token,fetcher:mocked([])})).status,400);
 }
});
test('text edit goes to named work branch with blob SHA',async()=>{
 const calls=[];
 const res=await workApi(post('file',{repo,branch:'acc/staged',path:'src/app.js',content:'สวัสดี',sha:'d'.repeat(40)}),{token,fetcher:mocked(calls)});
 assert.equal(res.status,201);
 const body=calls.at(-1).body;
 assert.equal(body.branch,'acc/staged');
 assert.equal(body.sha,'d'.repeat(40));
 assert.equal(Buffer.from(body.content,'base64').toString(),'สวัสดี');
});
test('only draft PR is possible; merge/delete are not routes',async()=>{
 const calls=[];
 const r=await workApi(post('pr',{repo,branch:'acc/staged',title:'Fix code'}),{token,fetcher:mocked(calls)});
 assert.equal(r.status,201);
 assert.equal(calls.at(-1).body.draft,true);
 assert.equal((await workApi(post('merge',{repo}),{token,fetcher:mocked([])})).status,405);
 assert.equal((await workApi(post('delete',{repo}),{token,fetcher:mocked([])})).status,405);
});
test('branches endpoint lists workspaces, not main',async()=>{
 const r=await workApi(new Request(host+'/api/v1/work/branches?repo='+repo),{token,fetcher:mocked([])});
 assert.deepEqual((await r.json()).branches.map(b=>b.name),['acc/staged']);
});

test('Astra PR feature branch can read and update CI YAML without creating a new PR',async()=>{
 const calls=[],repo='ARCANA-SURVIVOR',branch='feat/astra-visual-polish',path='.github/workflows/ci.yml';
 const blob='9'.repeat(40);
 const fetcher=async(url,opts)=>{
  const u=new URL(url);calls.push({path:u.pathname,query:u.search,method:opts.method,body:opts.body?JSON.parse(opts.body):null});
  if(u.pathname.endsWith('/contents/'+path)&&opts.method==='GET')return json({
   type:'file',encoding:'base64',size:50,sha:blob,content:Buffer.from('name: CI\n').toString('base64')
  });
  if(u.pathname.endsWith('/contents/'+path)&&opts.method==='PUT')
   return json({content:{sha:'b'.repeat(40)},commit:{sha:'c'.repeat(40)}},201);
  if(u.pathname.endsWith('/branches'))return json([{name:'main'},{name:branch}]);
  return json({},404);
 };
 const read=await workApi(new Request(host+'/api/v1/work/file?repo='+repo+'&branch='+encodeURIComponent(branch)+'&path='+encodeURIComponent(path)),
   {token,fetcher});
 assert.equal(read.status,200,JSON.stringify(await read.clone().json()));
 assert.equal((await read.json()).content,'name: CI\n');
 const saved=await workApi(post('file',{repo,branch,path,content:'name: CI\n# WebKit diagnosis\n'}),{token,fetcher});
 assert.equal(saved.status,201,JSON.stringify(await saved.clone().json()));
 assert.equal(calls.at(-1).body.sha,blob,'server attaches existing blob SHA automatically');
 assert.equal(calls.at(-1).body.branch,branch);
 const list=await workApi(new Request(host+'/api/v1/work/branches?repo='+repo),{token,fetcher});
 assert.deepEqual((await list.json()).branches.map(b=>b.name),[branch]);
 assert.equal(pathOk(path),false,'CI workflow remains blocked outside explicit project scope');
 assert.equal(pathOk(path,{repo}),true);
 assert.equal(pathOk('.github/workflows/release.yml',{repo}),false);
});
test('large text files up to 200KB can be committed with UTF-8 safely',async()=>{
 const repo='ARCANA-SURVIVOR',branch='acc/astra-ci-diagnostics',path='scripts/browser_qa.py';
 const calls=[],fetcher=async(url,opts)=>{
  calls.push({method:opts.method,url,body:opts.body?JSON.parse(opts.body):null});
  if(opts.method==='GET')return json({},404);
  return json({content:{sha:'c'.repeat(40)},commit:{sha:'d'.repeat(40)}},201);
 };
 const content='修正'+('x'.repeat(120000));
 const saved=await workApi(post('file',{repo,branch,path,content}),{token,fetcher});
 assert.equal(saved.status,201);
 assert.equal(Buffer.from(calls.at(-1).body.content,'base64').toString('utf8'),content);
 const bad=await workApi(post('file',{repo,branch,path,content:'x'.repeat(210000)}),{token,fetcher});
 assert.equal(bad.status,400);
 assert.equal((await bad.json()).error,'invalid_file_content');
});
test('GitHub errors retain reason without exposing the credential',async()=>{
 const repo='ARCANA-SURVIVOR',branch='feat/astra-visual-polish',path='scripts/browser_qa.py';
 const mocked=async()=>json({message:'Blob SHA does not match the file current SHA',
   errors:[{code:'sha_conflict',message:'Please reload the file and retry'}]},422);
 const response=await workApi(post('file',{repo,branch,path,content:'patched',sha:'a'.repeat(40)}),
 {token:'server-secret-do-not-expose',fetcher:mocked});
 assert.equal(response.status,422);
 const data=await response.json();
 assert.match(data.github_message,/Blob SHA/);
 assert.equal(data.github_errors[0],'Please reload the file and retry');
 assert.ok(!JSON.stringify(data).includes('server-secret-do-not-expose'));
});
