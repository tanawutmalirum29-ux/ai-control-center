// Owner-only web controls. GitHub App OAuth uses encrypted server-only session cookies.
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
  authenticated=Boolean(me.authenticated);
  create.hidden=!authenticated;
  exit.hidden=!authenticated;
  link.hidden=authenticated||!me.configured;
  meNotice.textContent=authenticated?'เชื่อมต่อ: '+me.login:me.configured?'ยังไม่เข้าสู่ระบบ':'รอตั้งค่า GitHub App';
 }catch{meNotice.textContent='ตรวจสถานะ GitHub ไม่ได้';}
}
create.addEventListener('click',async()=>{
 if(!authenticated)return;
 const repo=document.getElementById('repo-select').value.split('/')[1];
 const title=document.getElementById('task-title').value.trim();
 const detail=document.getElementById('task-body').value.trim();
 const role=document.getElementById('task-role').value;
 if(!title){notice.textContent='กรอกหัวข้องานก่อน';return;}
 if(repo!=='ai-control-center'){
  notice.textContent='ตอนนี้สร้างตรงได้เฉพาะ ai-control-center; โปรเจกต์อื่นใช้ปุ่มสร้างผ่าน GitHub';
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