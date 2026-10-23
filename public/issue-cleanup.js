// Browser-agent-friendly, owner-only permanent Issue cleanup console.
// Preview first, typed repository confirmation, resumable batches, and final recount.
// Never call this API with the site-wide shared credential.
import {OWNER,WRITE_REPOS} from './repositories.js';
(()=>{
'use strict';
const el=id=>document.getElementById(id);
const repo=()=>el('repo-select')?.value?.split('/')[1]||'';
let snapshot=null,working=false,stop=false,owner=false,context='';
const status=s=>{el('cleanup-status').textContent=s;};
function reset(){
 snapshot=null;context=repo();stop=false;
 el('cleanup-count').textContent='—';
 el('cleanup-confirm').value='';
 el('cleanup-agree').checked=false;
 el('cleanup-sample').replaceChildren();
 el('cleanup-delete').disabled=true;
 el('cleanup-copy').disabled=true;
 el('cleanup-stop').hidden=true;
 status('เลือก Repository แล้วกด “ตรวจรายการ” เพื่อโหลดรายการ Issues ทั้ง Open และ Closed');
}
async function request(path,data){
 const options={credentials:'same-origin',cache:'no-store'};
 if(data!==undefined){options.method='POST';options.headers={'content-type':'application/json'};options.body=JSON.stringify(data);}
 const url='/api/v1/maintenance/issues/'+path+(data===undefined?'?repo='+encodeURIComponent(repo()):'');
 const response=await fetch(url,options);
 const result=await response.json().catch(()=>({}));
 if(!response.ok&&response.status!==207)throw Error(result.detail||result.error||'HTTP '+response.status);
 return {result,status:response.status};
}
function confirmed(){
 return owner&&!working&&snapshot&&context===repo()&&snapshot.repo===OWNER+'/'+repo()&&
  snapshot.issues.length>0&&el('cleanup-confirm').value.trim()==='DELETE '+snapshot.repo&&el('cleanup-agree').checked;
}
function ready(){el('cleanup-delete').disabled=!confirmed();}
async function auth(){
 const resp=await fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'});
 const data=await resp.json();
 owner=Boolean(data.authenticated&&data.login===OWNER);
 el('cleanup-owner').textContent=owner?
  'OWNER ยืนยันตัวตนแล้ว — ลบถาวรได้เฉพาะ Repository ที่อนุญาต':
  'ต้องเข้าสู่ระบบ GitHub ด้วยบัญชี OWNER ก่อนใช้การลบถาวร (Token กลางและ AI ไม่ได้รับสิทธิ์นี้)';
 el('cleanup-preview').disabled=!owner||!WRITE_REPOS.includes(repo())||working;
 ready();
 return owner;
}
function render(data){
 snapshot=data;context=repo();
 el('cleanup-count').textContent=String(data.total);
 el('cleanup-copy').disabled=false;
 const view=el('cleanup-sample');view.replaceChildren();
 const examples=data.issues.slice(0,25);
 for(const issue of examples){
  const line=document.createElement('div');line.className='cleanup-entry';
  line.textContent='#'+issue.number+' ['+issue.state+'] '+issue.title;
  view.append(line);
 }
 if(data.total>examples.length){
  const extra=document.createElement('p');extra.textContent='… และอีก '+(data.total-examples.length)+' Issues (ส่งออก JSON ได้ทั้งหมด)';view.append(extra);
 }
 if(!data.total){status('ไม่พบ Issues แล้ว (รวม Open + Closed) — รายการปัจจุบัน = 0');}
 else{status('Preview สำเร็จ: '+data.total+' Issues ใน '+data.repo+' · ไม่รวม Pull Requests · ยังไม่ได้ลบข้อมูล');}
 ready();
}
async function preview(){
 if(working)return;
 const button=el('cleanup-preview');button.disabled=true;
 try{
  if(!await auth())throw Error('owner_github_login_required');
  snapshot=null;el('cleanup-copy').disabled=true;ready();
  status('กำลังตรวจ Issues ทั้งหมดจาก GitHub…');
  const {result}=await request('preview');
  if(result.repo!==OWNER+'/'+repo()||result.total!==result.issues.length)throw Error('repository_or_snapshot_mismatch');
  render(result);
 }catch(error){snapshot=null;el('cleanup-count').textContent='—';status('Preview ไม่สำเร็จ: '+error.message);}
 finally{button.disabled=!owner;}
}
async function run(){
 if(!confirmed())return;
 const original=snapshot,selected=repo(),button=el('cleanup-delete');
 working=true;stop=false;button.disabled=true;el('cleanup-preview').disabled=true;el('cleanup-stop').hidden=false;
 el('cleanup-confirm').disabled=true;el('cleanup-agree').disabled=true;
 let deleted=0,failure='';
 try{
  for(let at=0;at<original.issues.length;at+=5){
   if(stop||repo()!==selected){failure='หยุดตามคำสั่งหรือ Repository เปลี่ยน';break;}
   const batch=original.issues.slice(at,at+5).map(x=>({id:x.id,number:x.number,updatedAt:x.updatedAt}));
   status('กำลังลบถาวร '+deleted+'/'+original.total+' ใน '+original.repo+' · หยุดได้หลังจบ Batch');
   let value;
   try{value=await request('delete',{repo:selected,confirm:'DELETE '+original.repo,issues:batch});}
   catch(error){failure=error.message;break;}
   const outcome=value.result;
   deleted+=(outcome.deleted||[]).length;
   if(value.status===207||outcome.error){failure='หยุดที่ #'+(outcome.failed||'?')+': '+(outcome.detail||outcome.error);break;}
  }
 }finally{
  working=false;el('cleanup-stop').hidden=true;el('cleanup-confirm').disabled=false;el('cleanup-agree').disabled=false;
  el('cleanup-confirm').value='';el('cleanup-agree').checked=false;
  snapshot=null;ready();
 }
 if(failure||stop){
  status('ลบสำเร็จ '+deleted+'/'+original.total+' · '+(failure||'หยุดแล้ว')+' · กดตรวจรายการใหม่ก่อนเริ่มต่อ');
 }else{
  status('ลบไป '+deleted+' รายการ กำลังตรวจจำนวนที่เหลือบน GitHub…');
 }
 try{
  const {result}=await request('preview');
  if(repo()===selected){
   render(result);
   if(failure||stop)status('ลบถาวร '+deleted+' รายการ · '+(failure||'หยุดตามคำสั่ง')+' · เหลือ '+result.total+' รายการ');
   else status('ลบถาวร '+deleted+' รายการ · ตรวจสอบ GitHub แล้ว: เหลือ '+result.total+
     (result.total===0?' (เสร็จสมบูรณ์)':' (มีรายการใหม่/ข้อมูลเปลี่ยน โปรดตรวจอีกครั้ง)'));
  }
 }catch(error){status('ลบไป '+deleted+' รายการ แต่ตรวจจำนวนที่เหลือไม่ได้: '+error.message);}
 el('cleanup-preview').disabled=!owner;
 // Existing operations list is intentionally a secondary cache, refresh on demand.
}
function setup(){
 if(!el('cleanup-panel'))return;
 el('cleanup-preview').addEventListener('click',preview);
 el('cleanup-delete').addEventListener('click',run);
 el('cleanup-stop').addEventListener('click',()=>{stop=true;status('ได้รับคำสั่งหยุดแล้ว · จบรอบปัจจุบันก่อนหยุด');});
 el('cleanup-copy').addEventListener('click',async()=>{
  if(!snapshot)return;
  try{await navigator.clipboard.writeText(JSON.stringify(snapshot,null,2));status('คัดลอก Issue snapshot JSON แล้ว ('+snapshot.total+' รายการ)');}
  catch{status('คัดลอกไม่สำเร็จ ใช้การตรวจรายการบนหน้าเว็บแทน');}
 });
 el('cleanup-confirm').addEventListener('input',ready);
 el('cleanup-agree').addEventListener('change',ready);
 el('repo-select').addEventListener('change',()=>{if(working)stop=true;reset();auth().catch(()=>status('ตรวจสิทธิ์ OWNER ไม่ได้'));});
 reset();auth().catch(()=>status('ตรวจสิทธิ์ OWNER ไม่ได้'));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();