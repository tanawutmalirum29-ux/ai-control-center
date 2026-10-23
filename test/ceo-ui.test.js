import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('CEO navigation is the default homepage with all handoff controls',()=>{
 const html=read('public/index.html'),app=read('public/app.js'),client=read('public/ceo.js');
 const notes=read('public/agent-automation.js'),delegate=read('public/delegation.js'),agent=read('public/agent.js');
 assert.match(app,/switchView\('workspace'\); loadProject\(\)/);
 for(const tab of ['ceo','mywork','relay'])
  assert.ok(html.includes('data-view="'+tab+'"')&&html.includes('id="view-'+tab+'"'),tab);
 for(const id of ['ceo-task-list','ceo-appointment-form','ceo-role','ceo-parent','ceo-slot','ceo-title',
  'ceo-submit','ceo-pr-list','ceo-qa-status','relay-list','relay-text','relay-copy-current',
  'mywork-list','mywork-role','ceo-write-state']){
  assert.ok(html.includes('id="'+id+'"'),id+' not in HTML');
 }
 assert.match(client,/\/api\/v1\/mission/);
 assert.match(client,/\/api\/v1\/ops\/issue/);
 assert.match(client,/AP-ROLE/);
 assert.match(client,/\/api\/agent\/invite/);
 assert.match(client,/relayLine\(/);
 assert.match(notes,/Scheduled Task ทุก 1 ชั่วโมง/);
 assert.match(delegate,/cadenceNote/);
 assert.match(agent,/cadenceNote/);
 assert.match(html,/src="\.\/ceo\.js"/);
});
test('source browsing works without authenticated code writes',()=>{
 const html=read('public/index.html'),client=read('public/workspace.js');
 assert.ok(html.includes('id="ws-browse"'));
 assert.ok(html.includes('id="ws-tree"'));
 assert.match(client,/\/api\/v1\/source\/branches/);
 assert.match(client,/\/api\/v1\/source\/tree/);
 assert.match(client,/\/api\/v1\/source\/file/);
 assert.match(client,/\/api\/v1\/work\/branches/);
 assert.match(client,/ws-preview-file/);
 assert.match(client,/ws-file-diff/);
 assert.match(client,/workBranch\(branch\)/);
});
test('server routes public mission reads separately from authenticated write operations',()=>{
 const worker=read('src/worker.js');
 assert.match(worker,/if\(path==='\/api\/v1\/mission'\)\{/);
 assert.match(worker,/missionApi\(request,shared\.token/);
 assert.match(worker,/return opsApi\(request,\{token:access\?\.token,allowedRepo:access\?\.repo,claim:access\?\.claim\}\)/);
 assert.match(worker,/return workApi\(request,\{token:access\?\.token,allowedRepo:access\?\.repo,claim:access\?\.claim\}\)/);
});

test('full-file Workspace is visible by default, verified SHA and PR checks are uncached',()=>{
 const html=read('public/index.html'),ws=read('public/workspace.js'),ceo=read('public/ceo.js'),qa=read('public/qa.js'),app=read('public/app.js');
 assert.match(html,/<details class="ws-full-editor" open>/);
 assert.match(html,/id="ws-loaded-file"/);
 assert.match(ws,/data\.content/);
 assert.match(ws,/el\('ws-load'\)\.click\(\)/);
 assert.match(ws,/refreshEpoch/);
 assert.match(ceo,/fresh=1/);
 assert.match(qa,/fresh=1/);
 assert.match(app,/api\/v1\/mission\?repo=/);
});

test('Read all now fills both line viewer and full-file textarea only after matching blob SHA',()=>{
 const patch=read('public/workspace-patch.js'),ws=read('public/workspace.js');
 assert.match(patch,/if\(all\)\{/);
 assert.match(patch,/full\.sha!==data\.sha/);
 assert.match(patch,/acc:workspace-file-loaded/);
 assert.match(ws,/addEventListener\('acc:workspace-file-loaded'/);
 assert.match(ws,/el\('ws-content'\)\.value=data\.content/);
 assert.match(ws,/fileSha=data\.sha;lastFile=data\.path;loadedContent=data\.content/);
});
