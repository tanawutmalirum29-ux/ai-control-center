// Line editor for browser agents: bounded source chunks and SHA-locked patch preview.
// Does not rely on retrieving or replacing an entire large textarea.
(()=>{
 const el=id=>document.getElementById(id);
 const repo=()=>el('repo-select').value.split('/')[1];
 const branch=()=>el('ws-branches').value;
 const path=()=>el('ws-path').value.trim();
 let view=null,preview=null;
 const set=msg=>{el('ws-lines-status').textContent=msg;};
 const errText=d=>[d.error,d.hint||d.github_message||d.message,...(d.github_errors||[])].filter(Boolean).join(' · ');
 async function fetchWork(action,options={}){
  const res=await fetch('/api/v1/work/'+action,{credentials:'same-origin',cache:'no-store',...options});
  let data;try{data=await res.json();}catch{throw Error('invalid_response');}
  if(!res.ok)throw Error('HTTP '+res.status+' '+errText(data));
  return data;
 }
 const scope=()=>({repo:repo(),branch:branch(),path:path()});
 function validateScope(){
  const cur=scope();
  if(!cur.repo||!cur.branch||cur.branch==='main'||!cur.path)
   throw Error('เลือก Branch สำหรับงานและพาธไฟล์ก่อน (ห้าม main)');
  return cur;
 }
 function invalidate(){
  preview=null;
  el('ws-lines-commit').disabled=true;
  el('ws-lines-preview').replaceChildren();
 }
 function matchView(){
  const s=validateScope();
  if(!view||view.repo!==s.repo||view.branch!==s.branch||view.path!==s.path)
   throw Error('ไฟล์/Branch เปลี่ยนแล้ว · กด อ่านบรรทัด เพื่อรับ SHA ใหม่ก่อน');
  return {...s,sha:view.sha};
 }
 function listLines(data){
  const box=el('ws-lines-view');box.replaceChildren();
  for(const item of data.lines){
   const row=document.createElement('div');row.className='ws-source-line';
   const number=document.createElement('span');number.className='ws-source-number';
   number.textContent=String(item.number).padStart(4,' ');
   const code=document.createElement('span');code.className='ws-source-code';
   code.textContent=item.text||' ';
   row.append(number,code);box.append(row);
  }
  el('ws-lines-sha').textContent='SHA '+data.sha+' · '+data.total_lines+' บรรทัด · แสดง '+data.start+'–'+data.end;
 }
 async function readLines(all=false){
  invalidate();
  const s=validateScope(),start=Number(el('ws-lines-page').value)||1,count=40;
  set(all?'กำลังอ่านทั้งไฟล์พร้อมเลขบรรทัด...':'กำลังโหลดเนื้อหาเป็นช่วงบรรทัด...');
  const query=new URLSearchParams({...s,...(all?{all:'true'}:{start:String(start),count:String(count)})});
  const data=await fetchWork('file-lines?'+query);
  view={...s,sha:data.sha,total_lines:data.total_lines,lines:data.lines,start:data.start,end:data.end};
  listLines(data);
  set((all?'อ่านไฟล์ครบทุกบรรทัดสำเร็จ':'อ่านช่วงบรรทัดสำเร็จ')+
   ' · '+data.start+'–'+data.end+' จาก '+data.total_lines+
   ' บรรทัด · การแก้จะผูกกับ SHA ของไฟล์นี้');
 }
 async function previewPatch(){
  invalidate();
  const v=matchView(),start=Number(el('ws-lines-start').value),end=Number(el('ws-lines-end').value);
  const replacement=el('ws-lines-replacement').value;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<1||end<start)
   throw Error('กรอกหมายเลขบรรทัดเริ่มและสิ้นสุดให้ถูกต้อง');
  set('กำลังตรวจบรรทัดและสร้าง Diff โดยไม่ Commit...');
  const data=await fetchWork('patch-lines',{method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({...v,start,end,replacement,preview:true})});
  const panel=el('ws-lines-preview');panel.replaceChildren();
  const title=document.createElement('p');title.className='small-note';
  title.textContent='Diff ก่อน Commit · '+v.path+' · บรรทัด '+start+'–'+end+
   ' · '+data.total_before+' → '+data.total_after+' บรรทัด';
  panel.append(title);
  for(const [label,value,cls] of [['- ต้นฉบับ',data.original_text,'before'],
    ['+ หลังแก้',data.replacement_text,'after']]){
   const heading=document.createElement('strong');heading.textContent=label;panel.append(heading);
   const block=document.createElement('pre');block.className='ws-diff-'+cls;
   block.textContent=value||'(ลบบรรทัดที่เลือก)';panel.append(block);
  }
  preview={...v,start,end,replacement,preview_digest:data.preview_digest};
  el('ws-lines-commit').disabled=false;
  set('สร้าง Diff สำเร็จ · ยังไม่มี Commit · ตรวจข้อความต้นฉบับและหลังแก้ก่อนยืนยัน');
 }
 async function commitPatch(){
  if(!preview)throw Error('ต้องกด ดู Diff ก่อน Commit');
  const v=matchView();
  if(v.sha!==preview.sha||v.path!==preview.path||v.branch!==preview.branch||
    Number(el('ws-lines-start').value)!==preview.start||
    Number(el('ws-lines-end').value)!==preview.end||
    el('ws-lines-replacement').value!==preview.replacement)
   throw Error('รายละเอียดเปลี่ยนแล้ว · ดู Diff ใหม่ก่อน Commit');
  const payload={...preview,preview:false};
  invalidate();
  set('กำลัง Commit เฉพาะช่วงบรรทัดที่ยืนยันแล้ว...');
  const saved=await fetchWork('patch-lines',{method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify(payload)});
  set('Commit สำเร็จ '+saved.commit_sha+' · '+saved.branch+' · ไม่แตะ main');
  view=null;
  el('ws-lines-sha').textContent='Commit '+saved.commit_sha+' · กด อ่านบรรทัด เพื่อโหลด SHA ล่าสุด';
  // The full-file editor must not silently overwrite content from before this patch.
  el('ws-content').value='';
  el('ws-notice').textContent='บันทึก Diff สำเร็จ · ต้องกด อ่านไฟล์ อีกครั้งก่อนใช้ตัวแก้ไขทั้งไฟล์';
 }
 async function copySelected(){
  const v=matchView(),start=Number(el('ws-lines-start').value),end=Number(el('ws-lines-end').value);
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<v.start||end>v.end||end<start)
   throw Error('เลือกช่วงบรรทัดที่แสดงอยู่เท่านั้น (สูงสุด 40 บรรทัด)');
  const selected=v.lines.filter(x=>x.number>=start&&x.number<=end);
  el('ws-lines-replacement').value=selected.map(x=>x.text).join('\n');
  invalidate();
  set('เติมข้อความเดิม '+start+'–'+end+' ลงช่องแก้แล้ว · แก้เฉพาะส่วนที่ต้องการและกด ดู Diff');
 }
 async function run(button,fn){
  button.disabled=true;
  try{await fn();}
  catch(error){invalidate();set('ไม่สำเร็จ: '+error.message);}
  finally{
   if(button.id!=='ws-lines-commit')button.disabled=false;
  }
 }
 function setup(){
  for(const id of ['ws-lines-start','ws-lines-end','ws-lines-replacement'])
   el(id).addEventListener('input',invalidate);
  for(const id of ['repo-select','ws-branches','ws-path'])
   el(id).addEventListener(id==='ws-path'?'input':'change',()=>{view=null;invalidate();
    el('ws-lines-sha').textContent='เลือก Branch/ไฟล์แล้วกด อ่านบรรทัด ใหม่';});
  el('ws-lines-read').addEventListener('click',e=>run(e.currentTarget,()=>readLines(true)));
  el('ws-lines-read-page').addEventListener('click',e=>run(e.currentTarget,()=>readLines(false)));
  el('ws-lines-copy').addEventListener('click',e=>run(e.currentTarget,copySelected));
  el('ws-lines-preview-btn').addEventListener('click',e=>run(e.currentTarget,previewPatch));
  el('ws-lines-commit').addEventListener('click',e=>run(e.currentTarget,commitPatch));
  el('ws-lines-next').addEventListener('click',e=>run(e.currentTarget,async()=>{
   if(!view)throw Error('กด อ่านบรรทัด ก่อน');
   const next=view.end+1;if(next>view.total_lines)throw Error('ถึงท้ายไฟล์แล้ว');
   el('ws-lines-page').value=next;await readLines();
  }));
  el('ws-lines-prev').addEventListener('click',e=>run(e.currentTarget,async()=>{
   el('ws-lines-page').value=Math.max(1,(Number(el('ws-lines-page').value)||1)-40);
   await readLines();
  }));
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();
