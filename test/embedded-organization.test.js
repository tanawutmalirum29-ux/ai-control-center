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
test('new AI site removes old organization editor and retains QA plus bridge',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 for(const id of ['view-bridge','bridge-rooms','bridge-receipts','view-qa','qa-pr-output','qa-runs'])
  assert.ok(html.includes('id="'+id+'"'),id);
 for(const old of ['view-organization','orgw-message-form','orgw-task-form','cleanup-panel','branch-panel'])
  assert.ok(!html.includes('id="'+old+'"'),'retired '+old);
 assert.ok(!html.includes('src="./organization.js"'));
});
