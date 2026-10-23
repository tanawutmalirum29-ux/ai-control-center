// Project workspace UI: GitHub-backed branches; no merge or delete controls.
import {FULL_REPOS} from './repositories.js';
const el=id=>document.getElementById(id);
const repo=()=>el('repo-select')?.value?.split('/')[1]||'';
const current=()=>el('ws-branches')?.value||'';
const workBranch=name=>/^(?:acc|feat|fix)\/[a-z0-9][a-z0-9._/-]{0,180}$/.test(name)&&!name.includes('..')&&!name.includes('//');
let fileSha='',lastFile='',auth=false;
const state=(msg)=>{el('ws-notice').textContent=msg};
const status=(msg)=>{el('ws-auth').textContent=msg};
async function api(path,method='GET',body){
 const response=await fetch('/api/v1/work/'+path,{method,credentials:'same-origin',headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined,cache:'no-store'});
 const value=await response.json();
 if(!response.ok)throw Error([
  'HTTP '+response.status,value.error,value.hint||value.github_message||value.message,
  ...(Array.isArray(value.github_errors)?value.github_errors:[])
 ].filter(Boolean).join(' · '));
 return value;
}
async function login(){
 try{
  const [health,me,agent]=await Promise.all([
   fetch('/api/health',{cache:'no-store'}).then(r=>r.json()),
   fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'}).then(r=>r.json()),
   fetch('/api/agent/me',{credentials:'same-origin',cache:'no-store'}).then(r=>r.json())
  ]);
  const central=Boolean(health.central_credential_present&&health.write_repositories?.includes(el('repo-select').value));
  auth=Boolean(central||me.authenticated||
   (agent.agent_authenticated&&agent.agent_repo===repo()&&
   ['CEO','PROJECT-LEAD','ENGINEER','CREATOR','GUEST-ENGINEER'].includes(agent.agent_role)));
  status(central?'พร้อมทำงาน · ใช้ GitHub Token กลาง ไม่ต้องล็อกอิน (Branch acc/ และ Draft PR)':
   me.authenticated?'OWNER · ใช้สิทธิ์ GitHub App':
   auth?'AI '+agent.agent_role+' · สิทธิ์ตามงาน':
   'ยังไม่มี Credential สำหรับเขียน · ตรวจ GITHUB_WRITE_TOKEN ใน Cloudflare');
 }catch{auth=false;status('ตรวจสถานะ API ไม่สำเร็จ · ลองรีเฟรช')}
 for(const id of ['ws-create-branch','ws-save','ws-pr-create'])el(id).disabled=!auth;
}
async function refresh(){
 fileSha='';lastFile='';el('ws-branches').replaceChildren(new Option('เลือกพื้นที่ (Branch)',''));
 await login();
 if(!FULL_REPOS.includes(el('repo-select').value)){state('ไม่รองรับ Repository');return;}
 state('กำลังโหลด Branch ของโปรเจกต์...');
 try{
  let data,via='GitHub สาธารณะ';
  if(auth){
   try{
    data=await api('branches?repo='+encodeURIComponent(repo()));
    via='GitHub Token กลาง';
   }catch(err){
    const response=await fetch('/api/v1/source/branches?repo='+encodeURIComponent(repo()),{cache:'no-store'});
    data=await response.json();if(!response.ok)throw Error(data.reason||data.error);
   }
  }else{
   const response=await fetch('/api/v1/source/branches?repo='+encodeURIComponent(repo()),{cache:'no-store'});
   data=await response.json();if(!response.ok)throw Error(data.reason||data.error);
  }
  const choices=['main',...data.branches.filter(b=>workBranch(b.name)).map(b=>b.name)];
  for(const name of new Set(choices))el('ws-branches').add(new Option(name,name));
  el('ws-branches').value='main';
  state('Branch โหลดผ่าน '+via+' · แก้งานบน Branch acc/ หรือ feat/ เดิมของ PR ได้ ไม่ต้องสร้าง PR ซ้ำ');
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
 el('ws-browse').addEventListener('click',ev=>handle(ev.currentTarget,async()=>{
  const branch=chosen(),path=el('ws-path').value.trim();
  const folder=path.endsWith('/')?path.slice(0,-1):path.includes('/')?path.slice(0,path.lastIndexOf('/')):'';
  const query='repo='+encodeURIComponent(repo())+'&path='+encodeURIComponent(folder);
  let data;
  if(auth&&workBranch(branch))data=await api('tree?'+query+'&branch='+encodeURIComponent(branch));
  else{
   const result=await fetch('/api/v1/source/tree?'+query+'&ref='+encodeURIComponent(branch),{cache:'no-store'});
   data=await result.json();if(!result.ok)throw Error(data.reason||data.error);
  }
  const list=el('ws-tree');list.replaceChildren();
  for(const item of data.entries){
   const b=document.createElement('button');b.type='button';b.className='secondary-button';
   b.textContent=(item.type==='dir'?'▸ ':'• ')+item.path;
   b.addEventListener('click',()=>{
    el('ws-path').value=item.type==='dir'?item.path+'/':item.path;
    state(item.type==='dir'?'กดดูรายการไฟล์อีกครั้งเพื่อเปิดโฟลเดอร์':'กดอ่านไฟล์เพื่อเปิดโค้ด');
   });list.append(b);
  }
  state('โหลดรายการไฟล์ '+data.entries.length+' รายการจาก '+branch);
 }));
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
  let data;
  if(auth&&workBranch(branch))data=await api('file?repo='+encodeURIComponent(repo())+'&branch='+encodeURIComponent(branch)+'&path='+encodeURIComponent(path));
  else{
   const response=await fetch('/api/v1/source/file?repo='+encodeURIComponent(repo())+'&ref='+encodeURIComponent(branch)+'&path='+encodeURIComponent(path));
   data=await response.json();if(!response.ok)throw Error(data.reason||data.error);
  }
  el('ws-content').value=data.content;fileSha=data.sha;lastFile=path;
  state('อ่านไฟล์สำเร็จ · Blob SHA '+fileSha.slice(0,10)+' · พร้อมแก้ไข');
 }));
 el('ws-new').addEventListener('click',()=>{fileSha='';lastFile=el('ws-path').value.trim();el('ws-content').value='';state('โหมดไฟล์ใหม่ · ระบุพาธที่ยังไม่มีใน Branch');});
 el('ws-save').addEventListener('click',e=>handle(e.currentTarget,async()=>{
  const branch=chosen(),path=el('ws-path').value.trim(),content=el('ws-content').value;
  if(!path)throw Error('กรอกพาธไฟล์ก่อน');
  if(fileSha&&lastFile!==path)throw Error('พาธเปลี่ยน กรุณาอ่านไฟล์ใหม่ก่อนบันทึก');
  if(new TextEncoder().encode(content).length>200000)throw Error('ไฟล์ใหญ่กว่า 200 KB');
  if(!auth||!workBranch(branch))throw Error('โปรดเลือก Branch acc/, feat/ หรือ fix/ ห้าม Commit เข้า main');
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
  const response=await fetch('/api/v1/mission?repo='+encodeURIComponent(repo()),{cache:'no-store'});
  if(response.ok){
   const mission=await response.json();
   const existing=(mission.prs||[]).find(p=>p.head_branch===branch);
   if(existing){
    const area=el('ws-result');area.replaceChildren(document.createTextNode('Branch นี้มี PR #'+existing.number+' อยู่แล้ว · '));
    const link=document.createElement('a');link.href=existing.url;link.textContent='เปิด PR เดิม';link.target='_self';area.append(link);
    state('ไม่สร้าง PR ซ้ำ: พบ PR #'+existing.number+' สำหรับ Branch '+branch);
    return;
   }
  }
  const r=await api('pr','POST',{repo:repo(),branch,title,body});
  const area=el('ws-result');area.replaceChildren(document.createTextNode('สร้าง Draft PR #'+r.number+' แล้ว · '));
  const a=document.createElement('a');a.href=r.url;a.textContent='เปิด PR';a.target='_blank';a.rel='noopener noreferrer';area.append(a);
  state('Draft PR ส่งตรวจแล้ว · ยังไม่ได้ Merge และยังไม่ได้ยืนยัน QA');
 }));
 el('ws-copy-agent').addEventListener('click',async()=>{
  const msg=['เปิด https://ai-control-center.tanawutmalirum29.workers.dev','เข้าเมนู พื้นที่ทำงาน และเลือกโปรเจกต์ '+el('repo-select').value,
   'ทำงานนี้: '+(el('ws-title').value||'(อ่านคิวงานและเลือกงาน READY ก่อน)'),
   'ใช้ Branch acc/ หรือ feat/ ของ PR ที่มีอยู่ อ่านไฟล์ก่อนแก้ แล้ว Commit และตรวจว่า PR เดิมมีหรือไม่',
   'ห้าม Merge/Delete หรือถือว่า QA ผ่านเอง ต้องให้ QA ตรวจ head SHA','รายงาน MN/MQ/TR/C สั้น ๆ'].join('\n');
  try{await navigator.clipboard.writeText(msg);state('คัดลอกคำสั่งสำหรับ ChatGPT Work แล้ว');}
  catch{state('คัดลอกไม่สำเร็จ ให้ใช้ HTTPS และอนุญาต Clipboard');}
 });
 if(!el('view-workspace').classList.contains('hidden'))refresh();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
