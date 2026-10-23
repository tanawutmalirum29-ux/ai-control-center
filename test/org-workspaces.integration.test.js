import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {ORG_SCHEMA} from '../src/org-schema.js';
import {orgWorkspaceApi} from '../src/org-workspaces.js';

// Same SQLite engine/constraints as D1; this shim keeps D1's async methods.
function makeD1({schema=true}={}){
 const db=new DatabaseSync(':memory:');
 if(schema)db.exec(ORG_SCHEMA);
 return {
  prepare(sql){
   const stmt=db.prepare(sql);
   const wrapper={
    values:[],
    bind(...args){this.values=args;return this;},
    async first(){return stmt.get(...this.values)||null;},
    async all(){return {results:stmt.all(...this.values)};},
    async run(){const r=stmt.run(...this.values);return {meta:{changes:r.changes}};}
   };
   return wrapper;
  },
  async batch(operations){
   db.exec('BEGIN');
   try{const results=[];for(const op of operations)results.push(await op.run());db.exec('COMMIT');return results;}
   catch(error){db.exec('ROLLBACK');throw error;}
  },
  close(){db.close();}
 };
}
const base='https://example.workers.dev';
const make=(route,body,cookie)=>new Request(base+'/api/v1/org/'+route,{
 method:'POST',
 headers:{origin:base,'content-type':'application/json',...(cookie?{cookie}:{})},
 body:JSON.stringify(body)
});
const read=(route,query,cookie)=>new Request(base+'/api/v1/org/'+route+'?'+query,{headers:{...(cookie?{cookie}:{})}});
const idFrom=r=>r.headers.get('set-cookie')?.split(';')[0];
test('real SQLite D1 schema: CEO room invite, membership, numbering starts M00001 per room',async()=>{
 const db=makeD1();
 try{
  const room1=await orgWorkspaceApi(make('rooms',{repo:'ARCANA-SURVIVOR',title:'Mission CEO Round One',
   mission:'Build Astra'},null),{db,owner:true});
  assert.equal(room1.status,201);
  const a=await room1.json(),ownerCookie=idFrom(room1);
  assert.ok(ownerCookie.startsWith('__Host-acc_org='));
  const unauthorized=await orgWorkspaceApi(read('messages','room_id='+a.room_id),{db});
  assert.equal(unauthorized.status,403);
  const invite=await orgWorkspaceApi(make('members',{room_id:a.room_id,role:'ENGINEER',slot:'EN1'},ownerCookie),{db});
  assert.equal(invite.status,201);
  const cap=await invite.json();assert.equal(cap.slot,'EN1');
  const ticket=new URL(cap.invite_url).searchParams.get('join');
  const joined=await orgWorkspaceApi(make('join',{room_id:a.room_id,ticket}),{db});
  assert.equal(joined.status,200);
  const engineerCookie=idFrom(joined);
  const msg1=await orgWorkspaceApi(make('messages',{room_id:a.room_id,to:'CEO',body:'Ready to code'},engineerCookie),{db});
  assert.equal(msg1.status,201);assert.equal((await msg1.json()).code,'M00001');
  const msg2=await orgWorkspaceApi(make('messages',{room_id:a.room_id,to:'ALL',body:'Review SHA'},ownerCookie),{db});
  assert.equal(msg2.status,201);assert.equal((await msg2.json()).code,'M00002');
  const tasks=await orgWorkspaceApi(make('tasks',{room_id:a.room_id,title:'Build hero animation',
   description:'Eight way regression',assignee_slot:'EN1'},ownerCookie),{db});
  assert.equal(tasks.status,201);assert.equal((await tasks.json()).code,'T00001');
  const room2=await orgWorkspaceApi(make('rooms',{repo:'ARCANA-SURVIVOR',title:'Mission CEO Round Two',
   mission:'New release'},null),{db,owner:true});
  assert.equal(room2.status,201);const b=await room2.json(),ownerCookie2=idFrom(room2);
  const msg3=await orgWorkspaceApi(make('messages',{room_id:b.room_id,to:'ALL',body:'Independent round'},ownerCookie2),{db});
  assert.equal(msg3.status,201);assert.equal((await msg3.json()).code,'M00001');
  const leak=await orgWorkspaceApi(read('messages','room_id='+b.room_id,engineerCookie),{db});
  assert.equal(leak.status,403);
  const roomA=await orgWorkspaceApi(read('messages','room_id='+a.room_id,engineerCookie),{db});
  assert.equal(roomA.status,200);
  const msgs=(await roomA.json()).messages;
  assert.deepEqual(msgs.map(x=>x.code),['M00001','M00002']);
  const noGithubIssues=await db.prepare('SELECT COUNT(*) AS total FROM org_messages').first();
  assert.equal(noGithubIssues.total,3);
 }finally{db.close();}
});
test('real SQLite D1 schema: owner CEO bootstrap one-use and room closure read-only',async()=>{
 const db=makeD1();
 try{
  const minted=await orgWorkspaceApi(make('ceo-invite',{repo:'ARCANA-SURVIVOR'}),{db,owner:true});
  assert.equal(minted.status,201);
  const url=new URL((await minted.json()).invite_url);
  const ticket=url.searchParams.get('ceo_ticket');
  const activated=await orgWorkspaceApi(make('ceo-activate',{ticket}),{db});
  assert.equal(activated.status,200);
  const creatorCookie=idFrom(activated);
  assert.match(creatorCookie,/^__Host-acc_ceo=/);
  const second=await orgWorkspaceApi(make('ceo-activate',{ticket}),{db});
  assert.equal(second.status,403);
  const created=await orgWorkspaceApi(make('rooms',{repo:'ARCANA-SURVIVOR',
   title:'CEO ticket room',mission:'Build app'},creatorCookie),{db});
  assert.equal(created.status,201);
  const room=await created.json(),memberCookie=idFrom(created);
  const close=await orgWorkspaceApi(make('close',{room_id:room.room_id},memberCookie),{db});
  assert.equal(close.status,200);
  const blocked=await orgWorkspaceApi(make('messages',{room_id:room.room_id,to:'ALL',body:'After close'},memberCookie),{db});
  assert.equal(blocked.status,409);
  const archived=await orgWorkspaceApi(read('me','room_id='+room.room_id,memberCookie),{db});
  assert.equal((await archived.json()).status,'CLOSED');
 }finally{db.close();}
});


test('CEO alone appoints EN1..EN5 (at most five) and one independent QA; old roles rejected',async()=>{
 const db=makeD1();
 try{
  const created=await orgWorkspaceApi(make('rooms',{repo:'ARCANA-SURVIVOR',title:'Independent QA round',mission:'Regression all screens'}),{db,owner:true});
  assert.equal(created.status,201);
  const room=(await created.json()).room_id,ceo=idFrom(created);
  for(let i=1;i<=5;i++){
   const invite=await orgWorkspaceApi(make('members',{room_id:room,role:'ENGINEER',slot:'EN'+i},ceo),{db});
   assert.equal(invite.status,201,'EN'+i);
  }
  const overflow=await orgWorkspaceApi(make('members',{room_id:room,role:'ENGINEER',slot:'EN6'},ceo),{db});
  assert.equal(overflow.status,400);
  const qa=await orgWorkspaceApi(make('members',{room_id:room,role:'QA-REVIEWER',slot:'QA'},ceo),{db});
  assert.equal(qa.status,201);
  const duplicate=await orgWorkspaceApi(make('members',{room_id:room,role:'QA-REVIEWER',slot:'QA'},ceo),{db});
  assert.equal(duplicate.status,409);
  for(const oldRole of ['DIR','TL','PROJECT-LEAD','CEO']){
   const deny=await orgWorkspaceApi(make('members',{room_id:room,role:oldRole,slot:'ROLE-X'},ceo),{db});
   assert.equal(deny.status,400,oldRole);
  }
  const roster=await orgWorkspaceApi(read('members','room_id='+room,ceo),{db});
  const members=(await roster.json()).members;
  assert.equal(members.length,7);
  assert.equal(members.filter(m=>m.role==='ENGINEER').length,5);
  assert.equal(members.filter(m=>m.role==='QA-REVIEWER').length,1);
 }finally{db.close();}
});

test('ENGINEER and CEO cannot approve; only independent QA may complete with review evidence',async()=>{
 const db=makeD1();
 try{
  const created=await orgWorkspaceApi(make('rooms',{repo:'ARCANA-SURVIVOR',title:'QA gate round',mission:'Review Astra animations'}),{db,owner:true});
  const room=(await created.json()).room_id,ceo=idFrom(created);
  const invite1=await orgWorkspaceApi(make('members',{room_id:room,role:'ENGINEER',slot:'EN1'},ceo),{db});
  const token1=new URL((await invite1.json()).invite_url).searchParams.get('join');
  const en=idFrom(await orgWorkspaceApi(make('join',{room_id:room,ticket:token1}),{db}));
  const invite2=await orgWorkspaceApi(make('members',{room_id:room,role:'QA-REVIEWER',slot:'QA'},ceo),{db});
  const token2=new URL((await invite2.json()).invite_url).searchParams.get('join');
  const qa=idFrom(await orgWorkspaceApi(make('join',{room_id:room,ticket:token2}),{db}));
  const task=await orgWorkspaceApi(make('tasks',{room_id:room,title:'Astra animation regression',description:'Confirm 5 device sizes',assignee_slot:'EN1'},ceo),{db});
  assert.equal(task.status,201);
  const seq=(await task.json()).seq;
  const status=(cookie,to,evidence)=>orgWorkspaceApi(make('task-status',{room_id:room,seq,status:to,evidence},cookie),{db});
  assert.equal((await status(ceo,'DONE')).status,403);
  assert.equal((await status(en,'DONE')).status,403);
  assert.equal((await status(qa,'DONE','HEAD SHA abcdef1234567890 plus Chromium and WebKit PASS')).status,409);
  assert.equal((await status(en,'WAITING_QA')).status,200);
  assert.equal((await status(ceo,'DONE')).status,403);
  assert.equal((await status(qa,'DONE')).status,400);
  const approved=await status(qa,'DONE','PR #99 HEAD SHA abcdef1234567890 and Chromium/WebKit 5/5 PASS');
  assert.equal(approved.status,200);
  assert.equal((await approved.json()).verified_by,'QA');
  const updated=await orgWorkspaceApi(read('tasks','room_id='+room,ceo),{db});
  assert.equal((await updated.json()).tasks[0].status,'DONE');
  const messages=await orgWorkspaceApi(read('messages','room_id='+room,ceo),{db});
  assert.match((await messages.json()).messages[0].body,/QA T00001 DONE/);
 }finally{db.close();}
});

test('fresh D1 initializes tables automatically on first request without OWNER login',async()=>{
 const db=makeD1({schema:false});
 try{
  const req=read('rooms','repo=ARCANA-SURVIVOR');
  const response=await orgWorkspaceApi(req,{db});
  assert.equal(response.status,200);
  assert.deepEqual((await response.json()).rooms,[]);
  const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'org_%' ORDER BY name").all()).results;
  assert.equal(tables.length,6);
  const second=await orgWorkspaceApi(read('schema-health',''),{db});
  assert.equal(second.status,200);
  assert.equal((await second.json()).database_ready,true);
 }finally{db.close();}
});
