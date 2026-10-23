// Stable, line-numbered text editing primitives: preserve untouched bytes and LF/CRLF.
export function splitLines(source){
 if(typeof source!=='string')throw Error('invalid_source');
 const ending=source.endsWith('\n');
 const lines=source.split('\n');
 if(ending)lines.pop();
 return {lines,ending};
}
export function previewLineChange(source,{start,end,replacement}){
 if(typeof replacement!=='string'||replacement.length>60000)throw Error('invalid_replacement');
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end))throw Error('invalid_line_range');
 const {lines,ending}=splitLines(source);
 if(start<1||end<start||end>lines.length)throw Error('line_range_out_of_bounds');
 const before=lines.slice(start-1,end);
 const crlf=source.includes('\r\n')&&!(source.includes('\n')&&source.replace(/\r\n/g,'').includes('\n'));
 const normalized=replacement.replace(/\r\n/g,'\n');
 const normalizedTrimmed=normalized.endsWith('\n')?normalized.slice(0,-1):normalized;
 const nextLines=normalizedTrimmed?normalizedTrimmed.split('\n'):[];
 const inserted=crlf?nextLines.map(line=>line+'\r'):nextLines;
 const updated=lines.slice();
 updated.splice(start-1,end-start+1,...inserted);
 const result=updated.join('\n')+(ending?'\n':'');
 if(result===source)throw Error('no_changes');
 return {result,totalBefore:lines.length,totalAfter:updated.length,start,end,
   oldLines:before,newLines:inserted,crlf};
}
export async function contentDigest(source){
 const bytes=new TextEncoder().encode(source);
 const hash=await crypto.subtle.digest('SHA-256',bytes);
 return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
}
