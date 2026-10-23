import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const html=read('../public/index.html');
const js=read('../public/branch-cleanup.js');
const worker=read('../src/worker.js');
test('Git Branch cleanup UI has live controls, preview and confirmation fields',()=>{
 for(const id of ['branch-panel','branch-preview','branch-login','branch-owner','branch-count',
  'branch-pr-count','branch-protected-count','branch-list','branch-copy','branch-confirm',
  'branch-risk-code','branch-risk-pr','branch-delete','branch-stop','branch-status']){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(html,/src="\.\/branch-cleanup\.js"/);
 assert.match(html,/ลบทุก Branch ยกเว้น main/);
 assert.match(js,/el\('branch-risk-code'\)\.checked/);
 assert.match(js,/el\('branch-risk-pr'\)\.checked/);
 assert.match(js,/original\.branches\.slice\(i,i\+5\)/);
 assert.match(js,/confirm:'DELETE BRANCHES '/);
});
test('Worker branch deletion uses only current OAuth OWNER session',()=>{
 const route=worker.split("if(path.startsWith('/api/v1/maintenance/branches/')){")[1]?.split(
  "if(path.startsWith('/api/v1/maintenance/issues/'))")[0];
 assert.ok(route);
 assert.match(route,/const ownerSession=await session\(request,env\)/);
 assert.match(route,/token:ownerSession\?\.token\|\|null/);
 assert.doesNotMatch(route,/centralGithubAccess\(|delegatedAccess\(/);
});
