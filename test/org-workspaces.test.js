import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
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
test('authorized repo-scoped CEO may appoint successor without OWNER, Issues or a second confirmation',async()=>{
 const authorized={role:'CEO',repo:'ARCANA-SURVIVOR',slot:'CEO',nonce:'signed-ceo'};
 const result=await orgWorkspaceApi(post('ceo-invite',{repo:'ARCANA-SURVIVOR'}),{db:emptyDB,agent:authorized});
 assert.equal(result.status,201);
 const info=await result.json();
 assert.equal(info.issued_by,'SIGNED_CEO');
 assert.equal(info.single_use,true);
 assert.match(info.invite_url,/ceo_ticket=[a-f0-9]{64}$/);
 assert.equal((await orgWorkspaceApi(post('ceo-invite',{repo:'ant-project'}),{db:emptyDB,agent:authorized})).status,403);
 for(const role of ['ENGINEER','QA-REVIEWER']){
  const disallowed=await orgWorkspaceApi(post('ceo-invite',{repo:'ARCANA-SURVIVOR'}),{
   db:emptyDB,agent:{...authorized,role}});
  assert.equal(disallowed.status,403);
 }
 const stranger=await orgWorkspaceApi(post('ceo-invite',{repo:'ARCANA-SURVIVOR'}),{db:emptyDB});
 assert.equal(stranger.status,403);
});
test('current active D1 room CEO may issue successor link with room-only membership',async()=>{
 const room='3e3988e0-6d32-4d4b-b317-a793d1c6e0e2',writes=[];
 let role='CEO',status='ACTIVE';
 const db={prepare(sql){return{
  bind(...values){this.values=values;return this},
  async first(){
   if(sql.includes('SELECT m.room_id,m.slot,m.role'))return {role,repo:'ARCANA-SURVIVOR',status,slot:'CEO'};
   if(sql.includes('SELECT id,seq,sender_slot'))return {id:'recorded',seq:1};
   return null;
  },
  async run(){writes.push({sql,values:this.values});return {meta:{changes:1}}}
 }}};
 const request=()=>post('ceo-invite',{repo:'ARCANA-SURVIVOR',from_room_id:room},
  {headers:{cookie:'__Host-acc_org='+('a'.repeat(64))}});
 const approved=await orgWorkspaceApi(request(),{db});
 assert.equal(approved.status,201);
 assert.equal((await approved.json()).issued_by,'EXISTING_ROOM_CEO');
 assert.ok(writes.some(w=>w.sql.includes('INSERT INTO org_messages')),'D1 room succession receipt is created');
 assert.ok(!writes.some(w=>w.sql.includes('org_messages')&&w.values.some(v=>/ceo_ticket=/.test(String(v)))),
  'no secret invitation links are persisted in M messages');
 role='ENGINEER';
 assert.equal((await orgWorkspaceApi(request(),{db})).status,403);
 role='CEO';status='CLOSED';
 assert.equal((await orgWorkspaceApi(request(),{db})).status,403);
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
test('GitHub writer can bootstrap first CEO without OWNER login or an Issue; bearer remains private',async()=>{
 const ticket='b'.repeat(64);
 const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\\.\\d{3}/,'');
 const proofHash=createHash('sha256').update('ACC_ORG_MEMBER_V1:CEO-GITHUB-PROOF:'+ticket).digest('hex');
 const ref='refs/heads/acc/ceo-bootstrap/'+stamp+'-'+proofHash;
 let created=false,used=false,lookups=0;
 const db={prepare(sql){return{
  bind(...args){this.args=args;return this},
  async first(){
   if(sql.includes('SELECT repo FROM org_ceo_tickets'))
    return created&&!used?{repo:'ARCANA-SURVIVOR'}:null;
   return null;
  },
  async run(){
   if(sql.includes('INSERT OR IGNORE INTO org_ceo_tickets'))created=true;
   if(sql.includes('UPDATE org_ceo_tickets')){
    if(used)return {meta:{changes:0}};
    used=true;
   }
   return {meta:{changes:1}};
  }
 }}};
 const fetcher=async url=>{
  lookups++;
  assert.match(url,/github\\.com\\/repos\\/tanawutmalirum29-ux\\/ARCANA-SURVIVOR\\/git\\/ref\\/heads\\/acc\\/ceo-bootstrap\\//);
  assert.equal(url.includes(ticket),false,'GitHub must only see the hashed proof');
  return {ok:true,json:async()=>({ref,object:{type:'commit',sha:'a'.repeat(40)}})};
 };
 const payload={ticket,bootstrap_repo:'ARCANA-SURVIVOR',bootstrap_stamp:stamp};
 const first=await orgWorkspaceApi(post('ceo-activate',payload),{db,fetcher});
 assert.equal(first.status,200,JSON.stringify(await first.clone().json()));
 assert.equal((await first.json()).role,'CEO');
 assert.match(first.headers.get('set-cookie'),/__Host-acc_ceo=/);
 assert.equal(lookups,1);
 const second=await orgWorkspaceApi(post('ceo-activate',payload),{db,fetcher});
 assert.equal(second.status,403,'single-use ticket cannot be redeemed twice');
 const wrong=await orgWorkspaceApi(post('ceo-activate',{...payload,bootstrap_repo:'not-a-project'}),{db,fetcher});
 assert.equal(wrong.status,400,'invalid repo never receives bootstrap');
});
test('public visitor cannot bootstrap a CEO from a missing or malformed GitHub proof',async()=>{
 const ticket='d'.repeat(64),stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\\.\\d{3}/,'');
 const args={ticket,bootstrap_repo:'ARCANA-SURVIVOR',bootstrap_stamp:stamp};
 const fail=await orgWorkspaceApi(post('ceo-activate',args),{db:emptyDB,
  fetcher:async()=>({ok:false,status:404})});
 assert.equal(fail.status,403);
 assert.equal((await fail.json()).error,'github_write_proof_not_found');
 const expired=await orgWorkspaceApi(post('ceo-activate',{...args,bootstrap_stamp:'20240101T010101Z'}),{db:emptyDB,
  fetcher:async()=>{throw Error('must not fetch expired proofs')}});
 assert.equal(expired.status,403);
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

test('OWNER D1 setup is secured and loads packaged schema before any member query',async()=>{
 let count=0,sql=[];
 const db={prepare(query){return {async run(){count++;sql.push(query);return {meta:{changes:1}}}}}};
 const req=post('setup',{});
 const unauth=await orgWorkspaceApi(req.clone(),{db});
 assert.equal(unauth.status,403);
 assert.equal(count,0);
 const auth=await orgWorkspaceApi(req,{db,owner:true});
 assert.equal(auth.status,200,JSON.stringify(await auth.clone().json()));
 assert.equal((await auth.json()).initialized,true);
 assert.ok(count>=6);
 assert.ok(sql.some(x=>x.includes('CREATE TABLE IF NOT EXISTS org_messages')));
 assert.ok(sql.some(x=>x.includes('CREATE TABLE IF NOT EXISTS org_creator_sessions')));
});
test('packaged D1 schema matches the SQL migration file byte for byte',async()=>{
 const {ORG_SCHEMA}=await import('../src/org-schema.js');
 const sql=readFileSync(new URL('../migrations/0001_org_workspaces.sql',import.meta.url),'utf8');
 assert.equal(ORG_SCHEMA,sql);
});
test('invitation and CEO deep links do not leave bearer tickets in browser address bar',()=>{
 const script=readFileSync(new URL('../public/org-workspace.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(script,/history\.replaceState/);
 assert.match(script,/ceo-activate/);
 assert.match(html,/name="referrer" content="no-referrer"/);
});
