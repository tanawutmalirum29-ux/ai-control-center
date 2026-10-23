// Clickable Git branch picker. No typed confirmation. OWNER OAuth, checked SHA,
// protected-branch rejection and server main protection remain enforced.
import {OWNER,WRITE_REPOS} from './repositories.js';
(()=>{
'use strict';
const el=id=>document.getElementById(id);
const repo=()=>el('repo-select')?.value?.split('/')[1]||'';
const selected=new Set();
let snapshot=null,context='',owner=false,busy=false,stop=false;
const note=s=>{el('branch-status').textContent=s;};
const all=()=>snapshot?.branches||[];
const eligible=()=>all().filter(x=>!x.protected&&x.name!=='main');
const chosen=()=>eligible().filter(x=>selected.has(x.name));
function closeConfirm(){el('branch-final').hidden=true;}
function refresh(){
 const valid=owner&&!busy&&snapshot?.repo===OWNER+'/'+repo()&&
  snapshot?.default_branch==='main'&&context===repo();
 const count=chosen().length;
 el('branch-selected-count').textContent='เลือก '+count+' / '+eligible().length+' Branch ที่ลบได้';
 el('branch-select-all').disabled=!valid||!eligible().length;
 el('branch-select-no-pr').disabled=!valid||!eligible().length;
 el('branch-clear-selection').disabled=!valid||!count;
 el('branch-delete').disabled=!valid||!count;
 el('branch-delete').textContent='2. ลบ '+count+' Branch ที่เลือก';
 el('branch-copy').disabled=!valid;
 el('branch-preview').disabled=!owner||busy||!WRITE_REPOS.includes(repo());
}
function clear(){
 snapshot=null;context=repo();selected.clear();if(!busy)stop=false;closeConfirm();
 for(const id of ['branch-count','branch-pr-count','branch-protected-count'])el(id).textContent='—';
 el('branch-list').replaceChildren();el('branch-stop').hidden=true;
 refresh();note('เลือก Repository แล้วกดตรวจ Branch เพื่อแสดงรายการให้ติ๊กเลือก');
}
function select(names){
 if(busy||!snapshot)return;
 selected.clear();for(const name of names)selected.add(name);
 closeConfirm();
 for(const input of el('branch-list').querySelectorAll('input[type=checkbox]'))
  input.checked=selected.has(input.value);
 refresh();
}
async function auth(){
 const r=await fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'});
 if(!r.ok)throw Error('owner_auth_unavailable');
 const data=await r.json();
 owner=Boolean(data.authenticated&&data.login===OWNER);
 el('branch-login').hidden=owner;
 el('branch-owner').textContent=owner?'OWNER พร้อมจัดการ Branch ของ Repository ที่เลือก':
  'ต้องเชื่อมต่อ GitHub บัญชี OWNER ก่อน (AI และ Token กลางไม่มีสิทธิ์ลบ)';
 refresh();return owner;
}
async function call(path,body,repository=repo()){
 const options={credentials:'same-origin',cache:'no-store'};
 if(body!==undefined){options.method='POST';options.headers={'content-type':'application/json'};options.body=JSON.stringify(body);}
 const r=await fetch('/api/v1/maintenance/branches/'+path+
  (body===undefined?'?repo='+encodeURIComponent(repository):''),options);
 const data=await r.json().catch(()=>({}));
 if(!r.ok&&r.status!==207)
  throw Error(data.error+(data.default_branch?' (Default: '+data.default_branch+')':'')+
   (data.github_status?' [HTTP '+data.github_status+']':''));
 return {data,status:r.status};
}
function render(data){
 if(data.repo!==OWNER+'/'+repo()||data.default_branch!=='main'||
  !Array.isArray(data.branches)||data.total!==data.branches.length)throw Error('invalid_branch_preview');
 snapshot=data;context=repo();selected.clear();closeConfirm();
 el('branch-count').textContent=String(data.total);
 el('branch-pr-count').textContent=String(data.open_pr_branch_count);
 el('branch-protected-count').textContent=String(data.protected_count);
 const list=el('branch-list');list.replaceChildren();
 for(const branch of data.branches){
  const label=document.createElement('label');label.className='cleanup-option';
  if(branch.protected)label.classList.add('cleanup-locked');
  const input=document.createElement('input');input.type='checkbox';input.value=branch.name;
  input.disabled=branch.protected||branch.name==='main';
  input.setAttribute('aria-label','เลือก Branch '+branch.name);
  input.addEventListener('change',()=>{
   if(busy){input.checked=selected.has(branch.name);return;}
   input.checked?selected.add(branch.name):selected.delete(branch.name);
   closeConfirm();refresh();
  });
  const info=document.createElement('span');info.className='cleanup-option-info';
  const title=document.createElement('strong');title.textContent=branch.name;
  const meta=document.createElement('small');
  meta.textContent=branch.sha.slice(0,12)+(branch.protected?' · PROTECTED (เลือกไม่ได้)':'')+
   ((branch.open_prs||[]).length?' · PR เปิดอยู่: '+branch.open_prs.map(pr=>'#'+pr.number).join(', '):'');
  info.append(title,meta);label.append(input,info);list.append(label);
 }
 refresh();
 note(data.total?'โหลด '+data.total+' Branch · เลือกเฉพาะไม่มี PR หรือเลือกทั้งหมดที่ลบได้ · main ไม่อยู่ในรายการ':
  'ไม่มี Branch อื่น เหลือ main เพียงตัวเดียว');
}
async function preview(){
 if(busy)return;
 const repository=repo();
 try{
  if(!await auth())throw Error('กรุณาเข้าสู่ระบบ OWNER');
  snapshot=null;selected.clear();closeConfirm();refresh();
  note('กำลังอ่าน Branch และ PR ที่ยังเปิดอยู่…');
  const {data}=await call('preview',undefined,repository);
  if(repo()!==repository)throw Error('เปลี่ยน Repository ระหว่างโหลด');
  render(data);
 }catch(e){
  if(repo()===repository){snapshot=null;selected.clear();el('branch-count').textContent='—';refresh();
   note('อ่าน Branch ไม่สำเร็จ: '+e.message);}
 }
}
function stage(){
 if(busy||!owner||!snapshot||context!==repo())return;
 const list=chosen();if(!list.length)return;
 const prs=list.filter(x=>x.open_prs?.length);
 el('branch-final-title').textContent='ยืนยันลบ '+list.length+' Branch อย่างถาวร?';
 el('branch-final-detail').textContent='Repository: '+snapshot.repo+
  ' · เก็บ main ไว้ · มี '+prs.length+' Branch ที่มี PR เปิดอยู่'+
  ' · Commit ที่ยังไม่ Merge อาจสูญหายและ PR อาจเสียหาย · ไม่มี Backup อัตโนมัติ';
 el('branch-final').hidden=false;el('branch-final-yes').focus();
}
async function execute(){
 if(el('branch-final').hidden||busy||!owner||!snapshot||context!==repo())return;
 const target=chosen().map(x=>({name:x.name,sha:x.sha}));
 if(!target.length)return;
 const original=snapshot,repository=repo();
 closeConfirm();busy=true;stop=false;refresh();el('branch-stop').hidden=false;
 let done=0,failure='';
 try{
  for(let at=0;at<target.length;at+=5){
   if(stop||repo()!==repository){failure='หยุดตามคำสั่งหรือ Repository เปลี่ยน';break;}
   note('ลบ '+done+' / '+target.length+' Branch · main จะคงอยู่');
   let r;
   try{r=await call('delete',{repo:repository,keep:'main',
    confirm:'DELETE BRANCHES '+original.repo,acknowledge_unmerged:true,
    acknowledge_open_prs:true,branches:target.slice(at,at+5)},repository);}
   catch(e){failure=e.message;break;}
   done+=(r.data.deleted||[]).length;
   if(r.status===207||r.data.error){failure='หยุดที่ '+(r.data.failed||'?')+': '+(r.data.detail||r.data.error);break;}
  }
 }finally{
  busy=false;el('branch-stop').hidden=true;snapshot=null;selected.clear();refresh();
 }
 note('ลบ '+done+' / '+target.length+' Branch · กำลังตรวจยอดคงเหลือ…');
 try{
  const {data}=await call('preview',undefined,repository);
  if(repo()===repository){render(data);
   note('ลบ '+done+' / '+target.length+' Branch · เหลือ Branch อื่น '+data.total+
    (data.total===0?' (เหลือ main เท่านั้น)':'')+(failure?' · '+failure:''));
  }
 }catch(e){note('ลบ '+done+' Branch แต่ตรวจยอดคงเหลือไม่ได้: '+e.message);}
}
function setup(){
 if(!el('branch-panel'))return;
 el('branch-preview').addEventListener('click',preview);
 el('branch-select-all').addEventListener('click',()=>select(eligible().map(x=>x.name)));
 el('branch-select-no-pr').addEventListener('click',()=>select(eligible().filter(x=>!x.open_prs?.length).map(x=>x.name)));
 el('branch-clear-selection').addEventListener('click',()=>select([]));
 el('branch-delete').addEventListener('click',stage);
 el('branch-final-yes').addEventListener('click',execute);
 el('branch-final-no').addEventListener('click',closeConfirm);
 el('branch-stop').addEventListener('click',()=>{stop=true;note('หยุดหลังชุดปัจจุบัน');});
 el('branch-copy').addEventListener('click',async()=>{
  if(!snapshot)return;
  try{await navigator.clipboard.writeText(JSON.stringify(snapshot,null,2));
   note('คัดลอกรายการ Branch JSON แล้ว (ไม่ใช่สำเนาโค้ด)');}
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