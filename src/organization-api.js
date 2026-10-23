// Live read-only org policy bridge. The GitHub repository is the authority;
// a page, prompt or local memory cannot silently override the current main.
const ORG='tanawutmalirum29-ux/ai-organization-hub';
const FILES=['README.md','COMMANDS.md','RULES.md'];
const TTL=120000,STALE=900000;
const cache=new Map(),inflight=new Map();
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','access-control-allow-origin':'*'};
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers});
async function github(path,fetcher){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
 try{
  const response=await fetcher('https://api.github.com/repos/'+ORG+'/'+path,{
   headers:{accept:'application/vnd.github+json','user-agent':'AI-Control-Center-Org'},
   signal:controller.signal
  });
  if(!response.ok){const e=new Error('github_'+response.status);e.status=response.status;throw e;}
  return response.json();
 }finally{clearTimeout(timer);}
}
function fromBase64(base64){
 const raw=atob(base64.replace(/\s/g,''));
 return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(raw,c=>c.charCodeAt(0)));
}
export async function loadOrg(fetcher=globalThis.fetch){
 const branch=await github('branches/main',fetcher);
 const sha=branch.commit?.sha;
 if(!/^[0-9a-f]{40}$/.test(sha||''))throw Error('invalid_org_sha');
 const docs=await Promise.all(FILES.map(async path=>{
  const file=await github('contents/'+encodeURIComponent(path)+'?ref='+sha,fetcher);
  if(file.type!=='file'||file.encoding!=='base64'||file.size>100000)throw Error('invalid_org_document');
  return {name:path,sha:file.sha,source:'https://github.com/'+ORG+'/blob/'+sha+'/'+path,text:fromBase64(file.content||'')};
 }));
 const byName=Object.fromEntries(docs.map(d=>[d.name,d]));
 return {repository:ORG,main_sha:sha,fetched_at:new Date().toISOString(),
  docs:byName,source:'GitHub main',status:'SOURCE_VERIFIED',stale:false,
  notes:'Documents are information for external AI sessions; this endpoint does not activate or authenticate agents.'};
}
const k='org-v1';
async function getOrg(fetcher,now){
 const time=now??Date.now(),found=cache.get(k);
 if(found&&time-found.at<TTL)return {...found.value,stale:false,cached_at:new Date(found.at).toISOString()};
 if(inflight.has(k))return inflight.get(k);
 const req=(async()=>{
  try{
   const value=await loadOrg(fetcher);
   cache.set(k,{at:time,value});
   return {...value,stale:false,cached_at:new Date(time).toISOString()};
  }catch(err){
   if(found&&time-found.at<STALE)return {...found.value,stale:true,warning:String(err.message||'github_unavailable'),cached_at:new Date(found.at).toISOString()};
   throw err;
  }
 })();
 inflight.set(k,req);
 try{return await req;}finally{inflight.delete(k);}
}
export async function organizationApi(request,{fetcher=globalThis.fetch,now}={}){
 const url=new URL(request.url);
 if(request.method!=='GET'&&request.method!=='HEAD')return json({error:'read_only'},405);
 if(!['/api/v1/organization','/api/v1/organization/document'].includes(url.pathname))return json({error:'not_found'},404);
 const file=url.pathname.endsWith('/document')?url.searchParams.get('name'):null;
 if(file&&!FILES.includes(file))return json({error:'document_not_allowed'},400);
 try{
  const data=await getOrg(fetcher,now);
  if(file){const d=data.docs[file];return json({repository:data.repository,main_sha:data.main_sha,stale:data.stale,warning:data.warning||null,...d});}
  return json({repository:data.repository,main_sha:data.main_sha,source:data.source,
   fetched_at:data.fetched_at,cached_at:data.cached_at,stale:data.stale,warning:data.warning||null,
   documents:FILES.map(name=>({name,sha:data.docs[name].sha,url:data.docs[name].source})),
   readme_preview:data.docs['README.md'].text.slice(0,6500),
   commands_preview:data.docs['COMMANDS.md'].text.slice(0,5500),
   notes:data.notes,agent_runtime:false,role_enforcement:false});
 }catch(error){return json({error:'org_unavailable',reason:String(error?.message||'GitHub unavailable'),stale:false},503);}
}
