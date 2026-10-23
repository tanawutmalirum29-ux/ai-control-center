// AI Control Center branch cleanup: explicit OWNER action with preview and SHA verification.
import {OWNER,WRITE_REPOS} from './repositories.js';
(()=>{
 'use strict';
 const el=id=>document.getElementById(id);
 const repo=()=>el('repo-select')?.value?.split('/')[1]||'';
 let snapshot=null,context='',owner=false,busy=false,stop=false;
 const show=s=>{el('branch-status').textContent=s;};
 function clear(){
  snapshot=null;context=repo();stop=false;
  el('branch-count').textContent='—';
  el('branch-pr-count').textContent='—';
  el('branch-protected-count').textContent='—';
  el('branch-list').replaceChildren();
  el('branch-confirm').value='';
  el('branch-risk-code').checked=false;
  el('branch-risk-pr').checked=false;
  el('branch-delete').disabled=true;
  el('branch-copy').disabled=true;
  el('branch-stop').hidden=true;
  show('เลือก Repository แล้วกด Preview · main จะไม่ถูกเลือกเพื่อลบ');
 }
 async function auth(){
  const r=await fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'});
  if(!r.ok)throw Error('cannot_verify_owner');
  const data=await r.json();
  owner=Boolean(data.authenticated&&data.login===OWNER);
  el('branch-login').hidden=owner;
  el('branch-owner').textContent=owner?'OWNER ยืนยันตัวตนแล้ว · Branch ลบได้ตามสิทธิ์ GitHub':
    'ต้องเข้าสู่ระบบ GitHub ในฐานะ OWNER ก่อน (AI และ Token กลางไม่มีสิทธิ์ลบ Branch)';
  el('branch-preview').disabled=!owner||busy||!WRITE_REPOS.includes(repo());
  ready();
  return owner;
 }
 function ready(){
  el('branch-delete').disabled=!(owner&&!busy&&snapshot&&context===repo()&&
   snapshot.repo===OWNER+'/'+repo()&&snapshot.default_branch==='main'&&
   snapshot.total>0&&snapshot.protected_count===0&&
   el('branch-confirm').value.trim()==='DELETE BRANCHES '+snapshot.repo&&
   el('branch-risk-code').checked&&el('branch-risk-pr').checked);
 }
 async function call(path,body,selected=repo()){
  const options={credentials:'same-origin',cache:'no-store'};
  if(body!==undefined){options.method='POST';options.headers={'content-type':'application/json'};
   options.body=JSON.stringify(body);}
  const pathUrl='/api/v1/maintenance/branches/'+path+
   (body===undefined?'?repo='+encodeURIComponent(selected):'');
  const r=await fetch(pathUrl,options);
  const data=await r.json().catch(()=>({}));
  if(!r.ok&&r.status!==207)throw Error(data.error+
   (data.default_branch?' (default branch: '+data.default_branch+')':'')+
   (data.github_status?' (GitHub HTTP '+data.github_status+')':''));
  return {data,status:r.status};
 }
 function render(data){
  if(data.repo!==OWNER+'/'+repo()||data.default_branch!=='main'||
   !Array.isArray(data.branches)||data.total!==data.branches.length)throw Error('invalid_branch_snapshot');
  snapshot=data;context=repo();
  el('branch-count').textContent=String(data.total);
  el('branch-pr-count').textContent=String(data.open_pr_branch_count);
  el('branch-protected-count').textContent=String(data.protected_count);
  const list=el('branch-list');list.replaceChildren();
  for(const b of data.branches.slice(0,80)){
   const row=document.createElement('div');row.className='cleanup-entry';
   const detail=(b.protected?' [PROTECTED]':'')+(b.open_prs.length?' [OPEN PR: '+b.open_prs.map(p=>'#'+p.number).join(', ')+']':'');
   row.textContent=b.name+' @ '+b.sha.slice(0,12)+detail;
   list.append(row);
  }
  if(data.total>80){
   const row=document.createElement('p');row.textContent='… อีก '+(data.total-80)+' Branch (ดูทั้งหมดใน Preview JSON)';list.append(row);
  }
  el('branch-copy').disabled=false;
  if(data.protected_count)show('พบ '+data.protected_count+' Branch ที่ถูกป้องกันนอกเหนือจาก main · หยุดไว้ก่อน: ต้องปลดกฎป้องกัน Branch เหล่านั้นที่ GitHub ก่อน');
  else if(data.total===0)show('ตรวจ GitHub แล้ว · เหลือ main เพียง Branch เดียว (0 Branch ที่ต้องลบ)');
  else show('พบ '+data.total+' Branch ที่ลบได้ · '+data.open_pr_branch_count+
   ' Branch มี PR เปิดอยู่ · อาจมีโค้ดที่ยังไม่ Merge · โปรดตรวจรายชื่อและยืนยันความเสี่ยง');
  ready();
 }
 async function preview(){
  if(busy)return;
  el('branch-preview').disabled=true;
  try{
   if(!await auth())throw Error('owner_login_required');
   snapshot=null;ready();el('branch-copy').disabled=true;
   show('กำลังโหลดรายการ Branch, ค่า default และ PR ที่เปิดอยู่จาก GitHub…');
   const selected=repo();
   const {data}=await call('preview',undefined,selected);
   if(selected!==repo())throw Error('repository_changed_during_preview');
   render(data);
  }catch(e){snapshot=null;el('branch-count').textContent='—';show('ตรวจรายการไม่สำเร็จ: '+e.message);}
  finally{el('branch-preview').disabled=!owner||!WRITE_REPOS.includes(repo());}
 }
 async function erase(){
  if(el('branch-delete').disabled||!snapshot||busy)return;
  const original=snapshot,selected=repo(),amount=original.total;
  busy=true;stop=false;
  el('branch-preview').disabled=true;el('branch-delete').disabled=true;el('branch-stop').hidden=false;
  el('branch-confirm').disabled=true;el('branch-risk-code').disabled=true;el('branch-risk-pr').disabled=true;
  let n=0,failure='';
  try{
   for(let i=0;i<amount;i+=5){
    if(stop||repo()!==selected){failure='ยกเลิกตามคำสั่งหรือ Repository เปลี่ยน';break;}
    const batch=original.branches.slice(i,i+5).map(b=>({name:b.name,sha:b.sha}));
    show('ลบ Branch '+n+'/'+amount+' · main ยังคงอยู่ · หยุดได้หลัง Batch นี้');
    let outcome;
    try{outcome=await call('delete',{repo:selected,keep:'main',
     confirm:'DELETE BRANCHES '+original.repo,acknowledge_unmerged:true,acknowledge_open_prs:true,branches:batch},selected);}
    catch(e){failure=e.message;break;}
    const d=outcome.data;
    n+=(d.deleted||[]).length;
    if(outcome.status===207||d.error){failure='หยุดที่ '+(d.failed||'?')+': '+(d.detail||d.error);break;}
   }
  }finally{
   busy=false;el('branch-stop').hidden=true;
   el('branch-confirm').disabled=false;el('branch-risk-code').disabled=false;el('branch-risk-pr').disabled=false;
   snapshot=null;el('branch-confirm').value='';el('branch-risk-code').checked=false;el('branch-risk-pr').checked=false;
   ready();
  }
  show('ลบแล้ว '+n+'/'+amount+' Branch · กำลังตรวจยอดคงเหลือจาก GitHub…');
  try{
   const {data}=await call('preview',undefined,selected);
   if(repo()===selected){
    render(data);
    show('ลบจริง '+n+'/'+amount+' Branch · เหลือ Branch อื่น '+data.total+
     (data.total===0?' · คงเหลือ main เท่านั้น':' · '+(failure||'โปรดตรวจรายการที่เหลือ')));
   }
  }catch(e){show('ลบแล้ว '+n+' Branch แต่ยืนยันยอดคงเหลือไม่ได้: '+e.message);}
  el('branch-preview').disabled=!owner||!WRITE_REPOS.includes(repo());
 }
 function setup(){
  if(!el('branch-panel'))return;
  el('branch-preview').addEventListener('click',preview);
  el('branch-delete').addEventListener('click',erase);
  el('branch-stop').addEventListener('click',()=>{stop=true;show('กำลังหยุดหลัง Batch ปัจจุบัน…');});
  el('branch-confirm').addEventListener('input',ready);
  el('branch-risk-code').addEventListener('change',ready);
  el('branch-risk-pr').addEventListener('change',ready);
  el('branch-copy').addEventListener('click',async()=>{
   if(!snapshot)return;
   try{await navigator.clipboard.writeText(JSON.stringify(snapshot,null,2));
    show('คัดลอก JSON รายการ Branch '+snapshot.total+' รายการแล้ว (ไม่ใช่ Backup โค้ด)');}
   catch{show('คัดลอกไม่สำเร็จ');}
  });
  el('repo-select').addEventListener('change',()=>{
   if(busy)stop=true;
   clear();auth().catch(()=>show('ตรวจสิทธิ์ OWNER ไม่ได้'));
  });
  clear();auth().catch(()=>show('ตรวจสิทธิ์ OWNER ไม่ได้'));
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);
 else setup();
})();