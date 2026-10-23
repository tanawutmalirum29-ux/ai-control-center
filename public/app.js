import {FULL_REPOS} from './repositories.js';
// Website-first navigation. Legacy Issue, agent and relay panels are retired.
const byId=id=>document.getElementById(id);
const available=['orgrooms','workspace','qa','organization','operations','settings'];
const repoPattern=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
function stored(key,fallback){try{return JSON.parse(localStorage.getItem(key))||fallback}catch{return fallback}}
const validRepos=items=>[...new Set(items.filter(x=>FULL_REPOS.includes(x)&&repoPattern.test(x)))].slice(0,12);
let repos=validRepos(stored('acc.repos.v2',FULL_REPOS));
if(!repos.length)repos=[...FULL_REPOS];
let selected=stored('acc.selected.v1',repos[0]);
if(!repos.includes(selected))selected=repos[0];
const requested=new URLSearchParams(location.search).get('repo');
if(requested&&FULL_REPOS.includes('tanawutmalirum29-ux/'+requested)){
 selected='tanawutmalirum29-ux/'+requested;
 if(!repos.includes(selected))repos.push(selected);
}
function persist(){localStorage.setItem('acc.repos.v2',JSON.stringify(repos));localStorage.setItem('acc.selected.v1',JSON.stringify(selected))}
function switchView(name){
 if(!available.includes(name))return;
 document.querySelectorAll('.view').forEach(node=>node.classList.toggle('hidden',node.id!=='view-'+name));
 document.querySelectorAll('.navigation [data-view]').forEach(node=>node.classList.toggle('active',node.dataset.view===name));
 const labels={orgrooms:['องค์กร / ข้อความ M / งาน T','ORGANIZATION'],workspace:['แก้โค้ดและเปิด Draft PR','WORKSPACE'],qa:['ตรวจ CI และ QA','QUALITY'],organization:['กฎองค์กร','RULES'],operations:['บำรุงรักษาข้อมูลเก่า','MAINTENANCE'],settings:['โปรเจกต์','SETTINGS']};
 byId('page-heading').textContent=labels[name][0];
 byId('section-kicker').textContent=labels[name][1];
}
function picker(){
 const el=byId('repo-select');el.replaceChildren();
 for(const item of repos)el.add(new Option(item,item));
 el.value=selected;
}
function listRepos(){
 const target=byId('repo-list');target.replaceChildren();
 for(const name of repos){const b=document.createElement('button');b.type='button';b.className='secondary-button';b.textContent=name+(name===selected?' · เลือกอยู่':'');b.onclick=()=>{selected=name;persist();picker();listRepos();byId('repo-select').dispatchEvent(new Event('change'))};target.append(b)}
}
function init(){
 picker();listRepos();persist();
 for(const button of document.querySelectorAll('[data-view]'))button.addEventListener('click',()=>switchView(button.dataset.view));
 byId('repo-select').addEventListener('change',e=>{selected=e.target.value;persist();listRepos();byId('load-state').textContent='เปลี่ยนโปรเจกต์แล้ว · เข้าห้ององค์กรเพื่อตรวจงาน'});
 byId('refresh-btn').addEventListener('click',()=>{byId('load-state').textContent='รีเฟรชโปรเจกต์แล้ว';document.querySelector('.navigation [data-view="orgrooms"]')?.click();document.getElementById('orgw-refresh')?.click()});
 byId('repo-form').addEventListener('submit',e=>{
  e.preventDefault();const name=byId('repo-add').value.trim();
  if(!FULL_REPOS.includes(name)||!repoPattern.test(name)){byId('repo-notice').textContent='โปรเจกต์นี้ไม่อยู่ในรายการที่เว็บรองรับ';return}
  if(!repos.includes(name))repos.push(name);selected=name;persist();picker();listRepos();byId('repo-notice').textContent='เลือกโปรเจกต์ '+name;byId('repo-add').value='';
  byId('repo-select').dispatchEvent(new Event('change'));
 });
 switchView('orgrooms');
 byId('load-state').textContent='พื้นที่องค์กร M/T พร้อมใช้งาน · เลือกโปรเจกต์และเปิดห้อง';
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
