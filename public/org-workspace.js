// CEO organization workspaces. Messages/tasks are stored in D1, not GitHub Issues.
// OWNER forwards MN invitations between independent ChatGPT chats manually.
import {FULL_REPOS} from './repositories.js';
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const repo=()=>$('repo-select').value.split('/')[1];
 const status=(msg)=>{$('orgw-status').textContent=msg;};
 let roomId=null,identity=null,lastSeq=0,loading=false;
 const make=(tag,text,cls)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=String(text);if(cls)x.className=cls;return x;};
 async function api(path,method='GET',body){
  const r=await fetch('/api/v1/org/'+path,{
   method,credentials:'same-origin',cache:'no-store',
   ...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})
  });
  const d=await r.json().catch(()=>({error:'invalid_json_response'}));
  if(!r.ok)throw Error([d.error,d.hint].filter(Boolean).join(' · '));
  return d;
 }
 async function busy(button,fn){
  if(button)button.disabled=true;
  try{await fn();}
  catch(e){status('ไม่สำเร็จ: '+e.message);}
  finally{if(button)button.disabled=false;}
 }
 const formValue=id=>$(id).value.trim();
 function reset(){
  roomId=null;identity=null;lastSeq=0;
  $('orgw-summary').textContent='ยังไม่เลือกพื้นที่องค์กร';
  for(const id of ['orgw-messages','orgw-tasks','orgw-members'])$(id).replaceChildren();
  $('orgw-current').hidden=true;
  $('orgw-access').hidden=true;
 }
 function roomSummary(d){
  $('orgw-summary').textContent=d.title+' · '+d.repo+' · '+d.status+' · '+d.role+' / '+d.slot+
   ' · ห้อง '+d.room_id;
 }
 async function loadRooms(){
  const d=await api('rooms?repo='+encodeURIComponent(repo()));
  const list=$('orgw-room-list');list.replaceChildren();
  if(!d.rooms?.length){list.append(make('p','ยังไม่มีห้องที่บัญชี/แชทนี้เข้าถึงได้','small-note'));return;}
  for(const room of d.rooms){
   const row=make('div',undefined,'ceo-task');
   const text=make('div',undefined,'ceo-task-main');
   text.append(make('strong',room.title),make('small',room.status+' · '+room.created_at+' · '+room.id,'ceo-meta'));
   const b=make('button','เปิดห้อง','secondary-button');b.type='button';
   b.addEventListener('click',()=>busy(b,()=>enter(room.id)));
   row.append(text,b);list.append(row);
  }
 }
 async function enter(id){
  if(!/^[a-f0-9-]{36}$/i.test(id))throw Error('รหัสห้องไม่ถูกต้อง');
  const d=await api('me?room_id='+encodeURIComponent(id));
  if(d.repo!==repo())throw Error('โปรเจกต์ที่เลือกไม่ตรงกับห้อง · เลือก '+d.repo+' ก่อน');
  roomId=id;identity=d;lastSeq=0;
  $('orgw-current').hidden=false;$('orgw-access').hidden=false;
  roomSummary(d);
  $('orgw-link').value=location.origin+'/?repo='+encodeURIComponent(d.repo)+'&org='+id;
  $('orgw-share-repo').textContent='ห้องนี้แยกจากองค์กรอื่น ไม่มี Issue ใหม่ และการส่ง M ไม่เรียก AI อัตโนมัติ';
  $('orgw-create').hidden=d.role!=='CEO';
  $('orgw-close').disabled=d.role!=='CEO'||d.status!=='ACTIVE';
  $('orgw-invite').disabled=d.role!=='CEO'||d.status!=='ACTIVE';
  $('orgw-task-form').hidden=d.role!=='CEO'||d.status!=='ACTIVE';
  $('orgw-message-form').hidden=d.status!=='ACTIVE';
  history.replaceState(null,'','/?repo='+encodeURIComponent(d.repo)+'&org='+id);
  await Promise.all([loadMembers(),loadMessages(),loadTasks()]);
  status('เปิดพื้นที่องค์กรแล้ว · '+d.title+' · '+d.slot+' · ข้อความขึ้นต้น M00001 เฉพาะห้องนี้');
 }
 async function loadMembers(){
  const d=await api('members?room_id='+roomId);
  const root=$('orgw-members');root.replaceChildren();
  const members=d.members||[];
  for(const m of members)root.append(make('div',m.slot+' · '+m.role,'orgw-item'));
  const enCount=members.filter(m=>m.role==='ENGINEER').length;
  const qaCount=members.filter(m=>m.role==='QA-REVIEWER').length;
  $('orgw-roster-summary').textContent='CEO 1 · EN '+enCount+'/5 · QA '+qaCount+'/1 · CEO เลือกใช้ EN 1–5 ตัวตามขนาดงาน';
  $('orgw-invite').disabled=identity?.role!=='CEO'||identity?.status!=='ACTIVE'||(enCount===5&&qaCount===1);
 }
 async function loadMessages(){
  lastSeq=0;
  $('orgw-messages').replaceChildren();
  await moreMessages();
 }
 async function moreMessages(){
  const d=await api('messages?room_id='+roomId+'&after='+lastSeq);
  const root=$('orgw-messages');
  for(const m of d.messages||[]){
   const node=make('article',undefined,'orgw-item');
   const meta=make('strong',m.code+' · '+m.sender_slot+' → '+m.recipient_slot);
   node.append(meta,make('p',m.body),make('small',m.created_at,'small-note'));
   root.append(node);
  }
  lastSeq=d.next_after||lastSeq;
  $('orgw-more').disabled=!d.messages?.length||d.messages.length<100;
  if(!root.childNodes.length)root.append(make('p','ยังไม่มีข้อความในองค์กรนี้','small-note'));
 }
 async function loadTasks(){
  const d=await api('tasks?room_id='+roomId);
  const root=$('orgw-tasks');root.replaceChildren();
  for(const t of d.tasks||[]){
   const card=make('article',undefined,'orgw-item');
   card.append(make('strong',t.code+' '+t.title),make('small','ผู้รับ '+t.assignee_slot+' · '+t.status,'small-note'));
   if(t.description)card.append(make('p',t.description));
   if(identity?.role==='CEO'||identity?.role==='QA-REVIEWER'||
    (identity?.role==='ENGINEER'&&identity?.slot===t.assignee_slot)){
    const choices=make('select');choices.setAttribute('aria-label','สถานะงาน '+t.code);
    const selectable=identity?.role==='QA-REVIEWER'?['DONE','QA_HOLD']:
     identity?.role==='CEO'?['READY','IN_PROGRESS','WAITING_QA','CANCELLED']:['IN_PROGRESS','WAITING_QA'];
    for(const state of selectable){
     const option=make('option',state);option.value=state;option.selected=state===t.status;choices.append(option);
    }
    const save=make('button','บันทึกสถานะ','secondary-button');save.type='button';
    save.addEventListener('click',()=>busy(save,async()=>{
     const evidence=identity?.role==='QA-REVIEWER'?prompt('QA อิสระ: ใส่หลักฐานการตรวจ CI, SHA และผลทดสอบก่อนอนุมัติ/ปฏิเสธ'):'';
     if(identity?.role==='QA-REVIEWER'&&(!evidence||evidence.trim().length<12)){
      status('QA ต้องระบุหลักฐานอย่างน้อย 12 ตัวอักษรก่อนตัดสิน');return;
     }
     await api('task-status','POST',{room_id:roomId,seq:t.seq,status:choices.value,evidence});
     await loadTasks();
     status(t.code+' เปลี่ยนเป็น '+choices.value);
    }));
    const actions=make('div',undefined,'workspace-control');actions.append(choices,save);card.append(actions);
   }
   root.append(card);
  }
  if(!d.tasks?.length)root.append(make('p','ยังไม่มีงานในห้องนี้','small-note'));
 }
 async function createRoom(e){
  e.preventDefault();
  const btn=$('orgw-create-btn');
  await busy(btn,async()=>{
   const room=await api('rooms','POST',{repo:repo(),title:formValue('orgw-title'),mission:formValue('orgw-mission')});
   await loadRooms();await enter(room.room_id);
   status('สร้างพื้นที่องค์กร '+room.title+' สำเร็จ · ห้องนี้ไม่ใช้ GitHub Issues');
  });
 }
 async function invite(e){
  e.preventDefault();
  const btn=$('orgw-invite');
  await busy(btn,async()=>{
   const slot=formValue('orgw-slot').toUpperCase();
   const role=slot==='QA'?'QA-REVIEWER':'ENGINEER';
   const d=await api('members','POST',{room_id:roomId,slot,role});
   $('orgw-invite-url').value=d.invite_url;
   await loadMembers();
   status('CEO แต่งตั้ง '+d.slot+' แล้ว · ส่งลิงก์เฉพาะตำแหน่งให้ OWNER ส่ง MN ต่อแชทนั้น');
  });
 }
 async function message(e){
  e.preventDefault();const btn=$('orgw-send');
  await busy(btn,async()=>{
   const d=await api('messages','POST',{room_id:roomId,to:formValue('orgw-to').toUpperCase(),
    body:formValue('orgw-message')});
   $('orgw-message').value='';
   await loadMessages();
   status('บันทึก '+d.code+' สำเร็จ · '+d.sender_slot+' → '+d.recipient_slot+' · ไม่สร้าง GitHub Issue');
  });
 }
 async function task(e){
  e.preventDefault();const btn=$('orgw-task-send');
  await busy(btn,async()=>{
   const d=await api('tasks','POST',{room_id:roomId,title:formValue('orgw-task-title'),
    description:formValue('orgw-task-body'),assignee_slot:formValue('orgw-task-to').toUpperCase()});
   $('orgw-task-title').value='';$('orgw-task-body').value='';
   await loadTasks();status('สร้างงาน '+d.code+' สำเร็จ · ผู้รับ '+d.assignee_slot);
  });
 }
 async function activateCEO(){
  const params=new URLSearchParams(location.search),ticket=params.get('ceo_ticket');
  if(!ticket)return;
  const activeRepo=params.get('repo');
  history.replaceState(null,'','/?repo='+encodeURIComponent(activeRepo||repo()));
  const d=await api('ceo-activate','POST',{ticket});
  if(d.repo!==repo())throw Error('CEO activation completed; select repository '+d.repo);
  status('CEO activation successful: create a new organization room (no GitHub login needed)');
 }
 async function initializeDb(e){
  e.preventDefault();
  await busy($('orgw-setup-btn'),async()=>{
   const result=await api('setup','POST',{});
   if(!result.initialized)throw Error('D1 ไม่ยืนยันการสร้างตาราง');
   status('ฐานข้อมูล D1 พร้อมแล้ว · OWNER สามารถสร้างลิงก์แต่งตั้ง CEO ได้');
   await loadRooms();
  });
 }
 async function createCEOInvite(e){
  e.preventDefault();
  await busy($('orgw-owner-invite-btn'),async()=>{
   const result=await api('ceo-invite','POST',{repo:repo()});
   $('orgw-owner-invite-url').value=result.invite_url;
   status('OWNER สร้างลิงก์แต่งตั้ง CEO แล้ว · ส่งลิงก์ให้ CEO แชทใหม่โดยตรง (ใช้ได้ครั้งเดียว/24 ชั่วโมง)');
  });
 }
 async function joinFromLink(){
  const p=new URLSearchParams(location.search),ticket=p.get('join'),room=p.get('org');
  if(!ticket||!room)return;
  // Remove capability from address bar immediately, before any other navigation.
  history.replaceState(null,'','/?repo='+encodeURIComponent(repo())+'&org='+encodeURIComponent(room));
  const joined=await api('join','POST',{room_id:room,ticket});
  status('เปิดลิงก์รับตำแหน่ง '+joined.slot+' สำเร็จ');
  await enter(room);
 }
 async function initRoom(){
  if(loading)return;loading=true;
  try{
   await activateCEO();
   await joinFromLink();
   await loadRooms();
   const p=new URLSearchParams(location.search),requested=p.get('org');
   if(requested&&!roomId)await enter(requested);
  }catch(e){status('ยังเข้าองค์กรไม่ได้: '+e.message);}
  finally{loading=false;}
 }
 function setup(){
  $('orgw-create-form').addEventListener('submit',createRoom);
  $('orgw-owner-invite-form').addEventListener('submit',createCEOInvite);
  $('orgw-setup-form').addEventListener('submit',initializeDb);
  $('orgw-invite-form').addEventListener('submit',invite);
  $('orgw-message-form').addEventListener('submit',message);
  $('orgw-task-form').addEventListener('submit',task);
  $('orgw-refresh').addEventListener('click',()=>busy($('orgw-refresh'),initRoom));
  $('orgw-more').addEventListener('click',()=>busy($('orgw-more'),moreMessages));
  $('orgw-close').addEventListener('click',()=>busy($('orgw-close'),async()=>{
   if(!confirm('ปิดห้องนี้เป็นอ่านอย่างเดียว โดยไม่ลบประวัติข้อความ?'))return;
   await api('close','POST',{room_id:roomId});await enter(roomId);
  }));
  $('repo-select').addEventListener('change',()=>{reset();initRoom();});
  document.querySelector('[data-view="orgrooms"]')?.addEventListener('click',initRoom);
  initRoom();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();
