// QA evidence per PR/head SHA; repository-wide CI is not PR-specific QA.
import {FULL_REPOS} from './repositories.js';
(()=>{
 'use strict';
 const escape=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 const sel=()=>document.getElementById('repo-select')?.value||'';
 const roots=['overview-pulls','all-pulls'];
 const label=gate=>({QA_BLOCK:'BLOCKED',WAITING_QA:'WAITING QA',UNKNOWN:'UNKNOWN',CHECKS_PASS_REVIEWED:'CI PASS + REVIEW'}[gate]||gate);
 const color=gate=>gate==='QA_BLOCK'?'bad':gate==='CHECKS_PASS_REVIEWED'?'good':'wait';
 async function inspect(number,button,notice){
  const repo=sel();if(!FULL_REPOS.includes(repo))return;
  button.disabled=true;notice.textContent='กำลังตรวจ QA...';
  try{
   const response=await fetch('/api/v1/pr-qa?repo='+encodeURIComponent(repo.split('/')[1])+'&pr='+number,{headers:{Accept:'application/json'}});
   const data=await response.json();
   if(!response.ok)throw new Error(data.reason||data.error);
   if(sel()!==repo||Number(data.pr)!==number)return;
   const stale=data.stale?' (ข้อมูลสำรอง)':'';
   notice.innerHTML='<span class="status-tag '+color(data.gate)+'">'+escape(label(data.gate))+'</span>'+
     '<small>SHA '+escape((data.head_sha||'').slice(0,10))+' · CI '+escape(data.checks_state)+' · Review '+escape(data.review_state)+stale+'</small>'+
     '<small>PR นี้ยังไม่ผ่านการตรวจ QA แบบ Manual อัตโนมัติ และเว็บไม่มีสิทธิ์ Merge</small>';
  }catch(e){notice.textContent='QA ไม่พร้อม: '+e.message+' — ห้ามสรุปว่าผ่าน';}
  finally{button.disabled=false;}
 }
 function enhance(){
  for(const id of roots){
   const parent=document.getElementById(id);if(!parent)continue;
   for(const row of parent.querySelectorAll('.list-item:not([data-qa-ready])')){
    const a=row.querySelector('a[href*="/pull/"]');if(!a)continue;
    const n=Number(a.href.match(/\/pull\/(\d+)/)?.[1]);if(!Number.isSafeInteger(n)||n<1)continue;
    row.dataset.qaReady='1';
    const wrapper=document.createElement('div');wrapper.className='pr-qa-actions';
    const btn=document.createElement('button');btn.type='button';btn.className='secondary-button';btn.textContent='ตรวจ QA ของ PR';
    const output=document.createElement('div');output.className='pr-qa-output';output.textContent='ยังไม่ได้ตรวจ QA ของ PR นี้';
    btn.addEventListener('click',()=>inspect(n,btn,output));wrapper.append(btn,output);row.append(wrapper);
   }
  }
 }
 function setup(){for(const id of roots){const root=document.getElementById(id);if(root)new MutationObserver(enhance).observe(root,{childList:true});}enhance();}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();
