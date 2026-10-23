// Embedded GitHub Issue and PR reader. Never requires leaving AI Control Center.
import {OWNER,REPOS} from './repositories.js';
(()=>{
 const el=id=>document.getElementById(id);
 let seq=0,shown={repo:null,kind:'issue',number:null};
 const text=(tag,cls,value)=>{
  const node=document.createElement(tag);
  if(cls)node.className=cls;
  node.textContent=value===undefined?'':String(value);
  return node;
 };
 const path=(repo,kind,number)=>'/?repo='+encodeURIComponent(repo)+'&'+
  (kind==='pr'?'pr':'issue')+'='+number;
 function selectedRepo(){return el('repo-select').value.split('/')[1];}
 function addParagraph(container,title,value){
  const group=text('div','detail-section');
  group.append(text('h4',null,title),text('pre','detail-plaintext',value||'(ไม่มีรายละเอียด)'));
  container.append(group);
 }
 async function open(repo,kind,number,{historyUpdate=true}={}){
  if(!REPOS.includes(repo)||!['issue','pr'].includes(kind)||!Number.isSafeInteger(number)||number<1)return;
  shown={repo,kind,number};
  const selected=OWNER+'/'+repo;
  if(el('repo-select').value!==selected){
   const option=[...el('repo-select').options].find(x=>x.value===selected);
   if(option){el('repo-select').value=selected;el('repo-select').dispatchEvent(new Event('change'));}
  }
  document.querySelector('.navigation [data-view="issue"]')?.click();
  el('detail-number').value=number;
  el('detail-kind').value=kind;
  el('detail-comment-target').value=String(number);
  const id=++seq;
  el('detail-state').textContent='กำลังโหลด '+kind.toUpperCase()+' #'+number+' จาก GitHub ผ่าน Control Center...';
  el('detail-content').replaceChildren();
  if(historyUpdate)history.replaceState(null,'',path(repo,kind,number));
  try{
   const url='/api/v1/detail?repo='+encodeURIComponent(repo)+'&kind='+kind+'&number='+number+'&fresh=1';
   const response=await fetch(url,{cache:'no-store'});
   const data=await response.json();
   if(!response.ok)throw Error(data.error||'HTTP '+response.status);
   if(id!==seq)return;
   el('detail-state').textContent='โหลด '+data.kind.toUpperCase()+' #'+number+
    ' สำเร็จผ่าน AI Control Center'+(data.stale?' (ข้อมูลสำรอง)':'')+
    ' · '+(data.state||'')+' · '+(data.author||'');
   const panel=el('detail-content');
   panel.append(text('h3',null,'#'+number+' · '+data.title));
   panel.append(text('p','small-note','Repository: '+repo+' · อัปเดต: '+(data.updated_at||'ไม่ทราบ')+
    (data.labels?.length?' · Labels: '+data.labels.join(', '):'')));
   if(data.kind==='pr'){
    panel.append(text('p','small-note','LIVE PR HEAD SHA: '+(data.head_sha||'ไม่ทราบ')+
     ' · Branch: '+(data.head_branch||'?')+' → '+(data.base_branch||'?')+
     (data.draft?' · DRAFT':'')+' · SHA ในคำอธิบาย PR อาจเป็นข้อมูลเก่า'));
    const qaState=text('p','small-note','กำลังตรวจ CI/QA ตาม HEAD ปัจจุบัน...');
    panel.append(qaState);
    try{
     const checkResp=await fetch('/api/v1/pr-qa?repo='+encodeURIComponent(repo)+
       '&pr='+number+'&fresh=1',{cache:'no-store'});
     const check=await checkResp.json();
     if(id!==seq)return;
     if(!checkResp.ok||check.stale||check.head_sha!==data.head_sha){
      qaState.textContent='PR HEAD เปลี่ยนระหว่างตรวจหรือ GitHub ไม่พร้อม · ห้ามใช้ผล CI เก่า โปรดกด โหลดใหม่';
     }else{
      qaState.textContent='VERIFIED HEAD '+check.head_sha+' · CI '+check.checks_state+
       ' · QA '+check.gate+' · Independent review '+check.review_state+
       ' · Merge safe: NO';
     }
    }catch(error){if(id!==seq)return;qaState.textContent='ตรวจ CI ตาม HEAD ไม่สำเร็จ · ห้ามอนุมานว่า QA ผ่าน';}
   }
   addParagraph(panel,'รายละเอียดงาน',data.body);
   if(data.kind==='pr'){
    const section=text('div','detail-section');section.append(text('h4',null,
      'ไฟล์ที่เปลี่ยน '+data.files.length+(data.files_truncated?' (มีรายการเพิ่มเติม)':'')));
    for(const file of data.files){
     const d=document.createElement('details');d.className='detail-file';
     d.append(text('summary',null,file.filename+' · '+file.status+' · +'+file.additions+' / -'+file.deletions));
     if(file.patch)d.append(text('pre','detail-plaintext',file.patch));
     section.append(d);
    }
    panel.append(section);
   }
   const comments=text('div','detail-section');
   comments.append(text('h4',null,'ความคิดเห็น '+data.comments.length+
    (data.comments_truncated?' (ยังมีรายการเพิ่มเติม)':'')));
   if(!data.comments.length)comments.append(text('p','small-note','ยังไม่มีความคิดเห็น'));
   for(const c of data.comments){
    const block=text('article','detail-comment');
    block.append(text('strong',null,(c.author||'unknown')+' · '+(c.created_at||'')));
    block.append(text('pre','detail-plaintext',c.body||'(ไม่มีข้อความ)'));
    comments.append(block);
   }
   panel.append(comments);
   const work=document.createElement('button');work.type='button';work.className='primary-button';
   work.textContent='นำงานนี้ไปแก้โค้ดใน Workspace';
   work.addEventListener('click',()=>{
    document.querySelector('.navigation [data-view="workspace"]')?.click();
    if(el('ws-title'))el('ws-title').value='Issue #'+number+' '+data.title;
    if(el('ws-pr-title'))el('ws-pr-title').value='Issue #'+number+' '+data.title;
    if(el('ws-pr-body'))el('ws-pr-body').value='Related '+data.kind+' #'+number+
     '\nงาน: '+path(repo,kind,number)+'\nQA ต้องตรวจ HEAD SHA ของ PR';
   });
   panel.append(work);
  }catch(err){
   if(id!==seq)return;
   el('detail-state').textContent='โหลดรายละเอียดไม่ได้: '+err.message;
   el('detail-content').append(text('p','small-note',
    'หาก GitHub ไม่ตอบกลับ ให้โหลดอีกครั้ง ไม่มีความจำเป็นต้องออกไปหน้า GitHub'));
  }
 }
 async function submitComment(event){
  event.preventDefault();
  const number=Number(el('detail-comment-target').value);
  const body=el('detail-comment-body').value.trim();
  const repo=selectedRepo();
  const status=el('detail-comment-status');
  const button=el('detail-comment-send');
  if(!Number.isSafeInteger(number)||number<1||!body||body.length>3000){
   status.textContent='กรอก Issue ปลายทางและข้อความไม่เกิน 3000 ตัวอักษร';return;
  }
  button.disabled=true;
  status.textContent='กำลังส่งความคิดเห็นไปยัง Issue #'+number+' ...';
  try{
   const response=await fetch('/api/v1/ops/comment',{method:'POST',credentials:'same-origin',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({repo,number,comment:body})});
   const result=await response.json();
   if(!response.ok)throw Error([result.error,result.github_status,result.github_message||result.message].filter(Boolean).join(' · '));
   if(!result.created||result.issue!==number||!result.id)throw Error('GitHub ยังไม่ยืนยันการสร้างความคิดเห็น');
   status.textContent='ส่งสำเร็จ · Issue #'+number+' · GitHub Comment ID '+result.id;
   el('detail-comment-body').value='';
   open(repo,'issue',number,{historyUpdate:true});
  }catch(error){
   status.textContent='ส่งไม่สำเร็จ: '+error.message+' · ตรวจความคิดเห็นที่ Issue ก่อนส่งซ้ำ';
  }finally{button.disabled=false;}
 }
 function setup(){
  el('detail-comment-form').addEventListener('submit',submitComment);
  el('detail-target-qa100').addEventListener('click',()=>{
   el('detail-comment-target').value='100';
   el('detail-comment-status').textContent='เลือก Issue QA #100 แล้ว · ตรวจข้อความก่อนส่ง';
  });
  el('detail-form').addEventListener('submit',event=>{
   event.preventDefault();
   const n=Number(el('detail-number').value),repo=selectedRepo();
   open(repo,el('detail-kind').value,n);
  });
  el('detail-refresh').addEventListener('click',()=>{
   if(shown.repo)open(shown.repo,shown.kind,shown.number,{historyUpdate:false});
  });
  window.addEventListener('acc:open-detail',event=>{
   const d=event.detail||{};
   open(d.repo||selectedRepo(),d.kind||'issue',Number(d.number));
  });
  const query=new URLSearchParams(location.search);
  const wantedRepo=query.get('repo'),raw=query.get('issue')||query.get('pr');
  const kind=query.has('pr')?'pr':'issue';
  if(raw&&/^[1-9]\d{0,7}$/.test(raw)&&REPOS.includes(wantedRepo))
   open(wantedRepo,kind,Number(raw),{historyUpdate:false});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();
