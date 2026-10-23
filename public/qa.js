// Website-only PR and CI review. QA reports are exchanged in D1 M/T rooms.
import {FULL_REPOS} from './repositories.js';
(()=>{
'use strict';
const el=id=>document.getElementById(id),repo=()=>el('repo-select').value.split('/')[1]||'';
let nonce=0;
async function checkPR(e){
 e?.preventDefault();
 const n=Number(el('qa-pr-number').value);
 const out=el('qa-pr-output');
 if(!Number.isSafeInteger(n)||n<1){out.textContent='ใส่หมายเลข Pull Request ที่ถูกต้อง';return}
 const btn=el('qa-inspect');btn.disabled=true;out.textContent='กำลังตรวจ HEAD SHA / CI / Review ของ PR #'+n;
 try{
  const response=await fetch('/api/v1/pr-qa?repo='+encodeURIComponent(repo())+'&pr='+n+'&fresh=1',{cache:'no-store'});
  const d=await response.json();if(!response.ok)throw Error(d.error||d.reason||'QA endpoint unavailable');
  out.replaceChildren();
  const title=document.createElement('strong');title.textContent='PR #'+n+' · '+(d.gate||'UNKNOWN');out.append(title);
  for(const line of ['HEAD SHA: '+(d.head_sha||'UNKNOWN'),'CI: '+(d.checks_state||'UNKNOWN'),
    'Review: '+(d.review_state||'UNKNOWN'),d.stale?'ข้อมูลเก่า — ต้องรีเฟรชก่อน QA':'ตรวจข้อมูลสดแล้ว']){
   const p=document.createElement('p');p.textContent=line;out.append(p);
  }
  const note=document.createElement('p');
  note.textContent='บันทึกผลตรวจภาพ/โค้ดและการอนุมัติ QA ลง M/T ห้ององค์กร ไม่ใช้ GitHub Issue';
  out.append(note);
 }catch(err){out.textContent='ตรวจ PR ไม่สำเร็จ: '+err.message}
 finally{btn.disabled=false}
}
async function runs(){
 const target=el('qa-runs'),seq=++nonce;target.textContent='กำลังโหลด CI ของโปรเจกต์...';
 if(!FULL_REPOS.includes(el('repo-select').value)){target.textContent='โปรเจกต์ไม่อยู่ในรายการ';return}
 try{
  const response=await fetch('/api/v1/ops/runs?repo='+encodeURIComponent(repo()),{cache:'no-store'});
  const d=await response.json();if(!response.ok)throw Error(d.error||'ไม่สามารถโหลด Actions');
  if(seq!==nonce)return;
  target.replaceChildren();
  if(!d.runs?.length){target.textContent='ยังไม่พบ CI';return}
  for(const run of d.runs.slice(0,20)){
   const row=document.createElement('div');row.className='org-document';
   const btn=document.createElement('button');btn.type='button';btn.className='secondary-button';
   btn.textContent='#'+run.id+' · '+(run.name||'CI')+' · '+(run.conclusion||run.status||'UNKNOWN');
   const sub=document.createElement('small');sub.textContent=(run.head_branch||'main')+' · SHA '+(run.head_sha||'').slice(0,12);
   const detail=document.createElement('div');
   btn.onclick=async()=>{
    detail.textContent='กำลังอ่าน Jobs...';
    try{const resp=await fetch('/api/v1/ops/jobs?repo='+encodeURIComponent(repo())+'&run='+run.id,{cache:'no-store'});
      const info=await resp.json();if(!resp.ok)throw Error(info.error||'Jobs unavailable');
      detail.replaceChildren();for(const job of info.jobs||[]){const p=document.createElement('p');p.textContent=job.name+' · '+(job.conclusion||job.status);detail.append(p)}
    }catch(e){detail.textContent='โหลด Jobs ไม่สำเร็จ: '+e.message}
   };
   row.append(btn,sub,detail);target.append(row);
  }
 }catch(err){target.textContent='CI ไม่พร้อม: '+err.message}
}
function init(){
 el('pr-qa-form').addEventListener('submit',checkPR);
 el('qa-refresh').addEventListener('click',runs);
 document.querySelectorAll('[data-view="qa"]').forEach(b=>b.addEventListener('click',runs));
 el('repo-select').addEventListener('change',()=>{el('qa-pr-output').textContent='เลือก PR ของโปรเจกต์นี้เพื่อตรวจ QA';if(!el('view-qa').classList.contains('hidden'))runs()});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
