// Project workspace UI: GitHub-backed branches; no merge or delete controls.
import {FULL_REPOS} from './repositories.js';
const el=id=>document.getElementById(id);
const repo=()=>el('repo-select')?.value?.split('/')[1]||'';
const current=()=>el('ws-branches')?.value||'';
const workBranch=name=>/^(?:acc|feat|fix)\/[a-z0-9][a-z0-9._/-]{0,180}$/.test(name)&&!name.includes('..')&&!name.includes('//');
let fileSha='',lastFile='',auth=false,loadedContent=null,fullPreview=null,refreshEpoch=0;
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
function resetFullPreview(){fullPreview=null;el('ws-save').disabled=true;el('ws-file-diff').textContent='ยังไม่ได้ตรวจ Diff';}
async function login(){
  auth=false;
  let probeError='';
  try{
   const res=await fetch('/api/v1/work/branches?repo='+encodeURIComponent(repo()),{cache:'no-store',credentials:'same-origin'});
   if(res.ok){
    auth=true;
    status('GitHub Token กลางพร้อมทำงานจริง · อ่าน Branch ผ่าน GitHub API สำเร็จ · ไม่ต้องล็อกอิน');
   }else{
    const details=await res.json().catch(()=>({}));
    probeError='HTTP '+res.status+' · '+(details.error||details.github_message||'การเชื่อม GitHub ยังไม่สำเร็จ');
   }
  }catch(e){probeError=e.message||'เชื่อมต่อ GitHub ไม่สำเร็จ';}
  if(!auth){
   status('ยังไม่ยืนยันสิทธิ์เขียน · '+probeError+' · ตรวจสถานะใน Workspace ก่อน Commit');
  }
  for(const id of ['ws-create-branch','ws-pr-create','ws-preview-file'])el(id).disabled=!auth;
  el('ws-save').disabled=true;
  return auth;
}
async function refresh(){
 const n=++refreshEpoch,rememberBranch=current(),rememberRepo=repo();
 fileSha='';lastFile='';loadedContent=null;resetFullPreview();
 el('ws-loaded-file').textContent='ไฟล์ยังไม่ได้โหลด · เมื่อเลือก Branch อีกครั้งให้กดอ่านไฟล์';
 el('ws-content').value='';
 el('ws-branches').replaceChildren(new Option('เลือกพื้นที่ (Branch)',''));
 await login();
 if(n!==refreshEpoch||rememberRepo!==repo())return;
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
  if(n!==refreshEpoch||rememberRepo!==repo())return;
  const choices=['main',...data.branches.filter(b=>workBranch(b.name)).map(b=>b.name)];
  for(const name of new Set(choices))el('ws-branches').add(new Option(name,name));
  el('ws-branches').value=choices.includes(rememberBranch)?rememberBranch:'main';
  state('Branch โหลดผ่าน '+via+' · เลือก '+current()+' · คลิกไฟล์ในรายการเพื่อโหลดเนื้อหาจริงเข้า Editor');
 }catch(e){state('โหลด Branch ไม่สำเร็จ: '+e.message+' · หากเป็น 403 ให้ตรวจการติดตั้ง GitHub App ในโปรเจกต์');}
}
function chosen(){if(!current())throw Error('กรุณาเลือก Branch ก่อน');return current();}
async function handle(button,fn){
 button.disabled=true;
 try{await fn();}catch(e){state('ไม่สำเร็จ: '+e.message);}
 finally{
  // Never re-enable a Commit control unless the current content was previewed.
  button.disabled=button.id==='ws-save'?!fullPreview:false;
 }
}
function setup(){
 window.addEventListener('acc:workspace-file-invalidated',event=>{
  const d=event.detail||{};
  if(d.repo!==repo()||d.branch!==current()||d.path!==el('ws-path').value.trim())return;
  fileSha='';lastFile='';loadedContent=null;
  el('ws-content').value='';
  el('ws-loaded-file').textContent='มี Commit ใหม่แล้ว · กดอ่านทั้งไฟล์เพื่อโหลด Blob SHA ใหม่';
  resetFullPreview();
 });
 window.addEventListener('acc:workspace-file-loaded',event=>{
  const data=event.detail||{},branch=current(),path=el('ws-path').value.trim();
  if(!data.repo||data.repo!==repo()||data.branch!==branch||data.path!==path||
    typeof data.content!=='string'||!/^[a-f0-9]{40}$/.test(data.sha||'')){
   state('ไฟล์เปลี่ยนระหว่างอ่าน · กรุณาโหลดใหม่');return;
  }
  fileSha=data.sha;lastFile=data.path;loadedContent=data.content;
  el('ws-content').value=data.content;
  resetFullPreview();
  el('view-workspace').querySelector('.ws-full-editor').open=true;
  el('ws-loaded-file').textContent='ซิงก์จาก อ่านทั้งไฟล์ · '+data.content.split('\n').length+
   ' บรรทัด · '+data.content.length+' ตัวอักษร · '+data.branch+' · Blob SHA '+data.sha;
  state('อ่านทั้งไฟล์สำเร็จ · เติมเนื้อหาใน Editor พร้อม SHA '+data.sha+' แล้ว · แก้ไขและดู Diff ได้');
 });
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
    if(item.type==='dir'){state('กด ดูไฟล์ อีกครั้งเพื่อเปิดโฟลเดอร์');return;}
    // An agent choosing a file expects the editor to contain that exact source.
    el('ws-load').click();
   });list.append(b);
  }
  state('โหลดรายการไฟล์ '+data.entries.length+' รายการจาก '+branch);
 }));
 el('ws-branches').addEventListener('change',()=>{
  fileSha='';lastFile='';loadedContent=null;el('ws-content').value='';
  el('ws-loaded-file').textContent='เลือก Branch ใหม่แล้ว · ต้องโหลดไฟล์และ SHA ใหม่';
  resetFullPreview();state('เลือก Branch แล้ว · อ่านไฟล์ก่อนแก้เพื่อรับ SHA ที่ตรงกัน');
 });
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
  if(typeof data.content!=='string'||!/^[a-f0-9]{40}$/.test(data.sha||'')||
     data.path!==path||data.branch!==branch)
    throw Error('ข้อมูลไฟล์/Blob SHA จาก API ไม่ครบหรือต่างจาก Branch ที่เลือก');
  if(branch!==current()||path!==el('ws-path').value.trim())
    throw Error('Branch หรือพาธถูกเปลี่ยนระหว่างโหลดไฟล์ กรุณาอ่านอีกครั้ง');
  el('ws-content').value=data.content;fileSha=data.sha;lastFile=path;loadedContent=data.content;resetFullPreview();
  el('view-workspace').querySelector('.ws-full-editor').open=true;
  el('ws-loaded-file').textContent='อ่านครบ '+data.content.split('\n').length+' บรรทัด · '+data.content.length+
    ' ตัวอักษร · '+data.branch+' · Blob SHA '+fileSha;
  state('อ่านไฟล์สำเร็จ · Blob SHA '+fileSha+' · Editor แสดงเนื้อหาทั้งไฟล์แล้ว');
 }));
 el('ws-new').addEventListener('click',()=>{fileSha='';lastFile=el('ws-path').value.trim();el('ws-content').value='';loadedContent='';resetFullPreview();el('ws-loaded-file').textContent='ไฟล์ใหม่: ยังไม่มี SHA';state('โหมดไฟล์ใหม่ · ระบุพาธที่ยังไม่มีใน Branch');});
 el('ws-content').addEventListener('input',resetFullPreview);
 el('ws-path').addEventListener('input',resetFullPreview);
 el('ws-preview-file').addEventListener('click',e=>handle(e.currentTarget,async()=>{
  if(!auth)throw Error('GitHub Token กลางยังไม่พร้อม');
  const branch=chosen(),path=el('ws-path').value.trim(),content=el('ws-content').value;
  if(!workBranch(branch)||!path)throw Error('เลือก Branch งานและพาธไฟล์ก่อน');
  if(loadedContent===null||lastFile!==path)throw Error('กด อ่านไฟล์ หรือ ไฟล์ใหม่ ก่อนดู Diff');
  if(new TextEncoder().encode(content).length>200000)throw Error('ไฟล์ใหญ่กว่า 200 KB');
  if(content===loadedContent)throw Error('ไม่มี Diff เนื้อหาเหมือนต้นฉบับ จึงไม่สร้าง Commit');
  if(fileSha){
   const original=await api('file?repo='+encodeURIComponent(repo())+'&branch='+encodeURIComponent(branch)+'&path='+encodeURIComponent(path));
   if(original.sha!==fileSha||original.content!==loadedContent)throw Error('SHA หรือเนื้อหาไฟล์บน GitHub เปลี่ยนแล้ว ต้องอ่านไฟล์ใหม่');
  }
  const oldLines=loadedContent.split('\n'),newLines=content.split('\n');
  let start=0;while(start<oldLines.length&&start<newLines.length&&oldLines[start]===newLines[start])start++;
  let a=oldLines.length,b=newLines.length;
  while(a>start&&b>start&&oldLines[a-1]===newLines[b-1]){a--;b--;}
  const removed=oldLines.slice(start,a),added=newLines.slice(start,b);
  const previewText='Branch: '+branch+'\nFile: '+path+'\nOriginal blob SHA: '+(fileSha||'(new file)')+
   '\nChanged from line '+(start+1)+'\nRemoved: '+removed.length+' lines / Added: '+added.length+' lines'+
   '\n\n--- Before\n'+removed.map(x=>'- '+x).join('\n')+
   '\n+++ After\n'+added.map(x=>'+ '+x).join('\n');
  el('ws-file-diff').textContent=previewText;
  fullPreview={branch,path,sha:fileSha,content};
  el('ws-save').disabled=false;
  state('Diff พร้อมตรวจ · กดบันทึกเมื่อยืนยันเนื้อหาและ SHA แล้วเท่านั้น');
 }));
 el('ws-save').addEventListener('click',e=>handle(e.currentTarget,async()=>{
  const branch=chosen(),path=el('ws-path').value.trim(),content=el('ws-content').value;
  if(!path)throw Error('กรอกพาธไฟล์ก่อน');
  if(fileSha&&lastFile!==path)throw Error('พาธเปลี่ยน กรุณาอ่านไฟล์ใหม่ก่อนบันทึก');
  if(new TextEncoder().encode(content).length>200000)throw Error('ไฟล์ใหญ่กว่า 200 KB');
  if(!auth||!workBranch(branch))throw Error('โปรดเลือก Branch acc/, feat/ หรือ fix/ ห้าม Commit เข้า main');
  if(!fullPreview||fullPreview.branch!==branch||fullPreview.path!==path||
     fullPreview.sha!==fileSha||fullPreview.content!==content)
   throw Error('ต้องกด ดู Diff ก่อน Commit อีกครั้ง');
  resetFullPreview();
  state('กำลัง Commit ไปยัง '+branch+' (ไม่แตะ main)...');
  const payload={repo:repo(),branch,path,content};
  if(fileSha)payload.sha=fileSha;
  const saved=await api('file','POST',payload);
  if(!saved.saved||!/^[a-f0-9]{40}$/.test(saved.commit_sha||'')||!/^[a-f0-9]{40}$/.test(saved.sha||''))
   throw Error('GitHub ยังไม่ยืนยัน Commit SHA และ Blob SHA กรุณาตรวจ Branch ก่อนบันทึกซ้ำ');
  const verify=await api('file?repo='+encodeURIComponent(repo())+'&branch='+encodeURIComponent(branch)+'&path='+encodeURIComponent(path));
  if(verify.content!==content||verify.sha!==saved.sha)
   throw Error('GitHub บันทึก Commit '+saved.commit_sha+' แล้ว แต่การอ่านยืนยันเนื้อหาหลังบันทึกไม่ตรง · ห้ามกดซ้ำ');
  fileSha=saved.sha;lastFile=path;loadedContent=content;
  el('ws-loaded-file').textContent='ยืนยันหลังบันทึก Blob SHA '+saved.sha+' · Commit '+saved.commit_sha;
  state('ยืนยัน Commit SHA '+saved.commit_sha+' และ Blob SHA '+saved.sha+' · เนื้อหาหลังบันทึกตรงกับ Diff');
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
