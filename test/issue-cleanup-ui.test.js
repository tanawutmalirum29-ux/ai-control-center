import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const html=read('../public/index.html');
const ui=read('../public/issue-cleanup.js');
const worker=read('../src/worker.js');
test('Issues use selectable rows and two-stage irreversible confirmation, no typed input',()=>{
 for(const id of ['cleanup-panel','cleanup-login','cleanup-preview','cleanup-count','cleanup-sample',
  'cleanup-select-all','cleanup-clear-selection','cleanup-selected-count','cleanup-copy',
  'cleanup-delete','cleanup-stop','cleanup-status','cleanup-final','cleanup-final-title',
  'cleanup-final-detail','cleanup-final-yes','cleanup-final-no']){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.doesNotMatch(html,/id="cleanup-confirm"|id="cleanup-agree"/);
 assert.match(html,/src="\.\/issue-cleanup\.js"/);
 assert.match(html,/data-view="operations"/);
 assert.match(ui,/data\.authenticated&&data\.login===OWNER/);
 assert.match(ui,/snapshot\.repo===OWNER/);
 assert.match(ui,/chosen\(\)/);
 assert.match(ui,/selected\.has\(issue\.id\)/);
 assert.match(ui,/input\.type='checkbox'/);
 assert.match(ui,/el\('cleanup-final'\)\.hidden=false/);
 assert.match(ui,/el\('cleanup-final-yes'\)\.addEventListener\('click',execute\)/);
 assert.match(ui,/target\.slice\(at,at\+5\)/);
 assert.match(ui,/confirm:'DELETE '/);
 assert.match(worker,/const ownerSession=await session\(request,env\)/);
});
test('Owner session remains mandatory, central public token cannot delete Issues',()=>{
 const route=worker.split("if(path.startsWith('/api/v1/maintenance/issues/')){")[1]?.split("if(path.startsWith('/api/v1/org/'))")[0];
 assert.ok(route);
 assert.doesNotMatch(route,/centralGithubAccess|delegatedAccess/);
 assert.match(route,/token:ownerSession\?\.token\|\|null/);
});
