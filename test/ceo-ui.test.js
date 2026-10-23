import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('AI UI has no legacy Issue or AP-ROLE creation views, scripts or entry points',()=>{
 const html=read('public/index.html'),app=read('public/app.js'),server=read('src/worker.js');
 for(const tab of ['orgrooms','workspace','qa','organization'])assert.ok(html.includes('id="view-'+tab+'"'));
 for(const old of ['ceo','issue','mywork','relay','overview','issues','pulls','agents'])
  assert.ok(!html.includes('id="view-'+old+'"'),'obsolete UI '+old);
 for(const oldScript of ['ceo.js','delegation.js','issue-reader.js','operations.js','auth.js','agent.js'])
  assert.ok(!html.includes('src="./'+oldScript+'"'),'obsolete script '+oldScript);
 for(const form of ['ceo-appointment-form','ops-create','task-form','detail-comment-form'])
  assert.ok(!html.includes('id="'+form+'"'),'Issue composer still visible '+form);
 assert.ok(html.includes('id="pr-qa-form"'));
 assert.match(app,/switchView\('orgrooms'\)/);
 assert.ok(!app.includes('/issues/new'));
 assert.ok(server.includes('legacy_issue_workflow_retired'));
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

test('full-file Workspace remains available and PR QA reads exact SHA',()=>{
 const html=read('public/index.html'),ws=read('public/workspace.js'),qa=read('public/qa.js');
 assert.match(html,/<details class="ws-full-editor" open>/);
 assert.match(html,/id="ws-loaded-file"/);
 assert.match(ws,/data\.content/);
 assert.match(ws,/el\('ws-load'\)\.click\(\)/);
 assert.match(ws,/refreshEpoch/);
 assert.match(qa,/fresh=1/);
 assert.match(qa,/pr-qa\\?repo=/);
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
