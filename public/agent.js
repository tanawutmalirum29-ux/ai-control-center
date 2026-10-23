// AI task queue using public read-only bridge; no secrets, no automated AI execution.
(()=>{
'use strict';
const el=id=>document.getElementById(id);
const current=()=>el('repo-select')?.value||'';
const allowed=repo=>/^tanawutmalirum29-ux\/[A-Za-z0-9_.-]+$/.test(repo);
let loaded='',tasks=[],nonce=0;
function instruction(repo,t){
 const info=t?'Issue #'+t.number+': '+t.title+'\n'+t.url:'ตรวจรายการงานค้างและเลือกสิ่งที่ต้องดำเนินการ';
 return ['AI CONTROL CENTER / MN','Repository: https://github.com/'+repo,info,'','ดำเนินงานด้วย GitHub Connector ที่ได้รับสิทธิ์ ตรวจงานซ้ำก่อนแก้','รายงาน MN/MQ/TR/C ให้สั้นตามกฎองค์กร','ต้องมีหลักฐาน QA ก่อน Merge เข้า main','ห้ามลบ Repository/Branch/Issue หรือข้าม QA โดยไม่มีการอนุมัติ'].join('\n');
}
async function copy(text){
 try{await navigator.clipboard.writeText(text);el('agent-notice').textContent='คัดลอกแล้ว — วางในแชท GPT ที่เชื่อม GitHub';}
 catch(_){el('agent-notice').textContent='ไม่สามารถคัดลอกได้ โปรดอนุญาต Clipboard';}
}
function render(repo){
 const panel=el('agent-items');panel.replaceChildren();
 if(!tasks.length){const p=document.createElement('p');p.className='empty';p.textContent='ไม่มี Issue เปิดอยู่ในรายการล่าสุด';panel.append(p);return;}
 for(const task of tasks){
  const row=document.createElement('div');row.className='agent-task';
  const info=document.createElement('div');info.className='agent-task-info';
  const a=document.createElement('a');a.textContent='#'+task.number+' · '+task.title;a.href=task.url;a.target='_blank';a.rel='noopener noreferrer';
  const small=document.createElement('small');small.textContent=task.role+' · '+new Date(task.updated_at).toLocaleDateString('th-TH');
  const btn=document.createElement('button');btn.type='button';btn.className='secondary-button';btn.textContent='คัดลอก MN';btn.addEventListener('click',()=>copy(instruction(repo,task)));
  info.append(a,small);row.append(info,btn);panel.append(row);
 }
}
async function refresh(){
 const repo=current();const id=++nonce;loaded=repo;tasks=[];el('agent-items').replaceChildren();
 if(!allowed(repo)){el('agent-state').textContent='รองรับเฉพาะ Repository ที่กำหนด';return;}
 el('agent-state').textContent='กำลังโหลดงาน...';
 try{
  const r=await fetch('/api/v1/queue?repo='+encodeURIComponent(repo.split('/')[1]),{headers:{Accept:'application/json'}});
  if(!r.ok)throw Error('HTTP '+r.status);
  const data=await r.json();
  if(id!==nonce||repo!==current())return;
  if(data.repo!==repo||!Array.isArray(data.tasks))throw Error('invalid');
  tasks=data.tasks.filter(t=>Number.isSafeInteger(t.number)&&t.number>0&&Number.isFinite(Date.parse(t.updated_at)));
  el('agent-state').textContent='พบงาน '+tasks.length+' รายการ'+(data.truncated?' (สูงสุด 50)':'')+' · ข้อมูลจาก GitHub';
  render(repo);
 }catch(_){
  if(id!==nonce)return;
  el('agent-state').textContent='GitHub API ยังไม่พร้อม ลองรีเฟรชอีกครั้ง';
  const a=document.createElement('a');a.textContent='เปิด GitHub Issues ↗';a.className='primary-button';a.href='https://github.com/'+repo+'/issues';a.target='_blank';a.rel='noopener noreferrer';el('agent-items').append(a);
 }
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