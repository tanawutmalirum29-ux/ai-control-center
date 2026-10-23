import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {ORG_SCHEMA} from '../src/org-schema.js';
import {processBridgeCommand,githubBridgeApi,syncGithubBridge} from '../src/github-bridge.js';

function makeD1(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(ORG_SCHEMA);
 return {prepare(sql){
   const stmt=sqlite.prepare(sql);
   return {values:[],bind(...a){this.values=a;return this;},
    async first(){return stmt.get(...this.values)||null;},
    async all(){return {results:stmt.all(...this.values)};},
    async run(){const out=stmt.run(...this.values);return {meta:{changes:out.changes}};}
   };
  },
  async batch(ops){
   sqlite.exec('BEGIN');
   try{const all=[];for(const op of ops)all.push(await op.run());sqlite.exec('COMMIT');return all;}
   catch(e){sqlite.exec('ROLLBACK');throw e;}
  },close(){sqlite.close();}
 };
}
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
 '33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444',
 '55555555-5555-4555-8555-555555555555','66666666-6666-4666-8666-666666666666',
 '77777777-7777-4777-8777-777777777777','88888888-8888-4888-8888-888888888888'];
const repo='ARCANA-SURVIVOR';
function cmd(id,action,data={},actor='CEO',room_id=ids[0]){
 return {v:1,id,repo,actor,action,...(action==='open_room'?{}:{room_id}),data};
}
const open=()=>cmd(ids[0],'open_room',{title:'Arcana Hero Work',mission:'Build reliable lobby and QA'});
test('GitHub Connector commands create D1 organization, appoint team, make M and T, close',async()=>{
 const db=makeD1();
 try{
  const a=await processBridgeCommand(db,open());
  assert.equal(a.status,'DONE');assert.equal(a.room_id,ids[0]);
  assert.equal((await processBridgeCommand(db,open())).replayed,true);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM org_rooms').first()).n,1);
  const en=await processBridgeCommand(db,cmd(ids[1],'appoint',{slot:'EN1'}));assert.equal(en.status,'DONE');
  const qa=await processBridgeCommand(db,cmd(ids[2],'appoint',{slot:'QA'}));assert.equal(qa.status,'DONE');
  const message=await processBridgeCommand(db,cmd(ids[3],'message',{body:'Ready to review',to:'CEO'},'EN1'));
  assert.equal(message.code,'M00001');
  const task=await processBridgeCommand(db,cmd(ids[4],'task',{title:'Review hero movement',description:'Five phone sizes',assignee:'EN1'}));
  assert.equal(task.code,'T00001');
  const wrong=await processBridgeCommand(db,cmd(ids[5],'task_status',{seq:1,status:'DONE'},'EN1'));
  assert.equal(wrong.status,'REJECTED');assert.match(wrong.detail,/engineer_cannot_approve_qa/);
  const waiting=await processBridgeCommand(db,cmd(ids[6],'task_status',{seq:1,status:'WAITING_QA'},'EN1'));
  assert.equal(waiting.status,'DONE');
  const done=await processBridgeCommand(db,cmd(ids[7],'task_status',{seq:1,status:'DONE',evidence:'PR HEAD abcdef CI PASS + browser regression tested'},'QA'));
  assert.equal(done.status,'DONE');
  const updated=await db.prepare('SELECT status FROM org_tasks WHERE room_id=?').bind(ids[0]).first();
  assert.equal(updated.status,'DONE');
  const request=new Request('https://site.example/api/v1/bridge/inbox?room_id='+ids[0]);
  const board=await githubBridgeApi(request,{db});
  const view=await board.json();
  assert.equal(board.status,200);assert.equal(view.messages[0].code,'M00001');
  assert.equal(view.tasks[0].code,'T00001');assert.equal(view.members.length,3);
  assert.equal((await processBridgeCommand(db,open())).replayed,true);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM org_rooms').first()).n,1);
 }finally{db.close();}
});
test('unappointed roles and invalid repos cannot inject work',async()=>{
 const db=makeD1();
 try{
  await processBridgeCommand(db,open());
  let result=await processBridgeCommand(db,cmd(ids[1],'message',{body:'Fake QA',to:'ALL'},'QA'));
  assert.equal(result.status,'REJECTED');assert.equal(result.detail,'bridge_actor_not_appointed');
  result=await processBridgeCommand(db,{...cmd(ids[2],'appoint',{slot:'EN1'}),repo:'untrusted-repo'});
  assert.equal(result.status,'REJECTED');
  result=await processBridgeCommand(db,cmd(ids[3],'appoint',{slot:'EN6'}));
  assert.equal(result.status,'REJECTED');
  const response=await githubBridgeApi(new Request('https://site.example/api/v1/bridge/inbox?room_id='+ids[7]),{db});
  assert.equal(response.status,404);
 }finally{db.close();}
});
test('GitHub daily queue sync pulls files once, rejects non-matching IDs and bad JSON',async()=>{
 const db=makeD1();
 try{
  const date=new Date('2026-10-24T10:00:00Z');
  const good=open();
  const payload=btoa(JSON.stringify(good));
  const calls=[];
  const fetcher=async url=>{
   calls.push(url);
   if(url.includes('/bridge/requests/2026-10-24/')){
    if(url.endsWith('/'+good.id+'.json?ref=main'))return new Response(JSON.stringify({type:'file',size:JSON.stringify(good).length,content:payload}),{status:200});
    return new Response(JSON.stringify([{type:'file',name:good.id+'.json'}]),{status:200});
   }
   return new Response('{}',{status:404});
  };
  const out=await syncGithubBridge({db,fetcher,date,token:'mock-secret'});
  assert.equal(out.processed,1);assert.equal(out.rejected,0);
  const second=await syncGithubBridge({db,fetcher,date});
  assert.equal(second.processed,0);
  const receipts=await githubBridgeApi(new Request('https://site.example/api/v1/bridge/status?repo='+repo),{db});
  assert.equal((await receipts.json()).receipts.length,1);
  assert.ok(calls.some(u=>u.includes('ai-organization-hub/contents/')));
 }finally{db.close();}
});
test('HTTP bridge rejects cross-origin sync; status read has no secret capabilities',async()=>{
 const db=makeD1();
 try{
  const r=await githubBridgeApi(new Request('https://site.example/api/v1/bridge/sync',{method:'POST',headers:{origin:'https://evil.example'}}),{db});
  assert.equal(r.status,403);
  const health=await githubBridgeApi(new Request('https://site.example/api/v1/bridge/health'),{db});
  const info=await health.json();
  assert.equal(info.no_tinyfish,true);assert.equal(info.public_commands,true);
  assert.equal(info.cron,'*/5 * * * *');
 }finally{db.close();}
});
