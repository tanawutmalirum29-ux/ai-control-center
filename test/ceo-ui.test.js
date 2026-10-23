import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Only GitHub Bridge, read-only QA and project settings are visible',()=>{
 const html=read('public/index.html'),app=read('public/app.js');
 for(const tab of ['bridge','qa','settings'])assert.match(html,new RegExp('id="view-'+tab+'"'));
 for(const old of ['workspace','orgrooms','operations','organization','issues','ceo'])assert.doesNotMatch(html,new RegExp('id="view-'+old+'"'));
 for(const old of ['workspace.js','workspace-patch.js','issue-cleanup.js','branch-cleanup.js','org-workspace.js','organization.js'])assert.ok(!html.includes('src="./'+old+'"'));
 assert.match(app,/switchView\('bridge'\)/);
 assert.match(html,/id="bridge-sync"/);
});
test('AI does not click website editor buttons and QA preserves exact HEAD checks',()=>{
 const html=read('public/index.html'),qa=read('public/qa.js'),worker=read('src/worker.js');
 assert.doesNotMatch(html,/id="ws-save"|id="ws-create-branch"|id="ops-create"/);
 assert.match(qa,/fresh=1/);
 assert.match(worker,/browser_write_retired/);
});
