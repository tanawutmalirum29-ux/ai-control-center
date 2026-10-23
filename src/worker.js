// Public, read-only AI Control Center bridge. No secrets, no write endpoints.
const OWNER='tanawutmalirum29-ux';
const REPOS=['ARCANA-SURVIVOR','ai-control-center','appointment-CEO','Staging_area'];
const HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=30, s-maxage=120','x-content-type-options':'nosniff','access-control-allow-origin':'*','access-control-allow-methods':'GET, HEAD, OPTIONS'};
const send=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:HEADERS});
function getRole(title=''){
 const m=String(title).match(/^\[?(CEO|DIR(?:-[A-Z])?|TL(?:-[A-Z0-9]+)?|ENGINEER(?:-[A-Z0-9]+)?|QA-REVIEWER|PROJECT-LEAD)\]?(?=[\s:-])/i);
 return m?m[1].toUpperCase():'UNASSIGNED';
}
async function github(path){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),9500);
 try{
  const r=await fetch('https://api.github.com'+path,{headers:{Accept:'application/vnd.github+json','User-Agent':'AI-Control-Center-Free'},signal:controller.signal});
  if(!r.ok)throw Error('upstream_'+r.status);
  return await r.json();
 }finally{clearTimeout(timer);}
}
async function queue(name){
 const repo=OWNER+'/'+name;
 const list=await github('/repos/'+repo+'/issues?state=open&sort=updated&direction=desc&per_page=50');
 return {repo,fetched_at:new Date().toISOString(),truncated:list.length===50,read_only:true,tasks:list.filter(x=>!x.pull_request).map(x=>({number:x.number,title:x.title,role:getRole(x.title),url:'https://github.com/'+repo+'/issues/'+x.number,updated_at:x.updated_at}))};
}
async function summary(name){
 const repo=OWNER+'/'+name;
 const [issues,prs,runs]=await Promise.all([
  github('/repos/'+repo+'/issues?state=open&per_page=100'),
  github('/repos/'+repo+'/pulls?state=open&per_page=100'),
  github('/repos/'+repo+'/actions/runs?per_page=1')
 ]);
 const latest=runs.workflow_runs?.[0];
 return {repo,fetched_at:new Date().toISOString(),open_issues_in_page:issues.filter(x=>!x.pull_request).length,issues_truncated:issues.length===100,open_prs_in_page:prs.length,prs_truncated:prs.length===100,latest_qa:latest?{name:latest.name,status:latest.status,conclusion:latest.conclusion,url:latest.html_url}:null,read_only:true};
}
export default {async fetch(request,env){
 const u=new URL(request.url);
 if(!u.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:HEADERS});
 if(request.method!=='GET'&&request.method!=='HEAD')return send({error:'method_not_allowed',writes_enabled:false},405);
 if(u.pathname==='/api/health')return send({service:'AI Control Center',version:2,mode:'public-read-only',ai_provider:'none',owner:OWNER,repositories:REPOS.map(n=>OWNER+'/'+n),endpoints:['/api/health','/api/v1/queue?repo=ARCANA-SURVIVOR','/api/v1/summary?repo=ARCANA-SURVIVOR'],writes:'disabled'});
 if(!['/api/v1/queue','/api/v1/summary'].includes(u.pathname))return send({error:'not_found'},404);
 const repo=u.searchParams.get('repo');
 if(!REPOS.includes(repo))return send({error:'repository_not_allowed',allowed:REPOS},400);
 try{return send(u.pathname==='/api/v1/queue'?await queue(repo):await summary(repo));}
 catch(_){return send({error:'github_unavailable',message:'GitHub public API unavailable or rate limited.'},503);}
}};