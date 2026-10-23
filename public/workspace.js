// Project workspace UI: GitHub-backed branches; no merge or delete controls.
import {FULL_REPOS} from './repositories.js';
const el=id=>document.getElementById(id);
const repo=()=>el('repo-select')?.value?.split('/')[1]||'';
const current=()=>el('ws-branches')?.value||'';
let fileSha='',lastFile='',auth=false;
const state=(msg)=>{el('ws-notice').textContent=msg};
const status=(msg)=>{el('ws-auth').textContent=msg};
async function api(path,method='GET',body){
 const response=await fetch('/api/v1/work/'+path,{method,credentials:'same-origin',headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined,cache:'no-store'});
 const value=await response.json();
 if(!response.ok)throw Error(value.message||value.error||'HTTP '+response.status);
 return value;
}
async function login(){
 try{const response=await fetch('/api/auth/me',{cache:'no-store'});const me=await response.json();
 auth=Boolean(me.authenticated);status(auth?'ล็อกอินแล้ว: '+me.login+' · ใช้ GitHub App ตามสิทธิ์ Repository':'กรุณากด “เชื่อมต่อ GitHub” ที่ด้านบนก่อน');
 }catch{auth=false;status('ไม่สามารถตรวจสถานะ GitHub Login ได้')}
 for(const id of ['ws-create-branch','ws-save','ws-pr-create'])el(id).disabled=!auth;
}
async function refresh(){
 fileSha='';lastFile='';el('ws-branches').replaceChildren(new Option('เลือกพื้นที่ (Branch)',''));
 await login();
 if(!auth)return;
 if(!FULL_REPOS.includes(el('repo-select').value)){state('ไม่รองรับ Repository');return;}
 state('กำลังโหลด Branch ของโปรเจกต์...');
 try{
  const data=await api('branches?repo='+encodeURIComponent(repo()));
  for(const branch of data.branches)el('ws-branches').add(new Option(branch.name,branch.name));
  state(data.branches.length?'เลือก Branch ที่มีอยู่ หรือสร้างพื้นที่ใหม่':'ยังไม่มี Branch acc/ · สร้างพื้นที่ทำงานใหม่ได้');
 }catch(e){state('โหลด Branch ไม่สำเร็จ: '+e.message+' · หากเป็น 403 ให้ตรวจการติดตั้ง GitHub App ในโปรเจกต์');}
}
function chosen(){if(!current())throw Error('กรุณาเลือก Branch ก่อน');return current();}
async function handle(button,fn){
 button.disabled=true;
 try{await fn();}catch(e){state('ไม่สำเร็จ: '+e.message);}
 finally{button.disabled=false;}
}
function setup(){
 const nav=document.querySelector('.navigation [data-view="workspace"]');if(!nav)return;
 nav.addEventListener('click',refresh);
 el('repo-select').addEventListener('change',()=>{if(!el('view-workspace').classList.contains('hidden'))refresh();});
 el('ws-refresh').addEventListener('click',refresh);
 el('ws-branches').addEventListener('change',()=>{fileSha='';lastFile='';state('เลือก Branch แล้ว · อ่านไฟล์ก่อนแก้เพื่อรับ SHA ที่ตรงกัน');});
 el('ws-create-branch').addEventListener('click',e=>handle(e.currentTarget,async()=>{
  const title=el('ws-title').value.trim();
  if(title.length<3)throw Error('กรอกหัวข้องานอย่างน้อย 3 ตัวอักษร');
  state('กำลังสร้าง Branch แยกจาก Default Branch...');
  const r=await api('branch','POST',{repo:repo(),title});
  await refresh();el('ws-branches').value=r.branch;
  el('ws-pr-title').value=title;
  state('สร้าง Branch '+r.branch+' สำเร็จ · ใช้ไฟล์เดิมหรือเพิ่มไฟล์ใหม่ได้');
 }));
 el('ws-load').addEventListener('click',e=>handle(e.currentTarget,async()=>{
  const branch=chosen(),path=el('ws-path').value.trim();
  if(!path)throw Error('กรอกพาธไฟล์');
  state('กำลังอ่านไฟล์...');
  const data=await api('file?repo='+encodeURIComponent(repo())+'&branch='+encodeURIComponent(branch)+'&path='+encodeURIComponent(path));
  el('ws-content').value=data.content;fileSha=data.sha;lastFile=path;
  state('อ่านไฟล์สำเร็จ · Blob SHA '+fileSha.slice(0,10)+' · พร้อมแก้ไข');
 }));
 el('ws-new').addEventListener('click',()=>{fileSha='';lastFile=el('ws-path').value.trim();el('ws-content').value='';state('โหมดไฟล์ใหม่ · ระบุพาธที่ยังไม่มีใน Branch');});
 el('ws-save').addEventListener('click',e=>handle(e.currentTarget,async()=>{
  const branch=chosen(),path=el('ws-path').value.trim(),content=el('ws-content').value;
  if(!path)throw Error('กรอกพาธไฟล์ก่อน');
  if(fileSha&&lastFile!==path)throw Error('พาธเปลี่ยน กรุณาอ่านไฟล์ใหม่ก่อนบันทึก');
  if(new TextEncoder().encode(content).length>45000)throw Error('ไฟล์ใหญ่กว่า 45 KB');
  state('กำลัง Commit ไปยัง '+branch+' (ไม่แตะ main)...');
  const payload={repo:repo(),branch,path,content};
  if(fileSha)payload.sha=fileSha;
  const saved=await api('file','POST',payload);fileSha=saved.sha||'';lastFile=path;
  state('Commit สำเร็จ: '+(saved.commit_sha||'').slice(0,12)+' · อยู่บน '+branch+' เท่านั้น');
 }));
 el('ws-pr-create').addEventListener('click',e=>handle(e.currentTarget,async()=>{
  const branch=chosen(),title=el('ws-pr-title').value.trim(),body=el('ws-pr-body').value.trim();
  if(title.length<3)throw Error('กรอกชื่อ Draft PR');
  state('กำลังสร้าง Draft PR สำหรับ QA...');
  const r=await api('pr','POST',{repo:repo(),branch,title,body});
  const area=el('ws-result');area.replaceChildren(document.createTextNode('สร้าง Draft PR #'+r.number+' แล้ว · '));
  const a=document.createElement('a');a.href=r.url;a.textContent='เปิด PR';a.target='_blank';a.rel='noopener noreferrer';area.append(a);
  state('Draft PR ส่งตรวจแล้ว · ยังไม่ได้ Merge และยังไม่ได้ยืนยัน QA');
 }));
 el('ws-copy-agent').addEventListener('click',async()=>{
  const msg=['เปิด https://ai-control-center.tanawutmalirum29.workers.dev','เข้าเมนู พื้นที่ทำงาน และเลือกโปรเจกต์ '+el('repo-select').value,
   'ทำงานนี้: '+(el('ws-title').value||'(อ่านคิวงานและเลือกงาน READY ก่อน)'),
   'สร้าง Branch acc/ แยก อ่านไฟล์ก่อนแก้ บันทึก Commit บน Branch เท่านั้น แล้วสร้าง Draft PR',
   'ห้าม Merge/Delete หรือถือว่า QA ผ่านเอง ต้องให้ QA ตรวจ head SHA','รายงาน MN/MQ/TR/C สั้น ๆ'].join('\n');
  try{await navigator.clipboard.writeText(msg);state('คัดลอกคำสั่งสำหรับ ChatGPT Work แล้ว');}
  catch{state('คัดลอกไม่สำเร็จ ให้ใช้ HTTPS และอนุญาต Clipboard');}
 });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
