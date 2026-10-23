import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {splitLines,previewLineChange,contentDigest} from '../src/line-editor.js';
import {workApi} from '../src/work-api.js';

const host='https://ai-control-center.tanawutmalirum29.workers.dev';
const repo='ARCANA-SURVIVOR',branch='feat/astra-visual-polish',path='.github/workflows/ci.yml';
const sha='9'.repeat(40),token='do-not-expose-test-token';
const yaml='name: Astra Quality Gate\njobs:\n  browser-qa:\n    timeout-minutes: 45\n  webkit-isolated-diagnostics:\n    timeout-minutes: 12\n';
const get=url=>new Request(host+url);
const post=(action,body)=>new Request(host+'/api/v1/work/'+action,{
 method:'POST',headers:{origin:host,'content-type':'application/json'},body:JSON.stringify(body)
});
const fixture=(source=yaml,hash=sha,calls=[])=>async(url,opts)=>{
 const loc=new URL(url);calls.push({path:loc.pathname,method:opts.method,body:opts.body?JSON.parse(opts.body):null});
 if(opts.method==='GET')return new Response(JSON.stringify({type:'file',encoding:'base64',size:Buffer.byteLength(source),
  sha:hash,content:Buffer.from(source).toString('base64')}),{status:200});
 if(opts.method==='PUT')return new Response(JSON.stringify({content:{sha:'a'.repeat(40)},commit:{sha:'b'.repeat(40)}}),{status:200});
 throw Error('unexpected GitHub route');
};
test('line viewer returns small stable numbered chunks of full YAML',async()=>{
 const r=await workApi(get('/api/v1/work/file-lines?repo='+repo+'&branch='+encodeURIComponent(branch)+
  '&path='+encodeURIComponent(path)+'&start=3&count=3'),{token,fetcher:fixture()});
 assert.equal(r.status,200);
 const data=await r.json();
 assert.equal(data.sha,sha);assert.equal(data.total_lines,6);
 assert.deepEqual(data.lines.map(x=>x.number),[3,4,5]);
 assert.deepEqual(data.lines.map(x=>x.text),['  browser-qa:','    timeout-minutes: 45','  webkit-isolated-diagnostics:']);
});
test('patch preview reads current blob, does not mutate GitHub, and exposes exact diff',async()=>{
 const calls=[],f=fixture(yaml,sha,calls);
 const data={repo,branch,path,sha,start:6,end:6,replacement:'    timeout-minutes: 30',preview:true};
 const response=await workApi(post('patch-lines',data),{token,fetcher:f});
 assert.equal(response.status,200);
 const preview=await response.json();
 assert.equal(preview.original_text,'    timeout-minutes: 12');
 assert.equal(preview.replacement_text,'    timeout-minutes: 30');
 assert.match(preview.preview_digest,/^[a-f0-9]{64}$/);
 assert.equal(calls.length,1);
 assert.ok(!JSON.stringify(preview).includes(token));
 const commit=await workApi(post('patch-lines',{...data,preview:false,preview_digest:preview.preview_digest}),{token,fetcher:f});
 assert.equal(commit.status,201,JSON.stringify(await commit.clone().json()));
 const result=await commit.json();
 assert.equal(result.commit_sha,'b'.repeat(40));
 assert.equal(calls.at(-1).method,'PUT');
 assert.equal(calls.at(-1).body.sha,sha);
 assert.equal(calls.at(-1).body.branch,branch);
 const next=Buffer.from(calls.at(-1).body.content,'base64').toString('utf8');
 assert.equal(next,yaml.replace('    timeout-minutes: 12','    timeout-minutes: 30'));
});
test('stale blob sha blocks commit even when AI has old line numbers',async()=>{
 const old='1'.repeat(40),calls=[];
 const response=await workApi(post('patch-lines',{repo,branch,path,sha:old,start:6,end:6,
  replacement:'    timeout-minutes: 30',preview:false,preview_digest:'x'.repeat(64)}),
  {token,fetcher:fixture(yaml,sha,calls)});
 assert.equal(response.status,409);
 assert.equal((await response.json()).error,'stale_file_sha');
 assert.equal(calls.length,1);
});
test('changed input after preview fails and never calls PUT',async()=>{
 const calls=[],f=fixture(yaml,sha,calls),payload={repo,branch,path,sha,start:6,end:6,
  replacement:'    timeout-minutes: 30',preview:true};
 const preview=await (await workApi(post('patch-lines',payload),{token,fetcher:f})).json();
 const response=await workApi(post('patch-lines',{...payload,replacement:'    timeout-minutes: 60',
  preview:false,preview_digest:preview.preview_digest}),{token,fetcher:f});
 assert.equal(response.status,409);
 assert.equal((await response.json()).error,'preview_outdated');
 assert.ok(calls.every(c=>c.method==='GET'));
});
test('reject main, invalid line positions, unchanged text, and overly large patches',async()=>{
 const mock=fixture();
 const options={token,fetcher:mock};
 const item={repo,branch,path,sha,start:6,end:6,replacement:'    timeout-minutes: 30',preview:true};
 assert.equal((await workApi(post('patch-lines',{...item,branch:'main'}),options)).status,400);
 assert.equal((await workApi(post('patch-lines',{...item,start:900,end:901}),options)).status,400);
 const unchanged=await workApi(post('patch-lines',{...item,replacement:'    timeout-minutes: 12'}),options);
 assert.equal((await unchanged.json()).error,'no_changes');
 assert.equal((await workApi(post('patch-lines',{...item,replacement:'x'.repeat(17000)}),options)).status,400);
});
test('preserve CRLF in unedited lines and replacements',async()=>{
 const old='name: CI\r\njobs:\r\n  test:\r\n    timeout-minutes: 12\r\n';
 const edit=previewLineChange(old,{start:4,end:4,replacement:'    timeout-minutes: 30'});
 assert.equal(edit.result,'name: CI\r\njobs:\r\n  test:\r\n    timeout-minutes: 30\r\n');
 assert.equal((await contentDigest(edit.result)).length,64);
 assert.equal(splitLines(edit.result).lines.length,4);
});
test('line editor UI has bounded source chunks, diff gate and no auto-merge',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const client=readFileSync(new URL('../public/workspace-patch.js',import.meta.url),'utf8');
 for(const id of ['ws-lines-read','ws-lines-view','ws-lines-start','ws-lines-end','ws-lines-copy',
  'ws-lines-replacement','ws-lines-preview-btn','ws-lines-preview','ws-lines-commit','ws-lines-sha']){
  assert.ok(html.includes('id="'+id+'"'),id);
 }
 assert.match(client,/patch-lines/);
 assert.match(client,/file-lines/);
 assert.match(client,/preview_digest/);
 assert.match(html,/id="ws-lines-commit"[^>]*disabled/);
});
