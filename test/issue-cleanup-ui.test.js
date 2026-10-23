import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const ui=readFileSync(new URL('../public/issue-cleanup.js',import.meta.url),'utf8');
const worker=readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
test('owner cleanup link, destructive guard controls and accessibility labels exist',()=>{
 for(const id of ['cleanup-panel','cleanup-login','cleanup-preview','cleanup-count','cleanup-sample',
  'cleanup-copy','cleanup-confirm','cleanup-agree','cleanup-delete','cleanup-stop','cleanup-status']){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(html,/src="\.\/issue-cleanup\.js"/);
 assert.match(html,/data-view="operations"/);
 assert.match(html,/data-view="orgrooms"/);
 assert.match(ui,/data\.authenticated&&data\.login===OWNER/);
 assert.match(ui,/el\('cleanup-agree'\)\.checked/);
 assert.match(ui,/snapshot\.repo===OWNER/);
 assert.match(ui,/issues\.slice\(at,at\+5\)/);
 assert.match(worker,/const ownerSession=await session\(request,env\)/);
});
test('GitHub shared credential is never a fallback for permanent deletions',()=>{
 const route=worker.split("if(path.startsWith('/api/v1/maintenance/issues/')){")[1]?.split("if(path.startsWith('/api/v1/org/'))")[0];
 assert.ok(route);
 assert.doesNotMatch(route,/centralGithubAccess|delegatedAccess/);
 assert.match(route,/token:ownerSession\?\.token\|\|null/);
});
