import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('CEO navigation is the default homepage with all handoff controls',()=>{
 const html=read('public/index.html'),app=read('public/app.js'),client=read('public/ceo.js');
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
