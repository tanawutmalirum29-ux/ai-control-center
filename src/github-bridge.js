// GitHub Connector transport for ordinary ChatGPT chats, with Cloudflare D1 as the live board.
// The bridge inbox is in the public ai-organization-hub repository; NEVER include credentials,
// invitation URLs, personal data or confidential messages. GitHub write permission is the
// authority to submit a command; actor names are NOT independently authenticated chat IDs.
import {WRITE_REPOS} from '../public/repositories.js';
const OWNER='tanawutmalirum29-ux';
const HUB=OWNER+'/ai-organization-hub';
const uuid=s=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const slot=s=>typeof s==='string'&&/^(CEO|EN[1-5]|QA)$/.test(s);
const sane=(s,min,max)=>typeof s==='string'&&s.trim().length>=min&&s.trim().length<=max;
const okRepo=repo=>WRITE_REPOS.includes(repo);
const text=(x)=>String(x||'').trim();
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','access-control-allow-origin':'*'}});
const schema=[
 'CREATE TABLE IF NOT EXISTS bridge_receipts (id TEXT PRIMARY KEY, repo TEXT NOT NULL, action TEXT NOT NULL, status TEXT NOT NULL, room_id TEXT, code TEXT, detail TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)',
 'CREATE INDEX IF NOT EXISTS idx_bridge_receipts_repo ON bridge_receipts(repo,created_at DESC)'
];
async function ensure(db){for(const sql of schema)await db.prepare(sql).run();}
async function one(db,sql,...params){return db.prepare(sql).bind(...params).first();}
async function all(db,sql,...params){return (await db.prepare(sql).bind(...params).all()).results||[];}
const receipt=(cmd,status,detail,room_id=null,code=null)=>({id:cmd.id,repo:cmd.repo,action:cmd.action,status,detail,room_id,code});
async function store(db,item){
 await db.prepare('INSERT OR IGNORE INTO bridge_receipts(id,repo,action,status,detail,room_id,code) VALUES(?,?,?,?,?,?,?)')
  .bind(item.id,item.repo,item.action,item.status,item.detail,item.room_id,item.code).run();
}
async function actorInRoom(db,roomId,repo,actor){
 const room=await one(db,"SELECT id,repo,status FROM org_rooms WHERE id=? AND repo=? AND created_by='GITHUB_BRIDGE'",roomId,repo);
 if(!room||room.status!=='ACTIVE')throw Error('bridge_room_not_found_or_closed');
 const who=await one(db,'SELECT role,slot FROM org_members WHERE room_id=? AND slot=? AND revoked_at IS NULL',roomId,actor);
 if(!who)throw Error('bridge_actor_not_appointed');
 return who;
}
function commandShape(cmd){
 if(!cmd||typeof cmd!=='object'||Array.isArray(cmd)||cmd.v!==1||!uuid(cmd.id)||
  !okRepo(cmd.repo)||!['open_room','appoint','message','task','task_status','close_room'].includes(cmd.action)||
  !slot(cmd.actor)||!cmd.data||typeof cmd.data!=='object'||Array.isArray(cmd.data))throw Error('invalid_bridge_command');
 if(cmd.action!=='open_room'&&(!uuid(cmd.room_id)))throw Error('invalid_room_id');
 if(cmd.action==='open_room'&&cmd.actor!=='CEO')throw Error('ceo_required');
 if(cmd.action==='open_room'&&(!sane(cmd.data.title,3,120)||!sane(cmd.data.mission,1,4000)))throw Error('invalid_room_details');
 return cmd;
}
async function apply(db,cmd){
 const data=cmd.data,roomId=cmd.action==='open_room'?cmd.id:cmd.room_id;
 if(cmd.action==='open_room'){
  // Command UUID is the room ID: retrying the same file is always idempotent.
  const placeholder='bridge:'+cmd.id;
  await db.batch([
   db.prepare("INSERT INTO org_rooms(id,repo,title,mission,created_by) VALUES(?,?,?,?,'GITHUB_BRIDGE')")
    .bind(cmd.id,cmd.repo,text(data.title),text(data.mission)),
   db.prepare("INSERT INTO org_members(id,room_id,slot,role,token_hash,expires_at) VALUES(?,?,?,?,?,?)")
    .bind(crypto.randomUUID(),cmd.id,'CEO','CEO',placeholder,'2099-01-01T00:00:00Z')
  ]);
  return receipt(cmd,'DONE','Organization created via GitHub Connector',cmd.id);
 }
 const who=await actorInRoom(db,roomId,cmd.repo,cmd.actor);
 if(cmd.action==='appoint'){
  if(who.role!=='CEO')throw Error('ceo_required');
  const target=data.slot;
  if(!slot(target)||target==='CEO')throw Error('invalid_member_slot');
  const role=target==='QA'?'QA-REVIEWER':'ENGINEER';
  await db.prepare('INSERT INTO org_members(id,room_id,slot,role,token_hash,expires_at) VALUES(?,?,?,?,?,?)')
   .bind(crypto.randomUUID(),roomId,target,role,'bridge:'+cmd.id,'2099-01-01T00:00:00Z').run();
  return receipt(cmd,'DONE','Appointed '+target+' (GitHub bridge role)',roomId);
 }
 if(cmd.action==='message'){
  if(!sane(data.body,1,4000)||!slot(data.to)&&data.to!=='ALL')throw Error('invalid_message');
  if(data.to!=='ALL'&&!(await one(db,'SELECT id FROM org_members WHERE room_id=? AND slot=?',roomId,data.to)))throw Error('recipient_not_appointed');
  const id=crypto.randomUUID();
  await db.prepare("INSERT INTO org_messages(id,room_id,seq,sender_slot,recipient_slot,body) SELECT ?,?,COALESCE(MAX(seq),0)+1,?,?,? FROM org_messages WHERE room_id=?")
   .bind(id,roomId,cmd.actor,data.to,text(data.body),roomId).run();
  const added=await one(db,'SELECT seq FROM org_messages WHERE id=?',id);
  return receipt(cmd,'DONE','Message delivered',roomId,'M'+String(added.seq).padStart(5,'0'));
 }
 if(cmd.action==='task'){
  if(who.role!=='CEO')throw Error('ceo_required');
  if(!sane(data.title,3,200)||typeof data.description!=='string'||data.description.length>4000||
   !/^EN[1-5]$/.test(data.assignee))throw Error('invalid_task');
  if(!await one(db,'SELECT id FROM org_members WHERE room_id=? AND slot=?',roomId,data.assignee))throw Error('assignee_not_appointed');
  const id=crypto.randomUUID();
  await db.prepare("INSERT INTO org_tasks(id,room_id,seq,title,description,assignee_slot,created_by) SELECT ?,?,COALESCE(MAX(seq),0)+1,?,?,?,? FROM org_tasks WHERE room_id=?")
   .bind(id,roomId,text(data.title),data.description,data.assignee,cmd.actor,roomId).run();
  const added=await one(db,'SELECT seq FROM org_tasks WHERE id=?',id);
  return receipt(cmd,'DONE','Task assigned to '+data.assignee,roomId,'T'+String(added.seq).padStart(5,'0'));
 }
 if(cmd.action==='task_status'){
  const task=await one(db,'SELECT status,assignee_slot FROM org_tasks WHERE room_id=? AND seq=?',roomId,data.seq);
  if(!task)throw Error('task_not_found');
  const next=data.status;
  if(!['READY','IN_PROGRESS','WAITING_QA','QA_HOLD','DONE','CANCELLED'].includes(next))throw Error('invalid_task_status');
  if(who.role==='CEO'&&!['READY','IN_PROGRESS','WAITING_QA','CANCELLED'].includes(next))throw Error('ceo_cannot_approve_qa');
  if(who.role==='ENGINEER'&&(cmd.actor!==task.assignee_slot||!['IN_PROGRESS','WAITING_QA'].includes(next)))throw Error('engineer_cannot_approve_qa');
  if(who.role==='QA-REVIEWER'){
   if(!['DONE','QA_HOLD'].includes(next)||task.status!=='WAITING_QA'||!sane(data.evidence,12,1000))
    throw Error('qa_requires_waiting_submission_and_evidence');
  }
  await db.prepare('UPDATE org_tasks SET status=?,updated_at=CURRENT_TIMESTAMP WHERE room_id=? AND seq=?')
   .bind(next,roomId,data.seq).run();
  return receipt(cmd,'DONE','Task T'+String(data.seq).padStart(5,'0')+' marked '+next,roomId,'T'+String(data.seq).padStart(5,'0'));
 }
 if(cmd.action==='close_room'){
  if(who.role!=='CEO')throw Error('ceo_required');
  await db.prepare("UPDATE org_rooms SET status='CLOSED',closed_at=CURRENT_TIMESTAMP WHERE id=?").bind(roomId).run();
  return receipt(cmd,'DONE','Room closed',roomId);
 }
 throw Error('unsupported_bridge_action');
}
export async function processBridgeCommand(db,input){
 await ensure(db);
 const id=input?.id,previous=uuid(id)?await one(db,'SELECT * FROM bridge_receipts WHERE id=?',id):null;
 if(previous)return {...previous,replayed:true};
 let cmd;
 try{cmd=commandShape(input);}catch(error){
  if(uuid(id)&&okRepo(input?.repo))await store(db,receipt({id,repo:input.repo,action:String(input.action||'invalid')},'REJECTED',String(error.message).slice(0,120)));
  return {id,status:'REJECTED',detail:String(error.message)};
 }
 try{
  const result=await apply(db,cmd);
  await store(db,result);
  return result;
 }catch(error){
  const result=receipt(cmd,'REJECTED',String(error.message).slice(0,160),cmd.room_id||null);
  await store(db,result);
  return result;
 }
}
const apiRoot='https://api.github.com/repos/'+HUB+'/contents/';
function ghHeaders(token){return {'accept':'application/vnd.github+json','user-agent':'AI-Control-Center-Bridge',...(token?{authorization:'Bearer '+token}:{})};}
const utcDate=(d)=>d.toISOString().slice(0,10);
export async function syncGithubBridge({db,fetcher=fetch,token=null,date=new Date(),limit=35}={}){
 if(!db)return {ok:false,error:'d1_not_configured'};
 await ensure(db);
 const today=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()));
 let seen=0,processed=0,rejected=0;const errors=[];
 for(let n=2;n>=0;n--){
  const day=new Date(today.getTime()-n*86400000);
  const prefix='bridge/requests/'+utcDate(day)+'/';
  let directory;
  try{
   const r=await fetcher(apiRoot+prefix+'?ref=main',{headers:ghHeaders(token)});
   if(r.status===404)continue;
   if(!r.ok){errors.push('GitHub list HTTP '+r.status);continue;}
   directory=await r.json();
  }catch{errors.push('github_unreachable');continue;}
  if(!Array.isArray(directory)){errors.push('invalid_github_directory');continue;}
  for(const file of directory.filter(x=>x.type==='file'&&/^[0-9a-f-]{36}\.json$/i.test(x.name)).sort((a,b)=>a.name.localeCompare(b.name))){
   if(processed>=limit)break;
   const id=file.name.slice(0,-5);
   if(!uuid(id))continue;
   seen++;
   if(await one(db,'SELECT id FROM bridge_receipts WHERE id=?',id))continue;
   try{
    const r=await fetcher(apiRoot+prefix+file.name+'?ref=main',{headers:ghHeaders(token)});
    if(!r.ok){errors.push('GitHub file HTTP '+r.status);continue;}
    const obj=await r.json();
    if(obj.type!=='file'||typeof obj.content!=='string'||obj.size>10000){errors.push('invalid_command_file');continue;}
    // REST Contents API returns base64 even for UTF-8 JSON files.
    const raw=atob(obj.content.replace(/\s/g,''));
    const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
    const command=JSON.parse(new TextDecoder().decode(bytes));
    if(command.id!==id){errors.push('id_mismatch');continue;}
    const receipt=await processBridgeCommand(db,command);
    processed++;
    if(receipt.status!=='DONE')rejected++;
   }catch(error){errors.push(String(error?.message||error).slice(0,100));}
  }
  if(processed>=limit)break;
 }
 return {ok:errors.length===0,seen,processed,rejected,errors:errors.slice(0,8),bridge_repo:HUB};
}
export async function githubBridgeApi(request,{db,fetcher=fetch,token=null}={}){
 const url=new URL(request.url),path=url.pathname;
 if(!db)return response({error:'organization_database_not_configured'},503);
 try{
  await ensure(db);
  if(path==='/api/v1/bridge/sync'&&request.method==='POST'){
   if(request.headers.get('origin')!==url.origin)return response({error:'same_origin_required'},403);
   const result=await syncGithubBridge({db,fetcher,token});
   return response(result,result.ok?200:502);
  }
  if(request.method!=='GET')return response({error:'method_not_allowed'},405);
  if(path==='/api/v1/bridge/health')return response({ready:true,bridge_repo:HUB,branch:'main',
   transport:'github_connector_files',cron:'*/5 * * * *',public_commands:true,no_tinyfish:true});
  if(path==='/api/v1/bridge/status'){
   const id=url.searchParams.get('id');
   if(id){
    if(!uuid(id))return response({error:'invalid_command_id'},400);
    const item=await one(db,'SELECT id,repo,action,status,room_id,code,detail,created_at FROM bridge_receipts WHERE id=?',id);
    return response({receipt:item||null});
   }
   const repo=url.searchParams.get('repo');
   if(!okRepo(repo))return response({error:'invalid_repository'},400);
   return response({receipts:await all(db,'SELECT id,repo,action,status,room_id,code,detail,created_at FROM bridge_receipts WHERE repo=? ORDER BY created_at DESC LIMIT 60',repo)});
  }
  if(path==='/api/v1/bridge/rooms'){
   const repo=url.searchParams.get('repo');
   if(!okRepo(repo))return response({error:'invalid_repository'},400);
   return response({repo,rooms:await all(db,"SELECT id,repo,title,mission,status,created_at FROM org_rooms WHERE repo=? AND created_by='GITHUB_BRIDGE' ORDER BY created_at DESC LIMIT 40",repo)});
  }
  if(path==='/api/v1/bridge/inbox'){
   const id=url.searchParams.get('room_id');
   if(!uuid(id))return response({error:'invalid_room_id'},400);
   const room=await one(db,"SELECT id,repo,title,mission,status FROM org_rooms WHERE id=? AND created_by='GITHUB_BRIDGE'",id);
   if(!room)return response({error:'bridge_room_not_found'},404);
   const [members,messages,tasks]=await Promise.all([
    all(db,'SELECT slot,role FROM org_members WHERE room_id=? ORDER BY created_at,slot',id),
    all(db,'SELECT seq,sender_slot,recipient_slot,body,created_at FROM org_messages WHERE room_id=? ORDER BY seq DESC LIMIT 100',id),
    all(db,'SELECT seq,title,description,assignee_slot,status,created_at,updated_at FROM org_tasks WHERE room_id=? ORDER BY seq DESC LIMIT 100',id)
   ]);
   return response({room,members,messages:messages.reverse().map(x=>({...x,code:'M'+String(x.seq).padStart(5,'0')})),
    tasks:tasks.reverse().map(x=>({...x,code:'T'+String(x.seq).padStart(5,'0')})),public_bridge:true});
  }
  return response({error:'not_found'},404);
 }catch(error){return response({error:'bridge_internal_error',detail:String(error.message||error).slice(0,120)},500);}
}
