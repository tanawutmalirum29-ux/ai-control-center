// Owner-only GitHub project operations: issues, comments, assignees, CI visibility,
// workflow_dispatch on isolated work branches. No merges, deletes or background agents.
import {OWNER,REPOS,WRITE_REPOS} from '../public/repositories.js';
import {authorizeOps} from './role-policy.js';
import bundle from '../public/organization-bundle.json' with { type: 'json' };
const make=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{
 'content-type':'application/json; charset=utf-8','cache-control':'no-store',
 'x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
const validName=s=>REPOS.includes(s);
const validNumber=x=>/^[1-9]\d{0,8}$/.test(String(x||''));
const validRole=s=>['PROJECT-LEAD','CEO','ENGINEER','CREATOR','QA-REVIEWER','COORDINATOR'].includes(s);
const validUser=s=>typeof s==='string'&&/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(s);
const validBranch=s=>typeof s==='string'&&/^acc\/[a-z0-9][a-z0-9._-]{0,90}$/.test(s)&&!s.includes('..');
const validWorkflow=s=>validNumber(s)||typeof s==='string'&&/^[A-Za-z0-9_.-]{1,110}\.ya?ml$/i.test(s);
const titleOK=s=>typeof s==='string'&&s.trim().length>=3&&s.trim().length<=120;
const compact=(s,max)=>typeof s==='string'&&s.length<=max&&!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(s);
export function makeTaskBody(input,repo){
 const project='https://github.com/'+OWNER+'/'+repo;
 const lead=['PROJECT-LEAD','CEO'].includes(input.role);
 const parent=String(input.parent_issue||'').trim();
 const slot=String(input.agent_slot||input.role).trim().toUpperCase();
 const required=['PROJECT_REPO: '+project,
  'ORG_WORKSPACE_REPO: https://github.com/'+OWNER+'/ai-organization-hub',
  'STAGING_REPO: https://github.com/'+OWNER+'/Staging_area',
  'ORG_RULES_SNAPSHOT_SHA: '+bundle.source_main_sha,
  'FROM_ROLE: '+(lead?'OWNER':'PROJECT-LEAD'),
  'TO_ROLE: '+input.role,'AGENT_SLOT: '+slot,
  'PARENT_ISSUE: '+(parent?'#'+parent:'NONE'),
  'REPORTS_TO: '+(lead?'OWNER':input.reports_to||'PROJECT-LEAD'),
  'STATUS: APPOINTED / AWAITING_OWNER_RELAY','SESSION_ACTIVATION: AWAITING_OWNER_RELAY',
  'OBJECTIVE: '+input.title.trim(),'SCOPE: '+(input.scope||'Review current code and task issue'),
  'EDITABLE_PATHS: '+(input.editable_paths||'HOLD - must be assigned before code edit'),
  'BASE_SHA: NOT_YET_VERIFIED','BRANCH: NOT_YET_CREATED',
  'ACCEPTANCE: '+(input.acceptance||'Independent QA must verify exact head SHA'),
  'NEXT_ACTION: Verify organization rules/main SHA, then await the owner relay AP-ROLE message'];
 return required.join('\n')+'\n\nThe owner relays AP-ROLE to the assigned ChatGPT session. Creating this issue does not start an AI. Independent QA is required.';
}
export function validAction(request,origin){
 return request.headers.get('origin')===origin&&request.headers.get('content-type')?.toLowerCase().startsWith('application/json');
}
async function gh(path,token,fetcher,method='GET',body){
 const ctrl=new AbortController(),time=setTimeout(()=>ctrl.abort(),12000);
 try{
  const response=await fetcher('https://api.github.com'+path,{
   method,headers:{'accept':'application/vnd.github+json','authorization':'Bearer '+token,
    'user-agent':'AI-Control-Center-Ops','x-github-api-version':'2022-11-28',
    ...(body?{'content-type':'application/json'}:{})},
   signal:ctrl.signal,body:body?JSON.stringify(body):undefined});
  const payload=response.status===204?{}:await response.json().catch(()=>({}));
  if(!response.ok){
   const err=new Error('github_'+response.status);err.status=response.status;
   err.githubMessage=typeof payload.message==='string'?payload.message.slice(0,300):null;
   throw err;
  }
  return payload;
 }finally{clearTimeout(time);}
}
function mapIssue(x){return {number:x.number,title:x.title,url:x.html_url,state:x.state,
 assignees:(x.assignees||[]).map(a=>a.login),labels:(x.labels||[]).map(a=>a.name),
 updated_at:x.updated_at,body:(x.body||'').slice(0,5000)};}
export async function opsApi(request,{token,allowedRepo=null,claim=null,fetcher=globalThis.fetch}={}){
 if(!token)return make({error:'owner_login_required'},401);
 const url=new URL(request.url),verb=request.method,path=url.pathname;
 let body=null;
 if(verb==='POST'){
  if(!validAction(request,url.origin))return make({error:'invalid_origin_or_content_type'},403);
  try{body=await request.json();}catch{return make({error:'invalid_json'},400);}
  if(!body||typeof body!=='object'||Array.isArray(body))return make({error:'invalid_body'},400);
 }
 const name=verb==='GET'?url.searchParams.get('repo'):body?.repo;
 if(!validName(name))return make({error:'unsupported_repo'},400);
 if(allowedRepo&&allowedRepo!==name)return make({error:'agent_repo_scope_denied'},403);
 if(verb==='POST'&&!WRITE_REPOS.includes(name))return make({error:'repository_read_only'},403);
 if(!authorizeOps(claim,path,verb,body,url.searchParams))return make({error:'agent_role_or_task_scope_denied'},403);
 const prefix='/repos/'+OWNER+'/'+name;
 const fetchGh=(p,m='GET',b)=>gh(prefix+p,token,fetcher,m,b);
 try{
  if(path==='/api/v1/ops/issues'&&verb==='GET'){
   const state=url.searchParams.get('state')||'open';
   if(!['open','closed','all'].includes(state))return make({error:'invalid_state'},400);
   const issues=await fetchGh('/issues?state='+state+'&per_page=70&sort=updated');
   return make({repo:OWNER+'/'+name,issues:issues.filter(x=>!x.pull_request).map(mapIssue),truncated:issues.length===70});
  }
  if(path==='/api/v1/ops/comments'&&verb==='GET'){
   const number=url.searchParams.get('number');
   if(!validNumber(number))return make({error:'invalid_issue'},400);
   const comments=await fetchGh('/issues/'+number+'/comments?per_page=50');
   return make({issue:Number(number),comments:comments.map(x=>({id:x.id,author:x.user?.login,url:x.html_url,body:x.body,created_at:x.created_at})),truncated:comments.length===50});
  }
  if(path==='/api/v1/ops/issue'&&verb==='POST'){
   const slot=body.agent_slot||body.role;
   const isLead=['CEO','PROJECT-LEAD'].includes(body.role);
   if(!/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(slot||'')||
     (body.parent_issue&&!validNumber(body.parent_issue))||
     (!isLead&&!validNumber(body.parent_issue)))return make({error:'invalid_agent_slot_or_parent_issue'},400);
   if(!titleOK(body.title)||!validRole(body.role)||!compact(body.scope||'',1800)||!compact(body.acceptance||'',1200)||!compact(body.editable_paths||'',800)||!compact(body.reports_to||'',100))return make({error:'invalid_issue_fields'},400);
   const isWorker=!isLead;
   if(isWorker){
    const existing=[];
    let page=1,more=true;
    while(more&&page<=5){
     const rows=await fetchGh('/issues?state=open&per_page=100&page='+page);
     if(!Array.isArray(rows))return make({error:'invalid_github_issue_list'},502);
     existing.push(...rows);more=rows.length===100;page++;
    }
    if(more)return make({error:'too_many_open_issues_to_verify_team_limit'},409);
    const members=existing.filter(i=>!i.pull_request&&
      (i.body||'').split('\n').some(line=>line.trim()==='PARENT_ISSUE: #'+body.parent_issue)&&
      !(i.labels||[]).some(label=>['RETIRED','SUPERSEDED'].includes(String(label.name).toUpperCase())));
    if(members.length>=9)return make({error:'mission_agent_limit_10_including_lead'},409);
    if(members.some(i=>(i.body||'').split('\n').some(line=>line.trim().toUpperCase()==='AGENT_SLOT: '+slot.toUpperCase())))
     return make({error:'duplicate_agent_slot_for_mission'},409);
   }
   const role=body.role;
   const issue=await fetchGh('/issues','POST',{title:'['+role+'] '+body.title.trim(),body:makeTaskBody(body,name)});
   return make({created:true,issue:mapIssue(issue),activation:'AWAITING_OWNER_RELAY'},201);
  }
  if(path==='/api/v1/ops/comment'&&verb==='POST'){
   if(!validNumber(body.number)||!compact(body.comment,3000)||!body.comment.trim())return make({error:'invalid_comment'},400);
   const comment=await fetchGh('/issues/'+body.number+'/comments','POST',{body:body.comment.trim()});
   return make({created:true,issue:Number(body.number),url:comment.html_url,id:comment.id},201);
  }
  if(path==='/api/v1/ops/assign'&&verb==='POST'){
   if(!validNumber(body.number)||!validUser(body.username))return make({error:'invalid_assignee'},400);
   const x=await fetchGh('/issues/'+body.number+'/assignees','POST',{assignees:[body.username]});
   return make({assigned:true,issue:Number(body.number),assignees:(x.assignees||[]).map(a=>a.login)});
  }
  if(path==='/api/v1/ops/status'&&verb==='POST'){
   const statuses=['READY','IN_PROGRESS','WAITING_QA','QA_BLOCK','PAUSED'];
   if(!validNumber(body.number)||!statuses.includes(body.status)||body.confirm!=='CHANGE_STATUS')return make({error:'invalid_status_change'},400);
   const number=Number(body.number),issue=await fetchGh('/issues/'+number);
   if(issue.pull_request)return make({error:'only_issue_status_supported'},400);
   if(body.expected_updated_at&&issue.updated_at!==body.expected_updated_at)return make({error:'issue_updated_since_review'},409);
   const label=body.status,colors={READY:'267d64',IN_PROGRESS:'2b83c5',WAITING_QA:'ad831e',QA_BLOCK:'b42b34',PAUSED:'666e77'};
   try{await fetchGh('/labels/'+encodeURIComponent(label));}
   catch(err){
    if(err.status!==404)throw err;
    try{await fetchGh('/labels','POST',{name:label,color:colors[label],description:'AI Control Center human-managed work state'});}
    catch(e){if(e.status!==422)throw e;}
   }
   const current=(issue.labels||[]).map(x=>x.name).filter(Boolean);
   const keep=current.filter(x=>!statuses.includes(x.toUpperCase().replace(/[\s:-]/g,'_')));
   const changed=await fetchGh('/issues/'+number+'/labels','PUT',{labels:[...keep,label]});
   return make({changed:true,issue:number,status:label,labels:(changed||[]).map(x=>x.name),agent_activated:false,
    qa_approved:false,warning:'Status is a manual GitHub label. No atomic multi-agent claim or QA certification.'});
  }
  if(path==='/api/v1/ops/workflows'&&verb==='GET'){
   const x=await fetchGh('/actions/workflows?per_page=100');
   return make({repo:OWNER+'/'+name,workflows:(x.workflows||[]).map(w=>({id:w.id,name:w.name,path:w.path,state:w.state,url:w.html_url})),truncated:(x.total_count||0)>100});
  }
  if(path==='/api/v1/ops/runs'&&verb==='GET'){
   const x=await fetchGh('/actions/runs?per_page=50');
   return make({repo:OWNER+'/'+name,runs:(x.workflow_runs||[]).map(r=>({id:r.id,name:r.name,status:r.status,conclusion:r.conclusion,head_sha:r.head_sha,head_branch:r.head_branch,url:r.html_url,created_at:r.created_at,event:r.event})),truncated:(x.total_count||0)>50});
  }
  if(path==='/api/v1/ops/jobs'&&verb==='GET'){
   const run=url.searchParams.get('run');
   if(!validNumber(run))return make({error:'invalid_run'},400);
   const x=await fetchGh('/actions/runs/'+run+'/jobs?per_page=100');
   return make({run:Number(run),jobs:(x.jobs||[]).map(j=>({id:j.id,name:j.name,status:j.status,conclusion:j.conclusion,steps:(j.steps||[]).map(s=>({name:s.name,status:s.status,conclusion:s.conclusion})),url:j.html_url})),truncated:(x.total_count||0)>100});
  }
  if(path==='/api/v1/ops/dispatch'&&verb==='POST'){
   if(!validWorkflow(body.workflow)||!validBranch(body.branch)||body.confirm!=='RUN_WORKFLOW')return make({error:'invalid_workflow_request'},400);
   const workflows=await fetchGh('/actions/workflows?per_page=100');
   const chosen=(workflows.workflows||[]).find(w=>String(w.id)===String(body.workflow)||w.path?.endsWith('/'+body.workflow));
   if(!chosen||chosen.state!=='active')return make({error:'workflow_not_active_or_not_found'},409);
   const params={ref:body.branch};
   if(body.inputs!==undefined){
    const entries=body.inputs&&typeof body.inputs==='object'&&!Array.isArray(body.inputs)?Object.entries(body.inputs):null;
    if(!entries||entries.length>20||entries.some(([k,v])=>!(/^[a-zA-Z_][a-zA-Z0-9_]{0,60}$/.test(k)&&typeof v==='string'&&v.length<=300)))return make({error:'invalid_inputs'},400);
    params.inputs=body.inputs;
   }
   const x=await fetchGh('/actions/workflows/'+chosen.id+'/dispatches','POST',params);
   return make({dispatched:true,workflow:chosen.name,branch:body.branch,response:x,ci_pass:false,qa_pass:false},202);
  }
  return make({error:'not_found_or_method_not_allowed'},405);
 }catch(error){
  const status=error.status||502;
  return make({error:'github_operation_failed',github_status:status,github_message:error.githubMessage||null,
   hint:status===403?'GitHub App lacks repository permission or installation':status===404?'Resource not found or repository not installed':status===422?'GitHub validation failed; check inputs/duplicate permission':'GitHub request failed',
   write_result:'UNCONFIRMED_CHECK_GITHUB_BEFORE_RETRY'},status===403?403:status===404?404:status===422?422:502);
 }
}
