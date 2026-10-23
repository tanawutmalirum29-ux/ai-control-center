// Click-to-select Issue cleanup. Both the selection and final confirmation are in-page.
// Server still requires OAuth OWNER, exact repository confirmation, and fresh node checks.
import {OWNER,WRITE_REPOS} from './repositories.js';
(()=>{
'use strict';
const el=id=>document.getElementById(id);
const repo=()=>el('repo-select')?.value?.split('/')[1]||'';
const selected=new Set();
let snapshot=null,context='',owner=false,busy=false,stop=false;
const note=s=>{el('cleanup-status').textContent=s;};
const items=()=>snapshot?.issues||[];
const chosen=()=>items().filter(x=>selected.has(x.id));
function closeConfirm(){el('cleanup-final').hidden=true;}
function refresh(){
 const ready=owner&&!busy&&context===repo()&&snapshot?.repo===OWNER+'/'+repo();
 const count=chosen().length;
 el('cleanup-selected-count').textContent='เลือก '+count+' / '+items().length+' Issues';
 el('cleanup-delete').disabled=!ready||!count;
 el('cleanup-delete').textContent='2. ลบ '+count+' Issues ที่เลือก';
 el('cleanup-select-all').disabled=!ready||!items().length;
 el('cleanup-clear-selection').disabled=!ready||!count;
 el('cleanup-copy').disabled=!ready;
 el('cleanup-preview').disabled=!owner||busy||!WRITE_REPOS.includes(repo());
}
function clear(){
 snapshot=null;context=repo();selected.clear();if(!busy)stop=false;closeConfirm();
 el('cleanup-count').textContent='—';el('cleanup-sample').replaceChildren();
 el('cleanup-stop').hidden=true;refresh();
 note('เลือก Repository แล้วกดตรวจ Issues เพื่อแสดงรายการให้ติ๊กเลือก');
}
function select(ids){
 if(busy||!snapshot)return;
 closeConfirm();selected.clear();
 for(const id of ids)selected.add(id);
 for(const input of el('cleanup-sample').querySelectorAll('input[type=checkbox]'))
  input.checked=selected.has(input.value);
 refresh();
}
async function auth(){
 const r=await fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'});
 if(!r.ok)throw Error('owner_auth_unavailable');
 const data=await r.json();
 owner=Boolean(data.authenticated&&data.login===OWNER);
 el('cleanup-login').hidden=owner;
 el('cleanup-owner').textContent=owner?'OWNER พร้อมจัดการ Issues ของ Repository ที่เลือก':
  'ต้องเชื่อมต่อ GitHub บัญชี OWNER ก่อน (AI และ Token กลางไม่มีสิทธิ์ลบ)';
 refresh();return owner;
}
async function call(path,body,repository=repo()){
 const options={cache:'no-store',credentials:'same-origin'};
 if(body!==undefined){
  options.method='POST';options.headers={'content-type':'application/json'};
  options.body=JSON.stringify(body);
 }
 const r=await fetch('/api/v1/maintenance/issues/'+path+
  (body===undefined?'?repo='+encodeURIComponent(repository):''),options);
 const data=await r.json().catch(()=>({}));
 if(!r.ok&&r.status!==207)throw Error(data.detail||data.error||'HTTP '+r.status);
 return {data,status:r.status};
}
function render(data){
 if(data.repo!==OWNER+'/'+repo()||!Array.isArray(data.issues)||
    data.total!==data.issues.length)throw Error('invalid_preview');
 snapshot=data;context=repo();selected.clear();closeConfirm();
 el('cleanup-count').textContent=String(data.total);
 const list=el('cleanup-sample');list.replaceChildren();
 for(const issue of data.issues){
  const label=document.createElement('label');label.className='cleanup-option';
  const input=document.createElement('input');input.type='checkbox';input.value=issue.id;
  input.setAttribute('aria-label','เลือก Issue #'+issue.number);
  input.addEventListener('change',()=>{
   if(busy){input.checked=selected.has(issue.id);return;}
   input.checked?selected.add(issue.id):selected.delete(issue.id);
   closeConfirm();refresh();
  });
  const info=document.createElement('span');info.className='cleanup-option-info';
  const title=document.createElement('strong');title.textContent='#'+issue.number+' · '+issue.title;
  const meta=document.createElement('small');meta.textContent=issue.state+' · '+issue.updatedAt;
  info.append(title,meta);label.append(input,info);list.append(label);
 }
 refresh();
 note(data.total?'โหลด '+data.total+' Issues · ติ๊กเลือกหรือกดเลือกทั้งหมด ไม่ต้องพิมพ์ข้อความ':
  'ไม่พบ Issues ทั้ง Open และ Closed — เหลือ 0');
}
async function preview(){
 if(busy)return;
 const previous=repo();
 try{
  if(!await auth())throw Error('กรุณาเข้าสู่ระบบ OWNER');
  snapshot=null;selected.clear();closeConfirm();refresh();
  note('กำลังอ่าน Issues ทั้งหมดจาก GitHub…');
  const {data}=await call('preview',undefined,previous);
  if(repo()!==previous)throw Error('เปลี่ยน Repository ระหว่างโหลด');
  render(data);
 }catch(error){
  if(repo()===previous){snapshot=null;selected.clear();el('cleanup-count').textContent='—';refresh();
   note('อ่าน Issues ไม่สำเร็จ: '+error.message);}
 }
}
function stage(){
 if(busy||!owner||!snapshot||context!==repo()||!chosen().length)return;
 const batch=chosen();
 el('cleanup-final-title').textContent='ยืนยันลบ '+batch.length+' Issues อย่างถาวร?';
 el('cleanup-final-detail').textContent='Repository: '+snapshot.repo+
  ' · รวม Open และ Closed · ไม่รวม Pull Requests · ลบแล้วไม่สามารถ Undo ได้';
 el('cleanup-final').hidden=false;
 el('cleanup-final-yes').focus();
}
async function execute(){
 if(el('cleanup-final').hidden||busy||!owner||!snapshot||context!==repo())return;
 const target=chosen().map(x=>({id:x.id,number:x.number,updatedAt:x.updatedAt}));
 if(!target.length)return;
 const original=snapshot,repository=repo();
 closeConfirm();busy=true;stop=false;refresh();
 el('cleanup-stop').hidden=false;
 let done=0,failure='';
 try{
  for(let at=0;at<target.length;at+=5){
   if(stop||repo()!==repository){failure='หยุดตามคำสั่งหรือ Repository เปลี่ยน';break;}
   note('ลบถาวร '+done+' / '+target.length+' Issues ใน '+original.repo);
   let r;
   try{r=await call('delete',{repo:repository,confirm:'DELETE '+original.repo,issues:target.slice(at,at+5)},repository);}
   catch(e){failure=e.message;break;}
   done+=(r.data.deleted||[]).length;
   if(r.status===207||r.data.error){failure='หยุดที่ #'+(r.data.failed||'?')+': '+(r.data.detail||r.data.error);break;}
  }
 }finally{
  busy=false;el('cleanup-stop').hidden=true;snapshot=null;selected.clear();refresh();
 }
 note('ลบ '+done+' / '+target.length+' Issues · กำลังตรวจรายการที่เหลือ…');
 try{
  const {data}=await call('preview',undefined,repository);
  if(repo()===repository){
   render(data);
   note('ลบถาวร '+done+' / '+target.length+' รายการ · เหลือ '+data.total+
     ' Issues'+(failure?' · '+failure:''));
  }
 }catch(e){note('ลบ '+done+' รายการ แต่ตรวจยอดคงเหลือไม่ได้: '+e.message);}
}
function setup(){
 if(!el('cleanup-panel'))return;
 el('cleanup-preview').addEventListener('click',preview);
 el('cleanup-select-all').addEventListener('click',()=>select(items().map(x=>x.id)));
 el('cleanup-clear-selection').addEventListener('click',()=>select([]));
 el('cleanup-delete').addEventListener('click',stage);
 el('cleanup-final-yes').addEventListener('click',execute);
 el('cleanup-final-no').addEventListener('click',closeConfirm);
 el('cleanup-stop').addEventListener('click',()=>{stop=true;note('หยุดหลังชุดปัจจุบัน');});
 el('cleanup-copy').addEventListener('click',async()=>{
  if(!snapshot)return;
  try{await navigator.clipboard.writeText(JSON.stringify(snapshot,null,2));
   note('คัดลอกรายการ JSON '+snapshot.total+' Issues แล้ว');}
  catch{note('คัดลอกไม่ได้');}
 });
 el('repo-select').addEventListener('change',()=>{
  if(busy)stop=true;
  clear();auth().catch(()=>note('ตรวจ OWNER ไม่สำเร็จ'));
 });
 clear();auth().catch(()=>note('ตรวจ OWNER ไม่สำเร็จ'));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);
else setup();
})();