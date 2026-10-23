import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {organizationApi} from '../src/organization-api.js';
const bundle=JSON.parse(readFileSync(new URL('../public/organization-bundle.json',import.meta.url),'utf8'));
test('embedded organization snapshot is complete and pinned',()=>{
 assert.equal(bundle.repository,'tanawutmalirum29-ux/ai-organization-hub');
 assert.match(bundle.source_main_sha,/^[a-f0-9]{40}$/);
 assert.deepEqual(Object.keys(bundle.files).sort(),[
  'COMMANDS.md','README.md','RULES.md',
  'appointments/OWNER-TO-CEO.md','appointments/OWNER-TO-LEAD.md','appointments/ROLE-HANDOFF.md'
 ].sort());
 for(const [path,value]of Object.entries(bundle.files)){
  assert.match(value.sha,/^[a-f0-9]{40}$/);
  assert.ok(value.text.length>300,path+' is empty');
 }
 assert.match(bundle.files['RULES.md'].text,/PROJECT_LEAD|PROJECT LEAD/i);
 assert.match(bundle.files['COMMANDS.md'].text,/MN/);
});
test('organization bundle API works without GitHub API access',async()=>{
 let calls=0;
 const blocked=async()=>{calls++;throw Error('GitHub disabled');};
 let result=await organizationApi(new Request('https://control.example/api/v1/organization/bundle'),{fetcher:blocked,edge:null});
 assert.equal(result.status,200);
 const info=await result.json();
 assert.equal(info.documents.length,6);
 assert.equal(info.main_sha,bundle.source_main_sha);
 assert.equal(info.bundled,true);
 result=await organizationApi(new Request('https://control.example/api/v1/organization/bundle/document?name=RULES.md'),{fetcher:blocked,edge:null});
 assert.equal(result.status,200);
 assert.equal((await result.json()).text,bundle.files['RULES.md'].text);
 result=await organizationApi(new Request('https://control.example/api/v1/organization/bundle/document?name=../.env'),{fetcher:blocked,edge:null});
 assert.equal(result.status,400);
 assert.equal(calls,0);
});
test('Operations and workspace controls linked in HTML and JS',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const ops=readFileSync(new URL('../public/operations.js',import.meta.url),'utf8');
 const org=readFileSync(new URL('../public/organization.js',import.meta.url),'utf8');
 for(const id of ['view-organization','org-documents','org-full-document','view-operations','ops-workflow','ops-run-list','ops-issue-list','ops-status-send','ops-dispatch-send']){
  assert.ok(html.includes('id="'+id+'"'),id+' missing from HTML');
 }
 assert.ok(html.includes('src="./operations.js"'));
 assert.ok(html.includes('src="./organization.js"'));
 assert.match(ops,/ops-status-send/);
 assert.match(org,/organization\/bundle/);
});
