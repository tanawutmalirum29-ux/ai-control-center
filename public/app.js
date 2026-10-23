// New AI-first frontend: read-only GitHub Connector bridge dashboard.
// No legacy issue forms, browser code editing, role token creation or OS prompts.
import {FULL_REPOS} from './repositories.js';
const $=id=>document.getElementById(id);
const views=['bridge','qa','settings'];
let roomId=null,busy=false;
const repo=()=>$('repo-select').value.split('/')[1]||'';
function node(tag,value,className=''){
 const n=document.createElement(tag);if(value!==undefined)n.textContent=String(value);if(className)n.className=className;return n;
}
function setStatus(s){$('bridge-status').textContent=s;$('load-state').textContent=s;}
function switchView(view){
 if(!views.includes(view))return;
 for(const n of document.querySelectorAll('.view'))n.classList.toggle('hidden',n.id!=='view-'+view);
 for(const n of document.querySelectorAll('[data-view]'))n.classList.toggle('active',n.dataset.view===view);
 const heading={bridge:'ห้ององค์กร AI',qa:'ตรวจ PR / CI',settings:'โปรเจกต์ / วิธีใช้'};
 $('page-heading').textContent=heading[view];$('section-kicker').textContent=view.toUpperCase();
}
async function get(path){
 const r=await fetch('/api/v1/bridge/'+path,{cache:'no-store'});
 const data=await r.json();if(!r.ok)throw Error(data.error||'Bridge unavailable');return data;
}
function selectedRoom(){
 if(!roomId)return 'ยังไม่เลือกห้อง';
 return 'ห้อง '+roomId;
}
function prompt(){
 const project=repo();
 $('bridge-prompt').value='CEO: MN — เริ่มงานใน '+project+' ผ่าน GitHub Connector เท่านั้น\n'+
 '1. อ่าน https://github.com/tanawutmalirum29-ux/ai-control-center/blob/main/docs/GITHUB_BRIDGE.md\n'+
 '2. ใช้ GitHub Connector สร้างไฟล์คำสั่งใน repo tanawutmalirum29-ux/ai-organization-hub ที่ main\n'+
 '3. เลือก action open_room (actor CEO) หรือสานต่อห้อง '+(roomId||'(เปิดห้องใหม่)')+'\n'+
 '4. ดูผลที่ https://ai-control-center.tanawutmalirum29.workers.dev/api/v1/bridge/status?id=<command_uuid>\n'+
 '5. ดู M/T ที่ https://ai-control-center.tanawutmalirum29.workers.dev/api/v1/bridge/inbox?room_id=<room_uuid>\n'+
 '6. ไม่ใช้ TinyFish/เว็บคลิก/Issues ห้ามใส่ Token, ลิงก์ลับ หรือข้อมูลส่วนตัวลง GitHub Public\n'+
 '7. ตรวจ QA/CI ก่อน Merge; ตอบสั้น MN/MQ/TR/C';
}
async function showRoom(id){
 roomId=id;prompt();
 $('bridge-detail-heading').textContent='M / T · '+id;
 const root=$('bridge-detail');root.textContent='กำลังโหลด...';
 try{
  const d=await get('inbox?room_id='+encodeURIComponent(id));
  root.replaceChildren();
  root.append(node('h4',d.room.title+' · '+d.room.status));
  root.append(node('p',d.room.mission,'small-note'));
  root.append(node('p','ทีม: '+d.members.map(m=>m.slot).join(' · '),'small-note'));
  const tasks=node('div');tasks.append(node('h4','งาน T'));
  for(const t of d.tasks){const entry=node('div',t.code+' · '+t.title+' · '+t.assignee_slot+' · '+t.status,'item');tasks.append(entry);}
  if(!d.tasks.length)tasks.append(node('p','ยังไม่มีงาน','small-note'));
  root.append(tasks);
  const messages=node('div');messages.append(node('h4','ข้อความ M'));
  for(const m of d.messages){const item=node('div',undefined,'item');item.append(node('strong',m.code+' · '+m.sender_slot+' → '+m.recipient_slot));item.append(node('p',m.body));messages.append(item);}
  if(!d.messages.length)messages.append(node('p','ยังไม่มีข้อความ','small-note'));
  root.append(messages);
 }catch(e){root.textContent='โหลดห้องไม่สำเร็จ: '+e.message;}
}
async function refresh(){
 if(busy)return;busy=true;$('bridge-refresh').disabled=true;
 try{
  const [health,rooms,receipts]=await Promise.all([get('health'),get('rooms?repo='+encodeURIComponent(repo())),get('status?repo='+encodeURIComponent(repo()))]);
  setStatus(health.ready?'Bridge พร้อม · GitHub main → D1 · Cron ทุก 5 นาที':'Bridge ไม่พร้อม');
  const r=$('bridge-rooms');r.replaceChildren();
  $('bridge-room-count').textContent=rooms.rooms.length+' ห้อง';
  for(const item of rooms.rooms){
   const b=node('button',item.title+' · '+item.status,'item-button');b.type='button';b.onclick=()=>showRoom(item.id);r.append(b);
  }
  if(!rooms.rooms.length)r.append(node('p','ยังไม่มีห้องผ่าน GitHub Bridge','small-note'));
  const a=$('bridge-receipts');a.replaceChildren();
  for(const item of receipts.receipts){
   const e=node('div',undefined,'item');
   e.append(node('strong',item.action+' · '+item.status));
   e.append(node('p',(item.code?item.code+' · ':'')+item.detail,'small-note'));
   a.append(e);
  }
  if(!receipts.receipts.length)a.append(node('p','ยังไม่มีไฟล์คำสั่งที่ Worker ประมวลผล','small-note'));
  if(roomId)await showRoom(roomId);
 }catch(e){setStatus('Bridge ใช้งานไม่ได้: '+e.message);}
 finally{busy=false;$('bridge-refresh').disabled=false;}
}
async function sync(){
 const b=$('bridge-sync');b.disabled=true;setStatus('กำลังอ่าน GitHub Queue...');
 try{
  const r=await fetch('/api/v1/bridge/sync',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  const d=await r.json();if(!r.ok)throw Error(d.errors?.join(', ')||d.error||'Sync failed');
  await refresh();setStatus('Sync สำเร็จ: '+d.processed+' คำสั่ง · ปฏิเสธ '+d.rejected+' · แสกน '+d.seen+' ไฟล์');
 }catch(e){setStatus('Sync ไม่สำเร็จ: '+e.message);}
 finally{b.disabled=false;}
}
function init(){
 const select=$('repo-select');
 for(const item of FULL_REPOS){const opt=node('option',item);opt.value=item;select.append(opt);}
 const fromUrl=new URLSearchParams(location.search).get('repo');
 const choice='tanawutmalirum29-ux/'+fromUrl;
 const saved=localStorage.getItem('acc.bridge.repo');
 select.value=FULL_REPOS.includes(choice)?choice:FULL_REPOS.includes(saved)?saved:FULL_REPOS[0];
 select.addEventListener('change',()=>{localStorage.setItem('acc.bridge.repo',select.value);roomId=null;prompt();refresh();});
 for(const n of document.querySelectorAll('[data-view]'))n.addEventListener('click',()=>switchView(n.dataset.view));
 const list=$('repo-list');
 for(const item of FULL_REPOS){
  const b=node('button',item,'item-button');b.type='button';b.onclick=()=>{select.value=item;select.dispatchEvent(new Event('change'));switchView('bridge')};list.append(b);
 }
 $('bridge-refresh').addEventListener('click',refresh);
 $('refresh-btn').addEventListener('click',refresh);
 $('bridge-sync').addEventListener('click',sync);
 $('bridge-copy').addEventListener('click',async()=>{
  const value=$('bridge-prompt').value;try{await navigator.clipboard.writeText(value);setStatus('คัดลอกข้อความ CEO แล้ว');}catch{$('bridge-prompt').select();setStatus('เลือกข้อความแล้ว · คัดลอกด้วยเมนูเครื่อง');}
 });
 prompt();switchView('bridge');refresh();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
