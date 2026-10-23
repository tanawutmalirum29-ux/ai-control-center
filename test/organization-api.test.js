import test from 'node:test';
import assert from 'node:assert/strict';
import {organizationApi} from '../src/organization-api.js';
const sha='b'.repeat(40),host='https://control.example';
const source={
 'README.md':'# AI Organization Hub\nOWNER -> PROJECT LEAD -> QA',
 'COMMANDS.md':'# Commands\nMN/MQ/TR/C',
 'RULES.md':'# Rules\nNo merging without exact SHA QA.'
};
let calls=[];
function mocked(fail=false){
 return async(url)=>{
  if(fail)throw Error('rate_limited');
  calls.push(url);
  const p=new URL(url).pathname;
  if(p.endsWith('/branches/main'))return new Response(JSON.stringify({commit:{sha}}),{status:200});
  const match=p.match(/\/contents\/([^/?]+)$/);
  const file=match?.[1];
  if(file&&source[file])return new Response(JSON.stringify({
   type:'file',size:Buffer.byteLength(source[file]),sha:'a'.repeat(40),
   encoding:'base64',content:Buffer.from(source[file]).toString('base64')
  }),{status:200});
  return new Response(JSON.stringify({message:'not found'}),{status:404});
 };
}
test('organization main source, documents, caching, stale fallback, and safe routing',async()=>{
 const request=new Request(host+'/api/v1/organization');
 const begin=1700000000000;
 let r=await organizationApi(request,{fetcher:mocked(),now:begin,edge:null});
 assert.equal(r.status,200);
 const first=await r.json();
 assert.equal(first.main_sha,sha);
 assert.equal(first.documents.length,3);
 assert.ok(first.readme_preview.includes('PROJECT LEAD'));
 assert.equal(first.agent_runtime,false);
 assert.equal(calls.length,4);
 r=await organizationApi(request,{fetcher:mocked(true),now:begin+60000,edge:null});
 assert.equal(r.status,200);
 assert.equal((await r.json()).stale,false);
 r=await organizationApi(request,{fetcher:mocked(true),now:begin+121000,edge:null});
 assert.equal(r.status,200);
 const stale=await r.json();
 assert.equal(stale.stale,true);
 assert.match(stale.warning,/rate_limited/);
 const doc=await organizationApi(new Request(host+'/api/v1/organization/document?name=RULES.md'),{fetcher:mocked(true),now:begin+122000,edge:null});
 assert.equal(doc.status,200);
 assert.match((await doc.json()).text,/No merging without exact SHA QA/);
 const denied=await organizationApi(new Request(host+'/api/v1/organization/document?name=secrets.json'),{fetcher:mocked(),edge:null});
 assert.equal(denied.status,400);
 const write=await organizationApi(new Request(host+'/api/v1/organization',{method:'POST'}),{fetcher:mocked(),edge:null});
 assert.equal(write.status,405);
});
