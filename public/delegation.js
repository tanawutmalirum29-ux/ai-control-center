// First owner bootstrap, then CEO-only task-scoped delegation.
// Role/issue authorization is enforced by the Worker; UI never holds GitHub tokens.
import {OWNER,WRITE_REPOS} from './repositories.js';
import {cadenceNote} from './agent-automation.js';
(()=>{
 const e=id=>document.getElementById(id);
 let owner=false,role='',agentRepo='',tasks=[],guestMinutes=720;
 const repo=()=>e('repo-select').value.split('/')[1];
 const state=message=>{e('delegate-status').textContent=message};
 async function get(url,options){
  const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...options});
  const data=await r.json().catch(()=>({error:'invalid_api_response'}));
  if(!r.ok)throw Error(data.error||data.reason||'HTTP '+r.status);
  return data;
 }
 async function refresh(){
  if(!WRITE_REPOS.includes(repo())){state('Repository นี้อ่านอย่างเดียวตามกฎองค์กร');return;}
  try{
   const [a,o]=await Promise.all([get('/api/agent/me'),get('/api/auth/me')]);
   owner=Boolean(o.authenticated);
   role=a.agent_authenticated&&a.agent_repo===repo()?a.agent_role||'':'';
   agentRepo=a.agent_repo||'';
   const boss=owner||role==='CEO'||role==='PROJECT-LEAD';
   guestMinutes=a.configured?720:180;
   e('delegate-owner').disabled=!owner||!a.configured;
   e('delegate-child').disabled=!boss||owner||!a.configured;
   e('delegate-guest').disabled=!boss||!(a.configured||(owner&&a.guest_oauth_available));
   e('delegate-guest').textContent=a.configured?'ออกลิงก์ AI อิสระ (12 ชั่วโมง)':'ออกลิงก์ AI อิสระ (ประมาณ 3 ชั่วโมง · ไม่ต้อง Private Key)';
   e('delegate-guest-panel').hidden=!boss;
   if(!a.configured&&!owner){
    state('การแจกสิทธิ์ CEO ต้องมี GitHub App Private Key แต่ AI อิสระสามารถขอลิงก์จาก OWNER ได้');
    return;
   }
   if(!a.configured&&!a.guest_oauth_available){
    state('GitHub App OAuth ยังไม่พร้อมออกลิงก์ชั่วคราว');
    return;
   }
   e('delegate-owner-panel').hidden=!owner;
   e('delegate-child-panel').hidden=owner;
   e('delegate-login').hidden=owner||Boolean(role);
   e('delegate-who').textContent=owner?'OWNER · ออกลิงก์ CEO เริ่มต้น':
     role?role+' · โปรเจกต์ '+agentRepo+' · สามารถแต่งตั้งทีมตามกฎได้':
     'ไม่มีสิทธิ์แต่งตั้ง · ต้องได้รับลิงก์ CEO จาก OWNER หรือ Login ด้วยบัญชี OWNER เพียงครั้งแรก';
   if(!boss){state('อ่านโปรเจกต์ได้ แต่ไม่มีสิทธิ์ออกลิงก์สำหรับ AI');return;}
   if(owner){state(a.configured?'เลือก Repository แล้วออกลิงก์ CEO หรือ AI อิสระได้':'โหมดชั่วคราวพร้อม: OWNER ออกลิงก์ให้ AI อิสระได้เลย โดยใช้ GitHub Login ของ OWNER ที่เชื่อมแล้ว');return;}
   const data=await get('/api/v1/mission?repo='+encodeURIComponent(repo()));
   tasks=data.tasks||[];
   const select=e('delegate-task'),keep=select.value;select.replaceChildren(new Option('เลือก Issue งานที่ CEO สร้างไว้',''));
   for(const t of tasks.filter(t=>['ENGINEER','CREATOR','QA-REVIEWER','COORDINATOR'].includes(t.role)&&t.status!=='PAUSED')){
    const issue=t.number;
    select.add(new Option('#'+issue+' '+(t.agent_slot||t.role)+' · '+t.title,issue));
   }
   if(keep)select.value=keep;
   state('เลือก Issue ของ Engineer หรือ QA แล้วกดออกลิงก์ตามบทบาทที่ระบุไว้ใน Issue');
  }catch(err){state('ตรวจสิทธิ์ไม่ได้: '+err.message);}
 }
 async function createLink(payload){
  const result=await get('/api/agent/invite',{method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify(payload)});
  const line=result.role==='GUEST-ENGINEER'?
    'GUEST-ENGINEER: MN '+result.url+' | '+result.task:
    result.slot+': AP-ROLE'+(result.issue?' #'+result.issue:'')+' '+result.url;
  e('delegate-relay').value=line+' | '+cadenceNote;
  state('สร้างลิงก์ '+result.role+' สำหรับ '+result.repo+' แล้ว · คัดลอกหนึ่งบรรทัดไปส่งในแชท AI');
  try{await navigator.clipboard.writeText(e('delegate-relay').value);state('คัดลอกข้อความแต่งตั้งหนึ่งบรรทัดแล้ว · ส่งให้แชทผู้รับได้ทันที');}
  catch{e('delegate-relay').focus();e('delegate-relay').select();}
 }
 async function activateButton(button,fn){
  button.disabled=true;
  try{await fn();}
  catch(err){state('ยังออกลิงก์ไม่ได้: '+err.message);}
  finally{button.disabled=false;}
 }
 function setup(){
  const nav=document.querySelector('.navigation [data-view="ceo"]');
  nav?.addEventListener('click',refresh);
  e('repo-select').addEventListener('change',()=>{
   if(!e('view-ceo').classList.contains('hidden'))refresh();
  });
  e('delegate-refresh').addEventListener('click',refresh);
  e('delegate-owner').addEventListener('click',event=>activateButton(event.currentTarget,()=>createLink({
   repo:repo(),role:'CEO',slot:'CEO',minutes:10080
  })));
  e('delegate-guest').addEventListener('click',event=>activateButton(event.currentTarget,async()=>{
   const task=e('delegate-guest-task').value.trim();
   if(!task)throw Error('กรอกงานสั้น ๆ สำหรับ AI อิสระ');
   await createLink({repo:repo(),role:'GUEST-ENGINEER',slot:'GUEST-ENGINEER',
    issue:0,reason:task,minutes:guestMinutes});
  }));
  e('delegate-child').addEventListener('click',event=>activateButton(event.currentTarget,async()=>{
   const no=Number(e('delegate-task').value),task=tasks.find(t=>t.number===no);
   if(!task)throw Error('เลือก Issue ที่ CEO แต่งตั้งแล้ว');
   if(!task.agent_slot||task.agent_slot==='UNASSIGNED')throw Error('Issue นี้ไม่มี AGENT_SLOT');
   await createLink({repo:repo(),role:task.role,slot:task.agent_slot,issue:no,minutes:720});
  }));
  e('delegate-copy').addEventListener('click',async()=>{
   if(!e('delegate-relay').value.trim())return state('ยังไม่มีข้อความส่งต่อ');
   try{await navigator.clipboard.writeText(e('delegate-relay').value);state('คัดลอกแล้ว ส่งให้แชทผู้รับ');}
   catch{e('delegate-relay').select();state('เลือกข้อความแล้ว โปรดคัดลอกด้วยอุปกรณ์');}
  });
  e('delegate-login').addEventListener('click',()=>{location.href='/api/auth/login'});
  if(new URLSearchParams(location.search).has('agent_repo')){
   const name=new URLSearchParams(location.search).get('agent_repo');
   if(WRITE_REPOS.includes(name)){
    e('repo-select').value=OWNER+'/'+name;
    e('repo-select').dispatchEvent(new Event('change'));
    history.replaceState(null,'',location.pathname+location.hash);
    if(location.hash==='#ceo')nav?.click();
    else if(location.hash==='#workspace')document.querySelector('.navigation [data-view="workspace"]')?.click();
    else document.querySelector('.navigation [data-view="mywork"]')?.click();
   }
  }
  refresh();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();