// Live organization reference: rules are read from ai-organization-hub/main.
// Viewing rules or copying work orders never appoints or wakes an AI agent.
import {OWNER} from './repositories.js';
(()=>{
 'use strict';
 const el=id=>document.getElementById(id);
 const org='https://github.com/'+OWNER+'/ai-organization-hub';
 const staging='https://github.com/'+OWNER+'/Staging_area';
 const current=()=>el('repo-select')?.value||'';
 let policy=null;
 function link(label,url){
  const a=document.createElement('a');a.textContent=label;a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;
 }
 function renderProjects(){
  const area=el('org-context');area.replaceChildren();
  const project='https://github.com/'+current();
  [['PROJECT_REPO',project],['ORG_WORKSPACE_REPO',org],['STAGING_REPO',staging]].forEach(([name,url])=>{
   const p=document.createElement('p');p.append(document.createTextNode(name+': '),link(url,url));area.append(p);
  });
 }
 function showPreview(pre,content){const x=el(pre);x.textContent=content;x.hidden=false;}
 async function load(){
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
    row.append(link(doc.name,doc.url));
    const button=document.createElement('button');button.type='button';button.className='secondary-button';button.textContent='เปิดอ่านในเว็บ';
    button.addEventListener('click',()=>loadDoc(doc.name,button));
    row.append(button);list.append(row);
   }
   showPreview('org-readme',data.readme_preview||'ไม่พบ README');
   showPreview('org-commands',data.commands_preview||'ไม่พบ COMMANDS');
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
  if(!policy){el('org-copy-status').textContent='ยังไม่ได้โหลดเอกสารองค์กร';return;}
  const project='https://github.com/'+current();
  const txt=[
   'AI ORGANIZATION HUB / MN',
   'PROJECT_REPO: '+project,
   'ORG_WORKSPACE_REPO: '+org,
   'STAGING_REPO: '+staging,
   'ORG_RULES_SNAPSHOT_SHA: '+policy.main_sha,
   'นี่คือ Snapshot ที่ฝังกับเว็บ ต้องตรวจ latest main SHA ก่อนใช้กับงานใหม่:',
   'เปิดอ่าน RULES.md, COMMANDS.md และ README.md ที่ SHA นี้ก่อนทำงาน:',
   org+'/tree/'+policy.main_sha,
   'ตรวจ PROJECT_REPO/main SHA, Issue/PR/QA และ REPORTS_TO',
   'ปฏิบัติตาม OWNER → PROJECT LEAD/CEO → ENGINEER/CREATOR/QA; QA อิสระ และ AI ACTIVE ไม่เกิน 10 ต่อภารกิจ',
   'ต้องได้รับ AP-ROLE จริงก่อนทำงาน; การสร้าง Issue ไม่ปลุก AI อัตโนมัติ',
   'กำหนด EDITABLE_PATHS, BASE_SHA และ Branch ไม่ทับกันก่อนแก้โค้ด',
   'ห้ามแก้ main หรือ Merge โดยไม่ได้รับสิทธิ์ และห้ามกล่าวว่า QA ผ่านโดยไม่มีหลักฐาน exact SHA',
   'รายงาน MN/MQ/TR/C หรือ ER สั้น ๆ ตามกฎปัจจุบัน'
  ].join('\n');
  try{await navigator.clipboard.writeText(txt);el('org-copy-status').textContent='คัดลอกกฎที่ฝังและ 3 Repo แล้ว · โปรดตรวจ main ล่าสุดก่อนแต่งตั้ง';}
  catch{el('org-copy-status').textContent='คัดลอกไม่สำเร็จ กรุณาอนุญาต Clipboard';}
 }
 function setup(){
  el('org-refresh').addEventListener('click',load);
  el('org-copy').addEventListener('click',copy);
  document.querySelector('.navigation [data-view="organization"]')?.addEventListener('click',load);
  el('repo-select').addEventListener('change',renderProjects);
  renderProjects();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();