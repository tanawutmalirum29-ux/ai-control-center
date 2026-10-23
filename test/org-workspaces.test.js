import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {orgWorkspaceApi} from '../src/org-workspaces.js';

const origin='https://ai-control-center.tanawutmalirum29.workers.dev';
const get=(name,qs='')=>new Request(origin+'/api/v1/org/'+name+qs);
const post=(name,body,options={})=>new Request(origin+'/api/v1/org/'+name,{
 method:'POST',headers:{origin,...options.headers,'content-type':'application/json'},
 body:JSON.stringify(body)
});
const emptyDB={
 prepare(query){return{
  bind(...args){return this},
  async first(){return null},
  async all(){return {results:[]}},
  async run(){return {meta:{changes:1}}}
 }} ,
 async batch(items){return items.map(()=>({meta:{changes:1}}));}
};
test('D1 not configured: no write, actionable setup notice, no GitHub fallback',async()=>{
 const response=await orgWorkspaceApi(post('rooms',{repo:'ARCANA-SURVIVOR',title:'Astra CEO round',mission:'Fix hero'}),
  {db:null,owner:true});
 assert.equal(response.status,503);
 const data=await response.json();
 assert.equal(data.error,'organization_database_not_configured');
 assert.match(data.hint,/0001_org_workspaces\.sql/);
});
test('unauthorized website visitor cannot create CEO rooms even with shared GitHub token',async()=>{
 const response=await orgWorkspaceApi(post('rooms',{repo:'ARCANA-SURVIVOR',title:'Astra CEO round',mission:'Fix hero'}),{db:emptyDB});
 assert.equal(response.status,403);
 assert.equal((await response.json()).error,'verified_owner_or_appointed_ceo_required');
});
test('a verified CEO may create a repo-scoped room without an Issue',async()=>{
 const actor={role:'CEO',repo:'ARCANA-SURVIVOR',slot:'CEO',nonce:'signed-agent'};
 const r=await orgWorkspaceApi(post('rooms',{repo:'ARCANA-SURVIVOR',title:'Visual round',mission:'Astra quality'}),{db:emptyDB,agent:actor});
 assert.equal(r.status,201);
 const d=await r.json();
 assert.equal(d.created,true);
 assert.equal(d.repo,'ARCANA-SURVIVOR');
 assert.match(d.room_id,/^[a-f0-9-]{36}$/);
 assert.match(r.headers.get('set-cookie'),/__Host-acc_org=/);
 assert.ok(!JSON.stringify(d).includes('ticket'));
 const wrong=await orgWorkspaceApi(post('rooms',{repo:'ant-project',title:'Wrong repo',mission:'Fix hero'}),{db:emptyDB,agent:actor});
 assert.equal(wrong.status,403);
});
test('OWNER can mint an expiring one-time CEO link; visitor cannot',async()=>{
 const banned=await orgWorkspaceApi(post('ceo-invite',{repo:'ARCANA-SURVIVOR'}),{db:emptyDB});
 assert.equal(banned.status,403);
 const ok=await orgWorkspaceApi(post('ceo-invite',{repo:'ARCANA-SURVIVOR'}),{db:emptyDB,owner:true});
 assert.equal(ok.status,201);
 const data=await ok.json();
 assert.equal(data.single_use,true);assert.equal(data.expires_in,'24h');
 assert.match(data.invite_url,/ceo_ticket=[a-f0-9]{64}$/);
 assert.ok(!ok.headers.get('set-cookie'));
});
test('request origin and JSON content-type checked before any D1 mutation',async()=>{
 const req=post('messages',{room_id:'3e3988e0-6d32-4d4b-b317-a793d1c6e0e2',to:'QA',body:'test'},
  {headers:{origin:'https://evil.example'}});
 assert.equal((await orgWorkspaceApi(req,{db:emptyDB})).status,403);
 const bad=await orgWorkspaceApi(new Request(origin+'/api/v1/org/rooms',{method:'POST',
 headers:{origin,'content-type':'text/plain'},body:'{}'}),{db:emptyDB});
 assert.equal(bad.status,403);
});
test('cross-room reading requires a member cookie, not a URL or repo name',async()=>{
 const id='3e3988e0-6d32-4d4b-b317-a793d1c6e0e2';
 const data=await orgWorkspaceApi(get('messages','?room_id='+id),{db:emptyDB});
 assert.equal(data.status,403);
 assert.equal((await data.json()).error,'room_membership_required');
});
test('room creator tickets cannot be redeemed twice',async()=>{
 let used=false;
 const db={prepare(sql){
  return {bind(...args){return this;},
   async first(){if(sql.includes('org_creator_sessions'))return null;
     if(sql.includes('SELECT repo FROM org_ceo_tickets'))return used?null:{repo:'ARCANA-SURVIVOR'};
     return null;},
   async run(){if(sql.includes('UPDATE org_ceo_tickets')){used=true;return {meta:{changes:1}}}
     return {meta:{changes:1}}}
  };
 }};
 const token='a'.repeat(64);
 const first=await orgWorkspaceApi(post('ceo-activate',{ticket:token}),{db});
 assert.equal(first.status,200);
 assert.match(first.headers.get('set-cookie'),/__Host-acc_ceo=/);
 const second=await orgWorkspaceApi(post('ceo-activate',{ticket:token}),{db});
 assert.equal(second.status,403);
});
test('UI includes separate project organization rooms, M messages, T cards and owner relay',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../public/org-workspace.js',import.meta.url),'utf8');
 const worker=readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
 const migration=readFileSync(new URL('../migrations/0001_org_workspaces.sql',import.meta.url),'utf8');
 for(const id of ['view-orgrooms','orgw-create-form','orgw-owner-invite-form','orgw-invite-form',
 'orgw-message-form','orgw-task-form','orgw-messages','orgw-tasks']){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(js,/api\('messages','POST'/);
 assert.match(js,/api\('tasks','POST'/);
 assert.match(js,/api\('ceo-activate','POST'/);
 assert.match(worker,/db:env\.ORG_DB/);
 assert.match(migration,/UNIQUE\(room_id,seq\)/);
 assert.match(migration,/org_creator_sessions/);
});
