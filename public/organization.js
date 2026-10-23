// Live organization reference: rules are read from ai-organization-hub/main.
// Viewing rules or copying work orders never appoints or wakes an AI agent.
(()=>{
 'use strict';
 const el=id=>document.getElementById(id);
 const current=()=>el('repo-select')?.value||'';
 let policy=null;
 function renderProjects(){
  // All operator navigation remains inside AI Control Center.
  const area=el('org-context');area.replaceChildren();
  const p=document.createElement('p');
  p.textContent='โปรเจกต์: '+current()+' · องค์กร: D1 Organization Workspaces · งาน M/T ภายในเว็บ';
  area.append(p);
 }
 function showPreview(pre,content){const x=el(pre);x.textContent=content;x.hidden=false;}
 async function load(checkLive=false){
  renderProjects();el('org-status').textContent='กำลังอ่านกฎองค์กรจาก GitHub main…';
  try{
   const response=await fetch('/api/v1/organization/bundle',{cache:'no-store'});
   const data=await response.json();
   if(!response.ok)throw Error(data.reason||data.error);
   if(!/^[a-f0-9]{40}$/.test(data.main_sha)||!Array.isArray(data.documents))throw Error('ข้อมูล Source ไม่สมบูรณ์');
   policy=data;
   el('org-status').textContent='กฎที่ฝังในเว็บ · SHA '+data.main_sha.slice(0,12)+' · Snapshot ไม่จำเป็นต้องตรงกับ main ล่าสุด';
   const list=el('org-documents');list.replaceChildren();
   for(const doc of data.documents){
    const row=document.createElement('div');row.className='org-document';
    const name=document.createElement('strong');name.textContent=doc.name;row.append(name);
    const button=document.createElement('button');button.type='button';button.className='secondary-button';button.textContent='เปิดอ่านในเว็บ';
    button.addEventListener('click',()=>loadDoc(doc.name,button));
    row.append(button);list.append(row);
   }
   showPreview('org-readme',data.readme_preview||'ไม่พบ README');
   showPreview('org-commands',data.commands_preview||'ไม่พบ COMMANDS');
   if(checkLive){
    try{
     const liveResponse=await fetch('/api/v1/organization',{cache:'no-store'});
     const live=await liveResponse.json();
     if(!liveResponse.ok)throw Error(live.reason||live.error);
     el('org-status').textContent=live.main_sha===data.main_sha?'กฎที่ฝังตรงกับ GitHub main ล่าสุด · '+data.main_sha.slice(0,12):'พบกฎ main รุ่นใหม่ '+live.main_sha.slice(0,12)+' · เว็บยังฝัง Snapshot '+data.main_sha.slice(0,12)+' · ตรวจต้นฉบับก่อนเริ่มงาน';
    }catch(e){el('org-status').textContent+=' · ตรวจ GitHub main ล่าสุดไม่ได้: '+e.message;}
   }
  }catch(err){
   policy=null;el('org-status').textContent='เปิด Snapshot องค์กรไม่สำเร็จ: '+err.message;
  }
 }
 async function loadDoc(name,button){
  button.disabled=true;
  el('org-document-title').textContent='กำลังโหลด '+name+'…';
  try{
   const response=await fetch('/api/v1/organization/bundle/document?name='+encodeURIComponent(name),{cache:'no-store'});
   const doc=await response.json();
   if(!response.ok)throw Error(doc.reason||doc.error);
   el('org-document-title').textContent=name+' · SHA '+String(doc.sha).slice(0,12)+(doc.stale?' · สำรอง':'');
   showPreview('org-full-document',doc.text);
  }catch(err){el('org-document-title').textContent='เปิดเอกสารไม่สำเร็จ: '+err.message;}
  finally{button.disabled=false;}
 }
 async function copy(){
  if(!policy){el('org-copy-status').textContent='ยังไม่พบเอกสารองค์กร';return;}
  const txt=[
   'AI CONTROL CENTER / MN',
   'WEB: '+location.origin+'/?repo='+encodeURIComponent(current().split('/')[1]||''),
   'PROJECT: '+current(),
   'ORG_RULES_SNAPSHOT_SHA: '+policy.main_sha,
   'ทำงานผ่านพื้นที่องค์กรในเว็บ: M00001 ข้อความ / T00001 งาน',
   'CEO แต่งตั้ง EN1–EN5 และ QA อิสระภายในห้อง ไม่สร้าง GitHub Issue',
   'ตรวจ PR HEAD SHA และ CI ในเมนู QA ก่อน Merge',
   'OWNER ส่งต่อลิงก์เว็บให้แชทผู้รับเท่านั้น'
  ].join('\n');
  try{await navigator.clipboard.writeText(txt);el('org-copy-status').textContent='คัดลอกคำสั่งเว็บแล้ว · ไม่มีลิงก์ GitHub';}
  catch{el('org-copy-status').textContent='คัดลอกไม่สำเร็จ';}
 }
 function setup(){
  el('org-refresh').addEventListener('click',()=>load(true));
  el('org-copy').addEventListener('click',copy);
  document.querySelector('.navigation [data-view="organization"]')?.addEventListener('click',()=>load(false));
  el('repo-select').addEventListener('change',renderProjects);
  renderProjects();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();