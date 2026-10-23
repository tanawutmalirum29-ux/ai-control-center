import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const html=read('../public/index.html');
const ui=read('../public/branch-cleanup.js');
const worker=read('../src/worker.js');
test('Git branches have checked selection, PR-safe presets and two-click confirmation',()=>{
 for(const id of ['branch-panel','branch-preview','branch-login','branch-owner','branch-count',
  'branch-pr-count','branch-protected-count','branch-list','branch-copy',
  'branch-select-all','branch-select-no-pr','branch-clear-selection','branch-selected-count',
  'branch-delete','branch-stop','branch-status','branch-final','branch-final-title',
  'branch-final-detail','branch-final-yes','branch-final-no']){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.doesNotMatch(html,/id="branch-confirm"|id="branch-risk-code"|id="branch-risk-pr"/);
 assert.match(html,/src="\.\/branch-cleanup\.js"/);
 assert.match(ui,/data\.authenticated&&data\.login===OWNER/);
 assert.match(ui,/eligible=\(\)=>all\(\)\.filter\(x=>!x\.protected&&x\.name!=='main'\)/);
 assert.match(ui,/input\.disabled=branch\.protected\|\|branch\.name==='main'/);
 assert.match(ui,/el\('branch-select-no-pr'\)\.addEventListener/);
 assert.match(ui,/el\('branch-final'\)\.hidden=false/);
 assert.match(ui,/el\('branch-final-yes'\)\.addEventListener\('click',execute\)/);
 assert.match(ui,/target\.slice\(at,at\+5\)/);
 assert.match(ui,/confirm:'DELETE BRANCHES '/);
});
test('Worker still requires OWNER session, never anonymous central GitHub token',()=>{
 const route=worker.split("if(path.startsWith('/api/v1/maintenance/branches/')){")[1]?.split(
  "if(path.startsWith('/api/v1/maintenance/issues/'))")[0];
 assert.ok(route);
 assert.match(route,/const ownerSession=await session\(request,env\)/);
 assert.match(route,/token:ownerSession\?\.token\|\|null/);
 assert.doesNotMatch(route,/centralGithubAccess\(|delegatedAccess\(/);
});
