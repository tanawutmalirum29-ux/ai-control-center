// Delegated, task-scoped GitHub permissions. The signed claim is evidence of
// authorization, not proof a browser is operated by an AI rather than a person.
import {WRITE_REPOS} from '../public/repositories.js';
export const ROLES=Object.freeze(['CEO','PROJECT-LEAD','ENGINEER','CREATOR','QA-REVIEWER','COORDINATOR','GUEST-ENGINEER']);
export const manager=role=>role==='CEO'||role==='PROJECT-LEAD';
export const coder=role=>role==='ENGINEER'||role==='CREATOR'||role==='GUEST-ENGINEER';
export const reviewer=role=>role==='QA-REVIEWER';
export const taskPrefix=claim=>claim.role==='GUEST-ENGINEER'?
 'acc/guest-'+String(claim.nonce||'').slice(0,12).toLowerCase()+'-':
 'acc/issue-'+claim.issue+'-';
export function pathAllowed(path,editable){
 if(typeof path!=='string'||typeof editable!=='string')return false;
 const patterns=editable.split(/[\n,;]/).map(x=>x.trim()).filter(Boolean);
 return patterns.some(p=>{
  if(p==='PROJECT_FILES')return true;
  if(p==='HOLD'||p==='*'||p==='**'||p.length>200||p.includes('..')||p.startsWith('/'))return false;
  if(p.endsWith('/**'))return path.startsWith(p.slice(0,-2));
  if(p.endsWith('/*'))return path.startsWith(p.slice(0,-1));
  return path===p;
 });
}
export function authorizeWork(claim,route,verb,data,params){
 if(!claim)return true;
 if(!WRITE_REPOS.includes(claim.repo))return false;
 if(manager(claim.role))return true;
 if(!coder(claim.role)&&!reviewer(claim.role))return false;
 if(verb==='POST'&&reviewer(claim.role))return false;
 const branch=verb==='GET'?params.get('branch'):data?.branch;
 if(route.endsWith('/branches'))return verb==='GET';
 if(route.endsWith('/branch'))return coder(claim.role)&&verb==='POST';
 if(!Number.isSafeInteger(claim.issue)||
    (claim.role==='GUEST-ENGINEER'?claim.issue!==0:claim.issue<1)||
    !branch?.startsWith(taskPrefix(claim)))return false;
 if(route.endsWith('/file')){
  if(verb==='GET')return true;
  return coder(claim.role)&&pathAllowed(data?.path,claim.editable_paths);
 }
 if(route.endsWith('/pr'))return coder(claim.role)&&verb==='POST';
 return false;
}
export function authorizeOps(claim,route,verb,data,params){
 if(!claim)return true;
 if(!WRITE_REPOS.includes(claim.repo))return false;
 if(verb==='GET')return true;
 if(claim.role==='GUEST-ENGINEER')return false;
 if(manager(claim.role))return true;
 if(!coder(claim.role)&&!reviewer(claim.role))return false;
 const suffix=route.split('/').at(-1);
 if(!['comment','status'].includes(suffix))return false;
 if(Number(data?.number)!==claim.issue)return false;
 if(suffix==='status'){
  if(reviewer(claim.role))return ['WAITING_QA','QA_BLOCK'].includes(data.status);
  return data.status==='IN_PROGRESS'||data.status==='WAITING_QA';
 }
 return true;
}
