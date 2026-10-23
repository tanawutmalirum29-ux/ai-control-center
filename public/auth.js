// Owner OAuth or task-scoped delegated AI session; credentials never enter browser JS.
import {WRITE_REPOS} from './repositories.js';
(()=>{
'use strict';
const bar=document.querySelector('.top-actions');
const actions=document.querySelector('#task-form .form-actions');
const notice=document.getElementById('task-notice');
if(!bar||!actions||!notice)return;
const link=document.createElement('a');link.className='secondary-button';link.href='/api/auth/login';
link.textContent='เชื่อมต่อ GitHub';bar.append(link);
const create=document.createElement('button');create.type='button';create.className='primary-button';
create.textContent='บันทึก Issue โดยตรง';create.hidden=true;
actions.prepend(create);
const meNotice=document.createElement('span');meNotice.className='auth-status';
bar.append(meNotice);
const exit=document.createElement('button');exit.type='button';exit.className='secondary-button';
exit.hidden=true;exit.textContent='ออกจากระบบ';bar.append(exit);
let authenticated=false;
async function refresh(){
 try{
  const r=await fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'});
  const me=await r.json();
  const [a,health]=await Promise.all([
   fetch('/api/agent/me',{credentials:'same-origin',cache:'no-store'}).then(r=>r.json()),
   fetch('/api/health',{cache:'no-store'}).then(r=>r.json())]);
  authenticated=Boolean(me.authenticated);
  const delegated=Boolean(a.agent_authenticated);
  const shared=Boolean(health.central_credential_present);
  create.hidden=!authenticated;
  exit.hidden=!authenticated;
  link.hidden=authenticated||delegated||shared||!me.configured;
  meNotice.textContent=shared?'Token กลางพร้อมทำงาน':authenticated?'OWNER':delegated?(a.agent_role+' · '+a.agent_slot):'โหมดอ่าน';
  const side=document.querySelector('.side-bottom');
  if(side)side.textContent=shared?'อ่านโค้ดและ Commit ลง Branch acc/ ได้โดยไม่ต้องล็อกอิน':authenticated?'OWNER · จัดการโปรเจกต์ได้':delegated?'AI '+a.agent_role+' · งานของ '+a.agent_repo:'อ่านโปรเจกต์สาธารณะ';
  const settings=document.querySelectorAll('.settings-grid>div p');
  if(settings[0])settings[0].textContent=authenticated?'อ่าน GitHub และสร้าง Issue ตามสิทธิ์ Owner':'อ่าน Public Repository (ยังไม่เข้าสู่ระบบ)';
  if(settings[1])settings[1].textContent=shared?'ทุกคนที่มี URL ใช้ Token กลางแก้ไฟล์ใน Branch และเปิด Draft PR ได้':authenticated?'สร้าง Issue ใน Repository ที่ได้รับสิทธิ์แล้ว':delegated?'สิทธิ์ตามงาน':'ต้องมี Credential กลางสำหรับเขียน';
 }catch{meNotice.textContent='ตรวจสถานะ GitHub ไม่ได้';}
}
create.addEventListener('click',async()=>{
 if(!authenticated)return;
 const repo=document.getElementById('repo-select').value.split('/')[1];
 const title=document.getElementById('task-title').value.trim();
 const detail=document.getElementById('task-body').value.trim();
 const role=document.getElementById('task-role').value;
 if(!title){notice.textContent='กรอกหัวข้องานก่อน';return;}
 if(!WRITE_REPOS.includes(repo)){
  notice.textContent='Repository นี้อยู่ในโหมดอ่านอย่างเดียว';
  return;
 }
 create.disabled=true;notice.textContent='กำลังส่งคำสั่งไป GitHub...';
 try{
  const res=await fetch('/api/v1/issues',{method:'POST',credentials:'same-origin',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({repo,title:'['+role+'] '+title,body:detail||'Created by AI Control Center owner'})});
  const result=await res.json();
  if(!res.ok){notice.textContent='สร้างไม่สำเร็จ: '+(result.error||'GitHub API');return;}
  notice.replaceChildren(document.createTextNode('สร้าง Issue #'+result.number+' แล้ว · '));
  const a=document.createElement('a');a.href=result.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent='เปิด Issue';notice.append(a);
 }catch{notice.textContent='เชื่อมต่อ API ไม่สำเร็จ';}
 finally{create.disabled=false;}
});
exit.addEventListener('click',async()=>{
 try{await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'});}finally{location.reload();}
});
refresh();
})();