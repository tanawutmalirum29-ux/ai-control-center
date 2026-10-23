// AI queue: status evidence only; never run an AI job or write to GitHub silently.
import {OWNER, FULL_REPOS} from './repositories.js';
(()=>{
 'use strict';
 const el=id=>document.getElementById(id);
 const current=()=>el('repo-select')?.value||'';
 const allowed=repo=>FULL_REPOS.includes(repo);
 let loaded='',tasks=[],nonce=0;
 const actions={READY:'เริ่มงาน',IN_PROGRESS:'ติดตามงานเดิม',WAITING_QA:'ส่งตรวจ QA',QA_BLOCK:'รายงานสิ่งที่บล็อก',PAUSED:'ตรวจเหตุผลที่พัก',UNCLASSIFIED:'ตรวจสถานะก่อน'};
 const colors={READY:'good',IN_PROGRESS:'wait',WAITING_QA:'wait',QA_BLOCK:'bad',PAUSED:'bad',UNCLASSIFIED:'wait'};
 function instruction(repo,task){
  const target=task?`Issue #${task.number}: ${task.title}\n${task.url}\nสถานะ: ${task.status} (${task.source})`:'ตรวจสถานะงานล่าสุด เลือกเฉพาะงาน READY ที่ยังไม่มีผู้รับผิดชอบและไม่ซ้ำ';
  const rule=task?.status==='READY'?'ตรวจว่ามีผู้รับงานแล้วหรือไม่ก่อนลงมือ':task?.status==='IN_PROGRESS'?'ติดตามผู้รับงานเดิม ห้ามเริ่มซ้ำ':task?.status==='WAITING_QA'?'ตรวจหลักฐาน QA ห้าม Merge หากยังไม่ผ่าน':task?.status==='QA_BLOCK'?'รายงานจุด Block ห้าม Merge':task?.status==='PAUSED'?'ห้ามเริ่มงานจนกว่าจะปลดพัก':'ไม่ทราบสถานะที่ยืนยันได้ ต้องตรวจ Issue ก่อนเริ่ม';
  return ['AI CONTROL CENTER / MN','Repository: https://github.com/'+repo,target,rule,
   'อ่านกฎล่าสุดที่ https://github.com/'+OWNER+'/ai-organization-hub/blob/main/RULES.md และ COMMANDS.md ก่อนเริ่ม',
   'ORG_WORKSPACE_REPO: https://github.com/'+OWNER+'/ai-organization-hub',
   'STAGING_REPO: https://github.com/'+OWNER+'/Staging_area',
   'ตรวจ PROJECT_REPO/main SHA, AP-ROLE, REPORTS_TO, EDITABLE_PATHS, BASE_SHA ก่อนทำงาน',
   'ใช้ Control Center เป็นตัวกลาง หากการกระทำไม่รองรับให้รายงาน ไม่ข้ามสิทธิ์',
   'รายงาน MN/MQ/TR/C สั้นตามกฎองค์กร','ต้องมี QA ตรงกับ PR และ head SHA ก่อน Merge','ห้ามลบ Repository หรือข้าม QA โดยไม่ได้รับอนุมัติ'].join('\n');
 }
 async function copy(s){
  try{await navigator.clipboard.writeText(s);el('agent-notice').textContent='คัดลอกแล้ว — วางใน ChatGPT ที่เชื่อม GitHub';}
  catch{el('agent-notice').textContent='คัดลอกไม่สำเร็จ กรุณาอนุญาต Clipboard';}
 }
 function render(repo){
  const panel=el('agent-items');panel.replaceChildren();
  if(!tasks.length){const p=document.createElement('p');p.className='empty';p.textContent='ยังไม่มี Issue เปิดอยู่';panel.append(p);return;}
  for(const task of tasks){
   const row=document.createElement('div');row.className='agent-task';
   const info=document.createElement('div');info.className='agent-task-info';
   const title=document.createElement('a');title.textContent='#'+task.number+' · '+task.title;title.href=task.url;title.target='_blank';title.rel='noopener noreferrer';
   const tag=document.createElement('span');tag.className='status-tag '+(colors[task.status]||'wait');tag.textContent=task.status;
   tag.title=task.source==='label'?'จาก GitHub Label':'ไม่พบ Label ระบุสถานะ';
   const small=document.createElement('small');small.textContent=task.role+' · '+(task.source==='label'?'Label ยืนยัน':'ยังไม่ยืนยันสถานะ')+' · '+new Date(task.updated_at).toLocaleDateString('th-TH');
   const b=document.createElement('button');b.type='button';b.className='secondary-button';b.textContent=actions[task.status]||'ตรวจงาน';b.addEventListener('click',()=>copy(instruction(repo,task)));
   const via=document.createElement('button');via.type='button';via.className='secondary-button';via.textContent='ทำงานในเว็บ';via.addEventListener('click',()=>{document.querySelector('.navigation [data-view="workspace"]')?.click();document.getElementById('ws-title').value='Issue #'+task.number+' '+task.title;document.getElementById('ws-pr-title').value='Issue #'+task.number+' '+task.title;document.getElementById('ws-pr-body').value='Related issue: #'+task.number+'\n'+task.url+'\nStatus: '+task.status;});info.append(title,tag,small);row.append(info,b,via);panel.append(row);
  }
 }
 function remember(key,payload){try{localStorage.setItem(key,JSON.stringify({at:Date.now(),payload}));}catch{}}
 function recall(key){try{const d=JSON.parse(localStorage.getItem(key));return Date.now()-d.at<3600000?d.payload:null;}catch{return null;}}
 async function refresh(){
  const repo=current();const id=++nonce;loaded=repo;tasks=[];el('agent-items').replaceChildren();
  if(!allowed(repo)){el('agent-state').textContent='Repository นี้ไม่ได้เปิดใน Bridge';return;}
  el('agent-state').textContent='กำลังโหลดงาน...';
  let data;
  const key='acc.queue.'+repo;
  try{
   const response=await fetch('/api/v1/queue?repo='+encodeURIComponent(repo.split('/')[1]),{headers:{Accept:'application/json'}});
   data=await response.json();
   if(!response.ok)throw new Error(data.reason||data.error||'API unavailable');
   if(data.repo!==repo||!Array.isArray(data.tasks))throw Error('Invalid queue');
   if(!data.stale)remember(key,data);
  }catch(error){
   data=recall(key);
   if(!data){if(id!==nonce)return;el('agent-state').textContent='โหลดไม่สำเร็จ: '+(error.message||'GitHub API')+' · ไม่มีข้อมูลสำรอง';return;}
   data={...data,stale:true,warning:error.message};
  }
  if(id!==nonce||repo!==current())return;
  tasks=data.tasks.filter(t=>Number.isSafeInteger(t.number)&&t.number>0&&Number.isFinite(Date.parse(t.updated_at)));
  const stale=data.stale?' · ข้อมูลสำรอง (อาจไม่ล่าสุด)'+(data.warning?' · '+data.warning:''):'';
  el('agent-state').textContent='งาน '+tasks.length+' รายการ'+(data.truncated?' (สูงสุด 100)':'')+stale;
  render(repo);
 }
 function setup(){
  const nav=document.querySelector('.navigation [data-view="agents"]');if(!nav)return;
  nav.addEventListener('click',()=>{if(loaded!==current()||!tasks.length)refresh();});
  el('repo-select').addEventListener('change',()=>{loaded='';tasks=[];if(!el('view-agents').classList.contains('hidden'))refresh();});
  el('agent-refresh').addEventListener('click',refresh);
  el('agent-copy-all').addEventListener('click',()=>{if(allowed(current()))copy(instruction(current(),null));});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();
