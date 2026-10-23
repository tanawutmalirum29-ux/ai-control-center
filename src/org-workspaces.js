// Isolated, issue-free CEO workspaces backed by Cloudflare D1.
// No GitHub API, GitHub Issues, or per-message commits. Fail closed without D1 and membership.
import {WRITE_REPOS} from '../public/repositories.js';
import {ORG_SCHEMA} from './org-schema.js';
const validRepo=repo=>WRITE_REPOS.includes(repo);
const idOK=id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const slotOK=slot=>typeof slot==='string'&&/^[A-Z][A-Z0-9_-]{0,39}$/.test(slot);
// New organizations have exactly one CEO, one independent QA, and EN1..EN5.
const roles=['ENGINEER','QA-REVIEWER'];
const engineerSlot=slot=>/^EN[1-5]$/.test(slot);
const qaSlot=slot=>slot==='QA';
const stateOK=s=>['READY','IN_PROGRESS','WAITING_QA','QA_HOLD','DONE','CANCELLED'].includes(s);
const format=(prefix,n)=>prefix+String(n).padStart(5,'0');
const res=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{
 'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',
 'referrer-policy':'no-referrer',...headers}});
const clean=(v,max)=>typeof v==='string'?v.trim().slice(0,max+1):'';
const secret=()=>{const b=crypto.getRandomValues(new Uint8Array(32));return Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');};
async function digest(s){
 const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('ACC_ORG_MEMBER_V1:'+s));
 return Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
}
const now=()=>new Date().toISOString();
const expiration=()=>new Date(Date.now()+30*86400000).toISOString();
const cookieName='__Host-acc_org';
const creatorCookieName='__Host-acc_ceo';
const cookie=(value,age)=>cookieName+'='+value+'; Path=/; Max-Age='+age+'; Secure; HttpOnly; SameSite=Lax';
function creatorToken(req){
 const line=(req.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(creatorCookieName+'='));
 return line?line.slice(creatorCookieName.length+1):null;
}
async function creatorSession(db,request){
 const token=creatorToken(request);
 if(!token||!/^[0-9a-f]{64}$/.test(token))return null;
 return db.prepare('SELECT id,repo,expires_at FROM org_creator_sessions WHERE token_hash=? AND expires_at>?')
  .bind(await digest('CEO:'+token),now()).first();
}
function cookieToken(req){
 const line=(req.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='));
 return line?line.slice(cookieName.length+1):null;
}
async function member(db,request,id){
 const token=cookieToken(request);
 if(!idOK(id)||!token||!/^[0-9a-f]{64}$/.test(token))return null;
 return db.prepare(`SELECT m.room_id,m.slot,m.role,m.expires_at,m.revoked_at,
    r.repo,r.title,r.mission,r.status,r.created_at
    FROM org_members m JOIN org_rooms r ON r.id=m.room_id
    WHERE m.room_id=? AND m.token_hash=? AND m.revoked_at IS NULL AND m.expires_at>?`)
   .bind(id,await digest(token),now()).first();
}
function checkWrite(request,url){
 return request.headers.get('origin')===url.origin &&
  request.headers.get('content-type')?.toLowerCase().startsWith('application/json');
}
async function dataInput(request){
 try{return await request.json();}catch{return null;}
}
function adminRole(actor){return actor?.role==='CEO';}
async function nextMessage(db,room,actor,to,body){
 // SQLite write serialization + UNIQUE(room_id,seq) prevents duplicate M IDs.
 // Retry constraint conflicts; do not overwrite existing messages.
 for(let attempt=0;attempt<4;attempt++){
  try{
   const id=crypto.randomUUID();
   const insert=await db.prepare(`INSERT INTO org_messages
     (id,room_id,seq,sender_slot,recipient_slot,body)
     SELECT ?,?,COALESCE((SELECT MAX(seq) FROM org_messages WHERE room_id=?),0)+1,?,?,?
     WHERE EXISTS(SELECT 1 FROM org_rooms WHERE id=? AND status='ACTIVE')`)
     .bind(id,room,room,actor,to,body,room).run();
   if(!insert.meta?.changes)return null;
   return db.prepare('SELECT id,seq,sender_slot,recipient_slot,body,created_at FROM org_messages WHERE id=?').bind(id).first();
  }catch(error){
   if(!/UNIQUE|constraint/i.test(String(error))||attempt===3)throw error;
  }
 }
 return null;
}
async function nextTask(db,room,actor,to,title,description){
 for(let attempt=0;attempt<4;attempt++){
  try{
   const id=crypto.randomUUID();
   const insert=await db.prepare(`INSERT INTO org_tasks
    (id,room_id,seq,title,description,assignee_slot,created_by)
    SELECT ?,?,COALESCE((SELECT MAX(seq) FROM org_tasks WHERE room_id=?),0)+1,?,?,?,?
    WHERE EXISTS(SELECT 1 FROM org_rooms WHERE id=? AND status='ACTIVE')`)
    .bind(id,room,room,title,description,to,actor,room).run();
   if(!insert.meta?.changes)return null;
   return db.prepare('SELECT id,seq,title,description,assignee_slot,created_by,status,created_at,updated_at FROM org_tasks WHERE id=?').bind(id).first();
  }catch(error){
   if(!/UNIQUE|constraint/i.test(String(error))||attempt===3)throw error;
  }
 }
 return null;
}
export async function orgWorkspaceApi(request,{db,owner=false,agent=null}={}){
 const url=new URL(request.url),route=url.pathname,verb=request.method;
 if(!db||typeof db.prepare!=='function')return res({
  error:'organization_database_not_configured',
  hint:'Create a Cloudflare D1 database, execute migrations/0001_org_workspaces.sql and bind it as ORG_DB'},503);
 if(!route.startsWith('/api/v1/org/'))return res({error:'not_found'},404);
 if(!['GET','POST'].includes(verb))return res({error:'method_not_allowed'},405);
 if(verb==='POST'&&!checkWrite(request,url))return res({error:'same_origin_json_required'},403);
 const data=verb==='POST'?await dataInput(request):null;
 if(verb==='POST'&&(!data||typeof data!=='object'||Array.isArray(data)))return res({error:'invalid_json'},400);
 const room=verb==='GET'?url.searchParams.get('room_id'):data?.room_id;
 try{
  if(route==='/api/v1/org/setup'&&verb==='POST'){
   if(!owner)return res({error:'owner_login_required_for_database_setup'},403);
   if(typeof db.exec!=='function')return res({error:'d1_exec_unavailable'},503);
   await db.exec(ORG_SCHEMA);
   return res({initialized:true,database_binding:'ORG_DB',
    tables:['org_rooms','org_members','org_messages','org_tasks','org_ceo_tickets','org_creator_sessions'],
    note:'Idempotent schema, GitHub Issues unaffected'});
  }
  // D1 first-run initialization is idempotent; the OWNER does not have to create tables manually.
  // The configured ORG_DB is pre-authorized via Cloudflare deployment, not public GitHub access.
  try{await db.prepare('SELECT 1 FROM org_creator_sessions LIMIT 1').first();}
  catch(error){
   if(!/no such table/i.test(String(error))||typeof db.exec!=='function')throw error;
   await db.exec(ORG_SCHEMA);
  }
  const creator=await creatorSession(db,request);
  if(route==='/api/v1/org/ceo-invite'&&verb==='POST'){
   if(!owner)return res({error:'owner_session_required_to_appoint_ceo'},403);
   const repo=clean(data.repo,60);
   if(!validRepo(repo))return res({error:'invalid_repository'},400);
   const ticket=secret();
   await db.prepare('INSERT INTO org_ceo_tickets(token_hash,repo,expires_at) VALUES(?,?,?)')
    .bind(await digest('CEO-INVITE:'+ticket),repo,new Date(Date.now()+86400000).toISOString()).run();
   return res({created:true,repo,
    invite_url:url.origin+'/?repo='+encodeURIComponent(repo)+'&ceo_ticket='+ticket,
    expires_in:'24h',single_use:true},201);
  }
  if(route==='/api/v1/org/ceo-activate'&&verb==='POST'){
   const ticket=data.ticket;
   if(typeof ticket!=='string'||!/^[0-9a-f]{64}$/.test(ticket))
    return res({error:'invalid_ceo_ticket'},400);
   const hash=await digest('CEO-INVITE:'+ticket),time=now();
   const row=await db.prepare('SELECT repo FROM org_ceo_tickets WHERE token_hash=? AND used_at IS NULL AND expires_at>?')
    .bind(hash,time).first();
   if(!row)return res({error:'ceo_ticket_used_or_expired'},403);
   const consumed=await db.prepare('UPDATE org_ceo_tickets SET used_at=? WHERE token_hash=? AND used_at IS NULL AND expires_at>?')
    .bind(time,hash,time).run();
   if(!consumed.meta?.changes)return res({error:'ceo_ticket_used_or_expired'},403);
   const token=secret();
   await db.prepare('INSERT INTO org_creator_sessions(id,token_hash,repo,expires_at) VALUES(?,?,?,?)')
    .bind(crypto.randomUUID(),await digest('CEO:'+token),row.repo,new Date(Date.now()+7*86400000).toISOString()).run();
   return res({activated:true,repo:row.repo,role:'CEO',
    note:'CEO can create a room without GitHub login; this cookie expires after 7 days.'},
    200,{'set-cookie':creatorCookieName+'='+token+'; Path=/; Max-Age=604800; Secure; HttpOnly; SameSite=Lax'});
  }
  if(route==='/api/v1/org/rooms'&&verb==='POST'){
   const repo=clean(data.repo,60),title=clean(data.title,120),mission=clean(data.mission,4000);
   if(!validRepo(repo)||title.length<3||title.length>120||!mission||mission.length>4000)
    return res({error:'invalid_workspace_details'},400);
   if(!owner&&!(agent?.role==='CEO'&&agent.repo===repo)&&creator?.repo!==repo)
    return res({error:'verified_owner_or_appointed_ceo_required',
     hint:'Activate the signed CEO appointment session first; a GitHub write token is not proof of CEO identity'},403);
   const roomId=crypto.randomUUID(),memberId=crypto.randomUUID(),ticket=secret(),
    actor=owner?'OWNER':creator?.repo===repo?'CEO:BOOTSTRAP:'+creator.id:'CEO:'+agent.slot+':'+agent.nonce;
   const slot=owner||creator?.repo===repo?'CEO':agent.slot;
   const hash=await digest(ticket);
   await db.batch([
    db.prepare('INSERT INTO org_rooms(id,repo,title,mission,created_by) VALUES(?,?,?,?,?)')
     .bind(roomId,repo,title,mission,actor),
    db.prepare('INSERT INTO org_members(id,room_id,slot,role,token_hash,expires_at) VALUES(?,?,?,?,?,?)')
     .bind(memberId,roomId,slot,'CEO',hash,expiration())
   ]);
   return res({created:true,room_id:roomId,repo,title,mission,
    note:'Organization created in D1, not in GitHub Issues',
    room_url:url.origin+'/?org='+roomId},201,{'set-cookie':cookie(ticket,30*86400)});
  }
  if(route==='/api/v1/org/join'&&verb==='POST'){
   if(!idOK(room)||typeof data.ticket!=='string'||!/^[0-9a-f]{64}$/.test(data.ticket))
    return res({error:'invalid_invite'},400);
   const row=await db.prepare(`SELECT m.slot,m.role,r.repo,r.status FROM org_members m
    JOIN org_rooms r ON r.id=m.room_id WHERE m.room_id=? AND m.token_hash=?
    AND m.revoked_at IS NULL AND m.expires_at>?`)
    .bind(room,await digest(data.ticket),now()).first();
   if(!row||row.status!=='ACTIVE')return res({error:'invite_invalid_expired_or_room_closed'},403);
   return res({joined:true,room_id:room,slot:row.slot,role:row.role,repo:row.repo},
    200,{'set-cookie':cookie(data.ticket,30*86400)});
  }
  if(route==='/api/v1/org/rooms'&&verb==='GET'){
   const repo=clean(url.searchParams.get('repo'),60);
   if(!validRepo(repo))return res({error:'invalid_repository'},400);
   // No global organization index: access is scoped to an authenticated owner/CEO
   // or the one D1 room held by the current browser membership cookie.
   let rows=[];
   if(owner){
    const out=await db.prepare('SELECT id,repo,title,mission,status,created_at FROM org_rooms WHERE repo=? ORDER BY created_at DESC LIMIT 50').bind(repo).all();
    rows=out.results||[];
   }else if((agent?.role==='CEO'&&agent.repo===repo)||creator?.repo===repo){
    const actor=creator?.repo===repo?'CEO:BOOTSTRAP:'+creator.id:'CEO:'+agent.slot+':'+agent.nonce;
    const out=await db.prepare('SELECT id,repo,title,mission,status,created_at FROM org_rooms WHERE repo=? AND created_by=? ORDER BY created_at DESC LIMIT 50')
     .bind(repo,actor).all();
    rows=out.results||[];
   }else{
    const all=await db.prepare('SELECT id,repo,title,mission,status,created_at FROM org_rooms WHERE repo=? ORDER BY created_at DESC LIMIT 50').bind(repo).all();
    for(const r of all.results||[]){if(await member(db,request,r.id))rows.push(r);}
   }
   return res({repo,rooms:rows});
  }
  if(!idOK(room))return res({error:'invalid_room_id'},400);
  const who=await member(db,request,room);
  if(!who)return res({error:'room_membership_required',hint:'Open your invitation link and join this organization'},403);
  if(route==='/api/v1/org/me'&&verb==='GET')return res({room_id:room,repo:who.repo,title:who.title,mission:who.mission,
   status:who.status,slot:who.slot,role:who.role,created_at:who.created_at});
  if(route==='/api/v1/org/members'&&verb==='GET'){
   const result=await db.prepare('SELECT slot,role,created_at,expires_at FROM org_members WHERE room_id=? AND revoked_at IS NULL ORDER BY created_at').bind(room).all();
   return res({room_id:room,members:result.results||[]});
  }
  if(route==='/api/v1/org/messages'&&verb==='GET'){
   const after=Number(url.searchParams.get('after')||0);
   if(!Number.isSafeInteger(after)||after<0||after>99999)return res({error:'invalid_cursor'},400);
   const result=await db.prepare('SELECT seq,sender_slot,recipient_slot,body,created_at FROM org_messages WHERE room_id=? AND seq>? ORDER BY seq ASC LIMIT 100').bind(room,after).all();
   return res({room_id:room,messages:(result.results||[]).map(x=>({...x,code:format('M',x.seq)})),
    next_after:(result.results||[]).at(-1)?.seq||after});
  }
  if(route==='/api/v1/org/tasks'&&verb==='GET'){
   const result=await db.prepare('SELECT seq,title,description,assignee_slot,created_by,status,created_at,updated_at FROM org_tasks WHERE room_id=? ORDER BY seq DESC LIMIT 100').bind(room).all();
   return res({room_id:room,tasks:(result.results||[]).map(x=>({...x,code:format('T',x.seq)}))});
  }
  if(who.status!=='ACTIVE')return res({error:'workspace_closed_read_only'},409);
  if(route==='/api/v1/org/messages'&&verb==='POST'){
   const to=clean(data.to,40).toUpperCase(),body=clean(data.body,4000);
   if(!slotOK(to)||!body||body.length>4000)return res({error:'invalid_message'},400);
   if(to!=='ALL'){
    const target=await db.prepare('SELECT slot FROM org_members WHERE room_id=? AND slot=? AND revoked_at IS NULL').bind(room,to).first();
    if(!target)return res({error:'unknown_recipient'},400);
   }
   const result=await nextMessage(db,room,who.slot,to,body);
   return result?res({sent:true,room_id:room,...result,code:format('M',result.seq)},201):res({error:'room_closed'},409);
  }
  if(route==='/api/v1/org/members'&&verb==='POST'){
   if(!adminRole(who))return res({error:'ceo_only_can_appoint'},403);
   const slot=clean(data.slot,40).toUpperCase(),role=clean(data.role,30).toUpperCase();
   if(!roles.includes(role)||!(role==='ENGINEER'?engineerSlot(slot):qaSlot(slot)))
    return res({error:'only_EN1_to_EN5_or_one_QA_allowed'},400);
   const roster=await db.prepare('SELECT slot,role FROM org_members WHERE room_id=? AND revoked_at IS NULL').bind(room).all();
   const members=roster.results||[];
   if(members.filter(m=>m.role==='ENGINEER').length>=5&&role==='ENGINEER')
    return res({error:'maximum_five_engineers'},409);
   if(members.some(m=>m.role==='QA-REVIEWER')&&role==='QA-REVIEWER')
    return res({error:'one_independent_qa_only'},409);
   if(members.length>=7)return res({error:'maximum_seven_agents'},409);
   if(members.some(m=>m.slot===slot))return res({error:'slot_already_assigned'},409);
   const ticket=secret();
   await db.prepare('INSERT INTO org_members(id,room_id,slot,role,token_hash,expires_at) VALUES(?,?,?,?,?,?)')
    .bind(crypto.randomUUID(),room,slot,role,await digest(ticket),expiration()).run();
   return res({invited:true,room_id:room,slot,role,
    invite_url:url.origin+'/?org='+encodeURIComponent(room)+'&join='+ticket,
    warning:'Invitation contains a secret. Share only with the intended AI chat; access expires in 30 days.'},201);
  }
  if(route==='/api/v1/org/tasks'&&verb==='POST'){
   if(who.role!=='CEO')return res({error:'ceo_only_can_assign_tasks'},403);
   const title=clean(data.title,200),description=clean(data.description||'',3000),
    to=clean(data.assignee_slot,40).toUpperCase();
   if(title.length<3||title.length>200||description.length>3000||!slotOK(to))return res({error:'invalid_task'},400);
   const target=await db.prepare('SELECT slot FROM org_members WHERE room_id=? AND slot=? AND revoked_at IS NULL').bind(room,to).first();
   if(!target)return res({error:'assignee_not_in_room'},400);
   const task=await nextTask(db,room,who.slot,to,title,description);
   return task?res({created:true,...task,code:format('T',task.seq)},201):res({error:'room_closed'},409);
  }
  if(route==='/api/v1/org/task-status'&&verb==='POST'){
   const seq=Number(data.seq),status=clean(data.status,30).toUpperCase();
   if(!Number.isSafeInteger(seq)||seq<1||seq>99999||!stateOK(status))return res({error:'invalid_task_status'},400);
   const task=await db.prepare('SELECT assignee_slot FROM org_tasks WHERE room_id=? AND seq=?').bind(room,seq).first();
   if(!task)return res({error:'task_not_found'},404);
   // Engineers submit to independent QA; only the QA role can accept/reject.
   // CEO may reopen/cancel but cannot approve own team's output.
   const allowed=(who.role==='CEO'&&['READY','IN_PROGRESS','WAITING_QA','CANCELLED'].includes(status))||
    (who.role==='ENGINEER'&&task.assignee_slot===who.slot&&['IN_PROGRESS','WAITING_QA'].includes(status))||
    (who.role==='QA-REVIEWER'&&['DONE','QA_HOLD'].includes(status));
   if(!allowed)return res({error:'independent_qa_gate',hint:'Only QA may mark DONE or QA_HOLD; CEO/EN cannot self-approve'},403);
   if(who.role==='QA-REVIEWER'){
    const state=await db.prepare('SELECT status FROM org_tasks WHERE room_id=? AND seq=?').bind(room,seq).first();
    if(state?.status!=='WAITING_QA'&&state?.status!=='QA_HOLD')return res({error:'task_not_ready_for_qa'},409);
    const evidence=clean(data.evidence,1000);
    if(evidence.length<12||evidence.length>1000)return res({error:'qa_evidence_required',hint:'Enter checked SHA, CI and test evidence (12-1000 characters)'},400);
    // Before approving, the reviewer records a room-auditable M message.
    const msg=await nextMessage(db,room,who.slot,'CEO',
      'QA '+format('T',seq)+' '+status+' · '+evidence);
    if(!msg)return res({error:'room_closed'},409);
   }
   await db.prepare(`UPDATE org_tasks SET status=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE room_id=? AND seq=?`).bind(status,room,seq).run();
   return res({updated:true,room_id:room,code:format('T',seq),status,verified_by:who.role==='QA-REVIEWER'?'QA':null});
  }
  if(route==='/api/v1/org/close'&&verb==='POST'){
   if(who.role!=='CEO')return res({error:'ceo_only'},403);
   await db.prepare(`UPDATE org_rooms SET status='CLOSED',closed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`).bind(room).run();
   return res({closed:true,room_id:room});
  }
  return res({error:'method_not_allowed_or_not_found'},405);
 }catch(error){
  // Never reflect secrets, SQL, or D1 internals to the browser.
  return res({error:'workspace_database_operation_failed',
   hint:'Check ORG_DB binding and migration; no GitHub Issue was created'},503);
 }
}
