// GitHub-backed operations console. Actions require explicit owner interaction.
// No embedded AI model or autonomous worker, and no Merge/Delete endpoint.
import {FULL_REPOS,OWNER} from './repositories.js';
(()=>{
 'use strict';
 const el=id=>document.getElementById(id);
 const repo=()=>el('repo-select')?.value?.split('/')[1]||'';
 let authorized=false,seq=0;
 const note=(message)=>{el('ops-notice').textContent=message};
 function url(path,query={}){const qs=new URLSearchParams({repo:repo(),...query});return '/api/v1/ops/'+path+'?'+qs;}
 function link(name,href){const a=document.createElement('a');a.href=href;a.textContent=name;a.target='_blank';a.rel='noopener noreferrer';return a;}
 async function api(path,body){
  const r=await fetch(body===undefined?url(path):'/api/v1/ops/'+path,{method:body===undefined?'GET':'POST',
   headers:body===undefined?{}:{'content-type':'application/json'},credentials:'same-origin',
   body:body===undefined?undefined:JSON.stringify({repo:repo(),...body}),cache:'no-store'});
  const data=await r.json();
  if(!r.ok)throw Error(data.hint||data.error||('HTTP '+r.status));
  return data;
 }
 async function action(btn,callback){
  if(!authorized){note('กรุณาเชื่อมต่อ GitHub ด้วยบัญชีเจ้าของก่อน');return;}
  btn.disabled=true;
  try{await callback()}catch(error){note('ดำเนินการไม่สำเร็จ: '+error.message)}
  finally{btn.disabled=false}
 }
 async function login(){
  const r=await fetch('/api/auth/me',{cache:'no-store'});const user=await r.json();
  authorized=Boolean(user.authenticated);
  el('ops-auth').textContent=authorized?'บัญชีเจ้าของ: '+user.login+' · ใช้สิทธิ์ GitHub App ตามแต่ละ Repository':'ยังไม่ล็อกอิน · กด “เชื่อมต่อ GitHub” ด้านบน';
  for(const id of ['ops-create','ops-comment-send','ops-assign-send','ops-status-send','ops-dispatch-send'])el(id).disabled=!authorized;
  return authorized;
 }
 function showIssues(issues){
  const out=el('ops-issue-list');out.replaceChildren();
  if(!issues.length){out.textContent='ไม่พบ Issue';return;}
  for(const task of issues){
   const row=document.createElement('div');row.className='org-document';
   const info=document.createElement('div');info.className='agent-task-info';
   info.append(link('#'+task.number+' '+task.title,task.url));
   const small=document.createElement('small');small.textContent='Status: '+task.state+' · Labels: '+(task.labels||[]).join(', ')+' · GitHub assignee: '+(task.assignees||[]).join(', ');info.append(small);
   const choose=document.createElement('button');choose.type='button';choose.className='secondary-button';choose.textContent='เลือกงานนี้';
   choose.addEventListener('click',()=>{el('ops-number').value=String(task.number);note('เลือก Issue #'+task.number+' แล้ว');});
   row.append(info,choose);out.append(row);
  }
 }
 function showRuns(runs){
  const out=el('ops-run-list');out.replaceChildren();
  if(!runs.length){out.textContent='ไม่มี Workflow Runs';return;}
  for(const item of runs){
   const row=document.createElement('div');row.className='org-document';
   const div=document.createElement('div');div.className='agent-task-info';
   div.append(link('#'+item.id+' '+item.name,item.url));
   const small=document.createElement('small');small.textContent=(item.head_branch||'-')+' · '+item.head_sha?.slice(0,10)+' · '+item.status+' / '+(item.conclusion||'NOT_RUN');div.append(small);
   const btn=document.createElement('button');btn.className='secondary-button';btn.type='button';btn.textContent='ดู Jobs';
   btn.addEventListener('click',()=>showJobs(item.id,btn));
   row.append(div,btn);out.append(row);
  }
 }
 async function showJobs(id,button){
  await action(button,async()=>{
   const response=await fetch('/api/v1/ops/jobs?repo='+encodeURIComponent(repo())+'&run='+encodeURIComponent(String(id)),{credentials:'same-origin',cache:'no-store'});
   const data=await response.json();if(!response.ok)throw Error(data.error||'Jobs unavailable');
   const target=el('ops-job-list');target.replaceChildren();
   target.append(document.createTextNode('Workflow Run #'+id));
   for(const job of data.jobs){
    const x=document.createElement('p');x.textContent=job.name+' — '+job.status+' / '+(job.conclusion||'NOT_RUN');
    target.append(x);
    for(const step of job.steps){const s=document.createElement('small');s.style.display='block';s.textContent=' • '+step.name+': '+(step.conclusion||step.status);target.append(s);}
   }
   note('โหลดผล Jobs แล้ว · อย่าสรุปว่า QA ผ่านหากไม่มีการทดสอบตาม SHA');
  });
 }
 async function reload(){
  const counter=++seq;
  if(!FULL_REPOS.includes(el('repo-select').value)){note('Repository ไม่อยู่ในรายการที่อนุญาต');return;}
  try{if(!await login())return;}catch{note('ตรวจ GitHub Login ไม่สำเร็จ');return;}
  note('กำลังโหลด Issues, Workflows, Actions และ Branch งาน...');
  const results=await Promise.allSettled([
   api('issues'),api('workflows'),api('runs'),
   fetch('/api/v1/work/branches?repo='+encodeURIComponent(repo()),{credentials:'same-origin'}).then(async r=>{const j=await r.json();if(!r.ok)throw Error(j.error);return j;})
  ]);
  if(counter!==seq)return;
  const [issues,workflows,runs,branches]=results;
  if(issues.status==='fulfilled')showIssues(issues.value.issues);else el('ops-issue-list').textContent='โหลด Issues ไม่สำเร็จ: '+issues.reason.message;
  const choose=el('ops-workflow');choose.replaceChildren(new Option('เลือก Workflow',''));
  if(workflows.status==='fulfilled')for(const w of workflows.value.workflows)choose.add(new Option(w.name+' ('+w.state+')',String(w.id)));
  if(runs.status==='fulfilled')showRuns(runs.value.runs);else el('ops-run-list').textContent='โหลด Actions ไม่สำเร็จ: '+runs.reason.message;
  const branchSelect=el('ops-branch');branchSelect.replaceChildren(new Option('เลือก Branch งาน acc/...',''));
  if(branches.status==='fulfilled')for(const b of branches.value.branches)branchSelect.add(new Option(b.name,b.name));
  note('โหลดแล้ว · '+results.filter(r=>r.status==='fulfilled').length+'/4 ส่วนพร้อม · สิทธิ์ของ GitHub App อาจต่างกันตาม Repository');
 }
 function setup(){
  const nav=document.querySelector('.navigation [data-view="operations"]');
  nav?.addEventListener('click',reload);
  el('repo-select').addEventListener('change',()=>{if(!el('view-operations').classList.contains('hidden'))reload();});
  el('ops-refresh').addEventListener('click',reload);
  el('ops-create').addEventListener('click',e=>action(e.currentTarget,async()=>{
   const title=el('ops-title').value.trim(),role=el('ops-role').value;
   if(title.length<3)throw Error('หัวข้องานต้องยาวอย่างน้อย 3 ตัวอักษร');
   const data=await api('issue',{title,role,scope:el('ops-scope').value,editable_paths:el('ops-paths').value,reports_to:el('ops-reports').value,acceptance:el('ops-qa').value});
   note('สร้าง Issue #'+data.issue.number+' แล้ว · ยังไม่เรียก AI มาเริ่มงาน / '+data.activation);
   el('ops-number').value=String(data.issue.number);reload();
  }));
  el('ops-comment-send').addEventListener('click',e=>action(e.currentTarget,async()=>{
   const number=el('ops-number').value,comment=el('ops-comment').value.trim();
   if(!number||!comment)throw Error('กรอก Issue # และข้อความ');
   const d=await api('comment',{number,comment});
   note('บันทึกข้อความใน Issue #'+d.issue+' สำเร็จ');el('ops-comment').value='';
  }));
  el('ops-assign-send').addEventListener('click',e=>action(e.currentTarget,async()=>{
   const number=el('ops-number').value,username=el('ops-username').value.trim();
   if(!number||!username)throw Error('ต้องกรอก Issue # และชื่อบัญชี GitHub จริง');
   const d=await api('assign',{number,username});
   note('มอบหมายบน GitHub Issue #'+d.issue+' ให้ '+d.assignees.join(', ')+' · ไม่ได้เรียก AI ใหม่ให้เริ่มงาน');
  }));
  el('ops-status-send').addEventListener('click',e=>action(e.currentTarget,async()=>{
   const number=el('ops-number').value,status=el('ops-status').value;
   if(!number)throw Error('เลือก Issue ก่อนเปลี่ยนสถานะ');
   const data=await api('status',{number,status,confirm:'CHANGE_STATUS'});
   note('เปลี่ยน Issue #'+data.issue+' เป็น '+data.status+' แล้ว · ยังไม่ถือว่า QA อนุมัติหรือ AI เริ่มงาน');
   reload();
  }));
  el('ops-dispatch-send').addEventListener('click',e=>action(e.currentTarget,async()=>{
   const workflow=el('ops-workflow').value,branch=el('ops-branch').value;
   if(!workflow||!branch||!el('ops-confirm').checked)throw Error('เลือก Workflow/Branch และทำเครื่องหมายยืนยันก่อน');
   let inputs;
   try{inputs=JSON.parse(el('ops-inputs').value.trim()||'{}')}catch{throw Error('Inputs ต้องเป็น JSON ที่ถูกต้อง')}
   if(!inputs||typeof inputs!=='object'||Array.isArray(inputs))throw Error('Inputs ต้องเป็น Object');
   const data=await api('dispatch',{workflow,branch,inputs,confirm:'RUN_WORKFLOW'});
   note('ส่งคำสั่ง Run '+data.workflow+' บน '+data.branch+' แล้ว · CI และ QA ยังไม่ยืนยัน');
   el('ops-confirm').checked=false;
  }));
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();