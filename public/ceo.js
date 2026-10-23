// CEO-first Mission Console: GitHub issues are the work records; OWNER relays one line.
// This page does not claim to instantiate or identify independent AI sessions.
import {OWNER,FULL_REPOS} from './repositories.js';
(()=>{
'use strict';
const e=id=>document.getElementById(id);
const currentRepo=()=>e('repo-select').value.split('/')[1];
const org='https://github.com/'+OWNER+'/ai-organization-hub';
const base='https://github.com/'+OWNER+'/';
let tasks=[],prs=[],rights=false,nonce=0,selectedTask=null,loading=false;
const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
const message=(id,msg)=>{e(id).textContent=msg;};
function link(label,url){
 const a=el('a','ceo-link',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;
}
function setView(name){document.querySelector('.navigation [data-view="'+name+'"]')?.click();}
function taskUrl(task){return '/?repo='+encodeURIComponent(currentRepo())+'&issue='+task.number;}
function copyRelay(task){
 const code=(task.agent_slot||task.role)+': '+(task.status==='APPOINTED'?'AP-ROLE':'MN')+' #'+task.number+' '+new URL(taskUrl(task),location.origin).href;
 message('relay-copy',code);
 e('relay-text').value=code;
 try{navigator.clipboard.writeText(code).then(()=>message('relay-state','คัดลอก 1 บรรทัดแล้ว · ส่งเข้าแชทผู้รับโดยตรง')).catch(()=>{e('relay-text').focus();e('relay-text').select();message('relay-state','เลือกข้อความแล้ว · คัดลอกได้จากช่องข้อความ');});}
 catch{e('relay-text').focus();e('relay-text').select();}
}
function workOn(task){
 selectedTask=task;
 e('work-current').textContent='งาน #'+task.number+' · '+task.title;
 e('work-metadata').textContent=(task.agent_slot||task.role)+' · '+task.status+
   ' · รายงานต่อ '+(task.reports_to||'ไม่ระบุ')+' · ขอบเขตไฟล์ '+(task.editable_paths||'ยังไม่กำหนด');
 e('work-source').replaceChildren(link('อ่าน Issue #'+task.number+' ภายในเว็บ',taskUrl(task)));
 e('relay-text').value=(task.agent_slot||task.role)+': MN #'+task.number+' '+new URL(taskUrl(task),location.origin).href;
}
function renderCounts(counts,stale){
 e('ceo-total').textContent=counts.open_tasks;
 e('ceo-relay-count').textContent=counts.awaiting_relay;
 e('ceo-qa-count').textContent=counts.blocked;
 e('ceo-pr-count').textContent=counts.open_prs;
 message('ceo-source','ข้อมูลจาก GitHub '+(stale?'(แคชสำรอง อาจล้าสมัย)':'(อ่านสาธารณะได้)')+' · Repo '+currentRepo());
}
function taskItem(task,mode){
 const row=el('div','ceo-task');
 const left=el('div','ceo-task-main');
 const title=el('div','ceo-task-title');title.append(link('#'+task.number+' '+task.title,taskUrl(task)));
 const status=el('span','ceo-state',task.status);title.append(status);
 const meta=el('small','ceo-meta',(task.agent_slot||task.role)+' · '+(task.reports_to||'ไม่มีสายรายงาน')+
   ' · '+(task.parent_issue||'ภารกิจหลัก')+' · '+(task.editable_paths||'ไฟล์ยังไม่ระบุ'));
 left.append(title,meta);
 const actions=el('div','ceo-actions');
 const b=el('button','secondary-button',mode==='relay'?'คัดลอก AP-ROLE/MN':'ดูงาน');b.type='button';
 b.addEventListener('click',()=>{workOn(task);if(mode==='relay')copyRelay(task);else setView('mywork');});
 actions.append(b);
 if(mode==='mywork'){
  const open=el('button','secondary-button','เปิดพื้นที่แก้โค้ด');open.type='button';
  open.addEventListener('click',()=>{
   workOn(task);
   setView('workspace');
   e('ws-title').value='Issue #'+task.number+' '+task.title;
   e('ws-pr-title').value='Issue #'+task.number+' '+task.title;
   e('ws-pr-body').value='Related issue: #'+task.number+'\n'+taskUrl(task)+
    '\nEDITABLE_PATHS: '+(task.editable_paths||'NOT_SPECIFIED')+
    '\nReviewer must verify PR HEAD_SHA and Browser QA.';
  });
  actions.append(open);
 }
 row.append(left,actions);return row;
}
function renderTaskLists(){
 const people=e('ceo-task-list'),relay=e('relay-list'),mine=e('mywork-list');
 people.replaceChildren();relay.replaceChildren();mine.replaceChildren();
 const select=e('mywork-role').value.toUpperCase();
 const sorted=tasks.filter(t=>t.relay);
 if(!tasks.length)people.append(el('p','small-note','ไม่มี Issue เปิดอยู่ในโปรเจกต์นี้'));
 for(const task of tasks)people.append(taskItem(task,'ceo'));
 const waiting=sorted.filter(t=>t.status==='APPOINTED');
 if(!waiting.length)relay.append(el('p','small-note','ไม่มี AP-ROLE ที่รอ OWNER ส่งข้อความตามสถานะ Issue ปัจจุบัน'));
 for(const t of waiting)relay.append(taskItem(t,'relay'));
 const matching=tasks.filter(t=>select==='ALL'||(t.agent_slot||t.role).toUpperCase().includes(select)||t.role.toUpperCase().includes(select));
 if(!matching.length)mine.append(el('p','small-note','ไม่พบงานของบทบาทที่เลือก'));
 for(const t of matching)mine.append(taskItem(t,'mywork'));
 // Populate parent-mission options from active CEO/Project Lead assignments.
 const parent=e('ceo-parent'),keep=parent.value;parent.replaceChildren(new Option('เลือก CEO / Project Lead ภารกิจหลัก',''));
 for(const t of tasks.filter(t=>['CEO','PROJECT-LEAD'].includes(t.role))){
  parent.add(new Option('#'+t.number+' '+t.title,t.number));
 }
 if(keep)parent.value=keep;
}
function renderPRs(){
 const area=e('ceo-pr-list');area.replaceChildren();
 if(!prs.length){area.append(el('p','small-note','ไม่มี PR เปิดอยู่'));return;}
 for(const pr of prs){
  const row=el('div','ceo-task');const content=el('div','ceo-task-main');
  const heading=el('div','ceo-task-title');heading.append(link('#'+pr.number+' '+pr.title,'/?repo='+encodeURIComponent(currentRepo())+'&pr='+pr.number));
  heading.append(el('span','ceo-state',pr.draft?'DRAFT':'OPEN'));
  content.append(heading,el('small','ceo-meta','HEAD: '+(pr.head_sha||'UNKNOWN')+' · QA: ยังไม่ตรวจแยก PR'));
  const check=el('button','secondary-button','ตรวจ SHA / QA');check.type='button';
  check.addEventListener('click',async()=>{
   check.disabled=true;check.textContent='กำลังตรวจ QA...';
   try{
    const res=await fetch('/api/v1/pr-qa?repo='+encodeURIComponent(currentRepo())+'&pr='+pr.number,{cache:'no-store'});
    const data=await res.json();if(!res.ok)throw Error(data.reason||data.error);
    const current=data.head_sha===pr.head_sha;
    message('ceo-qa-status','PR #'+pr.number+' · HEAD '+data.head_sha+' · CI '+data.checks_state+
     ' · QA '+data.gate+(current?'':' · SHA เปลี่ยนแล้ว!')+' · Merge safe: NO (ต้องตรวจ QA อิสระ)');
   }catch(err){message('ceo-qa-status','ตรวจ QA ไม่สำเร็จ: '+err.message)}
   finally{check.disabled=false;check.textContent='ตรวจ SHA / QA';}
  });
  row.append(content,check);area.append(row);
 }
}
async function whoCanWrite(){
 try{
  const [o,a]=await Promise.all([
   fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'}).then(r=>r.json()),
   fetch('/api/agent/me',{credentials:'same-origin',cache:'no-store'}).then(r=>r.json())
  ]);
  rights=Boolean(o.authenticated||(a.agent_authenticated&&a.agent_repo===currentRepo()&&['CEO','PROJECT-LEAD'].includes(a.agent_role)));
  e('ceo-submit').disabled=!rights;
  message('ceo-write-state',o.authenticated?'เซสชันเจ้าของ: สร้าง Issue ได้ตามสิทธิ์ GitHub App':
    rights?'เซสชัน AI ที่ได้รับสิทธิ์โปรเจกต์นี้: สร้าง Issue ได้':
    'โหมดอ่านข้อมูล · การสร้าง Issue ต้องมีเซสชันที่ GitHub App อนุญาต');
 }catch{
  rights=false;e('ceo-submit').disabled=true;
  message('ceo-write-state','ไม่สามารถตรวจสิทธิ์การเขียนได้ · ยังเปิดอ่านงานได้');
 }
}
async function load(){
 const id=++nonce;
 if(!FULL_REPOS.includes(e('repo-select').value)){message('ceo-source','Repository ไม่อยู่ในรายการที่เว็บรองรับ');return}
 message('ceo-source','กำลังอ่านโปรเจกต์ '+currentRepo()+' ...');
 try{
  const [response]=await Promise.all([fetch('/api/v1/mission?repo='+encodeURIComponent(currentRepo()),{cache:'no-store'}),whoCanWrite()]);
  const d=await response.json();if(!response.ok)throw Error(d.reason||d.error);
  if(id!==nonce)return;
  tasks=d.tasks||[];prs=d.prs||[];
  renderCounts(d.counts,d.stale);
  renderTaskLists();renderPRs();
  if(d.truncated)message('ceo-board-warning','ข้อมูล GitHub เกิน 100 รายการ ต้องดูส่วนที่เหลือใน GitHub ด้วย');
  else message('ceo-board-warning',d.stale?'ใช้แคชสำรอง · หลีกเลี่ยงการมอบหมายซ้ำ':'รายการอ่านจาก GitHub · การแต่งตั้ง AI จริงต้องส่งข้อความเข้าตัว AI');
 }catch(err){if(id!==nonce)return;message('ceo-source','โหลดงานไม่ได้: '+err.message);}
}
async function createIssue(event){
 event.preventDefault();
 if(!rights){message('ceo-create-state','ไม่มีสิทธิ์เขียน · อ่านคิวงานและคัดลอก Relay ได้');return;}
 const role=e('ceo-role').value,lead=['CEO','PROJECT-LEAD'].includes(role);
 const title=e('ceo-title').value.trim(),parent=e('ceo-parent').value,slot=e('ceo-slot').value.trim().toUpperCase();
 if(!lead&&!parent){message('ceo-create-state','ต้องเลือกภารกิจหลักของ CEO ก่อนแต่งตั้ง Engineer/QA');return}
 if(title.length<3||!slot){message('ceo-create-state','กรอกหัวข้องานและรหัสผู้รับงาน');return}
 if(!lead&&tasks.filter(t=>t.parent_issue==='#'+parent&&t.status!=='PAUSED').length>=9){
  message('ceo-create-state','ภารกิจนี้มี AI ใกล้ถึง/เกิน 10 แล้ว ต้องตรวจจำนวนผู้ปฏิบัติงานก่อน');return;
 }
 const btn=e('ceo-submit');btn.disabled=true;message('ceo-create-state','กำลังสร้างงานจริงใน GitHub ...');
 try{
  const payload={repo:currentRepo(),role,title,agent_slot:slot,parent_issue:parent||null,
   reports_to:lead?'OWNER':'PROJECT-LEAD #'+parent,
   scope:e('ceo-scope').value.trim(),editable_paths:e('ceo-paths').value.trim(),
   acceptance:e('ceo-acceptance').value.trim()};
  const r=await fetch('/api/v1/ops/issue',{method:'POST',credentials:'same-origin',
   headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
  const data=await r.json();if(!r.ok)throw Error(data.hint||data.error);
  const relay=(slot||role)+': AP-ROLE #'+data.issue.number+' '+location.origin+'/?repo='+encodeURIComponent(currentRepo())+'&issue='+data.issue.number;
  e('relay-text').value=relay;message('ceo-create-state','สร้าง Issue #'+data.issue.number+' แล้ว · ส่งข้อความนี้ให้ AI ผู้รับ: '+relay);
  e('ceo-title').value='';await load();setView('relay');
  message('relay-copy',relay);
 }catch(err){message('ceo-create-state','สร้างไม่สำเร็จ: '+err.message+' · ตรวจ GitHub ว่าเกิด Issue แล้วหรือยังก่อนลองซ้ำ')}
 finally{btn.disabled=!rights;}
}
function init(){
 for(const name of ['ceo','mywork','relay'])
  document.querySelector('.navigation [data-view="'+name+'"]')?.addEventListener('click',load);
 e('ceo-refresh').addEventListener('click',load);
 e('repo-select').addEventListener('change',()=>{if(['view-ceo','view-mywork','view-relay'].some(id=>!e(id).classList.contains('hidden')))load()});
 e('mywork-role').addEventListener('change',renderTaskLists);
 e('ceo-role').addEventListener('change',()=>{
  const lead=['CEO','PROJECT-LEAD'].includes(e('ceo-role').value);
  e('ceo-parent').disabled=lead;
  message('ceo-parent-note',lead?'แต่งตั้ง CEO/Lead ต้นทาง · รายงานต่อ OWNER':'เลือก Issue ของ CEO ที่มอบหมายงาน');
 });
 e('ceo-appointment-form').addEventListener('submit',createIssue);
 e('relay-copy-current').addEventListener('click',async()=>{
  const value=e('relay-text').value.trim();if(!value){message('relay-state','เลือกงานในรายการก่อน');return;}
  try{await navigator.clipboard.writeText(value);message('relay-state','คัดลอก 1 บรรทัดแล้ว ส่งไปยัง ChatGPT ของผู้รับ')}
  catch{e('relay-text').select();message('relay-state','เลือกข้อความแล้ว ใช้คำสั่ง Copy บนอุปกรณ์นี้');}
 });
 e('mywork-to-queue').addEventListener('click',()=>setView('agents'));
 e('ceo-to-organization').addEventListener('click',()=>setView('organization'));
 e('ceo-role').dispatchEvent(new Event('change'));
 load();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();